const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool - will be reused across Lambda invocations
let pool;

function getDbPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return pool;
}

// API Routes

// Get all servers
app.get('/api/servers', async (req, res) => {
    try {
        const db = getDbPool();
        const [rows] = await db.query(
            'SELECT * FROM server_status ORDER BY updated_at DESC'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Failed to fetch server data' });
    }
});

// Get servers by status
app.get('/api/servers/status/:status', async (req, res) => {
    try {
        const { status } = req.params;
        const db = getDbPool();
        const [rows] = await db.query(
            'SELECT * FROM server_status WHERE status = ? ORDER BY updated_at DESC',
            [status]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching servers by status:', error);
        res.status(500).json({ error: 'Failed to fetch server data' });
    }
});

// Get single server by id
app.get('/api/servers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDbPool();
        const [rows] = await db.query(
            'SELECT * FROM server_status WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Server not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching server:', error);
        res.status(500).json({ error: 'Failed to fetch server data' });
    }
});

// Get summary statistics
app.get('/api/stats', async (req, res) => {
    try {
        const db = getDbPool();
        const [stats] = await db.query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
                SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
                SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning,
                SUM(CASE WHEN status = 'critical' THEN 1 ELSE 0 END) as critical,
                AVG(cpu_usage) as avg_cpu,
                AVG(memory_usage) as avg_memory
            FROM server_status
        `);
        res.json(stats[0]);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Update server status (for testing)
app.put('/api/servers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, cpu_usage, memory_usage, message } = req.body;
        const db = getDbPool();

        await db.query(
            'UPDATE server_status SET status = ?, cpu_usage = ?, memory_usage = ?, message = ? WHERE id = ?',
            [status, cpu_usage, memory_usage, message, id]
        );

        const [updated] = await db.query('SELECT * FROM server_status WHERE id = ?', [id]);
        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating server:', error);
        res.status(500).json({ error: 'Failed to update server' });
    }
});

// Get all server status monitoring data
app.get('/api/monitoring/servers', async (req, res) => {
    try {
        const db = getDbPool();
        const serverTypes = [
            {
                name: 'rp servers',
                query: `
                    SELECT s.SERVER_NAME, s.TYPE, s.ENV, rp.STATUS, rp.APACHE_STATUS,
                           rp.OPENSSL_STATUS, rp.WEBSITE_NAME, rp.INCIDENT_ID, rp.LAST_UPDATED
                    FROM rp_server_details rp
                    JOIN servers s ON rp.server_id = s.id
                    ORDER BY s.SERVER_NAME
                `
            },
            {
                name: 'aem servers',
                query: `
                    SELECT s.SERVER_NAME, s.TYPE, s.ENV, aem.STATUS, aem.LOAD,
                           aem.PROCESS_NAME, aem.SEGMENT_STORE_SIZE
                    FROM AEM_server_details aem
                    JOIN servers s ON aem.server_id = s.id
                    ORDER BY s.SERVER_NAME
                `
            },
            {
                name: 'eesof applications',
                query: `
                    SELECT s.SERVER_NAME, s.TYPE, s.ENV, e.APP_NAME, e.APP_USER,
                           e.APP_VERSION, e.APP_STATUS, e.INCIDENT_ID
                    FROM eesof_app_details e
                    JOIN servers s ON e.server_id = s.id
                    ORDER BY s.SERVER_NAME, e.APP_NAME
                `
            },
            {
                name: 'ruby applications',
                query: `
                    SELECT s.SERVER_NAME, s.TYPE, s.ENV, r.APP_NAME, r.APP_USER,
                           r.APP_PORT, r.APP_STATUS
                    FROM ruby_apps r
                    JOIN servers s ON r.server_id = s.id
                    ORDER BY s.SERVER_NAME, r.APP_NAME
                `
            },
            {
                name: 'ping monitor',
                query: `
                    SELECT hostname as SERVER_NAME, '' as TYPE, '' as ENV,
                           ping_status as STATUS, response_time_ms, last_checked, ip_address
                    FROM ping_monitor_status
                    ORDER BY hostname
                `
            },
            {
                name: 'new relic monitors',
                query: `
                    SELECT MONITOR_NAME as SERVER_NAME, '' as TYPE, '' as ENV,
                           MONITOR_STATE, MONITOR_STATUS as STATUS,
                           LAST_REFRESH_TIME, INCIDENT_ID
                    FROM new_relic_details
                    ORDER BY MONITOR_NAME
                `
            },
            {
                name: 'ssl certificates',
                query: `
                    SELECT HOST as SERVER_NAME, '' as TYPE, '' as ENV,
                           PORT, STATUS, EXPIRY_DATE, DAYS_REMAINING, INCIDENT_ID
                    FROM ssl_certificates
                    ORDER BY CAST(DAYS_REMAINING AS SIGNED)
                `
            }
        ];

        const results = {};

        for (const serverType of serverTypes) {
            const [rows] = await db.query(serverType.query);
            results[serverType.name] = rows;
        }

        res.json(results);
    } catch (error) {
        console.error('Error fetching server monitoring data:', error);
        res.status(500).json({ error: 'Failed to fetch server monitoring data' });
    }
});

// Get usage and overages for current month
app.get('/api/monitoring/usage', async (req, res) => {
    try {
        const db = getDbPool();
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonthLong = currentDate.toLocaleString('en-US', { month: 'long' });
        const currentMonthShort = currentDate.toLocaleString('en-US', { month: 'short' });

        // Get S3 bucket usage (uses abbreviated month names)
        const [s3Usage] = await db.query(`
            SELECT Account_Name, Bucket_Name, Size_MB, Retention
            FROM s3_bucket_usage
            WHERE Year = ? AND Month = ?
            ORDER BY CAST(Size_MB AS DECIMAL) DESC
        `, [currentYear, currentMonthShort]);

        // Get R2 thresholds
        const [r2Thresholds] = await db.query(`
            SELECT PAYLOAD_SIZE_TB, Class_A_Requests_PutObject, Class_B_Requests_GetObject
            FROM R2thresholds
            LIMIT 1
        `);

        // Get Cloudflare R2 usage threshold data
        const [r2Usage] = await db.query(`
            SELECT OBJECT_COUNT, PAYLOAD_SIZE_TB,
                   Class_A_Requests_MM_PutObject, Class_B_Requests_MM_GetObject,
                   LAST_REFRESH_TIME
            FROM cloudflare_R2_usageth
            WHERE YEAR = ? AND MONTH = ?
        `, [currentYear.toString(), currentMonthLong]);

        // Get Cloudflare Zone usage (uses abbreviated month names)
        const [zoneUsage] = await db.query(`
            SELECT Account_Name, Zone_Name, Requests_M, Bandwidth_TB,
                   Is_China, refresh_time_ist
            FROM cloudflare_zone_usage
            WHERE Year = ? AND Month = ?
            ORDER BY CAST(Bandwidth_TB AS DECIMAL) DESC
        `, [currentYear, currentMonthShort]);

        res.json({
            s3_buckets: s3Usage,
            cloudflare_r2: r2Usage,
            cloudflare_r2_thresholds: r2Thresholds.length > 0 ? r2Thresholds[0] : null,
            cloudflare_zones: zoneUsage,
            current_month: currentMonthLong,
            current_year: currentYear
        });
    } catch (error) {
        console.error('Error fetching usage data:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the handler
module.exports.handler = serverless(app);
