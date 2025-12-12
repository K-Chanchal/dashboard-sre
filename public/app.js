// Configuration
const API_BASE_URL = 'https://qnw5w902f4.execute-api.us-west-2.amazonaws.com/default/api';
const REFRESH_INTERVAL = 300000; // 5 minutes
const SERVER_TYPE_ROTATION_INTERVAL = 5000; // 5 seconds

// R2 Thresholds (will be loaded from database)
let R2_THRESHOLDS = {
    payload_tb: 80,      // Default 80 TB threshold
    class_a_mm: 550,     // Default 550 MM requests threshold
    class_b_mm: 600      // Default 600 MM requests threshold
};

// Zone Thresholds (will be loaded from database)
let ZONE_THRESHOLDS = {
    china: { bandwidth_tb: 5, requests_m: 1200 },
    com: { bandwidth_tb: 120, requests_m: 1200 },
    all_requests_m: 1200  // Unified threshold for all requests
};

let refreshTimer;
let serverRotationTimer;
let currentServerTypeIndex = 0;
let serverData = {};
let forecastCharts = {
    aws: null,
    r2: null,
    zone: null
};

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
    fetchForecastData();
    startAutoRefresh();
    startServerTypeRotation();
    setupNavigationButtons();
});

// Fetch all data
async function fetchAllData() {
    try {
        // Add cache-busting timestamp to force fresh data
        const timestamp = new Date().getTime();
        const [serverResponse, usageResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/monitoring/servers?_=${timestamp}`),
            fetch(`${API_BASE_URL}/monitoring/usage?_=${timestamp}`)
        ]);

        if (!serverResponse.ok || !usageResponse.ok) {
            throw new Error('Failed to fetch data');
        }

        serverData = await serverResponse.json();
        const usageData = await usageResponse.json();

        updateUsageData(usageData);
        updateFailureBanner();
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
    // Update R2 thresholds from database
    if (data.cloudflare_r2_thresholds) {
        R2_THRESHOLDS = {
            payload_tb: parseFloat(data.cloudflare_r2_thresholds.PAYLOAD_SIZE_TB) || 80,
            class_a_mm: parseFloat(data.cloudflare_r2_thresholds.Class_A_Requests_PutObject) || 550,
            class_b_mm: parseFloat(data.cloudflare_r2_thresholds.Class_B_Requests_GetObject) || 600
        };
    }

    // Update Zone thresholds from database
    if (data.cloudflare_zone_thresholds && data.cloudflare_zone_thresholds.length > 0) {
        data.cloudflare_zone_thresholds.forEach(threshold => {
            // Convert Is_China to number for comparison (can be string or number from API)
            if (parseInt(threshold.Is_China) === 1) {
                ZONE_THRESHOLDS.china = {
                    bandwidth_tb: parseFloat(threshold.Bandwidth_TB) || 5,
                    requests_m: parseFloat(threshold.Requests_M) || 1200
                };
            } else {
                ZONE_THRESHOLDS.com = {
                    bandwidth_tb: parseFloat(threshold.Bandwidth_TB) || 120,
                    requests_m: parseFloat(threshold.Requests_M) || 1200
                };
            }
        });
        // Use the requests_m from either record as the unified threshold for all requests
        ZONE_THRESHOLDS.all_requests_m = ZONE_THRESHOLDS.china.requests_m;
    }

    updateR2Cards(data.cloudflare_r2);
    updateZoneCards(data.cloudflare_zones);
    updateAWSCostTable(data.aws_costs);
}

// Update AWS Cost table with percentage-based color coding
function updateAWSCostTable(costs) {
    const tbody = document.querySelector('#aws-cost-table tbody');
    tbody.innerHTML = '';

    if (!costs || costs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">No data available</td></tr>';
        return;
    }

    costs.forEach(account => {
        const currentCost = parseFloat(account.current_cost) || 0;
        const baselineCost = parseFloat(account.baseline_cost) || 0;
        const percentage = baselineCost > 0 ? (currentCost / baselineCost) * 100 : 0;

        // Color coding: Green (<75%), Yellow (75-80%), Red (>80%)
        let colorClass = 'green';
        if (percentage >= 80) {
            colorClass = 'red';
        } else if (percentage >= 75) {
            colorClass = 'yellow';
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account.account_name || '-'}</td>
            <td>$${currentCost.toFixed(2)}</td>
            <td class="${colorClass}">${percentage.toFixed(1)}%</td>
        `;
        tbody.appendChild(row);
    });
}

// Update R2 cards with threshold-based coloring
function updateR2Cards(data) {
    if (!data || data.length === 0) {
        document.getElementById('r2-payload').textContent = 'No data';
        return;
    }

    const r2Data = data[0];

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

// Update Cloudflare Zone cards with threshold-based coloring
function updateZoneCards(zones) {
    if (!zones || zones.length === 0) {
        document.getElementById('zone-bandwidth-china').textContent = 'No data';
        document.getElementById('zone-bandwidth-com').textContent = 'No data';
        document.getElementById('zone-requests-all').textContent = 'No data';
        return;
    }

    // Aggregate data - bandwidth split by is_china, requests get all data
    let chinaBandwidth = 0;
    let comBandwidth = 0;
    let allRequests = 0;

    zones.forEach(zone => {
        const bandwidth = parseFloat(zone.Bandwidth_TB) || 0;
        const requests = parseFloat(zone.Requests_M) || 0;

        // For bandwidth, split by is_china flag
        if (zone.Is_China === 1 || zone.Is_China === '1') {
            chinaBandwidth += bandwidth;
        } else {
            comBandwidth += bandwidth;
        }

        // For requests, aggregate all data without checking is_china
        allRequests += requests;
    });

    // Update All Requests (first position)
    const allRequestsPercent = (allRequests / ZONE_THRESHOLDS.all_requests_m) * 100;
    document.getElementById('zone-requests-all').textContent = `${allRequests.toFixed(2)} M`;
    updatePercentageDisplay('zone-requests-all-percent', allRequestsPercent);

    // Update .com Bandwidth
    const comBandwidthPercent = (comBandwidth / ZONE_THRESHOLDS.com.bandwidth_tb) * 100;
    document.getElementById('zone-bandwidth-com').textContent = `${comBandwidth.toFixed(2)} TB`;
    updatePercentageDisplay('zone-bandwidth-com-percent', comBandwidthPercent);

    // Update China Bandwidth
    const chinaBandwidthPercent = (chinaBandwidth / ZONE_THRESHOLDS.china.bandwidth_tb) * 100;
    document.getElementById('zone-bandwidth-china').textContent = `${chinaBandwidth.toFixed(2)} TB`;
    updatePercentageDisplay('zone-bandwidth-china-percent', chinaBandwidthPercent);
}

// Get color class based on percentage
function getColorClass(percentage) {
    if (percentage > 80) return 'red';
    if (percentage >= 75) return 'yellow';
    return 'green';
}

// Update failure banner with all failing server types
function updateFailureBanner() {
    const failureBanner = document.getElementById('failure-banner');
    const failureList = document.getElementById('failure-list');
    const failureDetails = document.getElementById('failure-details');

    const failuresByType = {};

    // Check each server type for failures
    SERVER_TYPES.forEach((serverType, index) => {
        const servers = serverData[serverType] || [];
        const failedServers = servers.filter(server => !isServerSuccess(server, serverType));

        if (failedServers.length > 0) {
            failuresByType[serverType] = {
                count: failedServers.length,
                index: index,
                servers: failedServers
            };
        }
    });

    // Show or hide banner based on failures
    if (Object.keys(failuresByType).length > 0) {
        failureBanner.style.display = 'block';
        failureList.innerHTML = '';
        failureDetails.innerHTML = '';

        // Create chips for each failing server type
        Object.entries(failuresByType).forEach(([serverType, data]) => {
            const chip = document.createElement('div');
            chip.className = 'failure-chip';
            chip.innerHTML = `
                <span>${serverType.toUpperCase()}</span>
                <span class="count">${data.count}</span>
            `;

            // Click to navigate to that server type
            chip.addEventListener('click', () => {
                currentServerTypeIndex = data.index;
                updateServerDisplay();
                stopServerTypeRotation();
                clearTimeout(window.navigationTimeout);
                window.navigationTimeout = setTimeout(() => {
                    startServerTypeRotation();
                }, 60000);
            });

            failureList.appendChild(chip);
        });

        // Build detailed failure table (always visible)
        buildFailureDetailsTable(failuresByType, failureDetails);
    } else {
        failureBanner.style.display = 'none';
    }
}

// Build detailed failure table
function buildFailureDetailsTable(failuresByType, container) {
    Object.entries(failuresByType).forEach(([serverType, data]) => {
        const section = document.createElement('div');
        section.className = 'failure-section';

        const title = document.createElement('div');
        title.className = 'failure-section-title';
        title.innerHTML = `
            <span>${serverType.toUpperCase()}</span>
            <span class="failure-count-badge">${data.count} Failed</span>
        `;
        section.appendChild(title);

        // Create table
        const table = document.createElement('table');
        table.className = 'failure-details-table';

        // Table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Server Name</th>
                <th>Type</th>
                <th>Env</th>
                <th>Status</th>
                <th>Details</th>
            </tr>
        `;
        table.appendChild(thead);

        // Table body with failed servers
        const tbody = document.createElement('tbody');
        data.servers.forEach(server => {
            const row = createFailureDetailRow(server, serverType);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        section.appendChild(table);
        container.appendChild(section);
    });
}

// Create failure detail row
function createFailureDetailRow(server, serverType) {
    const row = document.createElement('tr');

    const serverName = server.SERVER_NAME || server.hostname || server.MONITOR_NAME ||
                       server.HOST || 'Unknown';
    const type = server.TYPE || '-';
    const env = server.ENV || '-';

    // Get status
    let status = server.STATUS || server.APP_STATUS || server.ping_status ||
                 server.MONITOR_STATUS || '-';

    // Build details column
    const details = buildServerDetails(server, serverType);

    row.innerHTML = `
        <td>${serverName}</td>
        <td>${type}</td>
        <td>${env}</td>
        <td><span class="status-badge status-failure">${status}</span></td>
        <td>${details}</td>
    `;

    return row;
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
        row.innerHTML = '<td colspan="5" class="all-success">✓ All systems operational</td>';
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

    row.innerHTML = `
        <td>${serverName}</td>
        <td>${type}</td>
        <td>${env}</td>
        <td><span class="status-badge status-failure">${status}</span></td>
        <td>${details}</td>
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

// Setup navigation buttons
function setupNavigationButtons() {
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');

    prevButton.addEventListener('click', () => {
        navigatePrevious();
    });

    nextButton.addEventListener('click', () => {
        navigateNext();
    });
}

// Navigate to previous server type
function navigatePrevious() {
    // Stop auto-rotation when user manually navigates
    stopServerTypeRotation();

    currentServerTypeIndex = (currentServerTypeIndex - 1 + SERVER_TYPES.length) % SERVER_TYPES.length;
    updateServerDisplay();

    // Restart auto-rotation after 1 minute of inactivity
    clearTimeout(window.navigationTimeout);
    window.navigationTimeout = setTimeout(() => {
        startServerTypeRotation();
    }, 60000);
}

// Navigate to next server type
function navigateNext() {
    // Stop auto-rotation when user manually navigates
    stopServerTypeRotation();

    currentServerTypeIndex = (currentServerTypeIndex + 1) % SERVER_TYPES.length;
    updateServerDisplay();

    // Restart auto-rotation after 1 minute of inactivity
    clearTimeout(window.navigationTimeout);
    window.navigationTimeout = setTimeout(() => {
        startServerTypeRotation();
    }, 60000);
}

// Fetch forecast data
async function fetchForecastData() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_BASE_URL}/monitoring/forecast?_=${timestamp}`);

        if (!response.ok) {
            throw new Error('Failed to fetch forecast data');
        }

        const data = await response.json();
        renderForecastCharts(data);
    } catch (error) {
        console.error('Error fetching forecast data:', error);
        showError('Failed to load forecast data');
    }
}

// Render forecast charts
function renderForecastCharts(data) {
    const { historical, forecast, forecast_month } = data;

    // AWS Cost Forecast Chart
    renderAWSForecastChart(historical.aws_cost, forecast.aws_cost, forecast_month);

    // Cloudflare R2 Forecast Chart
    renderR2ForecastChart(historical.cloudflare_r2, forecast.cloudflare_r2, forecast_month);

    // Cloudflare Zone Forecast Chart
    renderZoneForecastChart(historical.cloudflare_zones, forecast.cloudflare_zones, forecast_month);
}

// Render AWS Cost Forecast Chart
function renderAWSForecastChart(history, forecast, forecastMonth) {
    const ctx = document.getElementById('aws-forecast-chart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (forecastCharts.aws) {
        forecastCharts.aws.destroy();
    }

    // Get unique account names
    const accountNames = Object.keys(forecast);
    if (accountNames.length === 0) return;

    // Prepare data for first account (you can extend this to show multiple accounts)
    const mainAccount = accountNames[0];
    const labels = history.map(h => `${h.month.substring(0, 3)} ${h.year}`);
    labels.push(forecastMonth.substring(0, 3));

    const historicalData = history.map(h => {
        const account = h.data.find(d => d.account_name === mainAccount);
        return account ? parseFloat(account.current_cost) : null;
    });

    const forecastData = forecast[mainAccount];

    // Create datasets
    const datasets = [
        {
            label: 'Historical Cost',
            data: [...historicalData, null],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.4
        },
        {
            label: 'Forecast (High)',
            data: [...Array(historicalData.length).fill(null), forecastData.high],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'triangle'
        },
        {
            label: 'Forecast (Mean)',
            data: [...Array(historicalData.length).fill(null), forecastData.mean],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'circle'
        },
        {
            label: 'Forecast (Low)',
            data: [...Array(historicalData.length).fill(null), forecastData.low],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'rect'
        }
    ];

    forecastCharts.aws = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                title: {
                    display: true,
                    text: `${mainAccount} - Cost Forecast ($)`,
                    color: '#fff',
                    font: { size: 14, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#fff', padding: 10, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: $${context.parsed.y?.toFixed(2) || 'N/A'}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

// Render R2 Forecast Chart
function renderR2ForecastChart(history, forecast, forecastMonth) {
    const ctx = document.getElementById('r2-forecast-chart');
    if (!ctx) return;

    if (forecastCharts.r2) {
        forecastCharts.r2.destroy();
    }

    const labels = history.map(h => `${h.month.substring(0, 3)} ${h.year}`);
    labels.push(forecastMonth.substring(0, 3));

    // Payload Size TB data
    const historicalPayload = history.map(h => h.data ? parseFloat(h.data.PAYLOAD_SIZE_TB) : null);

    const datasets = [
        {
            label: 'Historical Payload (TB)',
            data: [...historicalPayload, null],
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'Forecast High (TB)',
            data: [...Array(historicalPayload.length).fill(null), forecast.payload_tb.high],
            borderColor: '#ef4444',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'triangle',
            yAxisID: 'y'
        },
        {
            label: 'Forecast Mean (TB)',
            data: [...Array(historicalPayload.length).fill(null), forecast.payload_tb.mean],
            borderColor: '#10b981',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'circle',
            yAxisID: 'y'
        },
        {
            label: 'Forecast Low (TB)',
            data: [...Array(historicalPayload.length).fill(null), forecast.payload_tb.low],
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'rect',
            yAxisID: 'y'
        }
    ];

    forecastCharts.r2 = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                title: {
                    display: true,
                    text: 'R2 Payload Size Forecast (TB)',
                    color: '#fff',
                    font: { size: 14, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#fff', padding: 10, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} TB`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    position: 'left',
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value.toFixed(1) + ' TB';
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

// Render Zone Forecast Chart
function renderZoneForecastChart(history, forecast, forecastMonth) {
    const ctx = document.getElementById('zone-forecast-chart');
    if (!ctx) return;

    if (forecastCharts.zone) {
        forecastCharts.zone.destroy();
    }

    const labels = history.map(h => `${h.month.substring(0, 3)} ${h.year}`);
    labels.push(forecastMonth.substring(0, 3));

    // Aggregate bandwidth data
    const historicalComBandwidth = history.map(h => {
        return h.data.filter(z => z.Is_China === 0 || z.Is_China === '0')
            .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
    });

    const datasets = [
        {
            label: 'Historical .com Bandwidth (TB)',
            data: [...historicalComBandwidth, null],
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.4
        },
        {
            label: 'Forecast High (TB)',
            data: [...Array(historicalComBandwidth.length).fill(null), forecast.com_bandwidth.high],
            borderColor: '#ef4444',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'triangle'
        },
        {
            label: 'Forecast Mean (TB)',
            data: [...Array(historicalComBandwidth.length).fill(null), forecast.com_bandwidth.mean],
            borderColor: '#10b981',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'circle'
        },
        {
            label: 'Forecast Low (TB)',
            data: [...Array(historicalComBandwidth.length).fill(null), forecast.com_bandwidth.low],
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 6,
            pointStyle: 'rect'
        }
    ];

    forecastCharts.zone = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                title: {
                    display: true,
                    text: 'Cloudflare .com Bandwidth Forecast (TB)',
                    color: '#fff',
                    font: { size: 14, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#fff', padding: 10, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} TB`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value.toFixed(1) + ' TB';
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}
