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
    aws: [],  // Array to store multiple AWS account charts
    r2ClassA: null,
    r2ClassB: null
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
    const { historical, forecast, forecast_month, forecast_date, current_year } = data;

    // Cloudflare R2 Class A Operations Forecast
    renderR2ClassAForecastChart(historical.cloudflare_r2, forecast.cloudflare_r2, forecast_month, forecast_date, current_year);

    // Cloudflare R2 Class B Operations Forecast
    renderR2ClassBForecastChart(historical.cloudflare_r2, forecast.cloudflare_r2, forecast_month, forecast_date, current_year);

    // AWS Cost Forecast Charts (one for each account)
    renderAWSForecastCharts(historical.aws_cost, forecast.aws_cost, forecast_month, forecast_date, current_year);
}

// Render Cloudflare R2 Class A Operations Forecast (Financial Style)
function renderR2ClassAForecastChart(history, forecast, forecastMonth, forecastDate, currentYear) {
    const ctx = document.getElementById('r2-class-a-forecast-chart');
    if (!ctx) return;

    if (forecastCharts.r2ClassA) {
        forecastCharts.r2ClassA.destroy();
    }

    // Prepare labels and data - exclude current month from historical
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => h.data ? parseFloat(h.data.Class_A_Requests_MM_PutObject) : null);

    // Add current month with actual partial data
    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data ? parseFloat(currentMonthData.data.Class_A_Requests_MM_PutObject) : null;
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    // Add forecast point for month-end
    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create forecast lines: show three separate points at Dec 31
    const highLine = [...Array(historicalData.length).fill(null), forecast.class_a_requests.high];
    const meanLine = [...Array(historicalData.length).fill(null), forecast.class_a_requests.mean];
    const lowLine = [...Array(historicalData.length).fill(null), forecast.class_a_requests.low];

    forecastCharts.r2ClassA = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Historical actuals (grey line)
                {
                    label: 'Actual Operations',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280'
                },
                // Forecast High (red)
                {
                    label: 'High Projection',
                    data: highLine,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: '+1',
                    pointRadius: 7,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0
                },
                // Forecast Mean (blue)
                {
                    label: 'Mean Projection',
                    data: meanLine,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 3,
                    fill: false,
                    pointRadius: 7,
                    pointBackgroundColor: '#3b82f6',
                    tension: 0
                },
                // Forecast Low (green)
                {
                    label: 'Low Projection',
                    data: lowLine,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: '-1',
                    pointRadius: 7,
                    pointStyle: 'rectRot',
                    pointBackgroundColor: '#22c55e',
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#e5e7eb',
                        padding: 15,
                        font: { size: 12, weight: '500' },
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#374151',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} MM`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        callback: function(value) {
                            return value.toFixed(0) + ' MM';
                        }
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.3)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// Render Cloudflare R2 Class B Operations Forecast (Financial Style)
function renderR2ClassBForecastChart(history, forecast, forecastMonth, forecastDate, currentYear) {
    const ctx = document.getElementById('r2-class-b-forecast-chart');
    if (!ctx) return;

    if (forecastCharts.r2ClassB) {
        forecastCharts.r2ClassB.destroy();
    }

    // Prepare labels and data - exclude current month from historical
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => h.data ? parseFloat(h.data.Class_B_Requests_MM_GetObject) : null);

    // Add current month with actual partial data
    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data ? parseFloat(currentMonthData.data.Class_B_Requests_MM_GetObject) : null;
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    // Add forecast point for month-end
    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create forecast lines: show three separate points at Dec 31
    const highLine = [...Array(historicalData.length).fill(null), forecast.class_b_requests.high];
    const meanLine = [...Array(historicalData.length).fill(null), forecast.class_b_requests.mean];
    const lowLine = [...Array(historicalData.length).fill(null), forecast.class_b_requests.low];

    forecastCharts.r2ClassB = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Historical actuals (grey line)
                {
                    label: 'Actual Operations',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280'
                },
                // Forecast High (red)
                {
                    label: 'High Projection',
                    data: highLine,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: '+1',
                    pointRadius: 7,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0
                },
                // Forecast Mean (blue)
                {
                    label: 'Mean Projection',
                    data: meanLine,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 3,
                    fill: false,
                    pointRadius: 7,
                    pointBackgroundColor: '#3b82f6',
                    tension: 0
                },
                // Forecast Low (green)
                {
                    label: 'Low Projection',
                    data: lowLine,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: '-1',
                    pointRadius: 7,
                    pointStyle: 'rectRot',
                    pointBackgroundColor: '#22c55e',
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#e5e7eb',
                        padding: 15,
                        font: { size: 12, weight: '500' },
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#374151',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} MM`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        callback: function(value) {
                            return value.toFixed(0) + ' MM';
                        }
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.3)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// Render AWS Cost Forecast Charts (One for each account)
function renderAWSForecastCharts(history, forecast, forecastMonth, forecastDate, currentYear) {
    // Get the container for AWS forecast charts
    const container = document.querySelector('.forecast-section');
    if (!container) {
        console.error('Forecast section container not found');
        return;
    }

    // Destroy old AWS charts
    if (forecastCharts.aws && forecastCharts.aws.length > 0) {
        forecastCharts.aws.forEach(chart => {
            if (chart) chart.destroy();
        });
        forecastCharts.aws = [];
    }

    // Remove old AWS forecast chart DOM elements
    const oldCharts = container.querySelectorAll('.aws-forecast-subsection');
    oldCharts.forEach(chart => chart.remove());

    // Get unique account names
    const accountNames = Object.keys(forecast);
    if (accountNames.length === 0) {
        console.warn('No AWS accounts found in forecast data');
        return;
    }

    console.log(`Creating ${accountNames.length} AWS forecast charts for accounts:`, accountNames);

    // Create a chart for each account
    accountNames.forEach((accountName, index) => {
        renderSingleAWSForecastChart(history, forecast[accountName], accountName, forecastMonth, forecastDate, currentYear, index);
    });
}

// Render single AWS Cost Forecast (Financial Style)
function renderSingleAWSForecastChart(history, forecastData, accountName, forecastMonth, forecastDate, currentYear, index) {
    // Get the forecast section container
    const container = document.querySelector('.forecast-section');
    if (!container) return;

    // Create new subsection for this account
    const subsection = document.createElement('div');
    subsection.className = 'forecast-subsection aws-forecast-subsection';
    subsection.innerHTML = `
        <h4>AWS Cost Forecast – ${accountName}</h4>
        <div class="chart-container financial-chart">
            <canvas id="aws-forecast-chart-${index}"></canvas>
        </div>
    `;

    // Append to the forecast section
    container.appendChild(subsection);

    // Get canvas after it's been added to DOM
    setTimeout(() => {
        const ctx = document.getElementById(`aws-forecast-chart-${index}`);
        if (!ctx) {
            console.error(`Canvas not found for chart-${index}`);
            return;
        }

        // Prepare labels and data - exclude current month from historical
        const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
        const historicalData = history.slice(0, -1).map(h => {
            const account = h.data.find(d => d.account_name === accountName);
            return account ? parseFloat(account.current_cost) : null;
        });

        // Add current month with actual partial data
        const currentMonthData = history[history.length - 1];
        const currentAccount = currentMonthData.data.find(d => d.account_name === accountName);
        const currentActual = currentAccount ? parseFloat(currentAccount.current_cost) : null;
        labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
        historicalData.push(currentActual);

        // Add forecast point for month-end
        labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

        // Create forecast lines: show three separate points at Dec 31
        console.log(`${accountName} - Current: ${currentActual}, High: ${forecastData.high}, Mean: ${forecastData.mean}, Low: ${forecastData.low}`);
        const highLine = [...Array(historicalData.length).fill(null), forecastData.high];
        const meanLine = [...Array(historicalData.length).fill(null), forecastData.mean];
        const lowLine = [...Array(historicalData.length).fill(null), forecastData.low];

        // Create and store the chart
        const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Historical actuals (grey line)
                {
                    label: 'Actual Cost',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280'
                },
                // Forecast High (red)
                {
                    label: 'High Projection',
                    data: highLine,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: '+1',
                    pointRadius: 7,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0
                },
                // Forecast Mean (blue)
                {
                    label: 'Mean Projection',
                    data: meanLine,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 3,
                    fill: false,
                    pointRadius: 7,
                    pointBackgroundColor: '#3b82f6',
                    tension: 0
                },
                // Forecast Low (green)
                {
                    label: 'Low Projection',
                    data: lowLine,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: '-1',
                    pointRadius: 7,
                    pointStyle: 'rectRot',
                    pointBackgroundColor: '#22c55e',
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                title: {
                    display: true,
                    text: accountName,
                    color: '#e5e7eb',
                    font: { size: 13, weight: '400' },
                    align: 'start',
                    padding: { bottom: 15 }
                },
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#e5e7eb',
                        padding: 15,
                        font: { size: 12, weight: '500' },
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#374151',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: $${context.parsed.y?.toFixed(2) || 'N/A'}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.3)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)',
                        drawBorder: false
                    }
                }
            }
        }
    });

        // Store the chart in the array
        forecastCharts.aws.push(chart);
        console.log(`AWS chart created for ${accountName}`);
    }, 100); // Small delay to ensure canvas is in DOM
}
