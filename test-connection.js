const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('Testing MySQL connection...');
    console.log('Host:', process.env.DB_HOST);
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);
    console.log('');

    try {
        // Create connection
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('✓ Connection successful!');

        // Try a simple query
        const [rows] = await connection.query('SELECT 1 as test');
        console.log('✓ Query successful:', rows);

        // Try querying the servers table
        const [servers] = await connection.query('SELECT COUNT(*) as count FROM servers');
        console.log('✓ Servers table query successful:', servers);

        await connection.end();
        console.log('✓ Connection closed successfully');

    } catch (error) {
        console.error('✗ Connection failed!');
        console.error('Error code:', error.code);
        console.error('Error number:', error.errno);
        console.error('SQL State:', error.sqlState);
        console.error('SQL Message:', error.sqlMessage);
        console.error('Full error:', error.message);
        console.error('');
        console.error('Stack trace:', error.stack);
    }
}

testConnection();
