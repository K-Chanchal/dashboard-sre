const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes

// Get all servers
app.get('/api/servers', async (req, res) => {
    try {
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`✓ SRE Dashboard server running on http://localhost:${PORT}`);
});
