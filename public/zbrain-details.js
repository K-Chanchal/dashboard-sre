// Configuration
const API_BASE_URL = 'https://qnw5w902f4.execute-api.us-west-2.amazonaws.com/default/api';
const REFRESH_INTERVAL = 60000; // 1 minute

// State
let refreshTimer;
let allZbrainData = [];
let currentStatusFilter = 'all';
let currentEnvFilter = 'ALL';
let currentSearch = '';
let sortColumn = null;
let sortDirection = null; // 'asc', 'desc', or null

// Initialize page on load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Zbrain Details page initialized');
    fetchZbrainData();
    startAutoRefresh();
    setupEventListeners();
});

// Setup all event listeners
function setupEventListeners() {
    // Status filter dropdown
    const statusFilter = document.getElementById('status-filter');
    statusFilter.addEventListener('change', (e) => {
        currentStatusFilter = e.target.value;
        displayZbrainData();
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        displayZbrainData();
    });

    // Environment filter buttons
    document.querySelectorAll('.env-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.env-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentEnvFilter = button.dataset.env;
            displayZbrainData();
        });
    });

    // Sortable column headers
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            handleSort(column, header);
        });
    });
}

// Handle column sorting
function handleSort(column, headerElement) {
    // Clear previous sort indicators
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });

    if (sortColumn === column) {
        // Cycle through: asc -> desc -> null
        if (sortDirection === 'asc') {
            sortDirection = 'desc';
            headerElement.classList.add('sort-desc');
        } else if (sortDirection === 'desc') {
            sortDirection = null;
            sortColumn = null;
        } else {
            sortDirection = 'asc';
            headerElement.classList.add('sort-asc');
        }
    } else {
        sortColumn = column;
        sortDirection = 'asc';
        headerElement.classList.add('sort-asc');
    }

    // Re-render icons
    updateSortIcons();
    displayZbrainData();
}

// Update sort icons
function updateSortIcons() {
    document.querySelectorAll('.sortable').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        if (!icon) return;

        const column = header.dataset.sort;
        if (sortColumn === column) {
            if (sortDirection === 'asc') {
                icon.setAttribute('data-lucide', 'arrow-up');
            } else if (sortDirection === 'desc') {
                icon.setAttribute('data-lucide', 'arrow-down');
            } else {
                icon.setAttribute('data-lucide', 'arrow-up-down');
            }
        } else {
            icon.setAttribute('data-lucide', 'arrow-up-down');
        }
    });

    // Re-initialize lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

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
        displayZbrainData();
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
    updateFailureBanner(downUrls.length);
}

// Update failure banner
function updateFailureBanner(downCount) {
    const failureBanner = document.getElementById('zbrain-failure-banner');
    const failureText = document.getElementById('failure-count-text');

    if (downCount === 0) {
        failureBanner.style.display = 'none';
        return;
    }

    failureBanner.style.display = 'block';
    failureText.textContent = `${downCount} URL${downCount > 1 ? 's are' : ' is'} currently unreachable`;
}

// Check if URL status is down
function isDown(item) {
    const status = (item.status || item.STATUS || '').toString().toUpperCase();
    return status === 'DOWN' || status === 'FAILED' || status === 'ERROR' ||
           status === 'OFFLINE' || status.includes('FAIL');
}

// Get field value helpers
function getAppName(item) {
    return item.APPLICATION_NAME || item.application_name || item.APP_NAME || item.app_name || '-';
}

function getUrl(item) {
    return item.url || item.URL || '-';
}

function getEnv(item) {
    return item.ENV || item.env || '-';
}

function getUseCase(item) {
    return item.USE_CASE || item.use_case || '-';
}

function getStatus(item) {
    return item.status || item.STATUS || '-';
}

function getStatusCode(item) {
    return item.status_code || item.STATUS_CODE || '-';
}

function getKeyExpiresOn(item) {
    const dateStr = item.KEY_EXPIRES_ON || item.key_expires_on || item.EXPIRY_DATE || item.expiry_date || '';
    return formatDate(dateStr);
}

function getLastRefresh(item) {
    const dateStr = item.LAST_REFRESH_TIME || item.last_refresh_time || item.LAST_REFRESH_DATE || item.last_refresh_date || '';
    return formatDateTime(dateStr);
}

// Format date to readable format (e.g., "Jan 31, 2026")
function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

// Format datetime to readable format (e.g., "Jan 21, 2026, 12:45 PM")
function formatDateTime(dateStr) {
    if (!dateStr || dateStr === '-') return '-';

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return dateStr;
    }
}

// Get column value for sorting
function getColumnValue(item, column) {
    switch (column) {
        case 'appName':
            return getAppName(item).toLowerCase();
        case 'url':
            return getUrl(item).toLowerCase();
        case 'env':
            return getEnv(item).toLowerCase();
        case 'useCase':
            return getUseCase(item).toLowerCase();
        case 'status':
            return getStatus(item).toLowerCase();
        case 'code':
            return parseInt(getStatusCode(item)) || 0;
        case 'keyExpires':
            return getKeyExpiresOn(item);
        case 'lastRefresh':
            return getLastRefresh(item);
        default:
            return '';
    }
}

// Display Zbrain data in table
function displayZbrainData() {
    const tbody = document.getElementById('zbrain-details-tbody');
    tbody.innerHTML = '';

    if (!allZbrainData || allZbrainData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No Zbrain connectivity data available</td></tr>';
        updateTableInfo(0, 0);
        return;
    }

    // Apply filters
    let filteredData = [...allZbrainData];

    // Status filter
    if (currentStatusFilter === 'down') {
        filteredData = filteredData.filter(item => isDown(item));
    } else if (currentStatusFilter === 'up') {
        filteredData = filteredData.filter(item => !isDown(item));
    }

    // Environment filter
    if (currentEnvFilter !== 'ALL') {
        filteredData = filteredData.filter(item => {
            const env = getEnv(item).toUpperCase();
            return env === currentEnvFilter || env.includes(currentEnvFilter);
        });
    }

    // Search filter
    if (currentSearch) {
        filteredData = filteredData.filter(item =>
            getUrl(item).toLowerCase().includes(currentSearch) ||
            getAppName(item).toLowerCase().includes(currentSearch) ||
            getUseCase(item).toLowerCase().includes(currentSearch)
        );
    }

    // Sort: Always keep down items first, then apply column sorting
    filteredData.sort((a, b) => {
        // First: down items always first
        const aDown = isDown(a);
        const bDown = isDown(b);
        if (aDown && !bDown) return -1;
        if (!aDown && bDown) return 1;

        // Second: apply column sorting within each group
        if (sortColumn && sortDirection) {
            const aValue = getColumnValue(a, sortColumn);
            const bValue = getColumnValue(b, sortColumn);

            let comparison = 0;
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                comparison = aValue - bValue;
            } else {
                comparison = String(aValue).localeCompare(String(bValue));
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        }

        return 0;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No URLs match the current filters</td></tr>';
        updateTableInfo(0, allZbrainData.length);
        return;
    }

    filteredData.forEach((item, index) => {
        const row = createZbrainRow(item, index + 1);
        tbody.appendChild(row);
    });

    updateTableInfo(filteredData.length, allZbrainData.length);

    // Re-initialize lucide icons for new elements
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Create table row for Zbrain URL
function createZbrainRow(item, rowNumber) {
    const row = document.createElement('tr');
    const isDownStatus = isDown(item);
    row.className = isDownStatus ? 'status-down' : 'status-up';

    const url = getUrl(item);
    const env = getEnv(item).toUpperCase();
    const status = getStatus(item);

    // Status badge class
    const statusBadgeClass = isDownStatus ? 'badge-danger' : 'badge-success';

    // Environment badge class
    let envBadgeClass = 'badge-env-default';
    if (env === 'PROD') envBadgeClass = 'badge-env-prod';
    else if (env === 'TEST') envBadgeClass = 'badge-env-test';
    else if (env === 'DEV') envBadgeClass = 'badge-env-dev';

    row.innerHTML = `
        <td class="tabular-nums text-muted">${rowNumber}</td>
        <td>${escapeHtml(getAppName(item))}</td>
        <td>${escapeHtml(url)}</td>
        <td>
            <span class="badge badge-env ${envBadgeClass}">${escapeHtml(getEnv(item))}</span>
        </td>
        <td class="text-muted">${escapeHtml(getUseCase(item))}</td>
        <td>
            <span class="badge badge-status ${statusBadgeClass}">
                <span class="badge-dot"></span>
                ${escapeHtml(status)}
            </span>
        </td>
        <td class="tabular-nums" style="text-align: center;">${escapeHtml(getStatusCode(item))}</td>
        <td class="text-muted">${escapeHtml(getKeyExpiresOn(item))}</td>
        <td class="text-muted">${escapeHtml(getLastRefresh(item))}</td>
    `;

    return row;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update table info text
function updateTableInfo(showing, total) {
    const tableInfo = document.getElementById('table-info');
    let infoText = `Showing ${showing} of ${total} URLs`;

    if (currentEnvFilter !== 'ALL') {
        infoText += ` (filtered by ${currentEnvFilter})`;
    }

    if (sortColumn && sortDirection) {
        infoText += ` • Sorted by ${sortColumn} (${sortDirection})`;
    }

    tableInfo.textContent = infoText;
}

// Update last update timestamp
function updateLastUpdate() {
    const now = new Date();
    const formatted = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

    document.getElementById('last-update').textContent = formatted;
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
    tbody.innerHTML = `<tr><td colspan="9" class="error">${escapeHtml(message)}</td></tr>`;
    updateTableInfo(0, 0);
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
