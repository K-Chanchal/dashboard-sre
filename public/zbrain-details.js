// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const REFRESH_INTERVAL = 60000; // 1 minute

let refreshTimer;
let allZbrainData = [];
let currentFilter = 'all';

// Initialize page on load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Zbrain Details page initialized');
    fetchZbrainData();
    startAutoRefresh();
    setupFilterButtons();
});

// Fetch Zbrain data from API
async function fetchZbrainData() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_BASE_URL}/monitoring/zbrain?_=${timestamp}`);

        if (!response.ok) {
            throw new Error('Failed to fetch Zbrain data');
        }

        allZbrainData = await response.json();
        updateStatistics(allZbrainData);
        displayZbrainData(allZbrainData);
        updateLastUpdate();
    } catch (error) {
        console.error('Error fetching Zbrain data:', error);
        showError('Failed to load Zbrain connectivity data');
    }
}

// Update statistics cards
function updateStatistics(data) {
    const total = data.length;
    const downUrls = data.filter(item => isDown(item));
    const upUrls = data.filter(item => !isDown(item));

    document.getElementById('total-urls').textContent = total;
    document.getElementById('down-count').textContent = downUrls.length;
    document.getElementById('up-count').textContent = upUrls.length;

    // Update failure banner
    updateFailureBanner(downUrls);
}

// Update failure banner
function updateFailureBanner(failedUrls) {
    const failureBanner = document.getElementById('zbrain-failure-banner');
    const failureDetails = document.getElementById('zbrain-failure-details');

    if (failedUrls.length === 0) {
        failureBanner.style.display = 'none';
        return;
    }

    failureBanner.style.display = 'block';
    failureDetails.innerHTML = '';

    // Create detailed failure table
    const section = document.createElement('div');
    section.className = 'failure-section';

    const title = document.createElement('div');
    title.className = 'failure-section-title';
    title.innerHTML = `
        <span>ZBRAIN CONNECTIVITY</span>
        <span class="failure-count-badge">${failedUrls.length} Failed</span>
    `;
    section.appendChild(title);

    // Create table
    const table = document.createElement('table');
    table.className = 'failure-details-table';

    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>URL</th>
            <th>Status</th>
            <th>Status Code</th>
            <th>Last Refresh Time</th>
        </tr>
    `;
    table.appendChild(thead);

    // Table body with failed URLs
    const tbody = document.createElement('tbody');
    failedUrls.forEach(item => {
        const row = createFailureRow(item);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);

    section.appendChild(table);
    failureDetails.appendChild(section);
}

// Create failure row for banner
function createFailureRow(item) {
    const row = document.createElement('tr');

    const url = item.url || item.URL || '-';
    const status = item.status || item.STATUS || '-';
    const statusCode = item.status_code || item.STATUS_CODE || '-';
    const lastRefresh = item.LAST_REFRESH_TIME || item.last_refresh_time || '-';

    row.innerHTML = `
        <td>${url}</td>
        <td><span class="status-badge status-failure">${status}</span></td>
        <td>${statusCode}</td>
        <td>${lastRefresh}</td>
    `;

    return row;
}

// Check if URL status is down
function isDown(item) {
    const status = (item.status || item.STATUS || '').toString().toUpperCase();
    return status === 'DOWN' || status === 'FAILED' || status === 'ERROR' ||
           status === 'OFFLINE' || status.includes('FAIL');
}

// Display Zbrain data in table
function displayZbrainData(data) {
    const tbody = document.getElementById('zbrain-details-tbody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No Zbrain connectivity data available</td></tr>';
        return;
    }

    // Filter data based on current filter
    let filteredData = data;
    if (currentFilter === 'down') {
        filteredData = data.filter(item => isDown(item));
    } else if (currentFilter === 'up') {
        filteredData = data.filter(item => !isDown(item));
    }

    // Sort: Down first, then Up
    filteredData.sort((a, b) => {
        const aIsDown = isDown(a);
        const bIsDown = isDown(b);
        if (aIsDown && !bIsDown) return -1;
        if (!aIsDown && bIsDown) return 1;
        return 0;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="no-data">No ${currentFilter} URLs found</td></tr>`;
        return;
    }

    filteredData.forEach((item, index) => {
        const row = createZbrainRow(item, index + 1);
        tbody.appendChild(row);
    });
}

// Create table row for Zbrain URL
function createZbrainRow(item, rowNumber) {
    const row = document.createElement('tr');

    const url = item.url || item.URL || '-';
    const status = item.status || item.STATUS || '-';
    const statusCode = item.status_code || item.STATUS_CODE || '-';
    const lastRefresh = item.LAST_REFRESH_TIME || item.last_refresh_time || '-';

    const isDownStatus = isDown(item);
    row.className = isDownStatus ? 'status-down' : 'status-up';

    const statusBadgeClass = isDownStatus ? 'status-failure' : 'status-success';

    row.innerHTML = `
        <td>${rowNumber}</td>
        <td><a href="${url}" target="_blank" style="color: inherit; text-decoration: none;">${url}</a></td>
        <td><span class="status-badge ${statusBadgeClass}">${status}</span></td>
        <td>${statusCode}</td>
        <td>${lastRefresh}</td>
    `;

    return row;
}

// Setup filter buttons
function setupFilterButtons() {
    const filterAll = document.getElementById('filter-all');
    const filterDown = document.getElementById('filter-down');
    const filterUp = document.getElementById('filter-up');

    filterAll.addEventListener('click', () => {
        setActiveFilter('all', filterAll);
        currentFilter = 'all';
        displayZbrainData(allZbrainData);
    });

    filterDown.addEventListener('click', () => {
        setActiveFilter('down', filterDown);
        currentFilter = 'down';
        displayZbrainData(allZbrainData);
    });

    filterUp.addEventListener('click', () => {
        setActiveFilter('up', filterUp);
        currentFilter = 'up';
        displayZbrainData(allZbrainData);
    });
}

// Set active filter button
function setActiveFilter(filter, button) {
    document.querySelectorAll('.filter-button').forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');
}

// Update last update timestamp
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

    document.getElementById('last-update').textContent = `${day}/${month}/${year}, ${time}`;
}

// Start auto-refresh timer
function startAutoRefresh() {
    refreshTimer = setInterval(() => {
        if (!document.hidden) {
            fetchZbrainData();
        }
    }, REFRESH_INTERVAL);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
}

// Show error message
function showError(message) {
    console.error(message);
    const tbody = document.getElementById('zbrain-details-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="error">${message}</td></tr>`;
}

// Pause refresh when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        fetchZbrainData();
        startAutoRefresh();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
