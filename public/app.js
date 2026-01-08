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
    r2ClassB: null,
    zoneRequestsAll: null,
    zoneBandwidthCom: null,
    zoneBandwidthChina: null
};

// Modal chart instance
let modalChart = null;
let forecastDataCache = null;

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
    setupModalHandlers();
    setupSectionRotation();
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

        // Add click handler to show chart
        row.style.cursor = 'pointer';
        row.onclick = () => {
            openModal(`AWS Cost Forecast – ${account.account_name}`, 'aws-cost', account.account_name);
        };

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

    // Add click handlers to R2 cards
    setupR2CardClickHandlers();
}

// Setup click handlers for R2 cards
function setupR2CardClickHandlers() {
    const classACard = document.querySelector('.r2-card:nth-child(2)'); // Class A card
    const classBCard = document.querySelector('.r2-card:nth-child(3)'); // Class B card

    if (classACard) {
        classACard.style.cursor = 'pointer';
        classACard.onclick = () => {
            openModal('Cloudflare R2 – Class A Operations Forecast', 'r2-class-a');
        };
    }

    if (classBCard) {
        classBCard.style.cursor = 'pointer';
        classBCard.onclick = () => {
            openModal('Cloudflare R2 – Class B Operations Forecast', 'r2-class-b');
        };
    }
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

    // Add click handlers to Zone cards
    setupZoneCardClickHandlers();
}

// Setup click handlers for Zone cards
function setupZoneCardClickHandlers() {
    const requestsAllCard = document.querySelector('.zone-card:nth-child(1)'); // Requests All card
    const bandwidthComCard = document.querySelector('.zone-card:nth-child(2)'); // Bandwidth .com card
    const bandwidthChinaCard = document.querySelector('.zone-card:nth-child(3)'); // Bandwidth China card

    if (requestsAllCard) {
        requestsAllCard.style.cursor = 'pointer';
        requestsAllCard.onclick = () => {
            openModal('Cloudflare Zone – Requests All Forecast', 'zone-requests-all');
        };
    }

    if (bandwidthComCard) {
        bandwidthComCard.style.cursor = 'pointer';
        bandwidthComCard.onclick = () => {
            openModal('Cloudflare Zone – Bandwidth .com Forecast', 'zone-bandwidth-com');
        };
    }

    if (bandwidthChinaCard) {
        bandwidthChinaCard.style.cursor = 'pointer';
        bandwidthChinaCard.onclick = () => {
            openModal('Cloudflare Zone – Bandwidth China Forecast', 'zone-bandwidth-china');
        };
    }
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
    // Update all server sections at once
    SERVER_TYPES.forEach((serverType, index) => {
        const servers = serverData[serverType] || [];
        const sectionIndex = index + 1;

        // Check if all servers are running/success
        const failedServers = servers.filter(server => !isServerSuccess(server, serverType));

        const messageElement = document.getElementById(`server-status-message-${sectionIndex}`);
        const tbody = document.getElementById(`server-tbody-${sectionIndex}`);

        if (!messageElement || !tbody) return;

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
                const row = createServerRow(server, serverType);
                tbody.appendChild(row);
            });
        }
    });

    // Update indicator
    updateServerIndicator();
}

function updateServerIndicator() {
    const indicator = document.getElementById('server-indicator');
    if (indicator) {
        indicator.textContent = `${currentServerTypeIndex + 1} / ${SERVER_TYPES.length}`;
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
                status === 'NOT RUNNING' || status.includes('FAIL') || status.includes('NOT')) {
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

// Start server type rotation with slide animation
function startServerTypeRotation() {
    serverRotationTimer = setInterval(() => {
        navigateToServerSection(currentServerTypeIndex + 2);
    }, SERVER_TYPE_ROTATION_INTERVAL);
}

function resetServerRotationTimer() {
    stopServerTypeRotation();
    startServerTypeRotation();
}

function navigateToServerSection(targetSection) {
    const totalServerSections = SERVER_TYPES.length;

    // Wrap around logic
    if (targetSection < 1) targetSection = totalServerSections;
    if (targetSection > totalServerSections) targetSection = 1;

    const currentSectionEl = document.querySelector(`.server-section[data-server-section="${currentServerTypeIndex + 1}"]`);
    const targetSectionEl = document.querySelector(`.server-section[data-server-section="${targetSection}"]`);

    if (!currentSectionEl || !targetSectionEl) return;

    // Determine animation direction
    const direction = targetSection > (currentServerTypeIndex + 1) ? 'right' : 'left';

    // Exit current section
    currentSectionEl.classList.remove('active');
    currentSectionEl.classList.add(`exit-${direction}`);

    // Enter target section
    targetSectionEl.classList.add(`enter-${direction}`);

    setTimeout(() => {
        currentSectionEl.classList.remove('exit-left', 'exit-right');
        targetSectionEl.classList.remove('enter-left', 'enter-right');
        targetSectionEl.classList.add('active');

        currentServerTypeIndex = targetSection - 1;
        updateServerIndicator();
    }, 50);
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
    const prevButton = document.getElementById('prev-server-button');
    const nextButton = document.getElementById('next-server-button');

    if (!prevButton || !nextButton) {
        console.error('Server navigation buttons not found');
        return;
    }

    prevButton.addEventListener('click', () => {
        navigateToServerSection(currentServerTypeIndex);
        resetServerRotationTimer();
    });

    nextButton.addEventListener('click', () => {
        navigateToServerSection(currentServerTypeIndex + 2);
        resetServerRotationTimer();
    });
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
        forecastDataCache = data; // Cache the forecast data for modal
        renderForecastCharts(data);
    } catch (error) {
        console.error('Error fetching forecast data:', error);
        showError('Failed to load forecast data');
    }
}


// Setup modal handlers
function setupModalHandlers() {
    const modal = document.getElementById('chart-modal');
    const closeBtn = document.querySelector('.modal-close');

    // Close modal on X click
    closeBtn.addEventListener('click', closeModal);

    // Close modal on outside click
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            closeModal();
        }
    });
}

// Open modal with chart
function openModal(title, chartType, accountName = null) {
    if (!forecastDataCache) {
        console.error('Forecast data not available');
        return;
    }

    const modal = document.getElementById('chart-modal');
    const modalTitle = document.getElementById('modal-title');

    modalTitle.textContent = title;
    modal.style.display = 'block';

    // Destroy existing modal chart if any
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }

    // Render the appropriate chart
    setTimeout(() => {
        const ctx = document.getElementById('modal-chart');
        if (!ctx) return;

        const { historical, forecast, forecast_month, forecast_date, current_year } = forecastDataCache;

        if (chartType === 'r2-class-a') {
            modalChart = createR2ClassAChart(ctx, historical.cloudflare_r2, forecast.cloudflare_r2, forecast_month, forecast_date, current_year);
        } else if (chartType === 'r2-class-b') {
            modalChart = createR2ClassBChart(ctx, historical.cloudflare_r2, forecast.cloudflare_r2, forecast_month, forecast_date, current_year);
        } else if (chartType === 'zone-requests-all') {
            modalChart = createZoneRequestsAllChart(ctx, historical.cloudflare_zones, forecast.cloudflare_zones, forecast_month, forecast_date, current_year);
        } else if (chartType === 'zone-bandwidth-com') {
            modalChart = createZoneBandwidthComChart(ctx, historical.cloudflare_zones, forecast.cloudflare_zones, forecast_month, forecast_date, current_year);
        } else if (chartType === 'zone-bandwidth-china') {
            modalChart = createZoneBandwidthChinaChart(ctx, historical.cloudflare_zones, forecast.cloudflare_zones, forecast_month, forecast_date, current_year);
        } else if (chartType === 'aws-cost' && accountName) {
            modalChart = createAWSCostChart(ctx, historical.aws_cost, forecast.aws_cost[accountName], accountName, forecast_month, forecast_date, current_year);
        }
    }, 100);
}

// Close modal
function closeModal() {
    const modal = document.getElementById('chart-modal');
    modal.style.display = 'none';

    // Destroy modal chart
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
}

// Create R2 Class A chart for modal
function createR2ClassAChart(ctx, history, forecast, forecastMonth, forecastDate, currentYear) {
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => h.data ? parseFloat(h.data.Class_A_Requests_MM_PutObject) : null);

    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data ? parseFloat(currentMonthData.data.Class_A_Requests_MM_PutObject) : null;
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create connector lines from actual to forecast points
    const connectorToHigh = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.class_a_requests.high];
    const connectorToMean = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.class_a_requests.mean];
    // const connectorToLow = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.class_a_requests.low];

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Upper triangular area (Actual -> High -> Mean, red)
                {
                    label: 'Upper Uncertainty',
                    data: connectorToHigh,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Mean line for triangle fill reference
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Lower triangular area (Actual -> Mean -> Low, green) - COMMENTED OUT
                // {
                //     label: 'Lower Uncertainty',
                //     data: connectorToLow,
                //     borderColor: 'transparent',
                //     backgroundColor: 'rgba(34, 197, 94, 0.2)',
                //     borderWidth: 0,
                //     fill: '-1',
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 5
                // },
                // Historical actual line
                {
                    label: 'Actual Operations',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280',
                    order: 1
                },
                // Connector to High (dotted red)
                {
                    label: '',
                    data: connectorToHigh,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 3
                },
                // Connector to Mean (dotted gray)
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: '#6b7280',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 2
                },
                // Connector to Low (dotted green) - COMMENTED OUT
                // {
                //     label: '',
                //     data: connectorToLow,
                //     borderColor: '#22c55e',
                //     backgroundColor: 'transparent',
                //     borderWidth: 2,
                //     borderDash: [5, 5],
                //     fill: false,
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 3
                // },
                // Forecast points
                {
                    label: 'High Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.class_a_requests.high],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Mean Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.class_a_requests.mean],
                    borderColor: '#6b7280',
                    backgroundColor: '#6b7280',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointBackgroundColor: '#6b7280',
                    tension: 0,
                    order: 1
                },
                // Low Projection - COMMENTED OUT
                // {
                //     label: 'Low Projection',
                //     data: [...Array(historicalData.length).fill(null), forecast.class_a_requests.low],
                //     borderColor: '#22c55e',
                //     backgroundColor: '#22c55e',
                //     borderWidth: 0,
                //     fill: false,
                //     pointRadius: 8,
                //     pointStyle: 'rectRot',
                //     pointBackgroundColor: '#22c55e',
                //     tension: 0,
                //     order: 1
                // }
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
                        boxHeight: 8,
                        filter: function(item, chart) {
                            return item.text !== '';
                        }
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
                            if (!context.dataset.label) return null;
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

// Create R2 Class B chart for modal
function createR2ClassBChart(ctx, history, forecast, forecastMonth, forecastDate, currentYear) {
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => h.data ? parseFloat(h.data.Class_B_Requests_MM_GetObject) : null);

    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data ? parseFloat(currentMonthData.data.Class_B_Requests_MM_GetObject) : null;
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create connector lines from actual to forecast points
    const connectorToHigh = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.class_b_requests.high];
    const connectorToMean = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.class_b_requests.mean];
    // const connectorToLow = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.class_b_requests.low];

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Upper triangular area (Actual -> High -> Mean, red)
                {
                    label: 'Upper Uncertainty',
                    data: connectorToHigh,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Mean line for triangle fill reference
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Lower triangular area (Actual -> Mean -> Low, green) - COMMENTED OUT
                // {
                //     label: 'Lower Uncertainty',
                //     data: connectorToLow,
                //     borderColor: 'transparent',
                //     backgroundColor: 'rgba(34, 197, 94, 0.2)',
                //     borderWidth: 0,
                //     fill: '-1',
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 5
                // },
                // Historical actual line
                {
                    label: 'Actual Operations',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280',
                    order: 1
                },
                // Connector to High (dotted red)
                {
                    label: '',
                    data: connectorToHigh,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 3
                },
                // Connector to Mean (dotted gray)
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: '#6b7280',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 2
                },
                // Connector to Low (dotted green) - COMMENTED OUT
                // {
                //     label: '',
                //     data: connectorToLow,
                //     borderColor: '#22c55e',
                //     backgroundColor: 'transparent',
                //     borderWidth: 2,
                //     borderDash: [5, 5],
                //     fill: false,
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 3
                // },
                // Forecast points
                {
                    label: 'High Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.class_b_requests.high],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Mean Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.class_b_requests.mean],
                    borderColor: '#6b7280',
                    backgroundColor: '#6b7280',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointBackgroundColor: '#6b7280',
                    tension: 0,
                    order: 1
                },
                // Low Projection - COMMENTED OUT
                // {
                //     label: 'Low Projection',
                //     data: [...Array(historicalData.length).fill(null), forecast.class_b_requests.low],
                //     borderColor: '#22c55e',
                //     backgroundColor: '#22c55e',
                //     borderWidth: 0,
                //     fill: false,
                //     pointRadius: 8,
                //     pointStyle: 'rectRot',
                //     pointBackgroundColor: '#22c55e',
                //     tension: 0,
                //     order: 1
                // }
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
                        boxHeight: 8,
                        filter: function(item, chart) {
                            return item.text !== '';
                        }
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
                            if (!context.dataset.label) return null;
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

// Create Zone Requests All chart for modal
function createZoneRequestsAllChart(ctx, history, forecast, forecastMonth, forecastDate, currentYear) {
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => {
        return h.data.reduce((sum, z) => sum + parseFloat(z.Requests_M || 0), 0);
    });

    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data.reduce((sum, z) => sum + parseFloat(z.Requests_M || 0), 0);
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create connector lines from actual to forecast points
    const connectorToHigh = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.all_requests.high];
    const connectorToMean = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.all_requests.mean];
    // const connectorToLow = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.all_requests.low];

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Upper triangular area (Actual -> High -> Mean, red)
                {
                    label: 'Upper Uncertainty',
                    data: connectorToHigh,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Mean line for triangle fill reference
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Lower triangular area (Actual -> Mean -> Low, green) - COMMENTED OUT
                // {
                //     label: 'Lower Uncertainty',
                //     data: connectorToLow,
                //     borderColor: 'transparent',
                //     backgroundColor: 'rgba(34, 197, 94, 0.2)',
                //     borderWidth: 0,
                //     fill: '-1',
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 5
                // },
                // Historical actual line
                {
                    label: 'Actual Requests',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280',
                    order: 1
                },
                // Connector to High (dotted red)
                {
                    label: '',
                    data: connectorToHigh,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 3
                },
                // Connector to Mean (dotted gray)
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: '#6b7280',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 2
                },
                // Connector to Low (dotted green) - COMMENTED OUT
                // {
                //     label: '',
                //     data: connectorToLow,
                //     borderColor: '#22c55e',
                //     backgroundColor: 'transparent',
                //     borderWidth: 2,
                //     borderDash: [5, 5],
                //     fill: false,
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 3
                // },
                // Forecast points
                {
                    label: 'High Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.all_requests.high],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Mean Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.all_requests.mean],
                    borderColor: '#6b7280',
                    backgroundColor: '#6b7280',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointBackgroundColor: '#6b7280',
                    tension: 0,
                    order: 1
                },
                // Low Projection - COMMENTED OUT
                // {
                //     label: 'Low Projection',
                //     data: [...Array(historicalData.length).fill(null), forecast.all_requests.low],
                //     borderColor: '#22c55e',
                //     backgroundColor: '#22c55e',
                //     borderWidth: 0,
                //     fill: false,
                //     pointRadius: 8,
                //     pointStyle: 'rectRot',
                //     pointBackgroundColor: '#22c55e',
                //     tension: 0,
                //     order: 1
                // }
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
                        boxHeight: 8,
                        filter: function(item, chart) {
                            return item.text !== '';
                        }
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
                            if (!context.dataset.label) return null;
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} M`;
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
                            return value.toFixed(0) + ' M';
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

// Create Zone Bandwidth .com chart for modal
function createZoneBandwidthComChart(ctx, history, forecast, forecastMonth, forecastDate, currentYear) {
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => {
        return h.data.filter(z => z.Is_China === 0 || z.Is_China === '0')
            .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
    });

    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data.filter(z => z.Is_China === 0 || z.Is_China === '0')
        .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create connector lines from actual to forecast points
    const connectorToHigh = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.com_bandwidth.high];
    const connectorToMean = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.com_bandwidth.mean];
    // const connectorToLow = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.com_bandwidth.low];

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Upper Uncertainty',
                    data: connectorToHigh,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Lower Uncertainty - COMMENTED OUT
                // {
                //     label: 'Lower Uncertainty',
                //     data: connectorToLow,
                //     borderColor: 'transparent',
                //     backgroundColor: 'rgba(34, 197, 94, 0.2)',
                //     borderWidth: 0,
                //     fill: '-1',
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 5
                // },
                {
                    label: 'Actual Bandwidth',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280',
                    order: 1
                },
                {
                    label: '',
                    data: connectorToHigh,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 3
                },
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: '#6b7280',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 2
                },
                // Connector to Low - COMMENTED OUT
                // {
                //     label: '',
                //     data: connectorToLow,
                //     borderColor: '#22c55e',
                //     backgroundColor: 'transparent',
                //     borderWidth: 2,
                //     borderDash: [5, 5],
                //     fill: false,
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 3
                // },
                {
                    label: 'High Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.com_bandwidth.high],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Mean Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.com_bandwidth.mean],
                    borderColor: '#6b7280',
                    backgroundColor: '#6b7280',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointBackgroundColor: '#6b7280',
                    tension: 0,
                    order: 1
                },
                // Low Projection - COMMENTED OUT
                // {
                //     label: 'Low Projection',
                //     data: [...Array(historicalData.length).fill(null), forecast.com_bandwidth.low],
                //     borderColor: '#22c55e',
                //     backgroundColor: '#22c55e',
                //     borderWidth: 0,
                //     fill: false,
                //     pointRadius: 8,
                //     pointStyle: 'rectRot',
                //     pointBackgroundColor: '#22c55e',
                //     tension: 0,
                //     order: 1
                // }
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
                        boxHeight: 8,
                        filter: function(item, chart) {
                            return item.text !== '';
                        }
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
                            if (!context.dataset.label) return null;
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} TB`;
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
                            return value.toFixed(0) + ' TB';
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

// Create Zone Bandwidth China chart for modal
function createZoneBandwidthChinaChart(ctx, history, forecast, forecastMonth, forecastDate, currentYear) {
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => {
        return h.data.filter(z => z.Is_China === 1 || z.Is_China === '1')
            .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
    });

    const currentMonthData = history[history.length - 1];
    const currentActual = currentMonthData.data.filter(z => z.Is_China === 1 || z.Is_China === '1')
        .reduce((sum, z) => sum + parseFloat(z.Bandwidth_TB || 0), 0);
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create connector lines from actual to forecast points
    const connectorToHigh = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.china_bandwidth.high];
    const connectorToMean = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.china_bandwidth.mean];
    // const connectorToLow = [...Array(historicalData.length - 1).fill(null), currentActual, forecast.china_bandwidth.low];

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Upper Uncertainty',
                    data: connectorToHigh,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Lower Uncertainty - COMMENTED OUT
                // {
                //     label: 'Lower Uncertainty',
                //     data: connectorToLow,
                //     borderColor: 'transparent',
                //     backgroundColor: 'rgba(34, 197, 94, 0.2)',
                //     borderWidth: 0,
                //     fill: '-1',
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 5
                // },
                {
                    label: 'Actual Bandwidth',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280',
                    order: 1
                },
                {
                    label: '',
                    data: connectorToHigh,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 3
                },
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: '#6b7280',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 2
                },
                // Connector to Low - COMMENTED OUT
                // {
                //     label: '',
                //     data: connectorToLow,
                //     borderColor: '#22c55e',
                //     backgroundColor: 'transparent',
                //     borderWidth: 2,
                //     borderDash: [5, 5],
                //     fill: false,
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 3
                // },
                {
                    label: 'High Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.china_bandwidth.high],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Mean Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.china_bandwidth.mean],
                    borderColor: '#6b7280',
                    backgroundColor: '#6b7280',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointBackgroundColor: '#6b7280',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Low Projection',
                    data: [...Array(historicalData.length).fill(null), forecast.china_bandwidth.low],
                    borderColor: '#22c55e',
                    backgroundColor: '#22c55e',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'rectRot',
                    pointBackgroundColor: '#22c55e',
                    tension: 0,
                    order: 1
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
                        boxHeight: 8,
                        filter: function(item, chart) {
                            return item.text !== '';
                        }
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
                            if (!context.dataset.label) return null;
                            return `${context.dataset.label}: ${context.parsed.y?.toFixed(2) || 'N/A'} TB`;
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
                            return value.toFixed(0) + ' TB';
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

// Create AWS Cost chart for modal
function createAWSCostChart(ctx, history, forecastData, accountName, forecastMonth, forecastDate, currentYear) {
    const labels = history.slice(0, -1).map(h => `${h.month.substring(0, 3)}\n${h.year}`);
    const historicalData = history.slice(0, -1).map(h => {
        const account = h.data.find(d => d.account_name === accountName);
        return account ? parseFloat(account.current_cost) : null;
    });

    const currentMonthData = history[history.length - 1];
    const currentAccount = currentMonthData.data.find(d => d.account_name === accountName);
    const currentActual = currentAccount ? parseFloat(currentAccount.current_cost) : null;
    labels.push(`${forecastMonth.substring(0, 3)}\n${currentYear}\n(Partial)`);
    historicalData.push(currentActual);

    labels.push(`${forecastMonth.substring(0, 3)} ${forecastDate}\n(Forecast)`);

    // Create connector lines from actual to forecast points
    const connectorToHigh = [...Array(historicalData.length - 1).fill(null), currentActual, forecastData.high];
    const connectorToMean = [...Array(historicalData.length - 1).fill(null), currentActual, forecastData.mean];
    // const connectorToLow = [...Array(historicalData.length - 1).fill(null), currentActual, forecastData.low];

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Upper Uncertainty',
                    data: connectorToHigh,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 5
                },
                // Lower Uncertainty - COMMENTED OUT
                // {
                //     label: 'Lower Uncertainty',
                //     data: connectorToLow,
                //     borderColor: 'transparent',
                //     backgroundColor: 'rgba(34, 197, 94, 0.2)',
                //     borderWidth: 0,
                //     fill: '-1',
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 5
                // },
                {
                    label: 'Actual Cost',
                    data: [...historicalData, currentActual],
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107, 116, 128, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#6b7280',
                    order: 1
                },
                {
                    label: '',
                    data: connectorToHigh,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 3
                },
                {
                    label: '',
                    data: connectorToMean,
                    borderColor: '#6b7280',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0,
                    order: 2
                },
                // Connector to Low - COMMENTED OUT
                // {
                //     label: '',
                //     data: connectorToLow,
                //     borderColor: '#22c55e',
                //     backgroundColor: 'transparent',
                //     borderWidth: 2,
                //     borderDash: [5, 5],
                //     fill: false,
                //     pointRadius: 0,
                //     tension: 0,
                //     order: 3
                // },
                {
                    label: 'High Projection',
                    data: [...Array(historicalData.length).fill(null), forecastData.high],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ef4444',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Mean Projection',
                    data: [...Array(historicalData.length).fill(null), forecastData.mean],
                    borderColor: '#6b7280',
                    backgroundColor: '#6b7280',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointBackgroundColor: '#6b7280',
                    tension: 0,
                    order: 1
                },
                {
                    label: 'Low Projection',
                    data: [...Array(historicalData.length).fill(null), forecastData.low],
                    borderColor: '#22c55e',
                    backgroundColor: '#22c55e',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 8,
                    pointStyle: 'rectRot',
                    pointBackgroundColor: '#22c55e',
                    tension: 0,
                    order: 1
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
                        boxHeight: 8,
                        filter: function(item, chart) {
                            return item.text !== '';
                        }
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
                            if (!context.dataset.label) return null;
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
}

// Section Rotation Logic
let currentSection = 1;
const totalSections = 3;
let rotationInterval = null;
const ROTATION_DELAY = 5000; // 5 seconds (same as server rotation)

function setupSectionRotation() {
    const prevButton = document.getElementById('prev-section');
    const nextButton = document.getElementById('next-section');

    if (!prevButton || !nextButton) {
        console.error('Navigation buttons not found');
        return;
    }

    // Previous button handler
    prevButton.addEventListener('click', () => {
        navigateToSection(currentSection - 1);
        resetRotationTimer();
    });

    // Next button handler
    nextButton.addEventListener('click', () => {
        navigateToSection(currentSection + 1);
        resetRotationTimer();
    });

    // Start automatic rotation
    startSectionRotation();

    console.log('Section rotation initialized');
}

function navigateToSection(targetSection) {
    // Wrap around
    if (targetSection < 1) targetSection = totalSections;
    if (targetSection > totalSections) targetSection = 1;

    if (targetSection === currentSection) return;

    const sections = document.querySelectorAll('.rotation-section');
    const currentSectionEl = document.querySelector(`.rotation-section[data-section="${currentSection}"]`);
    const targetSectionEl = document.querySelector(`.rotation-section[data-section="${targetSection}"]`);

    if (!currentSectionEl || !targetSectionEl) {
        console.error('Section elements not found');
        return;
    }

    // Determine direction
    const direction = targetSection > currentSection ? 'right' : 'left';

    // Remove active class and add exit animation
    currentSectionEl.classList.remove('active');
    currentSectionEl.classList.add(`exit-${direction}`);

    // Add enter animation and then active class
    if (direction === 'right') {
        targetSectionEl.classList.add('enter-right');
    } else {
        targetSectionEl.classList.add('enter-left');
    }

    // Small delay to ensure CSS transition triggers
    setTimeout(() => {
        targetSectionEl.classList.remove('enter-left', 'enter-right');
        targetSectionEl.classList.add('active');
    }, 50);

    // Clean up exit animations after transition
    setTimeout(() => {
        currentSectionEl.classList.remove('exit-left', 'exit-right');
    }, 500);

    // Update current section
    currentSection = targetSection;

    // Update indicator
    updateSectionIndicator();
}

function updateSectionIndicator() {
    const indicator = document.getElementById('section-indicator');
    if (indicator) {
        indicator.textContent = `${currentSection} / ${totalSections}`;
    }
}

function startSectionRotation() {
    // Clear any existing interval
    if (rotationInterval) {
        clearInterval(rotationInterval);
    }

    // Auto-rotate every minute
    rotationInterval = setInterval(() => {
        navigateToSection(currentSection + 1);
    }, ROTATION_DELAY);

    console.log('Auto-rotation started: switching sections every 60 seconds');
}

function resetRotationTimer() {
    // Restart the rotation timer when user manually navigates
    startSectionRotation();
}
