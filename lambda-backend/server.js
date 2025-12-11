require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database connection pool
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

// Import routes from index.js
const indexModule = require('./index.js');

// Copy all routes from the Lambda handler
const serverless = require('serverless-http');

app.get('/api/monitoring/servers', async (req, res) => {
    try {
        const db = getDbPool();

        // Get RP Servers
        const [rpServers] = await db.query(`
            SELECT r.*, s.SERVER_NAME, s.TYPE, s.ENV, s.LAST_REFRESH_TIME
            FROM rp_server_details r
            LEFT JOIN servers s ON r.server_id = s.id
            WHERE s.TYPE = 'RP'
        `);

        // Get AEM Servers
        const [aemServers] = await db.query(`
            SELECT a.*, s.SERVER_NAME, s.TYPE, s.ENV, s.LAST_REFRESH_TIME
            FROM AEM_server_details a
            LEFT JOIN servers s ON a.server_id = s.id
            WHERE s.TYPE = 'AEM'
        `);

        // Get EESOF Applications
        const [eesofApps] = await db.query(`
            SELECT e.*, s.SERVER_NAME, s.TYPE, s.ENV, s.LAST_REFRESH_TIME
            FROM eesof_app_details e
            LEFT JOIN servers s ON e.server_id = s.id
            WHERE s.TYPE = 'EESOF'
        `);

        // Get Ruby Applications
        const [rubyApps] = await db.query(`
            SELECT r.*, s.SERVER_NAME, s.TYPE, s.ENV, s.LAST_REFRESH_TIME
            FROM ruby_apps r
            LEFT JOIN servers s ON r.server_id = s.id
            WHERE s.TYPE = 'RUBY'
        `);

        // Get Ping Monitor
        const [pingMonitor] = await db.query(`
            SELECT * FROM ping_monitor_status
            ORDER BY last_checked DESC
        `);

        // Get New Relic Monitors
        const [newRelicMonitors] = await db.query(`
            SELECT * FROM new_relic_details
            ORDER BY LAST_REFRESH_TIME DESC
        `);

        // Get SSL Certificates
        const [sslCerts] = await db.query(`
            SELECT * FROM ssl_certificates
            ORDER BY DAYS_REMAINING ASC
        `);

        res.json({
            'rp servers': rpServers,
            'aem servers': aemServers,
            'eesof applications': eesofApps,
            'ruby applications': rubyApps,
            'ping monitor': pingMonitor,
            'new relic monitors': newRelicMonitors,
            'ssl certificates': sslCerts
        });
    } catch (error) {
        console.error('Error fetching monitoring data:', error);
        res.status(500).json({ error: 'Failed to fetch monitoring data' });
    }
});

app.get('/api/monitoring/usage', async (req, res) => {
    try {
        const db = getDbPool();
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonthLong = currentDate.toLocaleString('en-US', { month: 'long' });
        const currentMonthShort = currentDate.toLocaleString('en-US', { month: 'short' });

        // Get S3 bucket usage
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

        // Get Cloudflare R2 usage
        const [r2Usage] = await db.query(`
            SELECT OBJECT_COUNT, PAYLOAD_SIZE_TB,
                   Class_A_Requests_MM_PutObject, Class_B_Requests_MM_GetObject,
                   LAST_REFRESH_TIME
            FROM cloudflare_R2_usageth
            WHERE YEAR = ? AND MONTH = ?
        `, [currentYear.toString(), currentMonthLong]);

        // Get Cloudflare Zone usage
        const [zoneUsage] = await db.query(`
            SELECT Account_Name, Zone_Name, Requests_M, Bandwidth_TB,
                   Is_China, refresh_time_ist
            FROM cloudflare_zone_usage
            WHERE Year = ? AND Month = ?
            ORDER BY CAST(Bandwidth_TB AS DECIMAL) DESC
        `, [currentYear, currentMonthShort]);

        // Get Zone thresholds
        const [zoneThresholds] = await db.query(`
            SELECT Requests_M, Bandwidth_TB, Is_China
            FROM ZoneThreshold
        `);

        res.json({
            s3_buckets: s3Usage,
            cloudflare_r2: r2Usage,
            cloudflare_r2_thresholds: r2Thresholds.length > 0 ? r2Thresholds[0] : null,
            cloudflare_zones: zoneUsage,
            cloudflare_zone_thresholds: zoneThresholds,
            current_month: currentMonthLong,
            current_year: currentYear
        });
    } catch (error) {
        console.error('Error fetching usage data:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n✓ SRE Dashboard Server running on http://localhost:${PORT}`);
    console.log(`✓ Dashboard UI: http://localhost:${PORT}`);
    console.log(`✓ API endpoints: http://localhost:${PORT}/api`);
    console.log(`✓ Health check: http://localhost:${PORT}/health\n`);
});
