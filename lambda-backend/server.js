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

// Add cache control headers for API routes
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

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

// Import routes from lambda.js
const indexModule = require('./lambda.js');

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

        // Get Cloudflare Zone usage (latest record per zone for current month)
        const [zoneUsage] = await db.query(`
            SELECT czu.Account_Name, czu.Zone_Name, czu.Requests_M, czu.Bandwidth_TB,
                   czu.Is_China, czu.refresh_time_ist
            FROM cloudflare_zone_usage czu
            INNER JOIN (
                SELECT Zone_Name, MAX(refresh_time_ist) as max_refresh_time
                FROM cloudflare_zone_usage
                WHERE Year = ? AND Month = ?
                GROUP BY Zone_Name
            ) latest ON czu.Zone_Name = latest.Zone_Name
                    AND czu.refresh_time_ist = latest.max_refresh_time
            WHERE czu.Year = ? AND czu.Month = ?
            ORDER BY CAST(czu.Bandwidth_TB AS DECIMAL) DESC
        `, [currentYear, currentMonthShort, currentYear, currentMonthShort]);

        // Get Zone thresholds
        const [zoneThresholds] = await db.query(`
            SELECT Requests_M, Bandwidth_TB, Is_China
            FROM ZoneThreshold
        `);

        // Get AWS Cost Report for current month
        const [awsCosts] = await db.query(`
            SELECT account_name, account_id, baseline_cost, current_cost
            FROM aws_cost_report
            WHERE year = ? AND month = ?
            ORDER BY CAST(current_cost AS DECIMAL) DESC
        `, [currentYear, currentMonthLong]);

        res.json({
            s3_buckets: s3Usage,
            cloudflare_r2: r2Usage,
            cloudflare_r2_thresholds: r2Thresholds.length > 0 ? r2Thresholds[0] : null,
            cloudflare_zones: zoneUsage,
            cloudflare_zone_thresholds: zoneThresholds,
            aws_costs: awsCosts,
            current_month: currentMonthLong,
            current_year: currentYear
        });
    } catch (error) {
        console.error('Error fetching usage data:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

app.get('/api/monitoring/forecast', async (req, res) => {
    try {
        const db = getDbPool();
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // 1-12

        // Helper to get month name from number
        const getMonthName = (monthNum) => {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return monthNames[monthNum - 1];
        };

        // Get last 5 months including current (for better trend analysis)
        const months = [];
        for (let i = 4; i >= 0; i--) {
            let month = currentMonth - i;
            let year = currentYear;
            if (month <= 0) {
                month += 12;
                year -= 1;
            }
            months.push({ month: getMonthName(month), year, monthNum: month });
        }

        // Fetch AWS Cost historical data
        const awsCostHistory = [];
        for (const { month, year } of months) {
            const [costs] = await db.query(`
                SELECT account_name, account_id, current_cost, baseline_cost
                FROM aws_cost_report
                WHERE year = ? AND month = ?
                ORDER BY account_name
            `, [year, month]);

            awsCostHistory.push({
                month,
                year,
                data: costs
            });
        }

        // Fetch Cloudflare R2 historical data
        const r2History = [];
        for (const { month, year } of months) {
            const [r2Data] = await db.query(`
                SELECT PAYLOAD_SIZE_TB, Class_A_Requests_MM_PutObject, Class_B_Requests_MM_GetObject
                FROM cloudflare_R2_usageth
                WHERE YEAR = ? AND MONTH = ?
            `, [year.toString(), month]);

            r2History.push({
                month,
                year,
                data: r2Data.length > 0 ? r2Data[0] : null
            });
        }

        // Fetch Cloudflare Zone historical data
        const zoneHistory = [];
        for (const { month, year, monthNum } of months) {
            const monthShort = new Date(year, monthNum - 1).toLocaleString('en-US', { month: 'short' });
            const [zoneData] = await db.query(`
                SELECT Account_Name, Zone_Name, Requests_M, Bandwidth_TB, Is_China
                FROM cloudflare_zone_usage
                WHERE Year = ? AND Month = ?
            `, [year, monthShort]);

            zoneHistory.push({
                month,
                year,
                data: zoneData
            });
        }

        // Calculate forecasts
        const calculateForecast = (historicalValues) => {
            if (historicalValues.length === 0) return { high: 0, mean: 0, low: 0 };

            const validValues = historicalValues.filter(v => v !== null && v !== undefined && !isNaN(v));
            if (validValues.length === 0) return { high: 0, mean: 0, low: 0 };

            const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
            const variance = validValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validValues.length;
            const stdDev = Math.sqrt(variance);

            // Growth rate calculation
            let growthRate = 0;
            if (validValues.length >= 2) {
                const recentValue = validValues[validValues.length - 1];
                const previousValue = validValues[validValues.length - 2];
                if (previousValue > 0) {
                    growthRate = (recentValue - previousValue) / previousValue;
                }
            }

            // Forecast with growth trend
            const trendMean = mean * (1 + growthRate);
            const high = trendMean + (1.5 * stdDev);
            const low = Math.max(0, trendMean - (1.5 * stdDev));

            return {
                high: parseFloat(high.toFixed(2)),
                mean: parseFloat(trendMean.toFixed(2)),
                low: parseFloat(low.toFixed(2))
            };
        };

        // AWS Cost Forecast by account
        const awsForecast = {};
        if (awsCostHistory.length > 0 && awsCostHistory[0].data.length > 0) {
            const accountNames = [...new Set(awsCostHistory.flatMap(h => h.data.map(d => d.account_name)))];

            accountNames.forEach(accountName => {
                const historicalCosts = awsCostHistory.map(h => {
                    const account = h.data.find(d => d.account_name === accountName);
                    return account ? parseFloat(account.current_cost) : null;
                }).filter(v => v !== null);

                awsForecast[accountName] = calculateForecast(historicalCosts);
            });
        }

        // R2 Forecast
        const r2Forecast = {
            payload_tb: calculateForecast(r2History.map(h => h.data ? parseFloat(h.data.PAYLOAD_SIZE_TB) : null)),
            class_a_requests: calculateForecast(r2History.map(h => h.data ? parseFloat(h.data.Class_A_Requests_MM_PutObject) : null)),
            class_b_requests: calculateForecast(r2History.map(h => h.data ? parseFloat(h.data.Class_B_Requests_MM_GetObject) : null))
        };

        // Zone Forecast (aggregated)
        const zoneForecast = {
            china_bandwidth: calculateForecast(zoneHistory.map(h => {
                return h.data.filter(z => z.Is_China === 1 || z.Is_China === '1')
                    .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
            })),
            com_bandwidth: calculateForecast(zoneHistory.map(h => {
                return h.data.filter(z => z.Is_China === 0 || z.Is_China === '0')
                    .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
            })),
            all_requests: calculateForecast(zoneHistory.map(h => {
                return h.data.reduce((sum, z) => sum + parseFloat(z.Requests_M || 0), 0);
            }))
        };

        res.json({
            historical: {
                aws_cost: awsCostHistory,
                cloudflare_r2: r2History,
                cloudflare_zones: zoneHistory
            },
            forecast: {
                aws_cost: awsForecast,
                cloudflare_r2: r2Forecast,
                cloudflare_zones: zoneForecast
            },
            forecast_month: getMonthName(currentMonth),
            forecast_date: new Date(currentYear, currentMonth - 1, new Date(currentYear, currentMonth, 0).getDate()).getDate(),
            current_month: getMonthName(currentMonth),
            current_year: currentYear
        });
    } catch (error) {
        console.error('Error fetching forecast data:', error);
        res.status(500).json({ error: 'Failed to fetch forecast data' });
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
