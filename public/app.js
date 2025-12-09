// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const REFRESH_INTERVAL = 5000; // 5 seconds

let refreshTimer;
let countdown;

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('SRE Dashboard initialized');
    fetchAllData();
    startAutoRefresh();
});

// Fetch all data (servers and stats)
async function fetchAllData() {
    try {
        const [serversResponse, statsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/servers`),
            fetch(`${API_BASE_URL}/stats`)
        ]);

        if (!serversResponse.ok || !statsResponse.ok) {
            throw new Error('Failed to fetch data');
        }

        const servers = await serversResponse.json();
        const stats = await statsResponse.json();

        updateDashboard(servers);
        updateTicker(servers);
        updateStats(stats);
        updateLastUpdate();
    } catch (error) {
        console.error('Error fetching data:', error);
        showError('Failed to load dashboard data. Retrying...');
    }
}

// Update dashboard grid with server cards
function updateDashboard(servers) {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';

    servers.forEach(server => {
        const card = createServerCard(server);
        grid.appendChild(card);
    });
}

// Create server card element
function createServerCard(server) {
    const card = document.createElement('div');
    card.className = `server-card ${server.status}`;

    const lastCheck = new Date(server.last_check).toLocaleString();

    card.innerHTML = `
        <div class="card-header">
            <div class="server-name">${server.server_name}</div>
            <div class="status-indicator ${server.status}">${server.status}</div>
        </div>
        <div class="service-name">${server.service_name}</div>
        <div class="card-details">
            <div class="detail-item">
                <div class="detail-label">Location</div>
                <div class="detail-value">${server.location || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Uptime</div>
                <div class="detail-value">${server.uptime_hours}h</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">CPU Usage</div>
                <div class="detail-value">${server.cpu_usage}%</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Memory</div>
                <div class="detail-value">${server.memory_usage}%</div>
            </div>
        </div>
        ${server.message ? `<div class="message">${server.message}</div>` : ''}
        <div class="last-check">Last check: ${lastCheck}</div>
    `;

    return card;
}

// Update news ticker with server alerts
function updateTicker(servers) {
    const tickerContent = document.getElementById('ticker-content');
    tickerContent.innerHTML = '';

    // Filter servers with issues (critical, warning, offline)
    const alerts = servers.filter(s =>
        s.status === 'critical' || s.status === 'warning' || s.status === 'offline'
    );

    // Add online servers to show positive news too
    const onlineServers = servers.filter(s => s.status === 'online');

    // Create ticker items for alerts
    alerts.forEach(server => {
        const item = createTickerItem(server);
        tickerContent.appendChild(item);
    });

    // Add some positive news if we have online servers
    if (onlineServers.length > 0) {
        const randomOnline = onlineServers[Math.floor(Math.random() * onlineServers.length)];
        const item = createTickerItem(randomOnline);
        tickerContent.appendChild(item);
    }

    // Duplicate ticker content for seamless loop
    const clonedContent = tickerContent.innerHTML;
    tickerContent.innerHTML += clonedContent + clonedContent;

    // Adjust animation speed based on content length
    const itemCount = alerts.length + 1;
    const animationDuration = Math.max(30, itemCount * 8);
    tickerContent.style.animationDuration = `${animationDuration}s`;
}

// Create ticker item element
function createTickerItem(server) {
    const item = document.createElement('div');
    item.className = `ticker-item ${server.status}`;

    const statusEmoji = {
        online: '✅',
        warning: '⚠️',
        critical: '🔴',
        offline: '❌'
    };

    const message = server.message || `${server.server_name} is ${server.status}`;

    item.innerHTML = `
        ${statusEmoji[server.status]}
        <span class="status-badge">${server.status.toUpperCase()}</span>
        <strong>${server.server_name}</strong> - ${server.service_name}: ${message}
        ${server.location ? `(${server.location})` : ''}
    `;

    return item;
}

// Update statistics in header
function updateStats(stats) {
    document.getElementById('stat-online').textContent = stats.online || 0;
    document.getElementById('stat-warning').textContent = stats.warning || 0;
    document.getElementById('stat-critical').textContent = stats.critical || 0;
    document.getElementById('stat-offline').textContent = stats.offline || 0;
    document.getElementById('total-servers').textContent = stats.total || 0;
    document.getElementById('avg-cpu').textContent = stats.avg_cpu ? stats.avg_cpu.toFixed(1) : '0';
    document.getElementById('avg-memory').textContent = stats.avg_memory ? stats.avg_memory.toFixed(1) : '0';
}

// Update last update timestamp
function updateLastUpdate() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    document.getElementById('last-update').textContent = timeString;
}

// Start auto-refresh timer
function startAutoRefresh() {
    let seconds = REFRESH_INTERVAL / 1000;

    // Update countdown display
    countdown = setInterval(() => {
        seconds--;
        document.getElementById('refresh-timer').textContent = `${seconds}s`;

        if (seconds <= 0) {
            seconds = REFRESH_INTERVAL / 1000;
        }
    }, 1000);

    // Refresh data
    refreshTimer = setInterval(() => {
        if (!document.hidden) {
            fetchAllData();
        }
    }, REFRESH_INTERVAL);
}

// Stop auto-refresh (cleanup)
function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    if (countdown) {
        clearInterval(countdown);
    }
}

// Show error message
function showError(message) {
    console.error(message);
    // Could add a toast notification here
}

// Pause refresh when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        fetchAllData();
        startAutoRefresh();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
