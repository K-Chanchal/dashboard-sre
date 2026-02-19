// Configuration
const API_BASE_URL = 'https://qnw5w902f4.execute-api.us-west-2.amazonaws.com/default/api';
const REFRESH_INTERVAL = 60000; // 1 minute
const CUSTOM_LABELS_STORAGE_KEY = 'zbrainCustomLabelsV1';
const CUSTOM_ROW_LABELS_STORAGE_KEY = 'zbrainCustomRowLabelsV1';

// State
let refreshTimer;
let allZbrainData = [];
let currentStatusFilter = 'all';
let currentEnvFilter = 'ALL';
let currentLabelFilter = 'ALL';
let currentSearch = '';
let sortColumn = null;
let sortDirection = null; // 'asc', 'desc', or null
let customLabelNames = {};
let customRowLabels = {};
let pendingLabelRowKey = null;
let pendingLabelError = '';

// Initialize page on load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Zbrain Details page initialized');
    loadCustomLabels();
    loadCustomRowLabels();
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
    const envButtonsContainer = document.querySelector('.env-filter-row .env-buttons');
    if (envButtonsContainer) {
        envButtonsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.env-button');
            if (!button) return;

            envButtonsContainer.querySelectorAll('.env-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentEnvFilter = button.dataset.env || 'ALL';
            displayZbrainData();
        });
    }

    // Labels filter buttons (dynamic)
    const labelButtonsContainer = document.getElementById('label-buttons');
    if (labelButtonsContainer) {
        labelButtonsContainer.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.label-delete-button');
            if (deleteButton) {
                const labelToDelete = deleteButton.dataset.label;
                if (labelToDelete) {
                    deleteCustomLabel(labelToDelete);
                }
                return;
            }

            const button = e.target.closest('.label-button');
            if (!button) return;

            selectLabelFilter(button.dataset.label || 'ALL');
        });
    }

    const tableBody = document.getElementById('zbrain-details-tbody');
    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const saveButton = event.target.closest('.table-label-inline-save');
            if (saveButton) {
                submitInlineLabelEditor();
                return;
            }

            const cancelButton = event.target.closest('.table-label-inline-cancel');
            if (cancelButton) {
                closeInlineLabelEditor();
                return;
            }

            const editButton = event.target.closest('.table-label-edit-button');
            if (editButton) {
                const rowKey = editButton.dataset.rowKey;
                if (rowKey) {
                    handleRowLabelEdit(rowKey);
                }
                return;
            }

            const labelLink = event.target.closest('.table-label-link');
            if (!labelLink) return;

            const label = labelLink.dataset.label || 'ALL';
            selectLabelFilter(label);
        });

        tableBody.addEventListener('keydown', (event) => {
            const isInlineInput = event.target && event.target.classList && event.target.classList.contains('table-label-inline-input');
            if (!isInlineInput) return;

            if (event.key === 'Enter') {
                event.preventDefault();
                submitInlineLabelEditor();
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeInlineLabelEditor();
            }
        });
    }

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
        showLabels(allZbrainData);
        displayZbrainData();
        updateLastUpdate();
    } catch (error) {
        console.error('Error fetching Zbrain data:', error);
        showError('Failed to load Zbrain connectivity data');
    }
}

// Update statistics cards
function updateStatistics(data) {
    console.log('Updating statistics with data:', data);
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

function getRowLabelKey(item) {
    const env = getEnv(item).toUpperCase().trim();
    const url = getUrl(item).trim();
    return `${env}::${url}`;
}

function getEffectiveNormalizedLabels(item) {
    const rowKey = getRowLabelKey(item);
    const labels = [];

    const baseLabel = normalizeLabel(getUseCase(item));
    if (baseLabel && baseLabel !== '-') {
        labels.push(baseLabel);
    }

    const customLabels = customRowLabels[rowKey] || [];
    customLabels.forEach(label => {
        if (!label || label === '-' || label === 'ALL') {
            return;
        }

        if (!labels.includes(label)) {
            labels.push(label);
        }
    });

    return labels;
}

function getLabelDisplayNameByNormalized(normalizedLabel) {
    if (!normalizedLabel || normalizedLabel === '-') {
        return '-';
    }

    if (customLabelNames[normalizedLabel]) {
        return customLabelNames[normalizedLabel];
    }

    const matchingItem = allZbrainData.find(item =>
        normalizeLabel(getUseCase(item)) === normalizedLabel
    );

    if (!matchingItem) {
        return normalizedLabel;
    }

    const rawLabel = getUseCase(matchingItem);
    const trimmedRawLabel = rawLabel && rawLabel !== '-' ? rawLabel.toString().trim() : '';
    return trimmedRawLabel || normalizedLabel;
}

function getEffectiveLabelDisplayNames(item) {
    return getEffectiveNormalizedLabels(item).map(getLabelDisplayNameByNormalized);
}

function normalizeLabel(label) {
    return (label || '').toString().trim().toUpperCase();
}

function getLabelDisplayName(normalizedLabel) {
    return getLabelDisplayNameByNormalized(normalizedLabel);
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
function getDaysRemaining(item) {
    const remainingDays = item.remaining_days || '';
    return remainingDays
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
        case 'daysRemaining':
            return getDaysRemaining(item);
        default:
            return '';
    }
}

function applyActiveFilters(data) {
    let filteredData = [...data];

    if (currentStatusFilter === 'down') {
        filteredData = filteredData.filter(item => isDown(item));
    } else if (currentStatusFilter === 'up') {
        filteredData = filteredData.filter(item => !isDown(item));
    }

    if (currentEnvFilter !== 'ALL') {
        filteredData = filteredData.filter(item => {
            const env = getEnv(item).toUpperCase();
            return env === currentEnvFilter || env.includes(currentEnvFilter);
        });
    }

    if (currentLabelFilter !== 'ALL') {
        filteredData = filteredData.filter(item =>
            getEffectiveNormalizedLabels(item).includes(currentLabelFilter)
        );
    }

    if (currentSearch) {
        filteredData = filteredData.filter(item =>
            getUrl(item).toLowerCase().includes(currentSearch) ||
            getAppName(item).toLowerCase().includes(currentSearch) ||
            getEffectiveLabelDisplayNames(item).join(' ').toLowerCase().includes(currentSearch)
        );
    }

    return filteredData;
}

// Display Zbrain data in table
function displayZbrainData() {
    const tbody = document.getElementById('zbrain-details-tbody');
    tbody.innerHTML = '';

    if (!allZbrainData || allZbrainData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">No Zbrain connectivity data available</td></tr>';
        updateTableInfo(0, 0);
        return;
    }

    let filteredData = applyActiveFilters(allZbrainData);

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
        tbody.innerHTML = '';
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

function showLabels(data) {
    const labelButtonsContainer = document.getElementById('label-buttons');
    if (!labelButtonsContainer) return;

    const labelsMap = new Map();
    data.forEach(item => {
        const normalizedLabels = getEffectiveNormalizedLabels(item);
        normalizedLabels.forEach(normalized => {
            if (!normalized || normalized === '-') return;

            const label = getLabelDisplayNameByNormalized(normalized);
            if (!label || label === '-') return;

            if (!labelsMap.has(normalized)) {
                labelsMap.set(normalized, label);
            }
        });
    });

    // Keep all created custom labels visible as filter buttons,
    // even if current API data has zero matches for them.
    Object.entries(customLabelNames).forEach(([normalized, displayName]) => {
        if (!normalized || normalized === 'ALL') return;
        if (!labelsMap.has(normalized)) {
            labelsMap.set(normalized, String(displayName || normalized));
        }
    });

    const labelsData = Array.from(labelsMap.entries())
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

    const normalizedLabels = labelsData.map(([normalized]) => normalized);

    // Preserve currently selected custom label so table can show zero-result state
    // instead of auto-resetting to ALL.
    if (
        currentLabelFilter !== 'ALL' &&
        !normalizedLabels.includes(currentLabelFilter) &&
        !customLabelNames[currentLabelFilter]
    ) {
        currentLabelFilter = 'ALL';
    }

    labelButtonsContainer.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = `env-button label-button ${currentLabelFilter === 'ALL' ? 'active' : ''}`.trim();
    allButton.dataset.label = 'ALL';
    allButton.textContent = 'ALL';
    labelButtonsContainer.appendChild(allButton);

    labelsData.forEach(([normalizedLabel, displayLabel]) => {
        const isCustomLabel = !!customLabelNames[normalizedLabel];
        const safeDisplayLabel = String(displayLabel || normalizedLabel);

        if (isCustomLabel) {
            const chip = document.createElement('div');
            chip.className = 'label-chip';

            const button = document.createElement('button');
            button.className = `env-button label-button ${currentLabelFilter === normalizedLabel ? 'active' : ''}`.trim();
            button.dataset.label = normalizedLabel;
            button.textContent = safeDisplayLabel;

            const deleteButton = document.createElement('button');
            deleteButton.className = 'label-delete-button';
            deleteButton.type = 'button';
            deleteButton.dataset.label = normalizedLabel;
            deleteButton.title = `Delete ${safeDisplayLabel}`;
            deleteButton.setAttribute('aria-label', `Delete ${safeDisplayLabel}`);
            deleteButton.innerHTML = '&times;';

            chip.appendChild(button);
            chip.appendChild(deleteButton);
            labelButtonsContainer.appendChild(chip);
            return;
        }

        const button = document.createElement('button');
        button.className = `env-button label-button ${currentLabelFilter === normalizedLabel ? 'active' : ''}`.trim();
        button.dataset.label = normalizedLabel;
        button.textContent = safeDisplayLabel;
        labelButtonsContainer.appendChild(button);
    });
}

function setActiveLabelFilterButton(selectedLabel) {
    const labelButtonsContainer = document.getElementById('label-buttons');
    if (!labelButtonsContainer) return;

    labelButtonsContainer.querySelectorAll('.label-button').forEach(button => {
        const buttonLabel = button.dataset.label || 'ALL';
        button.classList.toggle('active', buttonLabel === selectedLabel);
    });
}

function selectLabelFilter(label) {
    const normalizedLabel = normalizeLabel(label);
    const nextLabel = normalizedLabel || 'ALL';

    currentLabelFilter = nextLabel;
    setActiveLabelFilterButton(nextLabel);
    displayZbrainData();
}

function sanitizeCustomLabelNames(source) {
    const sanitized = {};
    if (!source || typeof source !== 'object') {
        return sanitized;
    }

    Object.entries(source).forEach(([rawKey, rawValue]) => {
        const normalizedKey = normalizeLabel(rawKey);
        if (!normalizedKey || normalizedKey === 'ALL') {
            return;
        }

        if (typeof rawValue !== 'string') {
            return;
        }

        const trimmedValue = rawValue.trim();
        sanitized[normalizedKey] = trimmedValue || normalizedKey;
    });

    return sanitized;
}

function loadCustomLabels() {
    try {
        const raw = localStorage.getItem(CUSTOM_LABELS_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const namesFromCurrentFormat = sanitizeCustomLabelNames(parsed?.labelNames);
        if (Object.keys(namesFromCurrentFormat).length > 0) {
            customLabelNames = namesFromCurrentFormat;
            return;
        }

        // Backward compatibility: older format may have stored labels at the root object.
        customLabelNames = sanitizeCustomLabelNames(parsed);
    } catch (error) {
        console.error('Failed to load custom labels:', error);
        customLabelNames = {};
    }
}

function saveCustomLabels() {
    const payload = {
        labelNames: customLabelNames,
    };
    localStorage.setItem(CUSTOM_LABELS_STORAGE_KEY, JSON.stringify(payload));
}

function sanitizeCustomRowLabels(source) {
    const sanitized = {};
    if (!source || typeof source !== 'object') {
        return sanitized;
    }

    Object.entries(source).forEach(([rawRowKey, rawLabels]) => {
        const rowKey = String(rawRowKey || '').trim();
        if (!rowKey) {
            return;
        }

        const values = Array.isArray(rawLabels) ? rawLabels : [rawLabels];
        const normalizedList = [];

        values.forEach(rawValue => {
            const normalizedLabel = normalizeLabel(rawValue);
            if (!normalizedLabel || normalizedLabel === 'ALL' || normalizedLabel === '-') {
                return;
            }

            if (!normalizedList.includes(normalizedLabel)) {
                normalizedList.push(normalizedLabel);
            }
        });

        if (normalizedList.length > 0) {
            sanitized[rowKey] = normalizedList;
        }
    });

    return sanitized;
}

function loadCustomRowLabels() {
    try {
        const raw = localStorage.getItem(CUSTOM_ROW_LABELS_STORAGE_KEY);
        if (!raw) {
            customRowLabels = {};
            return;
        }

        customRowLabels = sanitizeCustomRowLabels(JSON.parse(raw));
    } catch (error) {
        console.error('Failed to load row labels:', error);
        customRowLabels = {};
    }
}

function saveCustomRowLabels() {
    localStorage.setItem(CUSTOM_ROW_LABELS_STORAGE_KEY, JSON.stringify(customRowLabels));
}

function handleRowLabelEdit(rowKey) {
    openInlineLabelEditor(rowKey);
}

function openInlineLabelEditor(rowKey) {
    if (!rowKey) {
        return;
    }

    pendingLabelRowKey = rowKey;
    pendingLabelError = '';
    displayZbrainData();

    requestAnimationFrame(() => {
        const input = document.getElementById('row-label-inline-input');
        if (input) {
            input.focus();
        }
    });
}

function closeInlineLabelEditor() {
    const shouldRerender = !!pendingLabelRowKey;
    pendingLabelRowKey = null;
    pendingLabelError = '';

    if (shouldRerender) {
        displayZbrainData();
    }
}

function submitInlineLabelEditor() {
    if (!pendingLabelRowKey) {
        return;
    }

    const input = document.getElementById('row-label-inline-input');
    if (!input) {
        return;
    }

    const trimmed = input.value.trim();
    if (!trimmed) {
        pendingLabelError = 'Label is required';
        displayZbrainData();
        requestAnimationFrame(() => {
            const nextInput = document.getElementById('row-label-inline-input');
            if (nextInput) nextInput.focus();
        });
        return;
    }

    const normalized = normalizeLabel(trimmed);
    if (!normalized || normalized === 'ALL' || normalized === '-') {
        pendingLabelError = 'Please enter a valid label';
        displayZbrainData();
        requestAnimationFrame(() => {
            const nextInput = document.getElementById('row-label-inline-input');
            if (nextInput) nextInput.focus();
        });
        return;
    }

    if (!customLabelNames[normalized]) {
        customLabelNames[normalized] = trimmed;
        saveCustomLabels();
    }

    const existingLabels = customRowLabels[pendingLabelRowKey] || [];
    if (!existingLabels.includes(normalized)) {
        customRowLabels[pendingLabelRowKey] = [...existingLabels, normalized];
        saveCustomRowLabels();
    }

    showLabels(allZbrainData);
    displayZbrainData();
    closeInlineLabelEditor();
}

function deleteCustomLabel(normalizedLabel) {
    if (!customLabelNames[normalizedLabel]) {
        return;
    }

    delete customLabelNames[normalizedLabel];
    Object.keys(customRowLabels).forEach(rowKey => {
        const remainingLabels = (customRowLabels[rowKey] || []).filter(label => label !== normalizedLabel);
        if (remainingLabels.length === 0) {
            delete customRowLabels[rowKey];
            return;
        }

        customRowLabels[rowKey] = remainingLabels;
    });
    saveCustomLabels();
    saveCustomRowLabels();

    if (currentLabelFilter === normalizedLabel) {
        currentLabelFilter = 'ALL';
    }

    showLabels(allZbrainData);
    displayZbrainData();
}

// Create table row for Zbrain URL
function createZbrainRow(item, rowNumber) {
    const row = document.createElement('tr');
    const isDownStatus = isDown(item);
    row.className = isDownStatus ? 'status-down' : 'status-up';

    const url = getUrl(item);
    const env = getEnv(item).toUpperCase();
    const status = getStatus(item);
    const normalizedLabels = getEffectiveNormalizedLabels(item);
    const hasLabel = normalizedLabels.length > 0;
    const rowKey = getRowLabelKey(item);
    const isEditingRow = pendingLabelRowKey === rowKey;

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
        <td>
            <div class="table-label-cell">
                ${hasLabel
                    ? normalizedLabels
                        .map(normalizedLabel => {
                            const displayLabel = getLabelDisplayNameByNormalized(normalizedLabel);
                            return `<button type="button" class="table-label-link" data-label="${escapeHtml(normalizedLabel)}">${escapeHtml(displayLabel)}</button>`;
                        })
                        .join('')
                    : '<span class="text-muted">-</span>'
                }
                ${isEditingRow
                    ? `<div class="table-label-inline-editor">
                        <input id="row-label-inline-input" type="text" class="label-create-input table-label-inline-input" placeholder="Enter label name">
                        <button type="button" class="label-create-action table-label-inline-save">Add</button>
                        <button type="button" class="label-create-action secondary table-label-inline-cancel">Cancel</button>
                        ${pendingLabelError ? `<span class="label-create-error">${escapeHtml(pendingLabelError)}</span>` : ''}
                    </div>`
                    : `<button type="button" class="table-label-edit-button" data-row-key="${escapeHtml(rowKey)}" title="Edit label" aria-label="Edit label">
                        <i data-lucide="pencil" class="icon"></i>
                    </button>`
                }
            </div>
        </td>
        <td>
            <span class="badge badge-status ${statusBadgeClass}">
                <span class="badge-dot"></span>
                ${escapeHtml(status)}
            </span>
        </td>
        <td class="tabular-nums" style="text-align: center;">${escapeHtml(getStatusCode(item))}</td>
        <td class="text-muted">${escapeHtml(getKeyExpiresOn(item))}</td>
        <td class="text-muted">${escapeHtml(getDaysRemaining(item))}</td>
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

    if (currentLabelFilter !== 'ALL') {
        const labelName = getLabelDisplayName(currentLabelFilter);
        infoText += `${currentEnvFilter !== 'ALL' ? ' ' : ' ('}label: ${labelName}${currentEnvFilter !== 'ALL' ? '' : ')'}`;
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
    tbody.innerHTML = `<tr><td colspan="10" class="error">${escapeHtml(message)}</td></tr>`;
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
