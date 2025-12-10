// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const REFRESH_INTERVAL = 300000; // 5 minutes
const SERVER_TYPE_ROTATION_INTERVAL = 5000; // 5 seconds

// R2 Thresholds (will be loaded from database)
let R2_THRESHOLDS = {
    payload_tb: 80,      // Default 80 TB threshold
    class_a_mm: 550,     // Default 550 MM requests threshold
    class_b_mm: 600      // Default 600 MM requests threshold
};

let refreshTimer;
let serverRotationTimer;
let currentServerTypeIndex = 0;
let serverData = {};

const SERVER_TYPES = [
    'rp servers',
    'aem servers',
    'eesof applications',
    'ruby applications',
    'ping monitor',
    'new relic monitors',
    'ssl certificates'
];

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('SRE Monitoring Dashboard initialized');
    fetchAllData();
    startAutoRefresh();
    startServerTypeRotation();
});

// Fetch all data
async function fetchAllData() {
    try {
        const [serverResponse, usageResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/monitoring/servers`),
            fetch(`${API_BASE_URL}/monitoring/usage`)
        ]);

        if (!serverResponse.ok || !usageResponse.ok) {
            throw new Error('Failed to fetch data');
        }

        serverData = await serverResponse.json();
        const usageData = await usageResponse.json();

        updateUsageData(usageData);
        updateServerDisplay();
        updateLastUpdate();
    } catch (error) {
        console.error('Error fetching data:', error);
        showError('Failed to load dashboard data. Retrying...');
    }
}

// Update last update timestamp with proper formatting
function updateLastUpdate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    document.getElementById('current-month-year').textContent =
        `${monthNames[now.getMonth()]} ${year}`;
    document.getElementById('last-update').textContent =
        `${day}/${month}/${year}, ${time}`;
}

// Update usage data section
function updateUsageData(data) {
    // Update thresholds from database
    if (data.cloudflare_r2_thresholds) {
        R2_THRESHOLDS = {
            payload_tb: parseFloat(data.cloudflare_r2_thresholds.PAYLOAD_SIZE_TB) || 80,
            class_a_mm: parseFloat(data.cloudflare_r2_thresholds.Class_A_Requests_PutObject) || 550,
            class_b_mm: parseFloat(data.cloudflare_r2_thresholds.Class_B_Requests_GetObject) || 600
        };
    }

    updateS3Table(data.s3_buckets);
    updateR2Cards(data.cloudflare_r2);
    updateZoneTable(data.cloudflare_zones);
}

// Update S3 bucket table (top 10)
function updateS3Table(buckets) {
    const tbody = document.querySelector('#s3-table tbody');
    tbody.innerHTML = '';

    if (!buckets || buckets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">No data available</td></tr>';
        return;
    }

    buckets.slice(0, 10).forEach(bucket => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${bucket.Account_Name || '-'}</td>
            <td>${bucket.Bucket_Name || '-'}</td>
            <td>${bucket.Size_MB || '0'}</td>
            <td>${bucket.Retention || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Update R2 cards with threshold-based coloring
function updateR2Cards(data) {
    if (!data || data.length === 0) {
        document.getElementById('r2-object-count').textContent = 'No data';
        return;
    }

    const r2Data = data[0];

    // Object Count
    document.getElementById('r2-object-count').textContent =
        formatNumber(r2Data.OBJECT_COUNT);

    // Payload Size
    const payloadTB = parseFloat(r2Data.PAYLOAD_SIZE_TB) || 0;
    const payloadPercent = (payloadTB / R2_THRESHOLDS.payload_tb) * 100;
    document.getElementById('r2-payload').textContent = `${payloadTB.toFixed(2)} TB`;
    updatePercentageDisplay('r2-payload-percent', payloadPercent);

    // Class A Requests
    const classA = parseFloat(r2Data.Class_A_Requests_MM_PutObject) || 0;
    const classAPercent = (classA / R2_THRESHOLDS.class_a_mm) * 100;
    document.getElementById('r2-class-a').textContent = `${classA} MM`;
    updatePercentageDisplay('r2-class-a-percent', classAPercent);

    // Class B Requests
    const classB = parseFloat(r2Data.Class_B_Requests_MM_GetObject) || 0;
    const classBPercent = (classB / R2_THRESHOLDS.class_b_mm) * 100;
    document.getElementById('r2-class-b').textContent = `${classB} MM`;
    updatePercentageDisplay('r2-class-b-percent', classBPercent);
}

// Update percentage display with color coding
function updatePercentageDisplay(elementId, percentage) {
    const element = document.getElementById(elementId);
    element.textContent = `${percentage.toFixed(1)}%`;

    element.className = 'r2-percent';
    if (percentage > 80) {
        element.classList.add('status-red');
    } else if (percentage >= 75) {
        element.classList.add('status-yellow');
    } else {
        element.classList.add('status-green');
    }
}

// Update Cloudflare Zone table (top 10)
function updateZoneTable(zones) {
    const tbody = document.querySelector('#zone-table tbody');
    tbody.innerHTML = '';

    if (!zones || zones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No data available</td></tr>';
        return;
    }

    zones.slice(0, 10).forEach(zone => {
        const bandwidthTB = parseFloat(zone.Bandwidth_TB) || 0;
        const percentage = (bandwidthTB / 10) * 100; // Assuming 10TB threshold
        const colorClass = getColorClass(percentage);

        const row = document.createElement('tr');
        row.className = `status-${colorClass}`;
        row.innerHTML = `
            <td>${zone.Account_Name || '-'}</td>
            <td>${zone.Zone_Name || '-'}</td>
            <td>${bandwidthTB.toFixed(4)}</td>
            <td>${zone.Requests_M || '0'}</td>
            <td>${zone.Is_China || 'No'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Get color class based on percentage
function getColorClass(percentage) {
    if (percentage > 80) return 'red';
    if (percentage >= 75) return 'yellow';
    return 'green';
}

// Update server display for current server type
function updateServerDisplay() {
    const currentType = SERVER_TYPES[currentServerTypeIndex];
    const servers = serverData[currentType] || [];

    // Update title with animation
    const titleElement = document.getElementById('server-type-title');
    titleElement.textContent = `🖥️ ${currentType.toUpperCase()}`;
    titleElement.classList.remove('flip-in');
    void titleElement.offsetWidth; // Trigger reflow
    titleElement.classList.add('flip-in');

    // Check if all servers are running/success
    const failedServers = servers.filter(server => !isServerSuccess(server, currentType));

    const messageElement = document.getElementById('server-status-message');
    const tbody = document.querySelector('#server-table tbody');
    tbody.innerHTML = '';

    if (failedServers.length === 0) {
        // All running
        messageElement.textContent = 'ALL RUNNING / SUCCESS';
        messageElement.className = 'status-message success-message';

        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6" class="all-success">✓ All systems operational</td>';
        tbody.appendChild(row);
    } else {
        // Show failed servers
        messageElement.textContent = `${failedServers.length} FAILURE(S) DETECTED`;
        messageElement.className = 'status-message failure-message';

        failedServers.forEach(server => {
            const row = createServerRow(server, currentType);
            tbody.appendChild(row);
        });
    }
}

// Check if server is successful
function isServerSuccess(server, serverType) {
    const statusFields = ['STATUS', 'APP_STATUS', 'ping_status', 'MONITOR_STATUS',
                          'APACHE_STATUS', 'OPENSSL_STATUS'];

    for (const field of statusFields) {
        if (server[field]) {
            const status = server[field].toString().toUpperCase();
            if (status === 'DOWN' || status === 'FAILED' || status === 'CRITICAL' ||
                status === 'ERROR' || status === 'OFFLINE' || status === 'ALERTING' ||
                status.includes('FAIL')) {
                return false;
            }
        }
    }

    // SSL certificates check
    if (server.DAYS_REMAINING) {
        const days = parseInt(server.DAYS_REMAINING);
        if (days < 30) return false;
    }

    return true;
}

// Create server row for table
function createServerRow(server, serverType) {
    const row = document.createElement('tr');
    row.className = 'status-red';

    const serverName = server.SERVER_NAME || server.hostname || server.MONITOR_NAME ||
                       server.HOST || 'Unknown';
    const type = server.TYPE || '-';
    const env = server.ENV || '-';

    // Get status
    let status = server.STATUS || server.APP_STATUS || server.ping_status ||
                 server.MONITOR_STATUS || '-';

    // Build details column
    const details = buildServerDetails(server, serverType);

    // Get incident ID
    const incidentId = (server.INCIDENT_ID && server.INCIDENT_ID !== 'NULL') ?
                       server.INCIDENT_ID : '-';

    row.innerHTML = `
        <td>${serverName}</td>
        <td>${type}</td>
        <td>${env}</td>
        <td><span class="status-badge status-failure">${status}</span></td>
        <td>${details}</td>
        <td>${incidentId}</td>
    `;

    return row;
}

// Build details for server
function buildServerDetails(server, serverType) {
    const details = [];

    if (serverType === 'rp servers') {
        if (server.WEBSITE_NAME) details.push(`Website: ${server.WEBSITE_NAME}`);
        if (server.APACHE_STATUS) details.push(`Apache: ${server.APACHE_STATUS}`);
        if (server.OPENSSL_STATUS) details.push(`OpenSSL: ${server.OPENSSL_STATUS}`);
    } else if (serverType === 'aem servers') {
        if (server.PROCESS_NAME) details.push(`Process: ${server.PROCESS_NAME}`);
        if (server.LOAD) details.push(`Load: ${server.LOAD}`);
    } else if (serverType === 'eesof applications' || serverType === 'ruby applications') {
        if (server.APP_NAME) details.push(`App: ${server.APP_NAME}`);
        if (server.APP_PORT) details.push(`Port: ${server.APP_PORT}`);
    } else if (serverType === 'ping monitor') {
        if (server.ip_address) details.push(`IP: ${server.ip_address}`);
        if (server.response_time_ms) details.push(`Response: ${server.response_time_ms}ms`);
    } else if (serverType === 'ssl certificates') {
        if (server.PORT) details.push(`Port: ${server.PORT}`);
        if (server.DAYS_REMAINING) details.push(`Days: ${server.DAYS_REMAINING}`);
        if (server.EXPIRY_DATE) details.push(`Expires: ${server.EXPIRY_DATE}`);
    }

    return details.join(' | ') || '-';
}

// Format large numbers
function formatNumber(num) {
    return parseInt(num).toLocaleString();
}

// Start auto-refresh timer (5 minutes)
function startAutoRefresh() {
    refreshTimer = setInterval(() => {
        if (!document.hidden) {
            fetchAllData();
        }
    }, REFRESH_INTERVAL);
}

// Start server type rotation
function startServerTypeRotation() {
    serverRotationTimer = setInterval(() => {
        currentServerTypeIndex = (currentServerTypeIndex + 1) % SERVER_TYPES.length;
        updateServerDisplay();
    }, SERVER_TYPE_ROTATION_INTERVAL);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
}

// Stop server rotation
function stopServerTypeRotation() {
    if (serverRotationTimer) clearInterval(serverRotationTimer);
}

// Show error message
function showError(message) {
    console.error(message);
}

// Pause refresh when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
        stopServerTypeRotation();
    } else {
        fetchAllData();
        startAutoRefresh();
        startServerTypeRotation();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    stopServerTypeRotation();
});
