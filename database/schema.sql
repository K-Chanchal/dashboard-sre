-- Create database
CREATE DATABASE IF NOT EXISTS SREData;
USE SREData;

-- Create server_status table
DROP TABLE IF EXISTS server_status;
CREATE TABLE server_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    server_name VARCHAR(255) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    status ENUM('online', 'offline', 'warning', 'critical') NOT NULL DEFAULT 'online',
    location VARCHAR(100),
    uptime_hours DECIMAL(10, 2) DEFAULT 0,
    cpu_usage DECIMAL(5, 2) DEFAULT 0,
    memory_usage DECIMAL(5, 2) DEFAULT 0,
    last_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_server_name (server_name)
);

-- Insert sample data for testing
INSERT INTO server_status (server_name, service_name, status, location, uptime_hours, cpu_usage, memory_usage, message) VALUES
('prod-web-01', 'Web Server', 'online', 'US-East', 720.5, 45.2, 62.8, 'All systems operational'),
('prod-web-02', 'Web Server', 'online', 'US-West', 680.3, 38.5, 55.3, 'Running smoothly'),
('prod-db-01', 'Database', 'warning', 'US-East', 720.5, 78.9, 85.2, 'High memory usage detected'),
('prod-db-02', 'Database', 'online', 'EU-West', 500.2, 52.3, 68.9, 'Performance normal'),
('prod-api-01', 'API Gateway', 'critical', 'US-East', 12.5, 92.5, 95.8, 'Service degradation - investigating'),
('prod-api-02', 'API Gateway', 'online', 'US-West', 720.5, 35.8, 48.3, 'Healthy'),
('prod-cache-01', 'Redis Cache', 'online', 'US-East', 720.5, 22.3, 35.6, 'Cache hit rate: 98%'),
('prod-cache-02', 'Redis Cache', 'warning', 'EU-West', 150.8, 65.4, 78.2, 'Cache eviction rate increasing'),
('prod-lb-01', 'Load Balancer', 'online', 'US-East', 720.5, 18.5, 28.9, 'Traffic balanced'),
('prod-mq-01', 'Message Queue', 'offline', 'US-West', 0, 0, 0, 'Service unavailable - restarting'),
('prod-search-01', 'Search Engine', 'online', 'US-East', 600.3, 55.7, 72.4, 'Index updated'),
('prod-cdn-01', 'CDN', 'online', 'Global', 720.5, 15.2, 22.8, 'Content delivery optimal');
