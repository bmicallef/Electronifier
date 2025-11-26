const ACTIVE_PROJECT_STORAGE_KEY = 'modspector.activeConfigurationKey';

const state = {
    servers: [],
    savedConfigs: [],
    scanJobId: null,
    scanTimer: null,
    runtimeStats: {},
    runtimeRegisterMaps: {},
    activeConfiguration: null,
    addressProbeResults: [],
    addressProbeSelections: {},
    addressProbeSelected: new Set(),
    addressProbeRequest: null,
    addressProbePollTimer: null,
    addressProbePollInFlight: false,
    probeByteOrder: 'BigEndian',
    runtimeRefreshTimers: {},
    serialDevices: [],
    scanContext: 'network',
    scanEndpoint: '/api/scan',
    networkDiscoveryDevices: [],
    networkDiscoveryInProgress: false,
    probeContext: 'network',
    probeEndpoint: '/api/address-probe',
    addressProbeSummary: '',
    probePollingInterval: 500,
    serialListenerJobId: null,
    serialListenerTimer: null,
    serialListenerAutoStopTimer: null,
    serialListenerLog: [],
    serialListenerFrames: [],
    serialListenerUnits: new Map(),
    serialListenerLastSequence: 0,
    serialListenerDevice: null,
    networkInterfaces: [],
    serialDevicesLoading: false,
    networkInterfacesLoading: false
};

function persistActiveConfigurationKey(key) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    try {
        if (key) {
            window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, key);
        } else {
            window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
        }
    } catch {
        // Ignore storage failures (e.g., private mode or quota issues)
    }
}

function readPersistedActiveConfigurationKey() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }

    try {
        return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    } catch {
        return null;
    }
}

function setActiveConfiguration(config) {
    if (!config) {
        state.activeConfiguration = null;
        persistActiveConfigurationKey(null);
        return;
    }

    state.activeConfiguration = normalizeConfigInfo(config);
    persistActiveConfigurationKey(state.activeConfiguration.key);
}

const isSerialDeviceAllowed = createSerialDevicePredicate();

function createSerialDevicePredicate() {
    const platformHint = (() => {
        if (typeof navigator === 'undefined') {
            return '';
        }
        return (navigator.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? '').toLowerCase();
    })();

    const isWindows = platformHint.includes('win');
    if (isWindows) {
        return (deviceId = '') => /com\d+/i.test((deviceId ?? '').trim());
    }

    return (deviceId = '') => {
        const id = (deviceId ?? '').trim().toLowerCase();
        return id.startsWith('/dev/tty');
    };
}

let bulkActionInFlight = false;

const elements = {
    alerts: document.getElementById('globalAlerts'),
    serversContainer: document.getElementById('serversContainer'),
    serverEmptyState: document.getElementById('serverEmptyState'),
    createServerForm: document.getElementById('createServerForm'),
    registerModal: document.getElementById('registerModal'),
    registerForm: document.getElementById('registerForm'),
    registerServerId: document.getElementById('registerServerId'),
    createServerModalElement: document.getElementById('createServerModal'),
    startAllDevicesBtn: document.getElementById('startAllDevicesBtn'),
    stopAllDevicesBtn: document.getElementById('stopAllDevicesBtn'),
    workspaceNavigationLink: document.getElementById('workspaceDeviceStudioLink'),
    registerAddressPreview: document.getElementById('registerAddressPreview'),
    editServerModal: document.getElementById('editServerModal'),
    editServerForm: document.getElementById('editServerForm'),
    editServerId: document.getElementById('editServerId'),
    createServerHostSelect: document.getElementById('serverHostSelect'),
    createServerHostCustom: document.getElementById('serverHostCustom'),
    editServerHostSelect: document.getElementById('editServerHost'),
    editServerHostCustom: document.getElementById('editServerHostCustom'),
    serversCard: document.getElementById('serversCardCol'),
    serversPlaceholder: document.getElementById('serversPlaceholder'),
    activeConfigurationDisplay: document.getElementById('activeConfigurationDisplay'),
    activeConfigurationName: document.getElementById('activeConfigurationName'),
    configSelect: document.getElementById('configSelect'),
    loadConfigBtn: document.getElementById('loadConfigBtn'),
    editProjectBtn: document.getElementById('editProjectBtn'),
    deleteProjectBtn: document.getElementById('deleteProjectBtn'),
    createConfigLink: document.getElementById('createConfigLink'),
    configModalForm: document.getElementById('configModalForm'),
    scanForm: document.getElementById('scanForm'),
    scanInterfaceSelect: document.getElementById('scanInterfaceSelect'),
    scanProgressWrapper: document.getElementById('scanProgressWrapper'),
    scanProgressBar: document.getElementById('scanProgressBar'),
    discoverNetworkLink: document.getElementById('discoverNetworkLink'),
    networkDiscoveryProgress: document.getElementById('networkDiscoveryProgress'),
    networkDiscoveryResultsWrapper: document.getElementById('networkDiscoveryResultsWrapper'),
    networkDiscoveryTableBody: document.getElementById('networkDiscoveryTableBody'),
    clearNetworkDiscoveryLink: document.getElementById('clearNetworkDiscoveryLink'),
    scanStartIp: document.getElementById('scanStartIp'),
    refreshNetworkInterfaceLink: document.querySelector('.refresh-network-interface-link'),
    scanResultsBody: document.getElementById('scanResultsBody'),
    cancelScanBtn: document.getElementById('cancelScanBtn'),
    serialDeviceSelect: document.getElementById('serialDeviceSelect'),
    serialDeviceCustom: document.getElementById('serialDeviceCustom'),
    serialBaudRate: document.getElementById('serialBaudRate'),
    serialParity: document.getElementById('serialParity'),
    serialDataBits: document.getElementById('serialDataBits'),
    serialStopBits: document.getElementById('serialStopBits'),
    serialStartUnit: document.getElementById('serialStartUnit'),
    serialEndUnit: document.getElementById('serialEndUnit'),
    addressProbeForm: document.getElementById('addressProbeForm'),
    addressProbeResultsBody: document.getElementById('probeResultsBody'),
    serialListenerStartBtn: document.getElementById('serialListenerStartBtn'),
    serialListenerStopBtn: document.getElementById('serialListenerStopBtn'),
    serialListenerClearBtn: document.getElementById('serialListenerClearBtn'),
    serialListenerLog: document.getElementById('serialListenerLog'),
    serialListenerFrames: document.getElementById('serialListenerFrames'),
    serialListenerRawContainer: document.getElementById('serialListenerRawContainer'),
    serialListenerFramesContainer: document.getElementById('serialListenerFramesContainer'),
    serialListenerLogCopyBtn: document.getElementById('serialListenerLogCopyBtn'),
    serialListenerFramesCopyBtn: document.getElementById('serialListenerFramesCopyBtn'),
    serialListenerSummaryBody: document.getElementById('serialListenerSummaryBody'),
    projectsCollapse: document.getElementById('projectsCollapse'),
    networkScannerCollapse: document.getElementById('networkScannerCollapse'),
    addressProbeCollapse: document.getElementById('addressProbeCollapse'),
    modbusServersCollapse: document.getElementById('modbusServersCollapse'),
    cloneServerModalElement: document.getElementById('cloneServerModal'),
    cloneServerForm: document.getElementById('cloneServerForm'),
    cloneServerHostSelect: document.getElementById('cloneServerHost'),
    cloneServerHostCustom: document.getElementById('cloneServerHostCustom'),
    cloneServerSourceId: document.getElementById('cloneServerSourceId'),
    cloneServerPortInput: document.getElementById('cloneServerPort'),
    cloneServerUnitInput: document.getElementById('cloneServerUnit'),
    confirmCloneServerBtn: document.getElementById('confirmCloneServerBtn'),
    createServerEndpointWarning: document.getElementById('createServerEndpointWarning'),
    editServerEndpointWarning: document.getElementById('editServerEndpointWarning'),
    cloneServerEndpointWarning: document.getElementById('cloneServerEndpointWarning'),
    probeByteOrder: document.getElementById('probeByteOrder'),
    probeCommId: document.getElementById('probeCommId'),
    probeCommIdCustom: document.getElementById('probeCommIdCustom'),
    probeBaudRate: document.getElementById('probeBaudRate'),
    probeParitySelect: document.getElementById('probeParity'),
    probeDataBitsSelect: document.getElementById('probeDataBits'),
    probeStopBitsSelect: document.getElementById('probeStopBits'),
    probeSelectAll: document.getElementById('probeSelectAll'),
    cloneProbeLink: document.getElementById('cloneProbeLink'),
    cloneProbeModalElement: document.getElementById('cloneProbeModal'),
    cloneProbeForm: document.getElementById('cloneProbeForm'),
    cloneProbeServerSelect: document.getElementById('cloneProbeServerSelect'),
    cloneProbeServerGroup: document.getElementById('cloneProbeServerGroup'),
    cloneProbeNoDevices: document.getElementById('cloneProbeNoDevices'),
    cloneProbeProjectSelect: document.getElementById('cloneProbeProjectSelect'),
    cloneProbeProjectGroup: document.getElementById('cloneProbeProjectGroup'),
    cloneProbeNoProjects: document.getElementById('cloneProbeNoProjects'),
    cloneProbeLoadProjectBtn: document.getElementById('cloneProbeLoadProjectBtn'),
    cloneProbeCreateProjectBtn: document.getElementById('cloneProbeCreateProjectBtn'),
    cloneProbeCreateDeviceBtn: document.getElementById('cloneProbeCreateDeviceBtn'),
    confirmCloneProbeBtn: document.getElementById('confirmCloneProbeBtn'),
    probeActions: document.getElementById('probeActions'),
    probePollingToggle: document.getElementById('probePollingToggle'),
    probePollingToggleLabel: document.getElementById('probePollingToggleLabel'),
    endProbeBtn: document.getElementById('endProbeBtn')
};

const modal = elements.registerModal ? new bootstrap.Modal(elements.registerModal) : null;
const createServerModal = elements.createServerModalElement ? new bootstrap.Modal(elements.createServerModalElement) : null;
const editServerModal = elements.editServerModal ? new bootstrap.Modal(elements.editServerModal) : null;
const configModal = document.getElementById('configModal') ? new bootstrap.Modal(document.getElementById('configModal')) : null;
const cloneServerModal = elements.cloneServerModalElement ? new bootstrap.Modal(elements.cloneServerModalElement) : null;
const cloneProbeModal = elements.cloneProbeModalElement ? new bootstrap.Modal(elements.cloneProbeModalElement) : null;

const endpointWarningElements = {
    create: elements.createServerEndpointWarning,
    edit: elements.editServerEndpointWarning,
    clone: elements.cloneServerEndpointWarning
};

state.scanContext = elements.scanForm?.dataset.scanContext ?? 'network';
state.scanEndpoint = state.scanContext === 'serial' ? '/api/serial-scan' : '/api/scan';
state.probeContext = elements.addressProbeForm?.dataset.probeContext ?? 'network';
state.probeEndpoint = state.probeContext === 'serial' ? '/api/serial-address-probe' : '/api/address-probe';
state.addressProbeSummary = '';

if (elements.configModalForm) {
    setProjectModalMode('create');
}

const functionAddressBases = {
    Coil: 0,
    DiscreteInput: 10000,
    InputRegister: 30000,
    HoldingRegister: 40000
};

const dataTypeWordLengths = {
    Boolean: 1,
    UInt16: 1,
    Int16: 1,
    UInt32: 2,
    Int32: 2,
    Float32: 2,
    Double: 4
};

const integerDataTypes = new Set(['UInt16', 'Int16', 'UInt32', 'Int32']);

const dataTypeRanges = {
    UInt16: { min: 0, max: 65535 },
    Int16: { min: -32768, max: 32767 },
    UInt32: { min: 0, max: 4294967295 },
    Int32: { min: -2147483648, max: 2147483647 }
};

const probeByteOrderModes = new Set(['BigEndian', 'LittleEndian', 'WordSwap', 'ByteSwap']);

function sanitizeConfigKey(key) {
    return (key ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function normalizeConfigInfo(entry) {
    if (typeof entry === 'string') {
        const slug = sanitizeConfigKey(entry);
        return { key: slug, name: entry.trim() || slug.replace(/_/g, ' ') };
    }

    const name = (entry?.name ?? '').trim();
    const keySource = entry?.key ?? name;
    const key = sanitizeConfigKey(keySource);
    return { key, name: name || key.replace(/_/g, ' ') };
}

function updateActiveConfigurationDisplay() {
    const name = state.activeConfiguration?.name ?? 'None selected';
    if (elements.activeConfigurationDisplay) {
        elements.activeConfigurationDisplay.textContent = name;
    }
    if (elements.activeConfigurationName) {
        elements.activeConfigurationName.textContent = name;
    }
    if (elements.configSelect) {
        if (state.activeConfiguration) {
            elements.configSelect.value = state.activeConfiguration.key;
        } else {
            elements.configSelect.value = '';
        }
    }
    updateLoadButtonState();
    updateProjectManagementButtons();
    updateWorkspaceNavigationCta();
}

function updateServersVisibility() {
    const hasActive = Boolean(state.activeConfiguration);
    elements.serversCard?.classList.toggle('d-none', !hasActive);
    elements.serversPlaceholder?.classList.toggle('d-none', hasActive);
    setCollapseState(elements.modbusServersCollapse, hasActive);
    setCollapseState(elements.projectsCollapse, hasActive);
    updateBulkDeviceButtons();
}

function updateLoadButtonState() {
    if (!elements.loadConfigBtn || !elements.configSelect) {
        return;
    }

    const selectedKey = elements.configSelect.value;
    const isActive = state.activeConfiguration?.key === selectedKey && !!selectedKey;
    if (isActive) {
        elements.loadConfigBtn.disabled = !selectedKey;
        elements.loadConfigBtn.textContent = 'Unload Project';
        elements.loadConfigBtn.classList.remove('btn-outline-primary');
        elements.loadConfigBtn.classList.add('btn-outline-info');
    } else {
        elements.loadConfigBtn.disabled = !selectedKey;
        elements.loadConfigBtn.textContent = 'Load & Apply';
        elements.loadConfigBtn.classList.remove('btn-outline-info');
        elements.loadConfigBtn.classList.add('btn-outline-primary');
    }
}

function updateProjectManagementButtons() {
    const editButton = elements.editProjectBtn;
    const deleteButton = elements.deleteProjectBtn;
    if (!elements.configSelect || !editButton || !deleteButton) {
        return;
    }

    const selectedKey = elements.configSelect.value || '';
    const hasSelection = selectedKey !== '';
    const isActive = state.activeConfiguration?.key === selectedKey && hasSelection;

    editButton.disabled = !hasSelection;
    deleteButton.disabled = !hasSelection;

    editButton.classList.remove('btn-outline-primary', 'text-primary', 'bg-warning-soft');
    editButton.classList.add('btn-outline-warning');
    editButton.textContent = isActive ? 'Rename Active' : 'Edit';

    const loadButton = elements.loadConfigBtn;
    if (loadButton) {
        loadButton.classList.remove('bg-primary-soft', 'bg-warning-soft', 'text-dark', 'text-primary');
    }

    const select = elements.configSelect;
    if (select) {
        select.classList.toggle('bg-primary-soft', isActive);
    }
}

function updateWorkspaceNavigationCta() {
    const link = elements.workspaceNavigationLink;
    if (!link) {
        return;
    }

    const shouldShow = !state.activeConfiguration;
    link.classList.toggle('is-visible', shouldShow);
    link.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
}

function populateConfigurationSelect() {
    if (!elements.configSelect) {
        return;
    }

    const select = elements.configSelect;
    const previousValue = select.value;

    select.innerHTML = '<option value="">Select project…</option>';

    for (const info of state.savedConfigs) {
        const option = document.createElement('option');
        option.value = info.key;
        option.textContent = info.name;
        if (state.activeConfiguration?.key === info.key) {
            option.selected = true;
        }
        select.appendChild(option);
    }

    if (!state.activeConfiguration && previousValue && select.querySelector(`option[value="${previousValue}"]`)) {
        select.value = previousValue;
    }

    updateLoadButtonState();
}

function updateConfigurationSummary() {}

function renderConfigurations() {}

async function loadNetworkInterfaces() {
    let success = true;
    try {
        const interfaces = await request('/api/servers/interfaces');
        state.networkInterfaces = Array.isArray(interfaces) ? interfaces : [];
    } catch {
        state.networkInterfaces = [
            { name: 'All Interfaces (0.0.0.0)', address: '0.0.0.0' },
            { name: 'Localhost (127.0.0.1)', address: '127.0.0.1' }
        ];
        success = false;
    }

    const previousInterfaceSelection = elements.scanInterfaceSelect?.value ?? '';

    populateHostSelect(elements.createServerHostSelect, '127.0.0.1');
    populateHostSelect(elements.editServerHostSelect, '127.0.0.1');
    populateHostSelect(elements.cloneServerHostSelect, '127.0.0.1');

    applyHostSelection(elements.createServerHostSelect, elements.createServerHostCustom, elements.createServerHostSelect?.dataset.selectedHost ?? '127.0.0.1');
    applyHostSelection(elements.editServerHostSelect, elements.editServerHostCustom, elements.editServerHostSelect?.dataset.selectedHost ?? '127.0.0.1');
    applyHostSelection(elements.cloneServerHostSelect, elements.cloneServerHostCustom, elements.cloneServerHostSelect?.dataset.selectedHost ?? '127.0.0.1');

    if (elements.createServerHostSelect) {
        elements.createServerHostSelect.dataset.selectedHost = elements.createServerHostSelect.value;
    }
    if (elements.editServerHostSelect) {
        elements.editServerHostSelect.dataset.selectedHost = elements.editServerHostSelect.value;
    }
    if (elements.cloneServerHostSelect) {
        elements.cloneServerHostSelect.dataset.selectedHost = elements.cloneServerHostSelect.value;
    }

    populateNetworkInterfaceSelect(elements.scanInterfaceSelect, previousInterfaceSelection);
    updateNetworkInterfaceRefreshLink();
    return success;
}

async function refreshNetworkInterfaces(event) {
    event?.preventDefault();
    if (state.networkInterfacesLoading) {
        return;
    }

    state.networkInterfacesLoading = true;
    updateNetworkInterfaceRefreshLink();
    const success = await loadNetworkInterfaces();
    state.networkInterfacesLoading = false;
    updateNetworkInterfaceRefreshLink();

    if (success) {
        showAlert('Network interfaces refreshed.', 'success');
        return;
    }

    showAlert('Failed to refresh network interfaces.', 'danger');
}

function updateNetworkInterfaceRefreshLink() {
    const link = elements.refreshNetworkInterfaceLink;
    if (!link) {
        return;
    }

    const defaultText = link.dataset.defaultText ?? 'Refresh Interfaces';
    const loadingText = link.dataset.loadingText ?? 'Refreshing…';

    if (state.networkInterfacesLoading) {
        link.classList.add('disabled');
        link.setAttribute('aria-disabled', 'true');
        link.textContent = loadingText;
    } else {
        link.classList.remove('disabled');
        link.removeAttribute('aria-disabled');
        link.textContent = defaultText;
    }
}

async function loadSerialDevices() {
    let success = true;

    try {
        const devices = await request('/api/serial-ports');
        state.serialDevices = filterSerialDevices(Array.isArray(devices) ? devices : []);
    } catch {
        state.serialDevices = [];
        success = false;
    }

    populateSerialDeviceSelect(elements.serialDeviceSelect, elements.serialDeviceCustom);
    populateSerialDeviceSelect(elements.probeCommId, elements.probeCommIdCustom);

    return success;
}

async function refreshSerialDeviceList(event) {
    event?.preventDefault();
    if (state.serialDevicesLoading) {
        return;
    }

    state.serialDevicesLoading = true;
    updateSerialDeviceRefreshLinks();
    const success = await loadSerialDevices();
    state.serialDevicesLoading = false;
    updateSerialDeviceRefreshLinks();

    if (success) {
        showAlert('Serial device list refreshed.', 'success');
        return;
    }

    showAlert('Serial device refresh failed.', 'danger');
}

function updateSerialDeviceRefreshLinks() {
    const links = document.querySelectorAll('.refresh-serial-device-list-link');
    links.forEach((link) => {
        if (!(link instanceof HTMLElement)) {
            return;
        }

        const defaultText = link.dataset.defaultText ?? 'Refresh Device List';
        const loadingText = link.dataset.loadingText ?? 'Refreshing…';

        if (state.serialDevicesLoading) {
            link.classList.add('disabled');
            link.setAttribute('aria-disabled', 'true');
            link.textContent = loadingText;
        } else {
            link.classList.remove('disabled');
            link.removeAttribute('aria-disabled');
            link.textContent = defaultText;
        }
    });
}

function filterSerialDevices(devices) {
    const normalized = Array.isArray(devices) ? devices : [];
    return normalized.filter((device) => {
        const id = (device?.id ?? device?.displayName ?? '').trim();
        return isSerialDeviceAllowed(id);
    });
}

function populateSerialDeviceSelect(select, customInput) {
    if (!select) {
        return;
    }

    const existingValue = select.value;
    const options = (state.serialDevices ?? [])
        .map((device) => ({
            id: device?.id ?? device?.displayName ?? '',
            label: device?.displayName ?? device?.id ?? ''
        }))
        .filter((device) => device.id)
        .map((device) => `<option value="${device.id}">${device.label}</option>`) // eslint-disable-line max-len
        .join('');

    const placeholder = '<option value="" disabled selected>Select a device</option>';
    const customOption = '<option value="__custom">Custom...</option>';
    select.innerHTML = `${placeholder}${options}${customOption}`;

    if (existingValue && Array.from(select.options).some((option) => option.value === existingValue)) {
        select.value = existingValue;
    } else {
        select.selectedIndex = 0;
    }

    toggleSerialCustomInput(select, customInput);
}

function toggleSerialCustomInput(select, customInput) {
    if (!select || !customInput) {
        return;
    }

    const isCustom = select.value === '__custom';
    customInput.classList.toggle('d-none', !isCustom);
    if (!isCustom) {
        customInput.value = '';
    } else {
        customInput.focus();
    }
}

function resolveSerialDevice(select, customInput) {
    if (!select) {
        return (customInput?.value ?? '').trim();
    }

    if (select.value === '__custom') {
        return (customInput?.value ?? '').trim();
    }

    return select.value?.trim() ?? '';
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return min;
    }

    if (number < min) {
        return min;
    }

    if (number > max) {
        return max;
    }

    return number;
}

function buildSerialSummary(deviceId, unitId, baudRate, dataBits, parity, stopBits) {
    const device = (deviceId ?? '').trim() || '—';
    const unitSegment = Number.isFinite(unitId) ? String(unitId).padStart(2, '0') : '??';
    const safeBaud = Number.isFinite(baudRate) ? baudRate : 9600;
    const safeDataBits = Number.isFinite(dataBits) ? dataBits : 8;
    const safeStopBits = Number.isFinite(stopBits) ? stopBits : 1;
    const parityCode = (parity ?? 'N').trim().charAt(0).toUpperCase() || 'N';
    return `${device}/${unitSegment}: ${safeBaud}, ${safeDataBits}, ${parityCode}, ${safeStopBits}`;
}

function applySerialDeviceSelection(value, select, customInput) {
    if (!select || !value) {
        return;
    }

    const hasOption = Array.from(select.options).some((option) => option.value === value);
    if (hasOption) {
        select.value = value;
        toggleSerialCustomInput(select, customInput);
        if (customInput) {
            customInput.value = '';
        }
        return;
    }

    select.value = '__custom';
    toggleSerialCustomInput(select, customInput);
    if (customInput) {
        customInput.value = value;
    }
}

function populateHostSelect(select, selectedValue) {
    if (!select) {
        return;
    }

    const uniqueAddresses = new Set();
    const options = [];
    for (const entry of state.networkInterfaces) {
        if (!entry?.address || uniqueAddresses.has(entry.address)) {
            continue;
        }
        uniqueAddresses.add(entry.address);
        options.push({ address: entry.address, name: entry.name ?? entry.address });
    }

    if (!uniqueAddresses.has('127.0.0.1')) {
        options.unshift({ address: '127.0.0.1', name: 'Localhost (127.0.0.1)' });
    }

    const optionHtml = options
        .map((option) => `<option value="${option.address}">${option.name}</option>`)
        .join('');

    select.innerHTML = `${optionHtml}<option value="__custom">Custom...</option>`;

    if (selectedValue && options.some((option) => option.address === selectedValue)) {
        select.value = selectedValue;
    }
}

function populateNetworkInterfaceSelect(select, selectedValue = '') {
    if (!select) {
        return;
    }

    const previousValue = selectedValue || select.value;
    const seen = new Set();
    const options = [];

    for (const entry of state.networkInterfaces) {
        const address = (entry?.address ?? '').trim();
        if (!address || seen.has(address)) {
            continue;
        }
        seen.add(address);
        const name = (entry?.name ?? '').trim();
        const label = name ? `${name} — ${address}` : address;
        options.push({ value: address, label: label || address });
    }

    if (!seen.has('0.0.0.0')) {
        options.unshift({ value: '0.0.0.0', label: 'All Interfaces — 0.0.0.0' });
        seen.add('0.0.0.0');
    }

    select.innerHTML = options
        .map((option) => `<option value="${option.value}">${option.label}</option>`)
        .join('');

    const fallbackValue = options[0]?.value ?? '';
    const shouldSelect = previousValue && options.some((option) => option.value === previousValue)
        ? previousValue
        : fallbackValue;

    if (shouldSelect) {
        select.value = shouldSelect;
    }
}

function applyHostSelection(select, customInput, value) {
    if (!select) {
        return;
    }

    const normalized = value?.trim();
    if (!normalized) {
        select.value = '127.0.0.1';
        toggleCustomHost(select, customInput);
        return;
    }

    const hasOption = Array.from(select.options).some((opt) => opt.value === normalized);
    if (hasOption) {
        select.value = normalized;
        if (customInput) {
            customInput.classList.add('d-none');
            customInput.value = '';
        }
    } else {
        select.value = '__custom';
        if (customInput) {
            customInput.classList.remove('d-none');
            customInput.value = normalized;
        }
    }

    toggleCustomHost(select, customInput);
}

function toggleCustomHost(select, customInput) {
    if (!select || !customInput) {
        return;
    }

    const useCustom = select.value === '__custom';
    customInput.classList.toggle('d-none', !useCustom);
    if (!useCustom) {
        customInput.value = '';
    }
}

function resolveHost(select, customInput) {
    if (!select) {
        return customInput?.value?.trim() ?? '';
    }

    if (select.value === '__custom') {
        return customInput?.value?.trim() ?? '';
    }

    return select.value?.trim() ?? '';
}

function normalizeHostAddress(value) {
    return (value ?? '').trim().toLowerCase();
}

function formatEndpoint(host, port, unitId) {
    const displayHost = host ?? '';
    const displayPort = Number.isInteger(port) ? port : '?';
    const displayUnit = Number.isInteger(unitId) ? unitId : '?';
    return `${displayHost}:${displayPort} · Unit ${displayUnit}`;
}

function findEndpointConflict(host, port, unitId, excludeId = null) {
    if (!Array.isArray(state.servers)) {
        return null;
    }

    const normalizedHost = normalizeHostAddress(host);
    if (!normalizedHost || !Number.isInteger(port) || !Number.isInteger(unitId)) {
        return null;
    }

    return state.servers.find((server) => {
        if (!server) {
            return false;
        }

        if (excludeId && server.id === excludeId) {
            return false;
        }

        const serverHost = normalizeHostAddress(server.hostAddress);
        const serverPort = Number(server.port);
        const serverUnit = Number(server.unitId);

        return serverHost === normalizedHost && serverPort === port && serverUnit === unitId;
    }) ?? null;
}

function getEndpointContext(context) {
    switch (context) {
        case 'create': {
            const host = resolveHost(elements.createServerHostSelect, elements.createServerHostCustom);
            const port = Number(document.getElementById('serverPort')?.value ?? NaN);
            const unitId = Number(document.getElementById('serverUnitId')?.value ?? NaN);
            return { host, port, unitId, excludeId: null };
        }
        case 'edit': {
            const serverId = elements.editServerId?.value ?? '';
            const server = state.servers.find((s) => s.id === serverId);
            const host = resolveHost(elements.editServerHostSelect, elements.editServerHostCustom) || server?.hostAddress || '';
            const port = Number(document.getElementById('editServerPort')?.value ?? NaN);
            const unitId = Number(document.getElementById('editServerUnitId')?.value ?? NaN);
            return { host, port, unitId, excludeId: serverId || null };
        }
        case 'clone': {
            const host = resolveHost(elements.cloneServerHostSelect, elements.cloneServerHostCustom);
            const port = Number(elements.cloneServerPortInput?.value ?? NaN);
            const unitId = Number(elements.cloneServerUnitInput?.value ?? NaN);
            return { host, port, unitId, excludeId: null };
        }
        default:
            return { host: '', port: NaN, unitId: NaN, excludeId: null };
    }
}

function handleEndpointValidation(context) {
    const warning = endpointWarningElements[context];
    if (!warning) {
        return false;
    }

    const { host, port, unitId, excludeId } = getEndpointContext(context);
    const hasValidPort = Number.isInteger(port) && port >= 1 && port <= 65535;
    const hasValidUnit = Number.isInteger(unitId) && unitId >= 1 && unitId <= 247;

    if (!host || !hasValidPort || !hasValidUnit) {
        warning.textContent = '';
        warning.classList.add('d-none');
        return false;
    }

    const conflict = findEndpointConflict(host, port, unitId, excludeId);
    if (conflict) {
        warning.textContent = `Conflicts with "${conflict.name}" (${formatEndpoint(conflict.hostAddress, conflict.port, conflict.unitId)}).`;
        warning.classList.remove('d-none');
        return true;
    }

    warning.textContent = '';
    warning.classList.add('d-none');
    return false;
}

function setupEndpointValidation() {
    const createPort = document.getElementById('serverPort');
    const createUnit = document.getElementById('serverUnitId');
    createPort?.addEventListener('input', () => handleEndpointValidation('create'));
    createUnit?.addEventListener('input', () => handleEndpointValidation('create'));
    elements.createServerHostSelect?.addEventListener('change', () => handleEndpointValidation('create'));
    elements.createServerHostCustom?.addEventListener('input', () => handleEndpointValidation('create'));

    const editPort = document.getElementById('editServerPort');
    const editUnit = document.getElementById('editServerUnitId');
    editPort?.addEventListener('input', () => handleEndpointValidation('edit'));
    editUnit?.addEventListener('input', () => handleEndpointValidation('edit'));
    elements.editServerHostSelect?.addEventListener('change', () => handleEndpointValidation('edit'));
    elements.editServerHostCustom?.addEventListener('input', () => handleEndpointValidation('edit'));

    const clonePort = elements.cloneServerPortInput;
    const cloneUnit = elements.cloneServerUnitInput;
    clonePort?.addEventListener('input', () => handleEndpointValidation('clone'));
    cloneUnit?.addEventListener('input', () => handleEndpointValidation('clone'));
    elements.cloneServerHostSelect?.addEventListener('change', () => handleEndpointValidation('clone'));
    elements.cloneServerHostCustom?.addEventListener('input', () => handleEndpointValidation('clone'));

    handleEndpointValidation('create');
    handleEndpointValidation('edit');
    handleEndpointValidation('clone');
}

function setProjectModalMode(mode, key = '', name = '') {
    if (!elements.configModalForm) {
        return;
    }

    elements.configModalForm.dataset.mode = mode;
    elements.configModalForm.dataset.projectKey = key;

    const label = document.getElementById('configModalLabel');
    if (label) {
        label.textContent = mode === 'edit' ? 'Rename Project' : 'Create Project';
    }

    const input = document.getElementById('configModalName');
    if (input && typeof name === 'string') {
        input.value = name;
    }
}

function openEditProjectModal() {
    if (!elements.configSelect) {
        return;
    }

    const key = elements.configSelect.value;
    if (!key) {
        showAlert('Select a project to edit.', 'warning');
        return;
    }

    const project = state.savedConfigs.find((info) => info.key === key);
    if (!project) {
        showAlert('Project details unavailable.', 'danger');
        return;
    }

    setProjectModalMode('edit', project.key, project.name);
    configModal?.show();
    setTimeout(() => document.getElementById('configModalName')?.focus(), 150);
}

function initCollapseControls() {
    const collapseIds = [
        'projectsCollapse',
        'networkScannerCollapse',
        'addressProbeCollapse',
        'modbusServersCollapse'
    ];

    collapseIds.forEach((collapseId) => {
        const element = document.getElementById(collapseId);
        if (!element) {
            return;
        }

        element.addEventListener('shown.bs.collapse', () => updateCollapseIcon(collapseId, true));
        element.addEventListener('hidden.bs.collapse', () => updateCollapseIcon(collapseId, false));
        updateCollapseIcon(collapseId, element.classList.contains('show'));
    });
}

function updateCollapseIcon(collapseId, isOpen) {
    const icon = document.querySelector(`[data-collapse-icon="${collapseId}"]`);
    if (!icon) {
        return;
    }

    icon.classList.toggle('bi-caret-right-fill', !isOpen);
    icon.classList.toggle('bi-caret-down-fill', isOpen);
}

function setCollapseState(element, shouldShow) {
    if (!element) {
        return;
    }

    const instance = bootstrap.Collapse.getOrCreateInstance(element, { toggle: false });
    if (shouldShow) {
        instance.show();
    } else {
        instance.hide();
    }
}

async function init() {
    initCollapseControls();
    await loadNetworkInterfaces();
    if (state.scanContext === 'serial' || state.probeContext === 'serial') {
        await loadSerialDevices();
    }
    bindEvents();
    updateActiveConfigurationDisplay();
    updateServersVisibility();
    await loadConfigurations();
    await restorePersistedProject();
    await loadServers();
}

async function restorePersistedProject() {
    if (!state.activeConfiguration) {
        return;
    }

    if (state.servers.length) {
        return;
    }

    const key = state.activeConfiguration.key;
    const displayName = state.activeConfiguration.name;

    try {
        await request(`/api/storage/${encodeURIComponent(key)}/apply`, { method: 'POST' });
        const payload = await request(`/api/storage/${encodeURIComponent(key)}`);
        if (!payload) {
            throw new Error('Project details could not be loaded.');
        }

        hydrateActiveProjectFromPayload(payload);
        updateActiveConfigurationDisplay();
        updateLoadButtonState();
        updateProjectManagementButtons();
    } catch (error) {
        showAlert(`Failed to restore project "${displayName}": ${error.message}`, 'danger');
    }
}

function bindEvents() {
    document.getElementById('registerRandom')?.addEventListener('change', updateRegisterForcedInputState);
    updateRegisterForcedInputState();

    elements.startAllDevicesBtn?.addEventListener('click', async (event) => {
        event.preventDefault();
        await handleBulkDeviceAction('start');
    });

    elements.stopAllDevicesBtn?.addEventListener('click', async (event) => {
        event.preventDefault();
        await handleBulkDeviceAction('stop');
    });

    const addressInput = document.getElementById('registerAddress');
    const functionSelect = document.getElementById('registerFunction');
    const dataTypeSelect = document.getElementById('registerDataType');
    const minInput = document.getElementById('registerMin');
    const maxInput = document.getElementById('registerMax');
    const forcedInput = document.getElementById('registerForced');
    addressInput?.addEventListener('input', updateRegisterAddressPreview);
    functionSelect?.addEventListener('change', () => {
        updateRegisterAddressPreview();
        updateRegisterRangeState();
        validateRegisterRange();
    });
    dataTypeSelect?.addEventListener('change', () => {
        updateRegisterRangeState();
        validateRegisterRange();
    });
    minInput?.addEventListener('input', validateRegisterRange);
    maxInput?.addEventListener('input', validateRegisterRange);
    forcedInput?.addEventListener('input', validateRegisterRange);
    updateRegisterAddressPreview();
    updateRegisterRangeState();
    validateRegisterRange();

    const probeStartAddressInput = document.getElementById('probeStartAddress');
    const probeEndAddressInput = document.getElementById('probeEndAddress');

    const normalizeProbeAddressRange = () => {
        if (!probeStartAddressInput || !probeEndAddressInput) {
            return;
        }

        const startValue = probeStartAddressInput.value.trim();
        if (startValue === '') {
            return;
        }

        const start = Number(startValue);
        if (!Number.isInteger(start) || start < 0) {
            return;
        }

        const endValue = probeEndAddressInput.value.trim();
        if (endValue === '') {
            return;
        }

        const end = Number(endValue);
        if (!Number.isInteger(end) || end < start) {
            probeEndAddressInput.value = String(start);
        }
    };

    probeStartAddressInput?.addEventListener('input', normalizeProbeAddressRange);
    probeEndAddressInput?.addEventListener('blur', normalizeProbeAddressRange);
    normalizeProbeAddressRange();

    elements.cloneProbeCreateDeviceBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        if (createServerModal) {
            cloneProbeModal?.hide();
            setTimeout(() => {
                createServerModal.show();
                setTimeout(() => document.getElementById('serverName')?.focus(), 150);
            }, 200);
            return;
        }

        const targetUrl = elements.cloneProbeCreateDeviceBtn.dataset.createDeviceUrl;
        if (typeof targetUrl === 'string' && targetUrl.trim() !== '') {
            window.location.href = targetUrl;
        }
    });

    elements.cloneProbeProjectSelect?.addEventListener('change', () => {
        updateCloneProbeProjectControls();
    });

    elements.cloneProbeLoadProjectBtn?.addEventListener('click', async (event) => {
        event.preventDefault();
        const select = elements.cloneProbeProjectSelect;
        const projectKey = select?.value ?? '';
        if (!projectKey) {
            showAlert('Select a project to load.', 'warning');
            select?.focus();
            return;
        }

        if (elements.cloneProbeLoadProjectBtn) {
            elements.cloneProbeLoadProjectBtn.disabled = true;
        }

        try {
            await applyConfiguration(projectKey);
            const servers = Array.isArray(state.servers) ? state.servers : [];
            populateProbeCloneServerSelect(servers);
            if (servers.length) {
                elements.cloneProbeServerSelect?.focus();
            } else {
                elements.cloneProbeCreateDeviceBtn?.focus();
            }
        } finally {
            updateCloneProbeProjectControls();
        }
    });

    elements.cloneProbeCreateProjectBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        if (cloneProbeModal) {
            cloneProbeModal.hide();
        }

        const targetUrl = elements.cloneProbeCreateProjectBtn.dataset.createProjectUrl;
        if (typeof targetUrl === 'string' && targetUrl.trim() !== '') {
            setTimeout(() => {
                window.location.href = targetUrl;
            }, 200);
        }
    });

    const hostSelectPairs = [
        { select: elements.createServerHostSelect, custom: elements.createServerHostCustom },
        { select: elements.editServerHostSelect, custom: elements.editServerHostCustom },
        { select: elements.cloneServerHostSelect, custom: elements.cloneServerHostCustom }
    ];

    for (const pair of hostSelectPairs) {
        pair.select?.addEventListener('change', () => {
            toggleCustomHost(pair.select, pair.custom);
        });
        toggleCustomHost(pair.select, pair.custom);
    }

    if (elements.serialDeviceSelect) {
        elements.serialDeviceSelect.addEventListener('change', () => {
            toggleSerialCustomInput(elements.serialDeviceSelect, elements.serialDeviceCustom);
            setSerialListenerButtons(Boolean(state.serialListenerJobId));
        });
        toggleSerialCustomInput(elements.serialDeviceSelect, elements.serialDeviceCustom);
        setSerialListenerButtons(Boolean(state.serialListenerJobId));
    }

    if (elements.probeCommId) {
        elements.probeCommId.addEventListener('change', () => {
            toggleSerialCustomInput(elements.probeCommId, elements.probeCommIdCustom);
        });
        toggleSerialCustomInput(elements.probeCommId, elements.probeCommIdCustom);
    }

    if (elements.serialDeviceCustom) {
        elements.serialDeviceCustom.addEventListener('input', () => {
            setSerialListenerButtons(Boolean(state.serialListenerJobId));
        });
    }

    if (elements.probeByteOrder) {
        elements.probeByteOrder.value = state.probeByteOrder;
        elements.probeByteOrder.addEventListener('change', (event) => {
            setProbeByteOrder(event.target.value);
        });
    }

    setupEndpointValidation();

    if (elements.createServerForm) {
        elements.createServerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!state.activeConfiguration) {
                showAlert('Create or activate a project before adding devices.', 'warning');
                return;
            }
            const formData = new FormData(elements.createServerForm);
            const hostAddress = resolveHost(elements.createServerHostSelect, elements.createServerHostCustom);
            if (!hostAddress) {
                showAlert('Enter a valid host/IP address.', 'warning');
                return;
            }
            const payload = {
                name: formData.get('serverName') || document.getElementById('serverName').value,
                hostAddress,
                port: Number(document.getElementById('serverPort').value),
                unitId: Number(document.getElementById('serverUnitId').value),
                pollRateMilliseconds: Number(document.getElementById('serverPollRate').value),
                autoStart: document.getElementById('serverAutoStart').checked,
                registers: []
            };

            const conflict = findEndpointConflict(payload.hostAddress, payload.port, payload.unitId, null);
            if (conflict) {
                showAlert(`Another device already uses that endpoint (${formatEndpoint(conflict.hostAddress, conflict.port, conflict.unitId)}).`, 'warning');
                handleEndpointValidation('create');
                return;
            }

            try {
                await request('/api/servers', {
                    method: 'POST',
                    data: payload
                });
                showAlert(`Device "${payload.name}" created.`, 'success');
                elements.createServerForm.reset();
                handleEndpointValidation('create');
                populateHostSelect(elements.createServerHostSelect, payload.hostAddress);
                applyHostSelection(elements.createServerHostSelect, elements.createServerHostCustom, payload.hostAddress);
                if (elements.createServerHostSelect) {
                    elements.createServerHostSelect.dataset.selectedHost = payload.hostAddress;
                }
                createServerModal?.hide();
                await loadServers();
                await saveActiveConfiguration();
                await loadConfigurations();
            } catch (error) {
                showAlert(error.message, 'danger');
            }
        });
    }

    elements.configSelect?.addEventListener('change', () => {
        updateLoadButtonState();
        updateProjectManagementButtons();
    });

    elements.loadConfigBtn?.addEventListener('click', async () => {
        const key = elements.configSelect?.value;
        if (!key) {
            showAlert('Select a project to load.', 'warning');
            return;
        }

        if (state.activeConfiguration?.key === key) {
            await prepareUploadWorkflow();
        } else {
            await applyConfiguration(key);
        }

        updateLoadButtonState();
        updateProjectManagementButtons();
    });

    elements.createConfigLink?.addEventListener('click', (event) => {
        event.preventDefault();
        setProjectModalMode('create');
        configModal?.show();
        setTimeout(() => document.getElementById('configModalName')?.focus(), 150);
    });

    elements.editProjectBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        openEditProjectModal();
    });

    elements.deleteProjectBtn?.addEventListener('click', async (event) => {
        event.preventDefault();
        const key = elements.configSelect?.value;
        if (!key) {
            return;
        }

        await deleteConfiguration(key);
        updateProjectManagementButtons();
    });

    if (elements.configModalForm) {
        elements.configModalForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = document.getElementById('configModalName');
            const displayName = input?.value.trim() ?? '';
            if (!displayName) {
                showAlert('Project name is required.', 'warning');
                return;
            }

            const mode = elements.configModalForm.dataset.mode ?? 'create';
            const targetKey = elements.configModalForm.dataset.projectKey ?? '';

            const duplicate = state.savedConfigs.some((info) => info.key !== targetKey && info.name.toLowerCase() === displayName.toLowerCase());
            if (duplicate) {
                showAlert('A project with that name already exists.', 'warning');
                return;
            }

            try {
                if (mode === 'edit') {
                    if (!targetKey) {
                        showAlert('Select a project to edit.', 'warning');
                        return;
                    }

                    await request(`/api/storage/${encodeURIComponent(targetKey)}`, {
                        method: 'PUT',
                        data: { name: displayName }
                    });

                    if (state.activeConfiguration?.key === targetKey) {
                        setActiveConfiguration({
                            ...state.activeConfiguration,
                            name: displayName
                        });
                    }

                    configModal?.hide();
                    setProjectModalMode('create');

                    await loadConfigurations();
                    if (elements.configSelect) {
                        elements.configSelect.value = targetKey;
                    }
                    updateLoadButtonState();
                    updateProjectManagementButtons();
                    updateActiveConfigurationDisplay();

                    showAlert(`Project "${displayName}" renamed.`, 'success');
                    return;
                }

                const info = await request('/api/storage', {
                    method: 'POST',
                    data: { name: displayName }
                });

                const normalizedInfo = normalizeConfigInfo(info);
                setActiveConfiguration(normalizedInfo);
                state.servers = [];
                state.runtimeStats = {};
                state.runtimeRegisterMaps = {};

                updateActiveConfigurationDisplay();
                updateServersVisibility();
                renderServers();
                populateConfigurationSelect();
                updateConfigurationSummary();

                configModal?.hide();
                setProjectModalMode('create');

                await request(`/api/storage/${encodeURIComponent(info.key)}/apply`, { method: 'POST' });
                await loadServers();
                await loadConfigurations();

                if (elements.configSelect) {
                    elements.configSelect.value = info.key;
                }
                updateLoadButtonState();
                updateProjectManagementButtons();

                showAlert(`Project "${info.name}" created and activated.`, 'success');
            } catch (error) {
                showAlert(error.message, 'danger');
            }
        });
    }

    document.getElementById('configModal')?.addEventListener('hidden.bs.modal', () => {
        setProjectModalMode('create');
    });

    elements.serversContainer?.addEventListener('click', async (event) => {
        const actionElement = event.target.closest('[data-action]');
        if (!actionElement) {
            return;
        }

    const action = actionElement.dataset.action;
    const serverId = actionElement.dataset.serverId;
    const registerId = actionElement.dataset.registerId;

    switch (action) {
        case 'edit-server':
            openEditServerModal(serverId);
            break;
        case 'start-server':
            await startServer(serverId);
            break;
            case 'stop-server':
                await stopServer(serverId);
                break;
            case 'delete-server':
                await deleteServer(serverId);
                break;
        case 'clone-server':
            await cloneServer(serverId);
            break;
        case 'add-register':
            openRegisterModal(serverId);
            break;
        case 'edit-register': {
            const server = state.servers.find((s) => s.id === serverId);
            const normalizedRegisterId = registerId ? registerId.toLowerCase() : null;
            const register = server?.registers?.find((r) => r.id && normalizedRegisterId && r.id.toLowerCase() === normalizedRegisterId);
            if (!register) {
                showAlert('Register not found.', 'danger');
                break;
            }
            openRegisterModal(serverId, register);
            break;
        }
        case 'delete-register':
            await deleteRegister(serverId, registerId);
            break;
        case 'write-register':
            await promptRegisterWrite(serverId, registerId);
            break;
        default:
            break;
        }
    });

    if (elements.registerForm) {
        elements.registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!state.activeConfiguration) {
                showAlert('Select a project before adding registers.', 'warning');
                return;
            }
            const payload = buildRegisterPayload();
            const serverId = elements.registerServerId.value;
            const registerIdInput = document.getElementById('registerId');
            const registerId = registerIdInput?.value?.trim() || null;
            const isEdit = Boolean(registerId);

            if (!validateRegisterInput(serverId, payload, registerId)) {
                return;
            }

            if (isEdit) {
                payload.id = registerId;
            }

            const endpoint = isEdit
                ? `/api/servers/${serverId}/registers/${registerId}`
                : `/api/servers/${serverId}/registers`;
            const method = isEdit ? 'PUT' : 'POST';

            try {
                await request(endpoint, {
                    method,
                    data: payload
                });
                showAlert(isEdit ? 'Register updated.' : 'Register added.', 'success');
                modal?.hide();
                elements.registerForm.reset();
                if (registerIdInput) {
                    registerIdInput.value = '';
                }
                elements.registerForm.dataset.mode = 'create';
                updateRegisterForcedInputState();
                await loadServers();
                await saveActiveConfiguration();
                await loadConfigurations();
            } catch (error) {
                showAlert(error.message, 'danger');
            }
        });
    }

    if (elements.editServerForm) {
        elements.editServerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const serverId = elements.editServerId?.value;
            if (!serverId) {
                showAlert('Missing device identifier.', 'danger');
                return;
            }

            const server = state.servers.find((s) => s.id === serverId);
            if (!server) {
                showAlert('Device not found.', 'danger');
                return;
            }

            const hostAddress = resolveHost(elements.editServerHostSelect, elements.editServerHostCustom) || server.hostAddress;
            if (!hostAddress) {
                showAlert('Enter a valid host/IP address.', 'warning');
                return;
            }

            const updated = {
                ...server,
                name: document.getElementById('editServerName').value.trim(),
                hostAddress,
                port: Number(document.getElementById('editServerPort').value),
                unitId: Number(document.getElementById('editServerUnitId').value),
                pollRateMilliseconds: Number(document.getElementById('editServerPollRate').value),
                autoStart: document.getElementById('editServerAutoStart').checked,
                registers: Array.isArray(server.registers) ? server.registers.map((r) => ({ ...r })) : []
            };

            const conflict = findEndpointConflict(updated.hostAddress, updated.port, updated.unitId, serverId);
            if (conflict) {
                showAlert(`Another device already uses that endpoint (${formatEndpoint(conflict.hostAddress, conflict.port, conflict.unitId)}).`, 'warning');
                handleEndpointValidation('edit');
                return;
            }

            try {
                await request(`/api/servers/${serverId}`, {
                    method: 'PUT',
                    data: updated
                });
                showAlert('Device updated.', 'success');
                if (elements.editServerHostSelect) {
                    elements.editServerHostSelect.dataset.selectedHost = hostAddress;
                }
                editServerModal?.hide();
                await loadServers();
                await saveActiveConfiguration();
                await loadConfigurations();
            } catch (error) {
                showAlert(error.message, 'danger');
            }
        });
    }

    if (elements.scanForm) {
        elements.scanForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await startScan();
        });
    }

    elements.discoverNetworkLink?.addEventListener('click', handleDiscoverNetworkDevices);
    elements.networkDiscoveryTableBody?.addEventListener('click', handleNetworkDiscoveryTableClick);
    elements.clearNetworkDiscoveryLink?.addEventListener('click', handleClearNetworkDiscovery);
    elements.refreshNetworkInterfaceLink?.addEventListener('click', refreshNetworkInterfaces);
    document.querySelectorAll('.refresh-serial-device-list-link').forEach((link) => {
        link.addEventListener('click', refreshSerialDeviceList);
    });

    if (elements.cancelScanBtn) {
        elements.cancelScanBtn.addEventListener('click', async () => {
            if (!state.scanJobId) {
                return;
            }

            try {
                await request(`${state.scanEndpoint}/${state.scanJobId}/cancel`, { method: 'POST' });
                showAlert('Scan cancelled.', 'info');
            } catch (error) {
                showAlert(error.message, 'danger');
            } finally {
                resetScanState();
            }
        });
    }

    if (elements.addressProbeForm) {
        elements.addressProbeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await startAddressProbe();
        });

        updateProbePollingLabel();
    } else {
        updateProbePollingLabel();
    }

    if (elements.probePollingToggle) {
        elements.probePollingToggle.addEventListener('change', () => {
            updateProbePollingLabel();
            if (elements.probePollingToggle.checked) {
                startProbePolling();
            } else {
                stopProbePolling();
            }
        });
    }

    elements.endProbeBtn?.addEventListener('click', () => {
        endAddressProbeSession();
    });

    elements.cloneServerForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitCloneServer();
    });

    elements.confirmCloneServerBtn?.addEventListener('click', async () => {
        await submitCloneServer();
    });

    elements.scanResultsBody?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="probe-host"]');
        if (!button) {
            return;
        }

        event.preventDefault();

        const { ip, port, device, baud, parity, databits, stopbits, unit } = button.dataset;

        if (device) {
            applySerialDeviceSelection(device, elements.probeCommId, elements.probeCommIdCustom);
            if (elements.probeBaudRate && typeof baud === 'string' && baud) {
                elements.probeBaudRate.value = baud;
            }
            if (elements.probeParitySelect && typeof parity === 'string' && parity) {
                elements.probeParitySelect.value = parity;
            }
            if (elements.probeDataBitsSelect && typeof databits === 'string' && databits) {
                elements.probeDataBitsSelect.value = databits;
            }
            if (elements.probeStopBitsSelect && typeof stopbits === 'string' && stopbits) {
                elements.probeStopBitsSelect.value = stopbits;
            }
            if (elements.serialDeviceSelect && state.scanContext === 'serial') {
                applySerialDeviceSelection(device, elements.serialDeviceSelect, elements.serialDeviceCustom);
                setSerialListenerButtons(Boolean(state.serialListenerJobId));
            }
            const unitInput = document.getElementById('probeUnitId');
            if (unitInput && typeof unit === 'string' && unit) {
                unitInput.value = unit;
            }
        } else {
            const probeIpInput = document.getElementById('probeIp');
            const probePortInput = document.getElementById('probePort');

            if (probeIpInput && typeof ip === 'string' && ip) {
                probeIpInput.value = ip;
            }

            if (probePortInput && typeof port === 'string' && port) {
                probePortInput.value = port;
            }
        }

        setCollapseState(elements.networkScannerCollapse, false);
        setCollapseState(elements.addressProbeCollapse, true);

        document.getElementById('probeStartAddress')?.focus();
    });

    elements.addressProbeResultsBody?.addEventListener('change', (event) => {
        const target = event.target;
        if (!target) {
            return;
        }

        if (target.matches('[data-probe-type]')) {
            const address = Number(target.dataset.probeType);
            if (!Number.isFinite(address)) {
                return;
            }

            state.addressProbeSelections[address] = target.value;
            updateProbeDecodedValue(address);
            updateMultiWordRowVisibility();
            updateSelectAllState();
            updateCloneLinkVisibility();
            return;
        }

        if (target.matches('[data-probe-select]')) {
            const address = Number(target.dataset.probeSelect);
            if (!Number.isFinite(address)) {
                return;
            }

            handleProbeSelectionChange(address, target.checked);
        }
    });

    elements.probeSelectAll?.addEventListener('change', (event) => {
        const checked = Boolean(event.target?.checked);
        toggleAllProbeSelections(checked);
    });

    elements.cloneProbeLink?.addEventListener('click', async (event) => {
        event.preventDefault();
        await startCloneProbeWorkflow();
    });

    elements.confirmCloneProbeBtn?.addEventListener('click', async () => {
        await confirmCloneProbeSelection();
    });

    elements.cloneProbeForm?.addEventListener('submit', (event) => {
        event.preventDefault();
    });

    elements.serialListenerStartBtn?.addEventListener('click', async () => {
        await startSerialListener();
    });

    elements.serialListenerStopBtn?.addEventListener('click', async () => {
        await stopSerialListener();
    });

    elements.serialListenerSummaryBody?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action="listener-probe"]');
        if (!button) {
            return;
        }

        const unitId = Number(button.dataset.unitId);
        if (!Number.isFinite(unitId)) {
            return;
        }

        await stopSerialListener();

        hydrateProbeFromListener(unitId);
    });

    elements.serialListenerLogCopyBtn?.addEventListener('click', async () => {
        await copySerialListenerText(state.serialListenerLog, 'Serial capture log');
    });

    elements.serialListenerFramesCopyBtn?.addEventListener('click', async () => {
        await copySerialListenerText(state.serialListenerFrames, 'Serial frame log');
    });

    elements.serialListenerClearBtn?.addEventListener('click', () => {
        clearSerialListenerHistory();
    });

    document.addEventListener('click', async (event) => {
        const link = event.target.closest('[data-action="edit-server-poll"]');
        if (!link) {
            return;
        }

        event.preventDefault();
        const serverId = link.dataset.serverId;
        const currentPoll = Number(link.dataset.currentPoll) || 1000;
        await promptServerPollRate(serverId, currentPoll);
    });

    setSerialListenerButtons(Boolean(state.serialListenerJobId));
    updateSerialDeviceRefreshLinks();
    updateAddressProbeControls();
    updateSerialListenerHistoryControls();
}

function buildRegisterPayload() {
    const randomCheckbox = document.getElementById('registerRandom');
    const randomize = randomCheckbox ? randomCheckbox.checked : false;
    const forcedValueInput = document.getElementById('registerForced');
    const forcedValue = forcedValueInput.value !== '' ? Number(forcedValueInput.value) : null;
    const description = document.getElementById('registerDescription').value.trim();

    return {
        address: Number(document.getElementById('registerAddress').value),
        function: document.getElementById('registerFunction').value,
        accessMode: document.getElementById('registerAccess').value,
        dataType: document.getElementById('registerDataType').value,
        minimum: parseNullableNumber(document.getElementById('registerMin').value),
        maximum: parseNullableNumber(document.getElementById('registerMax').value),
        slope: parseNullableNumber(document.getElementById('registerSlope').value) ?? 1,
        offset: parseNullableNumber(document.getElementById('registerOffset').value) ?? 0,
        randomize,
        forcedValue: randomize ? null : forcedValue,
        description
    };
}

function updateRegisterForcedInputState() {
    const randomCheckbox = document.getElementById('registerRandom');
    const forcedValueInput = document.getElementById('registerForced');
    const forcedWrapper = document.getElementById('registerForcedWrapper');
    if (!forcedValueInput) {
        return;
    }

    const shouldDisable = randomCheckbox?.checked ?? true;
    forcedValueInput.disabled = shouldDisable;
    if (forcedWrapper) {
        forcedWrapper.classList.toggle('d-none', shouldDisable);
    }
    if (shouldDisable) {
        forcedValueInput.value = '';
        forcedValueInput.setCustomValidity('');
        forcedValueInput.classList.remove('is-invalid');
    }

    updateRegisterRangeState();
    validateRegisterRange();
}

function updateRegisterRangeState() {
    const functionSelect = document.getElementById('registerFunction');
    const dataTypeSelect = document.getElementById('registerDataType');
    const minInput = document.getElementById('registerMin');
    const maxInput = document.getElementById('registerMax');
    const forcedValueInput = document.getElementById('registerForced');
    const feedback = document.getElementById('registerRangeFeedback');

    if (!functionSelect || !dataTypeSelect || !minInput || !maxInput) {
        return;
    }

    const func = functionSelect.value;
    const dataType = dataTypeSelect.value;
    const requiresRange = (func === 'HoldingRegister' || func === 'InputRegister') && dataType !== 'Boolean';
    const limits = getDataTypeLimits(dataType);

    minInput.disabled = !requiresRange;
    maxInput.disabled = !requiresRange;
    minInput.required = requiresRange;
    maxInput.required = requiresRange;

    if (!requiresRange) {
        minInput.value = '';
        maxInput.value = '';
        minInput.removeAttribute('min');
        minInput.removeAttribute('max');
        maxInput.removeAttribute('min');
        maxInput.removeAttribute('max');
        minInput.step = 'any';
        maxInput.step = 'any';
        minInput.setCustomValidity('');
        maxInput.setCustomValidity('');
        if (forcedValueInput) {
            forcedValueInput.step = 'any';
            forcedValueInput.removeAttribute('min');
            forcedValueInput.removeAttribute('max');
            forcedValueInput.setCustomValidity('');
            forcedValueInput.classList.remove('is-invalid');
        }
        if (feedback) {
            feedback.textContent = '';
            feedback.classList.add('d-none');
        }
        return;
    }

    if (limits) {
        minInput.min = limits.min;
        minInput.max = limits.max;
        maxInput.min = limits.min;
        maxInput.max = limits.max;
        minInput.step = 1;
        maxInput.step = 1;
        if (forcedValueInput && !forcedValueInput.disabled) {
            forcedValueInput.step = 1;
            forcedValueInput.min = limits.min;
            forcedValueInput.max = limits.max;
        }
    } else {
        minInput.removeAttribute('min');
        minInput.removeAttribute('max');
        maxInput.removeAttribute('min');
        maxInput.removeAttribute('max');
        minInput.step = 'any';
        maxInput.step = 'any';
        if (forcedValueInput && !forcedValueInput.disabled) {
            forcedValueInput.step = 'any';
            forcedValueInput.removeAttribute('min');
            forcedValueInput.removeAttribute('max');
        }
    }
}

function validateRegisterRange() {
    const functionSelect = document.getElementById('registerFunction');
    const dataTypeSelect = document.getElementById('registerDataType');
    const minInput = document.getElementById('registerMin');
    const maxInput = document.getElementById('registerMax');
    const forcedValueInput = document.getElementById('registerForced');
    const feedback = document.getElementById('registerRangeFeedback');

    if (!functionSelect || !dataTypeSelect || !minInput || !maxInput) {
        return true;
    }

    const func = functionSelect.value;
    const dataType = dataTypeSelect.value;
    const requiresRange = (func === 'HoldingRegister' || func === 'InputRegister') && dataType !== 'Boolean';
    const limits = getDataTypeLimits(dataType);

    let message = '';
    const minValue = parseNullableNumber(minInput.value);
    const maxValue = parseNullableNumber(maxInput.value);

    if (!requiresRange) {
        minInput.setCustomValidity('');
        maxInput.setCustomValidity('');
        if (feedback) {
            feedback.textContent = '';
            feedback.classList.add('d-none');
        }
        if (forcedValueInput) {
            forcedValueInput.setCustomValidity('');
            forcedValueInput.classList.remove('is-invalid');
        }
        return true;
    }

    if (minValue == null || maxValue == null) {
        message = 'Enter both minimum and maximum raw values.';
    } else if (minValue > maxValue) {
        message = 'Minimum must be less than or equal to maximum.';
    } else if (limits) {
        if (!Number.isInteger(minValue)) {
            message = 'Minimum must be a whole number for this data type.';
        } else if (!Number.isInteger(maxValue)) {
            message = 'Maximum must be a whole number for this data type.';
        } else if (minValue < limits.min || minValue > limits.max) {
            message = `Minimum must be between ${limits.min} and ${limits.max}.`;
        } else if (maxValue < limits.min || maxValue > limits.max) {
            message = `Maximum must be between ${limits.min} and ${limits.max}.`;
        }
    }

    minInput.setCustomValidity(message ? ' ' : '');
    maxInput.setCustomValidity(message ? ' ' : '');
    minInput.classList.toggle('is-invalid', Boolean(message));
    maxInput.classList.toggle('is-invalid', Boolean(message));

    let feedbackMessage = message;

    let forcedMessage = '';
    if (forcedValueInput && !forcedValueInput.disabled) {
        const forcedValue = parseNullableNumber(forcedValueInput.value);
        if (forcedValue != null) {
            if (limits) {
                if (!Number.isInteger(forcedValue)) {
                    forcedMessage = 'Forced value must be a whole number.';
                } else if (minValue != null && maxValue != null && (forcedValue < minValue || forcedValue > maxValue)) {
                    forcedMessage = 'Forced value must be within the configured range.';
                }
            } else if (minValue != null && maxValue != null && (forcedValue < minValue || forcedValue > maxValue)) {
                forcedMessage = 'Forced value must be within the configured range.';
            }
        }
        forcedValueInput.setCustomValidity(forcedMessage ? ' ' : '');
        forcedValueInput.classList.toggle('is-invalid', forcedMessage !== '');

        if (!feedbackMessage && forcedMessage) {
            feedbackMessage = forcedMessage;
        }
    } else if (forcedValueInput) {
        forcedValueInput.setCustomValidity('');
        forcedValueInput.classList.remove('is-invalid');
    }

    if (feedback) {
        feedback.textContent = feedbackMessage;
        feedback.classList.toggle('d-none', feedbackMessage === '');
    }

    return feedbackMessage === '';
}

function getDataTypeLimits(dataType) {
    return dataTypeRanges[dataType] ?? null;
}

function isIntegerDataType(dataType) {
    return integerDataTypes.has(dataType);
}

function parseNullableNumber(value) {
    if (value === '' || value === null || value === undefined) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function storeRuntimeStats(serverId, stats) {
    if (!stats) {
        delete state.runtimeStats[serverId];
        delete state.runtimeRegisterMaps[serverId];
        return;
    }

    state.runtimeStats[serverId] = stats;

    const serverDefinition = state.servers.find((s) => s.id === serverId);

    if (Array.isArray(stats.registers)) {
        const map = {};
        for (const snapshot of stats.registers) {
            if (snapshot?.registerId) {
                map[snapshot.registerId] = snapshot;

                if (serverDefinition && Array.isArray(serverDefinition.registers)) {
                    const register = serverDefinition.registers.find((r) => r.id === snapshot.registerId);
                    if (register) {
                        const isRandomized = Boolean(snapshot.isRandomized);
                        register.randomize = isRandomized;
                        if (isRandomized) {
                            register.forcedValue = null;
                        } else {
                            register.forcedValue = snapshot.forcedValue ?? null;
                        }
                    }
                }
            }
        }
        state.runtimeRegisterMaps[serverId] = map;
    } else {
        state.runtimeRegisterMaps[serverId] = {};
    }
}

function buildRawValue(register, snapshot) {
    const isRandomized = Boolean(snapshot?.isRandomized ?? register?.randomize);
    const forcedValue = snapshot?.forcedValue ?? register?.forcedValue ?? null;

    let badgeClass = 'badge-pending';
    let badgeLabel = 'Pending';
    let valueClass = 'value-pending';

    if (isRandomized) {
        badgeClass = 'badge-random';
        badgeLabel = 'Random';
        valueClass = 'value-random';
    } else if (forcedValue != null) {
        badgeClass = 'badge-forced';
        badgeLabel = 'Forced';
        valueClass = 'value-forced';
    } else if (snapshot) {
        badgeClass = 'badge-live';
        badgeLabel = 'Live';
        valueClass = 'value-live';
    }

    let valueContent = null;
    const requiresInteger = register?.dataType === 'Boolean' || isIntegerDataType(register?.dataType);
    let calculatedValue = null;
    if (snapshot && snapshot.rawValue != null) {
        calculatedValue = formatNumber(snapshot.rawValue, requiresInteger ? 0 : null);
    } else if (forcedValue != null) {
        calculatedValue = formatNumber(forcedValue, requiresInteger ? 0 : null);
    }

    if (calculatedValue == null) {
        valueClass = 'value-pending';
    }
    valueContent = calculatedValue ?? '—';

    const valueHtml = `<span class="${valueClass}">${valueContent}</span>`;
    const badge = `<span class="badge ${badgeClass}">${badgeLabel}</span>`;
    return `${badge} ${valueHtml}`.trim();
}

function buildEngineeringValue(register, snapshot) {
    let engineeringValue = null;

    if (snapshot && snapshot.engineeringValue != null) {
        engineeringValue = snapshot.engineeringValue;
    } else if (snapshot?.forcedValue != null) {
        engineeringValue = calculateEngineeringValue(register, snapshot.forcedValue);
    } else if (register.forcedValue != null) {
        engineeringValue = calculateEngineeringValue(register, register.forcedValue);
    }

    if (engineeringValue == null) {
        return '<span class="engineering-value engineering-empty">—</span>';
    }

    const precision = Math.max(0, getDecimalPrecision(register?.slope ?? 0));
    return `<span class="engineering-value">${formatNumber(engineeringValue, precision)}</span>`;
}

function calculateEngineeringValue(register, rawValue) {
    const numericRaw = Number(rawValue);
    if (!Number.isFinite(numericRaw)) {
        return null;
    }

    const slope = Number(register.slope ?? 1);
    const offset = Number(register.offset ?? 0);
    let scaled = (numericRaw * (Number.isFinite(slope) ? slope : 1)) + (Number.isFinite(offset) ? offset : 0);

    const minValue = register.minimum;
    const maxValue = register.maximum;
    const min = minValue != null && Number.isFinite(Number(minValue)) ? Number(minValue) : Number.NEGATIVE_INFINITY;
    const max = maxValue != null && Number.isFinite(Number(maxValue)) ? Number(maxValue) : Number.POSITIVE_INFINITY;

    if (min != Number.NEGATIVE_INFINITY || max != Number.POSITIVE_INFINITY) {
        scaled = Math.max(min, Math.min(max, scaled));
    }

    return scaled;
}

async function saveActiveConfiguration() {
    if (!state.activeConfiguration) {
        return;
    }

    try {
        await request(`/api/storage/${encodeURIComponent(state.activeConfiguration.key)}`, {
            method: 'PUT',
            data: {
                name: state.activeConfiguration.name,
                servers: state.servers
            }
        });
    } catch (error) {
        console.error('Failed to save project', error);
        showAlert(`Failed to save project: ${error.message}`, 'danger');
    }
}

function getWordLengthFor(dataType) {
    return dataTypeWordLengths[dataType] ?? 1;
}

function validateRegisterInput(serverId, payload, currentRegisterId = null) {
    if (!Number.isInteger(payload.address) || payload.address < 0 || payload.address > 65535) {
        showAlert('Address must be a whole number between 0 and 65535.', 'warning');
        return false;
    }

    const isRegister = payload.function === 'HoldingRegister' || payload.function === 'InputRegister';

    if (!validateRegisterRangeValues(payload)) {
        return false;
    }

    const wordLength = getWordLengthFor(payload.dataType);
    const newStart = payload.address;
    const newEnd = isRegister ? newStart + wordLength - 1 : newStart;

    if (newEnd > 65535) {
        showAlert('The selected data type extends beyond the Modbus address space.', 'warning');
        return false;
    }

    if (!serverId) {
        return true;
    }

    const server = state.servers.find((s) => s.id === serverId);
    if (!server || !Array.isArray(server.registers)) {
        return true;
    }

    const normalizedCurrentId = currentRegisterId ? currentRegisterId.toLowerCase() : null;

    const conflict = server.registers.some((existing) => {
        if (existing.id && normalizedCurrentId && existing.id.toLowerCase() === normalizedCurrentId) {
            return false;
        }

        if (existing.function !== payload.function) {
            return false;
        }

        const existingStart = existing.address ?? 0;
        const existingIsRegister = existing.function === 'HoldingRegister' || existing.function === 'InputRegister';
        const existingEnd = existingIsRegister
            ? existingStart + getWordLengthFor(existing.dataType) - 1
            : existingStart;

        return existingEnd >= newStart && existingStart <= newEnd;
    });

    if (conflict) {
        showAlert('Another register with an overlapping address already exists.', 'warning');
        return false;
    }

    return true;
}

function validateRegisterRangeValues(payload) {
    const isRegister = payload.function === 'HoldingRegister' || payload.function === 'InputRegister';
    const requiresRange = isRegister && payload.dataType !== 'Boolean';

    if (!requiresRange) {
        return true;
    }

    const min = payload.minimum;
    const max = payload.maximum;

    if (min == null || max == null) {
        showAlert('Enter both minimum and maximum raw values.', 'warning');
        return false;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        showAlert('Minimum and maximum raw values must be valid numbers.', 'warning');
        return false;
    }

    if (min > max) {
        showAlert('Minimum must be less than or equal to maximum.', 'warning');
        return false;
    }

    const limits = getDataTypeLimits(payload.dataType);
    if (limits) {
        if (!Number.isInteger(min) || !Number.isInteger(max)) {
            showAlert('Minimum and maximum must be whole numbers for the selected data type.', 'warning');
            return false;
        }

        if (min < limits.min || min > limits.max) {
            showAlert(`Minimum must be between ${limits.min} and ${limits.max}.`, 'warning');
            return false;
        }

        if (max < limits.min || max > limits.max) {
            showAlert(`Maximum must be between ${limits.min} and ${limits.max}.`, 'warning');
            return false;
        }
    }

    if (!payload.randomize && payload.forcedValue != null) {
        if (!Number.isFinite(payload.forcedValue)) {
            showAlert('Forced value must be a valid number.', 'warning');
            return false;
        }

        if (limits && !Number.isInteger(payload.forcedValue)) {
            showAlert('Forced value must be a whole number for the selected data type.', 'warning');
            return false;
        }

        if (payload.forcedValue < min || payload.forcedValue > max) {
            showAlert('Forced value must be within the configured minimum and maximum.', 'warning');
            return false;
        }
    }

    return true;
}

function updateRegisterAddressPreview() {
    const preview = elements.registerAddressPreview;
    const addressInput = document.getElementById('registerAddress');
    const functionSelect = document.getElementById('registerFunction');

    if (!preview || !addressInput || !functionSelect) {
        return;
    }

    const addressValue = Number(addressInput.value);
    if (Number.isFinite(addressValue) && addressValue >= 0) {
        preview.textContent = getFullyQualifiedAddress(functionSelect.value, addressValue);
    } else {
        preview.textContent = '—';
    }
}

function clearRuntimePolling(serverId) {
    if (!state.runtimeRefreshTimers) {
        state.runtimeRefreshTimers = {};
    }

    const handle = state.runtimeRefreshTimers[serverId];
    if (handle) {
        clearTimeout(handle);
        delete state.runtimeRefreshTimers[serverId];
    }
}

function clearAllRuntimePolling() {
    if (!state.runtimeRefreshTimers) {
        state.runtimeRefreshTimers = {};
        return;
    }

    for (const timerId of Object.keys(state.runtimeRefreshTimers)) {
        clearTimeout(state.runtimeRefreshTimers[timerId]);
    }

    state.runtimeRefreshTimers = {};
}

function scheduleRuntimePolling(serverId, stats) {
    clearRuntimePolling(serverId);

    if (!stats?.isRunning) {
        return;
    }

    const interval = Math.max(250, Number(stats.pollRateMilliseconds) || 1000);
    state.runtimeRefreshTimers[serverId] = setTimeout(async () => {
        delete state.runtimeRefreshTimers[serverId];
        try {
            await refreshServerStats(serverId);
        } catch {
            // Errors are handled inside refreshServerStats; avoid unhandled rejections.
        }
    }, interval);
}

async function loadServers() {
    if (!state.activeConfiguration) {
        state.servers = [];
        state.runtimeStats = {};
        state.runtimeRegisterMaps = {};
        clearAllRuntimePolling();
        renderServers();
        updateServersVisibility();
        handleEndpointValidation('create');
        handleEndpointValidation('edit');
        handleEndpointValidation('clone');
        return;
    }

    try {
        const servers = await request('/api/servers');
        state.servers = servers ?? [];
        state.runtimeStats = {};
        state.runtimeRegisterMaps = {};
        clearAllRuntimePolling();
        renderServers();
        updateServersVisibility();
        await Promise.all(state.servers.map((server) => refreshServerStats(server.id)));
        handleEndpointValidation('create');
        handleEndpointValidation('edit');
        handleEndpointValidation('clone');
    } catch (error) {
        showAlert(`Failed to load servers: ${error.message}`, 'danger');
        handleEndpointValidation('create');
        handleEndpointValidation('edit');
        handleEndpointValidation('clone');
    }
}

async function refreshServerStats(serverId) {
    try {
        const stats = await request(`/api/servers/${serverId}/stats`);
        storeRuntimeStats(serverId, stats);
        updateServerStatus(serverId, stats);
        updateRegisterRuntimeDisplay(serverId, stats);
        scheduleRuntimePolling(serverId, stats);
    } catch {
        delete state.runtimeStats[serverId];
        delete state.runtimeRegisterMaps[serverId];
        updateServerStatus(serverId, null);
        clearRuntimePolling(serverId);
    }
}

async function sendDeviceCommand(serverId, command) {
    const endpoint = command === 'start' ? 'start' : 'stop';
    await request(`/api/servers/${serverId}/${endpoint}`, { method: 'POST' });
    await refreshServerStats(serverId);
}

async function startServer(serverId) {
    try {
        await sendDeviceCommand(serverId, 'start');
        showAlert('Device starting.', 'info');
        updateBulkDeviceButtons();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function stopServer(serverId) {
    try {
        await sendDeviceCommand(serverId, 'stop');
        showAlert('Device stopping.', 'info');
        updateBulkDeviceButtons();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

function setBulkControlsDisabled(disabled) {
    if (elements.startAllDevicesBtn) {
        elements.startAllDevicesBtn.disabled = disabled;
    }
    if (elements.stopAllDevicesBtn) {
        elements.stopAllDevicesBtn.disabled = disabled;
    }
}

function getDeviceRunningState(serverId) {
    return Boolean(state.runtimeStats[serverId]?.isRunning);
}

async function handleBulkDeviceAction(action) {
    if (bulkActionInFlight) {
        return;
    }

    if (!state.activeConfiguration) {
        showAlert('Activate a project before controlling devices.', 'warning');
        return;
    }

    const isStart = action === 'start';
    const devices = Array.isArray(state.servers) ? state.servers : [];

    if (!devices.length) {
        showAlert('No devices available.', 'warning');
        updateBulkDeviceButtons();
        return;
    }

    const targets = devices.filter((device) => {
        const running = getDeviceRunningState(device.id);
        return isStart ? !running : running;
    });

    if (!targets.length) {
        showAlert(isStart ? 'All devices are already running.' : 'All devices are already stopped.', 'info');
        updateBulkDeviceButtons();
        return;
    }

    bulkActionInFlight = true;
    setBulkControlsDisabled(true);
    const command = isStart ? 'start' : 'stop';
    const failures = [];

    try {
        showAlert(`${isStart ? 'Starting' : 'Stopping'} ${targets.length} device${targets.length === 1 ? '' : 's'}...`, 'info');

        for (const device of targets) {
            try {
                await sendDeviceCommand(device.id, command);
            } catch (error) {
                failures.push(device.name ?? 'Unnamed Device');
            }
        }

        if (failures.length) {
            const summary = failures.slice(0, 3).join(', ');
            const suffix = failures.length > 3 ? ', ...' : '';
            showAlert(
                `Failed to ${command} ${failures.length} device${failures.length === 1 ? '' : 's'}: ${summary}${suffix}.`,
                'danger'
            );
        } else {
            showAlert(
                `${isStart ? 'Started' : 'Stopped'} ${targets.length} device${targets.length === 1 ? '' : 's'} successfully.`,
                'success'
            );
        }
    } finally {
        bulkActionInFlight = false;
        setBulkControlsDisabled(false);
        updateBulkDeviceButtons();
    }
}

async function prepareUploadWorkflow() {
    if (!state.activeConfiguration) {
        return;
    }

    await handleBulkDeviceAction('stop');
    await unloadActiveProject();
    showAlert('Devices stopped and project unloaded. Ready to upload a new project.', 'info');
}

function updateBulkDeviceButtons() {
    const startBtn = elements.startAllDevicesBtn;
    const stopBtn = elements.stopAllDevicesBtn;

    const devices = Array.isArray(state.servers) ? state.servers : [];
    const runningStates = devices.map((device) => getDeviceRunningState(device.id));
    toggleBulkActionActiveStates(startBtn, stopBtn, runningStates);

    if (bulkActionInFlight) {
        setBulkControlsDisabled(true);
        return;
    }

    const hasActiveProject = Boolean(state.activeConfiguration);
    const hasDevices = hasActiveProject && devices.length > 0;

    if (!hasDevices) {
        if (startBtn) {
            startBtn.disabled = true;
        }
        if (stopBtn) {
            stopBtn.disabled = true;
        }
        return;
    }

    const allRunning = runningStates.every(Boolean);
    const noneRunning = runningStates.every((state) => !state);

    if (startBtn) {
        startBtn.disabled = allRunning;
    }
    if (stopBtn) {
        stopBtn.disabled = noneRunning;
    }
}

function toggleBulkActionActiveStates(startBtn, stopBtn, runningStates) {
    const anyRunning = runningStates.some(Boolean);
    const anyStopped = runningStates.some((state) => !state);
    if (startBtn) {
        startBtn.classList.toggle('is-active', anyRunning);
    }
    if (stopBtn) {
        stopBtn.classList.toggle('is-active', anyStopped);
    }
}

async function deleteServer(serverId) {
    const server = state.servers.find((s) => s.id === serverId);
    const name = server?.name ?? 'device';
    if (!confirm(`Delete ${name}? This cannot be undone.`)) {
        return;
    }

    try {
        await request(`/api/servers/${serverId}`, { method: 'DELETE' });
        showAlert(`Device "${name}" removed.`, 'info');
        await loadServers();
        await saveActiveConfiguration();
        await loadConfigurations();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function cloneServer(serverId) {
    const source = state.servers.find((s) => s.id === serverId);
    if (!source) {
        showAlert('Device details unavailable.', 'danger');
        return;
    }

    elements.cloneServerSourceId.value = serverId;
    populateHostSelect(elements.cloneServerHostSelect, source.hostAddress ?? '127.0.0.1');
    applyHostSelection(elements.cloneServerHostSelect, elements.cloneServerHostCustom, source.hostAddress ?? '127.0.0.1');
    if (elements.cloneServerHostSelect) {
        elements.cloneServerHostSelect.dataset.selectedHost = source.hostAddress ?? '127.0.0.1';
    }
    if (elements.cloneServerPortInput) {
        elements.cloneServerPortInput.value = source.port ?? 1502;
    }
    if (elements.cloneServerUnitInput) {
        elements.cloneServerUnitInput.value = source.unitId ?? 1;
    }

    handleEndpointValidation('clone');
    cloneServerModal?.show();
}

function openRegisterModal(serverId, register = null) {
    if (!state.activeConfiguration) {
        showAlert('Select a project before adding registers.', 'warning');
        return;
    }

    const form = elements.registerForm;
    if (!form) {
        return;
    }

    const modalTitle = document.getElementById('registerModalLabel');
    const registerIdInput = document.getElementById('registerId');
    const randomCheckbox = document.getElementById('registerRandom');
    const forcedValueInput = document.getElementById('registerForced');

    form.reset();
    elements.registerServerId.value = serverId;
    if (registerIdInput) {
        registerIdInput.value = register?.id ?? '';
    }

    form.dataset.mode = register ? 'edit' : 'create';

    const assignValue = (id, value, fallback = '') => {
        const input = document.getElementById(id);
        if (input) {
            input.value = value ?? fallback;
        }
    };

    assignValue('registerDescription', register?.description ?? '');
    assignValue('registerFunction', register?.function ?? 'HoldingRegister');
    assignValue('registerAddress', register?.address ?? 0);
    assignValue('registerDataType', register?.dataType ?? 'UInt16');
    assignValue('registerAccess', register?.accessMode ?? 'ReadOnly');
    assignValue('registerMin', register?.minimum ?? '');
    assignValue('registerMax', register?.maximum ?? '');
    assignValue('registerSlope', register?.slope ?? 1);
    assignValue('registerOffset', register?.offset ?? 0);

    if (randomCheckbox) {
        randomCheckbox.checked = register ? register.randomize !== false : false;
    }

    updateRegisterForcedInputState();

    if (!register?.randomize && forcedValueInput && register?.forcedValue != null) {
        forcedValueInput.value = register.forcedValue;
    }

    updateRegisterAddressPreview();
    if (modalTitle) {
        modalTitle.textContent = register ? 'Edit Register' : 'Add Register';
    }
    modal?.show();
}

function openEditServerModal(serverId) {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) {
        showAlert('Device details unavailable.', 'danger');
        return;
    }

    if (elements.editServerId) {
        elements.editServerId.value = serverId;
    }

    document.getElementById('editServerName').value = server.name ?? '';
    document.getElementById('editServerUnitId').value = server.unitId ?? 1;
    populateHostSelect(elements.editServerHostSelect, server.hostAddress ?? '127.0.0.1');
    applyHostSelection(elements.editServerHostSelect, elements.editServerHostCustom, server.hostAddress ?? '127.0.0.1');
    if (elements.editServerHostSelect) {
        elements.editServerHostSelect.dataset.selectedHost = server.hostAddress ?? '127.0.0.1';
    }
    document.getElementById('editServerPort').value = server.port ?? 1502;
    document.getElementById('editServerPollRate').value = server.pollRateMilliseconds ?? 250;
    document.getElementById('editServerAutoStart').checked = Boolean(server.autoStart);

    handleEndpointValidation('edit');
    editServerModal?.show();
}

async function deleteRegister(serverId, registerId) {
    if (!confirm('Delete this register?')) {
        return;
    }

    try {
        await request(`/api/servers/${serverId}/registers/${registerId}`, { method: 'DELETE' });
        showAlert('Register deleted.', 'info');
        await loadServers();
        await saveActiveConfiguration();
        await loadConfigurations();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function promptRegisterWrite(serverId, registerId) {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) {
        showAlert('Device not found.', 'danger');
        return;
    }

    const register = server.registers?.find((r) => r.id === registerId);
    if (!register) {
        showAlert('Register not found.', 'danger');
        return;
    }

    if (register.accessMode !== 'ReadWrite') {
        showAlert('This register is read-only.', 'warning');
        return;
    }

    const snapshot = state.runtimeRegisterMaps[serverId]?.[registerId] ?? null;
    const currentValue = snapshot?.rawValue ?? register.forcedValue ?? 0;
    let payloadValue;

    if (register.function === 'Coil' || register.function === 'DiscreteInput') {
        const defaultValue = currentValue ? '1' : '0';
        const input = prompt('Enter coil value (0 or 1):', defaultValue);
        if (input === null) {
            return;
        }

        const trimmed = input.trim().toLowerCase();
        if (!['0', '1', 'true', 'false'].includes(trimmed)) {
            showAlert('Value must be 0, 1, true, or false.', 'warning');
            return;
        }

        const boolValue = trimmed === '1' || trimmed === 'true';
        payloadValue = boolValue ? '1' : '0';
    } else {
        const input = prompt('Enter register value:', String(currentValue ?? '0'));
        if (input === null) {
            return;
        }

        const trimmed = input.trim();
        const parsed = Number(trimmed);
        if (trimmed.length === 0 || Number.isNaN(parsed)) {
            showAlert('Numeric value expected.', 'warning');
            return;
        }

        payloadValue = parsed.toString();
    }

    try {
        await request(`/api/servers/${serverId}/registers/${registerId}/write`, {
            method: 'POST',
            data: { value: payloadValue }
        });

        showAlert('Register updated.', 'success');
        await refreshServerStats(serverId);
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function submitCloneServer() {
    const sourceId = elements.cloneServerSourceId?.value;
    if (!sourceId) {
        cloneServerModal?.hide();
        return;
    }

    const source = state.servers.find((s) => s.id === sourceId);
    if (!source) {
        showAlert('Device details unavailable.', 'danger');
        cloneServerModal?.hide();
        return;
    }

    const hostSelect = elements.cloneServerHostSelect;
    const portInput = elements.cloneServerPortInput;
    const unitInput = elements.cloneServerUnitInput;
    const hostAddress = resolveHost(hostSelect, elements.cloneServerHostCustom);
    const port = Number(portInput?.value ?? NaN);
    const unitId = Number(unitInput?.value ?? NaN);

    if (!hostAddress) {
        showAlert('Select a host for the cloned device.', 'warning');
        return;
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        showAlert('Port must be a whole number between 1 and 65535.', 'warning');
        return;
    }

    if (!Number.isInteger(unitId) || unitId < 1 || unitId > 247) {
        showAlert('Unit ID must be a whole number between 1 and 247.', 'warning');
        return;
    }

    const conflict = findEndpointConflict(hostAddress, port, unitId, null);
    if (conflict) {
        showAlert(`Another device already uses that endpoint (${formatEndpoint(conflict.hostAddress, conflict.port, conflict.unitId)}).`, 'warning');
        handleEndpointValidation('clone');
        return;
    }

    const baseName = source.name ?? 'Device';
    let cloneName = `${baseName} Clone`;
    let counter = 2;
    while (state.servers.some((server) => server.name === cloneName)) {
        cloneName = `${baseName} Clone ${counter++}`;
    }

    const serverPayload = {
        name: cloneName,
        hostAddress,
        port,
        unitId,
        pollRateMilliseconds: source.pollRateMilliseconds,
        autoStart: source.autoStart ?? false,
        registers: []
    };

    try {
        const created = await request('/api/servers', {
            method: 'POST',
            data: serverPayload
        });

        if (!created?.id) {
            throw new Error('Device clone failed to create.');
        }

        const newServerId = created.id;
        const registers = Array.isArray(source.registers) ? source.registers : [];
        for (const register of registers) {
            const registerPayload = {
                description: register.description ?? '',
                function: register.function,
                address: register.address,
                dataType: register.dataType,
                accessMode: register.accessMode,
                minimum: register.minimum ?? null,
                maximum: register.maximum ?? null,
                slope: register.slope ?? 1,
                offset: register.offset ?? 0,
                randomize: Boolean(register.randomize),
                forcedValue: register.randomize ? null : (register.forcedValue ?? null)
            };

            await request(`/api/servers/${newServerId}/registers`, {
                method: 'POST',
                data: registerPayload
            });
        }

        cloneServerModal?.hide();
        handleEndpointValidation('clone');
        showAlert(`Device "${source.name}" cloned as "${cloneName}".`, 'success');
        if (elements.cloneServerHostSelect) {
            elements.cloneServerHostSelect.dataset.selectedHost = hostAddress;
        }
        applyHostSelection(elements.cloneServerHostSelect, elements.cloneServerHostCustom, hostAddress);
        await loadServers();
        await saveActiveConfiguration();
        await loadConfigurations();
    } catch (error) {
        showAlert(`Clone failed: ${error.message}`, 'danger');
    }
}

async function loadConfigurations() {
    try {
        const configs = await request('/api/storage');
        state.savedConfigs = (Array.isArray(configs) ? configs : []).map(normalizeConfigInfo);

        populateCloneProbeProjectSelect();

        reconcileActiveConfigurationAfterLoad();

        populateConfigurationSelect();
        updateConfigurationSummary();
        updateActiveConfigurationDisplay();
        updateServersVisibility();
        updateProjectManagementButtons();
    } catch (error) {
        showAlert(`Unable to load project library: ${error.message}`, 'danger');
    }
}

function reconcileActiveConfigurationAfterLoad() {
    const requestedKey = state.activeConfiguration?.key ?? readPersistedActiveConfigurationKey();
    if (!requestedKey) {
        if (state.activeConfiguration) {
            setActiveConfiguration(null);
        }
        return;
    }

    const match = state.savedConfigs.find((info) => info.key === requestedKey);
    if (!match) {
        setActiveConfiguration(null);
        state.servers = [];
        state.runtimeStats = {};
        state.runtimeRegisterMaps = {};
        renderServers();
        return;
    }

    const alreadyActive = state.activeConfiguration?.key === match.key && state.activeConfiguration?.name === match.name;
    if (!alreadyActive) {
        setActiveConfiguration(match);
    }
}

function hydrateActiveProjectFromPayload(payload) {
    if (!payload) {
        return;
    }

    const normalized = normalizeConfigInfo({
        key: payload.key ?? state.activeConfiguration?.key ?? '',
        name: payload.name ?? state.activeConfiguration?.name ?? ''
    });

    if (!normalized.key) {
        return;
    }

    setActiveConfiguration(normalized);
    state.servers = Array.isArray(payload.servers) ? payload.servers : [];
    state.runtimeStats = {};
    state.runtimeRegisterMaps = {};
    renderServers();
    updateServersVisibility();
}

async function applyConfiguration(key) {
    if (!key) {
        return;
    }

    try {
        await request(`/api/storage/${encodeURIComponent(key)}/apply`, { method: 'POST' });
        const payload = await request(`/api/storage/${encodeURIComponent(key)}`);
        if (!payload) {
            throw new Error('Project details could not be loaded.');
        }

        hydrateActiveProjectFromPayload(payload);
        updateActiveConfigurationDisplay();

        await loadServers();
        await loadConfigurations();
        updateLoadButtonState();
        updateProjectManagementButtons();
        showAlert(`Project "${payload.name}" applied.`, 'success');
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function unloadActiveProject() {
    if (!state.activeConfiguration) {
        return;
    }

    const previousName = state.activeConfiguration.name;

    setActiveConfiguration(null);
    state.servers = [];
    state.runtimeStats = {};
    state.runtimeRegisterMaps = {};

    updateActiveConfigurationDisplay();
    updateServersVisibility();
    renderServers();

    try {
        await loadServers();
        await loadConfigurations();
        updateLoadButtonState();
        updateProjectManagementButtons();
        showAlert(`Project "${previousName}" unloaded.`, 'info');
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function deleteConfiguration(key) {
    if (!key) {
        return;
    }

    const target = state.savedConfigs.find((info) => info.key === key);
    const displayName = target?.name ?? key;

    if (!confirm(`Delete project "${displayName}"?`)) {
        return;
    }

    try {
        await request(`/api/storage/${encodeURIComponent(key)}`, { method: 'DELETE' });
        if (state.activeConfiguration?.key === key) {
            setActiveConfiguration(null);
            state.servers = [];
            state.runtimeStats = {};
            state.runtimeRegisterMaps = {};
            updateActiveConfigurationDisplay();
            updateServersVisibility();
            renderServers();
        }
        showAlert(`Project "${displayName}" deleted.`, 'info');
        await loadConfigurations();
        updateLoadButtonState();
        updateProjectManagementButtons();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function startScan() {
    if (state.scanJobId) {
        showAlert('A scan is already running. Cancel it before starting a new one.', 'warning');
        return;
    }

    state.scanContext = elements.scanForm?.dataset.scanContext ?? 'network';
    state.scanEndpoint = state.scanContext === 'serial' ? '/api/serial-scan' : '/api/scan';

    if (state.scanContext === 'serial') {
        await startSerialScan();
        return;
    }

    const startIpInput = document.getElementById('scanStartIp');
    const endIpInput = document.getElementById('scanEndIp');
    const startPortInput = document.getElementById('scanStartPort');
    const endPortInput = document.getElementById('scanEndPort');

    const startIp = startIpInput?.value.trim() ?? '';
    if (!startIp) {
        showAlert('Start IP address is required.', 'warning');
        startIpInput?.focus();
        return;
    }

    const endIpRaw = endIpInput?.value.trim() ?? '';
    const endIp = endIpRaw || startIp;
    if (!endIpRaw && endIpInput) {
        endIpInput.value = endIp;
    }

    const startPortRaw = startPortInput?.value ?? '';
    if (startPortRaw === '') {
        showAlert('Start port is required.', 'warning');
        startPortInput?.focus();
        return;
    }

    const startPort = Number(startPortRaw);
    if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
        showAlert('Start port must be between 1 and 65535.', 'warning');
        startPortInput?.focus();
        return;
    }

    const endPortRaw = endPortInput?.value ?? '';
    const endPort = endPortRaw === '' ? startPort : Number(endPortRaw);
    if (!Number.isInteger(endPort) || endPort < 1 || endPort > 65535) {
        showAlert('End port must be between 1 and 65535.', 'warning');
        endPortInput?.focus();
        return;
    }

    if (endPortRaw === '' && endPortInput) {
        endPortInput.value = String(endPort);
    }

    const interfaceAddress = elements.scanInterfaceSelect?.value?.trim() ?? '0.0.0.0';
    const sourceAddress = interfaceAddress || '0.0.0.0';

    const payload = {
        startIpAddress: startIp,
        endIpAddress: endIp,
        startPort,
        endPort,
        sourceAddress
    };

    setCollapseState(elements.networkScannerCollapse, true);

    try {
        const job = await request(state.scanEndpoint, { method: 'POST', data: payload });
        if (!job?.id) {
            throw new Error('Scan job could not be created.');
        }

        state.scanJobId = job.id;
        setScanningState(true);
        showAlert('Scan started.', 'info');
        renderScan(job);
        state.scanTimer = setInterval(async () => {
            await pollScanStatus();
        }, 1000);
    } catch (error) {
        showAlert(error.message, 'danger');
        resetScanState();
    }
}

async function startSerialScan() {
    const device = resolveSerialDevice(elements.serialDeviceSelect, elements.serialDeviceCustom);
    if (!device) {
        showAlert('Select a serial device to scan.', 'warning');
        elements.serialDeviceSelect?.focus();
        return;
    }

    const baudRate = Number(elements.serialBaudRate?.value ?? 9600);
    const parity = elements.serialParity?.value ?? 'None';
    const dataBits = Number(elements.serialDataBits?.value ?? 8);
    const stopBits = Number(elements.serialStopBits?.value ?? 1);
    const startUnit = Number(elements.serialStartUnit?.value ?? 1);
    const endUnitRaw = elements.serialEndUnit?.value ?? '';
    const endUnit = endUnitRaw === '' ? startUnit : Number(endUnitRaw);

    if (!Number.isInteger(startUnit) || startUnit < 1 || startUnit > 247) {
        showAlert('Start Unit ID must be between 1 and 247.', 'warning');
        elements.serialStartUnit?.focus();
        return;
    }

    if (!Number.isInteger(endUnit) || endUnit < 1 || endUnit > 247) {
        showAlert('End Unit ID must be between 1 and 247.', 'warning');
        elements.serialEndUnit?.focus();
        return;
    }

    if (elements.serialEndUnit && endUnitRaw === '') {
        elements.serialEndUnit.value = String(endUnit);
    }

    const payload = {
        deviceId: device,
        baudRate,
        parity,
        dataBits,
        stopBits,
        startUnitId: Math.min(startUnit, endUnit),
        endUnitId: Math.max(startUnit, endUnit)
    };

    setCollapseState(elements.networkScannerCollapse, true);

    try {
        const job = await request(state.scanEndpoint, { method: 'POST', data: payload });
        if (!job?.id) {
            throw new Error('Serial scan job could not be created.');
        }

        state.scanJobId = job.id;
        setScanningState(true);
        showAlert('Serial scan started.', 'info');
        renderScan(job);
        state.scanTimer = setInterval(async () => {
            await pollScanStatus();
        }, 1000);
    } catch (error) {
        showAlert(error.message, 'danger');
        resetScanState();
    }
}

async function startSerialListener() {
    const device = resolveSerialDevice(elements.serialDeviceSelect, elements.serialDeviceCustom);
    if (!device) {
        showAlert('Select a serial device to start listening.', 'warning');
        elements.serialDeviceSelect?.focus();
        return;
    }

    if (state.serialListenerJobId) {
        showAlert('Already listening on a serial device. Stop the current session first.', 'warning');
        return;
    }

    try {
        const response = await request('/api/serial-listener/start', {
            method: 'POST',
            data: { deviceId: device }
        });

        if (!response?.id) {
            throw new Error('Listener could not be started.');
        }

        state.serialListenerDevice = device;
        state.serialListenerJobId = response.id;
        state.serialListenerLog = [];
        state.serialListenerFrames = [];
        state.serialListenerUnits = new Map();
        state.serialListenerLastSequence = 0;
        renderSerialListenerLog();
        renderSerialListenerSummary();
        setSerialListenerButtons(true);
        showAlert('Listening for serial traffic…', 'info');
        await pollSerialListener();
        state.serialListenerTimer = window.setInterval(async () => {
            await pollSerialListener();
        }, 1500);
        if (state.serialListenerAutoStopTimer) {
            clearTimeout(state.serialListenerAutoStopTimer);
        }
        state.serialListenerAutoStopTimer = window.setTimeout(() => {
            void stopSerialListener();
        }, 60000);
    } catch (error) {
        showAlert(error.message, 'danger');
        resetSerialListenerState();
    }
}

async function stopSerialListener() {
    if (!state.serialListenerJobId) {
        return;
    }

    try {
        await request(`/api/serial-listener/${state.serialListenerJobId}/stop`, { method: 'POST' });
        showAlert('Serial listener stopped.', 'info');
    } catch (error) {
        showAlert(error.message, 'danger');
    } finally {
        resetSerialListenerState();
    }
}

function resetSerialListenerState() {
    if (state.serialListenerTimer) {
        clearInterval(state.serialListenerTimer);
        state.serialListenerTimer = null;
    }
    if (state.serialListenerAutoStopTimer) {
        clearTimeout(state.serialListenerAutoStopTimer);
        state.serialListenerAutoStopTimer = null;
    }
    state.serialListenerJobId = null;
    state.serialListenerLastSequence = 0;
    state.serialListenerDevice = null;
    setSerialListenerButtons(false);
    renderSerialListenerFrames();
}

async function pollSerialListener() {
    if (!state.serialListenerJobId) {
        return;
    }

    try {
        const status = await request(`/api/serial-listener/${state.serialListenerJobId}`);
        if (!status) {
            throw new Error('Listener status unavailable.');
        }

        const entries = Array.isArray(status.entries) ? status.entries : [];
        const newEntries = entries.filter((entry) => Number(entry.sequence) > state.serialListenerLastSequence);
        if (newEntries.length) {
            state.serialListenerLastSequence = Math.max(...newEntries.map((entry) => Number(entry.sequence)));
            applySerialListenerEntries(newEntries);
        }

        if (!status.isListening) {
            showAlert('Serial listener has stopped.', 'info');
            resetSerialListenerState();
        }
    } catch (error) {
        showAlert(`Listener error: ${error.message}`, 'danger');
        resetSerialListenerState();
    }
}

function applySerialListenerEntries(entries) {
    for (const entry of entries) {
        const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—';
        const unitLabel = Number.isFinite(Number(entry.unitId)) ? String(entry.unitId).padStart(2, '0') : '??';
        const line = `[${timestamp}] ${entry.direction ?? 'Rx'} U${unitLabel} ${entry.hexPayload ?? ''}`.trim();
        state.serialListenerLog.push(line);
        if (state.serialListenerLog.length > 200) {
            state.serialListenerLog.splice(0, state.serialListenerLog.length - 200);
        }
        const addressesLabel = Array.isArray(entry.addresses) && entry.addresses.length
            ? ` [${entry.addresses.join(',')}]`
            : '';
        const frameLine = `[${timestamp}] ${entry.direction ?? 'Rx'} U${unitLabel} ${entry.function ?? 'Frame'}${addressesLabel} ${entry.hexPayload ?? ''}`.trim();
        state.serialListenerFrames.push(frameLine);
        if (state.serialListenerFrames.length > 200) {
            state.serialListenerFrames.splice(0, state.serialListenerFrames.length - 200);
        }

        const unitId = Number(entry.unitId);
        if (Number.isFinite(unitId)) {
            const addresses = Array.isArray(entry.addresses) ? entry.addresses : [];
        const record = state.serialListenerUnits.get(unitId) ?? {
            unitId,
            addressTraffic: new Map(),
            addressValues: new Map(),
            function: entry.function ?? 'HoldingRegister',
            latestRequestAddresses: new Set(),
            functionRequests: new Map()
        };
            const direction = (entry.direction ?? 'Rx') === 'Tx' ? 'Tx' : 'Rx';
            const numericAddresses = [];
            for (const rawAddr of addresses) {
                const addr = Number(rawAddr);
                if (!Number.isFinite(addr)) {
                    continue;
                }
                numericAddresses.push(addr);
                const traffic = record.addressTraffic.get(addr) ?? { hasTx: false, hasRx: false };
                if (direction === 'Tx') {
                    traffic.hasTx = true;
                } else {
                    traffic.hasRx = true;
                }
                record.addressTraffic.set(addr, traffic);
            }
        if (direction === 'Tx' && numericAddresses.length) {
            record.latestRequestAddresses = new Set(numericAddresses);
            const functionName = entry.function ?? 'HoldingRegister';
            if (!(record.functionRequests instanceof Map)) {
                record.functionRequests = new Map();
            }
            if (shouldTrackAddressBlock(numericAddresses)) {
                const functionSet = record.functionRequests.get(functionName) ?? new Set();
                numericAddresses.forEach((addr) => functionSet.add(addr));
                record.functionRequests.set(functionName, functionSet);
            }
        }
            if (Array.isArray(entry.words)) {
                entry.words.forEach((word, index) => {
                    const addr = addresses[index];
                    if (addr != null) {
                        record.addressValues.set(Number(addr), Number(word));
                    }
                });
            }
            record.function = entry.function ?? record.function;
            state.serialListenerUnits.set(unitId, record);
        }
    }

    renderSerialListenerLog();
    renderSerialListenerSummary();
}

function renderSerialListenerLog() {
    if (!elements.serialListenerLog) {
        return;
    }

    if (!state.serialListenerLog.length) {
        elements.serialListenerLog.textContent = 'Waiting for capture…';
        renderSerialListenerFrames();
        updateSerialListenerHistoryControls();
        return;
    }

    elements.serialListenerLog.textContent = state.serialListenerLog.join('\n');
    renderSerialListenerFrames();
    updateSerialListenerHistoryControls();
}

function renderSerialListenerFrames() {
    if (!elements.serialListenerFrames) {
        return;
    }

    if (!state.serialListenerFrames.length) {
        elements.serialListenerFrames.textContent = 'No frames yet.';
        return;
    }

    elements.serialListenerFrames.textContent = state.serialListenerFrames.join('\n');
    updateSerialListenerHistoryControls();
}

function clearSerialListenerHistory() {
    state.serialListenerLog = [];
    state.serialListenerFrames = [];
    state.serialListenerUnits = new Map();
    renderSerialListenerLog();
    renderSerialListenerSummary();
    updateSerialListenerHistoryControls();
}

function updateSerialListenerHistoryControls() {
    const hasHistory = state.serialListenerLog.length > 0 || state.serialListenerFrames.length > 0 || (state.serialListenerUnits && state.serialListenerUnits.size > 0);
    if (elements.serialListenerClearBtn) {
        elements.serialListenerClearBtn.disabled = !hasHistory;
    }
}

async function copySerialListenerText(lines, label) {
    if (!Array.isArray(lines) || !lines.length) {
        showAlert(`${label} is empty.`, 'warning');
        return;
    }

    const text = lines.join('\n');
    try {
        await writeTextToClipboard(text);
        showAlert(`${label} copied to clipboard.`, 'success');
    } catch {
        showAlert(`Unable to copy ${label}.`, 'danger');
    }
}

async function writeTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

function renderSerialListenerSummary() {
    const body = elements.serialListenerSummaryBody;
    if (!body) {
        return;
    }

    if (!state.serialListenerUnits || state.serialListenerUnits.size === 0) {
        body.innerHTML = '<tr><td colspan="3" class="text-center text-monospace small py-3 text-bumblebee">No captures yet.</td></tr>';
        return;
    }

    const rows = Array.from(state.serialListenerUnits.values())
        .map((record) => {
        const functionCounts = getFunctionAddressCounts(record);
        if (functionCounts.length <= 0) {
            return null;
        }
            const latestAddresses = getLatestRequestAddresses(record);
            const buttonDisabled = latestAddresses.length === 0;
            const button = `<button class="btn btn-outline-primary btn-sm" data-action="listener-probe" data-unit-id="${record.unitId}" ${buttonDisabled ? 'disabled' : ''}>Probe</button>`;
            return {
                unitId: record.unitId,
                html: `
                    <tr>
                        <td><code>${record.unitId.toString().padStart(2, '0')}</code></td>
                        <td>${renderFunctionCounts(record)}</td>
                        <td class="text-end">${button}</td>
                    </tr>
                `
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.unitId - b.unitId)
        .map((entry) => entry.html)
        .join('');

    if (!rows) {
        body.innerHTML = '<tr><td colspan="3" class="text-center text-monospace small py-3 text-bumblebee">No captures yet.</td></tr>';
        return;
    }

    body.innerHTML = rows;
}

function getConfirmedAddresses(record, options = {}) {
    if (!record?.addressTraffic || !(record.addressTraffic instanceof Map)) {
        return [];
    }

    const requireTx = options.requireTx !== false;
    const requireRx = options.requireRx !== false;
    const requireValue = Boolean(options.requireValue);
    const values = record.addressValues instanceof Map ? record.addressValues : new Map();

    return Array.from(record.addressTraffic.entries())
        .filter(([, data]) => (!requireTx || data.hasTx) && (!requireRx || data.hasRx))
        .map(([addr]) => Number(addr))
        .filter(Number.isFinite)
        .filter((addr) => !requireValue || values.has(addr))
        .sort((a, b) => a - b);
}

function getLatestRequestAddresses(record) {
    const addresses = record?.latestRequestAddresses;
    if (!addresses || typeof addresses[Symbol.iterator] !== 'function') {
        return [];
    }

    return Array.from(addresses)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
}

function getTrackedRequestAddresses(record) {
    if (!record?.functionRequests || !(record.functionRequests instanceof Map)) {
        return [];
    }

    const addresses = new Set();
    for (const entry of record.functionRequests.values()) {
        if (!(entry instanceof Set)) {
            continue;
        }

        for (const addr of entry) {
            if (Number.isFinite(Number(addr))) {
                addresses.add(Number(addr));
            }
        }
    }

    return Array.from(addresses).sort((a, b) => a - b);
}

function getFunctionAddressCounts(record) {
    if (!record?.functionRequests || !(record.functionRequests instanceof Map)) {
        return [];
    }

    return Array.from(record.functionRequests.entries())
        .map(([func, addresses]) => ({
            functionName: func,
            count: addresses instanceof Set ? addresses.size : 0
        }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => a.functionName.localeCompare(b.functionName, undefined, { sensitivity: 'base' }));
}

function renderFunctionCounts(record) {
    const counts = getFunctionAddressCounts(record);
    if (!counts.length) {
        return '<span class="text-muted small">No requests yet.</span>';
    }

    return `<ul class="list-unstyled mb-0 text-start small">${counts
        .map((entry) => `<li class="text-capitalize">${entry.functionName}: ${entry.count}</li>`)
        .join('')}</ul>`;
}

function shouldTrackAddressBlock(addresses) {
    if (!Array.isArray(addresses) || !addresses.length) {
        return false;
    }

    if (addresses.length > 8) {
        return false;
    }

    return isConsecutiveSequence(addresses);
}

function isConsecutiveSequence(addresses) {
    for (let index = 1; index < addresses.length; index++) {
        if (addresses[index] !== addresses[index - 1] + 1) {
            return false;
        }
    }

    return true;
}

function setSerialListenerButtons(isListening) {
    const listening = Boolean(isListening);
    const hasDevice = Boolean(resolveSerialDevice(elements.serialDeviceSelect, elements.serialDeviceCustom));

    if (elements.serialListenerRawContainer) {
        elements.serialListenerRawContainer.classList.toggle('d-none', !hasDevice);
    }
    if (elements.serialListenerFramesContainer) {
        elements.serialListenerFramesContainer.classList.toggle('d-none', !hasDevice);
    }

    if (elements.serialListenerStartBtn) {
        elements.serialListenerStartBtn.disabled = listening || !hasDevice;
    }

    if (elements.serialListenerStopBtn) {
        elements.serialListenerStopBtn.disabled = !listening;
    }
}

function hydrateProbeFromListener(unitId) {
    const record = state.serialListenerUnits.get(unitId);
    if (!record) {
        showAlert('Captured data for that unit is unavailable.', 'warning');
        return;
    }

    let addresses = getTrackedRequestAddresses(record);
    if (!addresses.length) {
        addresses = getConfirmedAddresses(record);
    }
    if (!addresses.length) {
        addresses = getLatestRequestAddresses(record);
    }
    if (!addresses.length) {
        showAlert('No register addresses captured for that unit.', 'warning');
        return;
    }

    const listenerDevice = resolveSerialDevice(elements.serialDeviceSelect, elements.serialDeviceCustom)
        || state.serialListenerDevice;
    if (listenerDevice) {
        applySerialDeviceSelection(listenerDevice, elements.serialDeviceSelect, elements.serialDeviceCustom);
        applySerialDeviceSelection(listenerDevice, elements.probeCommId, elements.probeCommIdCustom);
        state.serialListenerDevice = listenerDevice;
    }
    const start = addresses[0];
    const end = addresses[addresses.length - 1];
    const unitInput = document.getElementById('probeUnitId');
    const startInput = document.getElementById('probeStartAddress');
    const endInput = document.getElementById('probeEndAddress');
    if (!unitInput || !startInput || !endInput) {
        showAlert('Address Probe form is not available on this page.', 'danger');
        return;
    }
    unitInput.value = String(unitId);
    startInput.value = String(start);
    endInput.value = String(end);

    const baud = elements.probeBaudRate?.value ?? '9600';
    const dataBits = elements.probeDataBitsSelect?.value ?? '8';
    const parity = elements.probeParitySelect?.value ?? 'None';
    const stopBits = elements.probeStopBitsSelect?.value ?? '1';
    state.addressProbeSummary = buildSerialSummary(
        state.serialListenerDevice ?? '—',
        unitId,
        Number(baud),
        Number(dataBits),
        parity,
        Number(stopBits)
    );

    const functionSelect = document.getElementById('probeFunction');
    if (functionSelect && record.function) {
        functionSelect.value = record.function;
    }

    const results = addresses.map((address) => ({
        function: record.function ?? 'HoldingRegister',
        address,
        word: record.addressValues?.get(address) ?? null,
        error: null
    }));

    setAddressProbeResults(results, { resetSelections: true });
    renderAddressProbeResults();
    state.addressProbeRequest = null;
    updateAddressProbeControls();

    setCollapseState(elements.addressProbeCollapse, true);
    document.getElementById('probeStartAddress')?.focus();
    showAlert(`Loaded Unit ${unitId} into Address Probe.`, 'success');
}

async function pollScanStatus() {
    if (!state.scanJobId) {
        return;
    }

    try {
        const status = await request(`${state.scanEndpoint}/${state.scanJobId}`);
        if (!status) {
            throw new Error('Scan status unavailable.');
        }

        renderScan(status);

        if (!status.isRunning) {
            showAlert('Scan completed.', 'success');
            resetScanState();
        }
    } catch (error) {
        showAlert(`Scan error: ${error.message}`, 'danger');
        resetScanState();
    }
}

function isProbePollingEnabled() {
    return Boolean(elements.probePollingToggle?.checked);
}

function updateProbePollingLabel() {
    const label = elements.probePollingToggleLabel;
    if (!label) {
        return;
    }

    if (!isProbePollingEnabled()) {
        label.textContent = 'Single poll';
        return;
    }

    const interval = clampNumber(state.probePollingInterval ?? 500, 100, 5000);
    state.probePollingInterval = interval;
    label.innerHTML = `<a href="#" class="text-sky" data-action="edit-poll-rate">${interval}ms poll rate</a>`;
    const link = label.querySelector('[data-action="edit-poll-rate"]');
    link?.addEventListener('click', handleProbePollRateClick);
}

function stopProbePolling() {
    if (state.addressProbePollTimer) {
        clearInterval(state.addressProbePollTimer);
        state.addressProbePollTimer = null;
    }
    state.addressProbePollInFlight = false;
}

function disableProbePolling() {
    stopProbePolling();
    if (elements.probePollingToggle) {
        elements.probePollingToggle.checked = false;
    }
    updateProbePollingLabel();
}

function updateAddressProbeControls() {
    const hasSession = Boolean(state.addressProbeRequest);
    if (elements.endProbeBtn) {
        elements.endProbeBtn.disabled = !hasSession;
    }
}

function endAddressProbeSession() {
    const hadSession = Boolean(state.addressProbeRequest);
    const hadResults = Boolean(state.addressProbeResults.length);
    if (!hadSession && !hadResults) {
        return;
    }

    disableProbePolling();
    state.addressProbeRequest = null;
    state.addressProbeSummary = '';
    setAddressProbeResults([], { resetSelections: true });
    renderAddressProbeResults();
    updateAddressProbeControls();
    showAlert('Probe session ended.', 'info');
}

function handleProbePollRateClick(event) {
    event.preventDefault();

    const current = state.probePollingInterval ?? 500;
    const input = window.prompt('Enter poll rate in milliseconds (100-5000):', String(current));
    if (input === null) {
        return;
    }

    const trimmed = input.trim();
    if (trimmed === '') {
        showAlert('Enter a poll rate between 100 and 5000 milliseconds.', 'warning');
        return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 100 || value > 5000) {
        showAlert('Poll rate must be between 100 and 5000 milliseconds.', 'warning');
        return;
    }

    state.probePollingInterval = Math.round(value);
    updateProbePollingLabel();

    if (isProbePollingEnabled() && state.addressProbeRequest) {
        startProbePolling();
    }
}

async function promptServerPollRate(serverId, currentPoll) {
    if (!serverId) {
        return;
    }

    const normalized = clampNumber(currentPoll ?? 1000, 100, 5000);
    const input = window.prompt('Enter device poll rate in milliseconds (100-5000):', String(normalized));
    if (input === null) {
        return;
    }

    const trimmed = input.trim();
    if (trimmed === '') {
        showAlert('Enter a poll rate between 100 and 5000 milliseconds.', 'warning');
        return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 100 || value > 5000) {
        showAlert('Poll rate must be between 100 and 5000 milliseconds.', 'warning');
        return;
    }

    try {
        await updateServerPollRate(serverId, Math.round(value));
        showAlert('Poll rate updated.', 'success');
        await loadServers();
        await saveActiveConfiguration();
        await loadConfigurations();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function updateServerPollRate(serverId, pollRate) {
    if (!serverId) {
        throw new Error('Invalid device identifier.');
    }

    let server = state.servers.find((entry) => entry.id === serverId);
    if (!server) {
        server = await request(`/api/servers/${serverId}`);
    }

    if (!server) {
        throw new Error('Device could not be found.');
    }

    let stats = null;
    try {
        stats = await request(`/api/servers/${serverId}/stats`);
    } catch {
        // ignore stats fetch failures
    }

    const wasRunning = Boolean(stats?.isRunning);
    if (wasRunning) {
        await request(`/api/servers/${serverId}/stop`, { method: 'POST' });
    }

    const payload = JSON.parse(JSON.stringify(server));
    payload.pollRateMilliseconds = pollRate;

    await request(`/api/servers/${serverId}`, {
        method: 'PUT',
        data: payload
    });

    if (wasRunning) {
        await request(`/api/servers/${serverId}/start`, { method: 'POST' });
    }
}

function setAddressProbeResults(results, { resetSelections }) {
    const normalized = (Array.isArray(results) ? results : [])
        .map((result) => ({
            ...result,
            address: Number(result.address)
        }))
        .sort((a, b) => a.address - b.address);

    const selections = resetSelections ? {} : { ...state.addressProbeSelections };
    const addresses = new Set(normalized.map((result) => result.address));

    if (resetSelections) {
        state.addressProbeSelected = new Set();
    } else {
        ensureProbeSelectionSet();
        for (const address of Array.from(state.addressProbeSelected)) {
            if (!addresses.has(address)) {
                state.addressProbeSelected.delete(address);
            }
        }
    }

    if (!resetSelections) {
        for (const key of Object.keys(selections)) {
            if (!addresses.has(Number(key))) {
                delete selections[key];
            }
        }
    }

    for (const result of normalized) {
        if (!Object.prototype.hasOwnProperty.call(selections, result.address)) {
            selections[result.address] = getDefaultProbeType(result.function);
        }
    }

    state.addressProbeResults = normalized;
    state.addressProbeSelections = selections;

    if (state.addressProbeSummary) {
        for (const result of state.addressProbeResults) {
            result.commSummary = state.addressProbeSummary;
        }
    }
}

function startProbePolling() {
    if (!isProbePollingEnabled() || !state.addressProbeRequest) {
        return;
    }

    stopProbePolling();
    const interval = clampNumber(state.probePollingInterval ?? 500, 100, 5000);
    state.probePollingInterval = interval;
    state.addressProbePollTimer = window.setInterval(runProbePollingTick, interval);
    updateProbePollingLabel();
    void runProbePollingTick();
}

async function runProbePollingTick() {
    if (!state.addressProbeRequest || state.addressProbePollInFlight) {
        return;
    }

    state.addressProbePollInFlight = true;

    try {
        const response = await request(state.probeEndpoint, { method: 'POST', data: state.addressProbeRequest });
        const results = Array.isArray(response?.results) ? response.results : [];
        state.addressProbeRequest = response?.request ?? state.addressProbeRequest;
        if (state.probeContext === 'serial' && response?.request) {
            state.addressProbeSummary = buildSerialSummary(
                response.request.deviceId,
                response.request.unitId,
                response.request.baudRate,
                response.request.dataBits,
                response.request.parity,
                response.request.stopBits
            );
        }
        setAddressProbeResults(results, { resetSelections: false });
        renderAddressProbeResults();
    } catch (error) {
        disableProbePolling();
        showAlert(`Probe polling stopped: ${error.message}`, 'danger');
    } finally {
        state.addressProbePollInFlight = false;
    }
}

async function startAddressProbe() {
    if (!elements.addressProbeForm) {
        return;
    }

    stopProbePolling();

    state.probeContext = elements.addressProbeForm.dataset.probeContext ?? 'network';
    state.probeEndpoint = state.probeContext === 'serial' ? '/api/serial-address-probe' : '/api/address-probe';

    if (state.probeContext === 'serial') {
        await startSerialAddressProbe();
        return;
    }

    const ipInput = document.getElementById('probeIp');
    const portInput = document.getElementById('probePort');
    const unitInput = document.getElementById('probeUnitId');
    const functionInput = document.getElementById('probeFunction');
    const startAddressInput = document.getElementById('probeStartAddress');
    const endAddressInput = document.getElementById('probeEndAddress');

    const ipAddress = ipInput?.value.trim() ?? '';
    if (!ipAddress) {
        showAlert('Enter an IP address to probe.', 'warning');
        ipInput?.focus();
        return;
    }

    const portRaw = portInput?.value ?? '';
    if (portRaw === '') {
        showAlert('Port is required for probing.', 'warning');
        portInput?.focus();
        return;
    }

    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        showAlert('Port must be between 1 and 65535.', 'warning');
        portInput?.focus();
        return;
    }

    const unitRaw = unitInput?.value ?? '';
    if (unitRaw === '') {
        showAlert('Unit ID is required for probing.', 'warning');
        unitInput?.focus();
        return;
    }

    const unitId = Number(unitRaw);
    if (!Number.isInteger(unitId) || unitId < 1 || unitId > 247) {
        showAlert('Unit ID must be between 1 and 247.', 'warning');
        unitInput?.focus();
        return;
    }

    const startAddressRaw = startAddressInput?.value ?? '';
    if (startAddressRaw === '') {
        showAlert('Start address is required for probing.', 'warning');
        startAddressInput?.focus();
        return;
    }

    const startAddress = Number(startAddressRaw);
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
        showAlert('Start address must be between 0 and 65535.', 'warning');
        startAddressInput?.focus();
        return;
    }

    const endAddressRaw = endAddressInput?.value ?? '';
    let endAddress = endAddressRaw === '' ? startAddress : Number(endAddressRaw);
    if (!Number.isInteger(endAddress) || endAddress < 0 || endAddress > 65535) {
        showAlert('End address must be between 0 and 65535.', 'warning');
        endAddressInput?.focus();
        return;
    }

    if (endAddress < startAddress) {
        endAddress = startAddress;
    }

    if (endAddressInput) {
        endAddressInput.value = String(endAddress);
    }

    const payload = {
        ipAddress,
        port,
        unitId,
        function: functionInput?.value ?? 'HoldingRegister',
        startAddress,
        endAddress
    };

    state.addressProbeSummary = '';
    renderProbePendingRow();

    try {
        const response = await request(state.probeEndpoint, { method: 'POST', data: payload });
        const results = Array.isArray(response?.results) ? response.results : [];

        state.addressProbeRequest = response?.request ?? payload;
        updateAddressProbeControls();
        const summaryIp = response?.request?.ipAddress ?? payload.ipAddress;
        const summaryPort = response?.request?.port ?? payload.port;
        state.addressProbeSummary = `${summaryIp}:${summaryPort}`;
        setAddressProbeResults(results, { resetSelections: true });
        renderAddressProbeResults();
        showAlert(`Probe completed with ${state.addressProbeResults.length} result${state.addressProbeResults.length === 1 ? '' : 's'}.`, 'success');

        if (isProbePollingEnabled() && state.addressProbeResults.length) {
            startProbePolling();
        }
    } catch (error) {
        showAlert(`Probe failed: ${error.message}`, 'danger');
        state.addressProbeRequest = null;
        updateAddressProbeControls();
        state.addressProbeSummary = '';
        setAddressProbeResults([], { resetSelections: true });
        renderAddressProbeResults();
        disableProbePolling();
    }
}

async function startSerialAddressProbe() {
    const device = resolveSerialDevice(elements.probeCommId, elements.probeCommIdCustom);
    if (!device) {
        showAlert('Select a serial device to probe.', 'warning');
        elements.probeCommId?.focus();
        return;
    }

    const baudRate = Number(elements.probeBaudRate?.value ?? 9600);
    const parity = elements.probeParitySelect?.value ?? 'None';
    const dataBits = Number(elements.probeDataBitsSelect?.value ?? 8);
    const stopBits = Number(elements.probeStopBitsSelect?.value ?? 1);
    const unitInput = document.getElementById('probeUnitId');
    const unitRaw = unitInput?.value ?? '';
    if (unitRaw === '') {
        showAlert('Unit ID is required for probing.', 'warning');
        unitInput?.focus();
        return;
    }

    const unitId = Number(unitRaw);
    if (!Number.isInteger(unitId) || unitId < 1 || unitId > 247) {
        showAlert('Unit ID must be between 1 and 247.', 'warning');
        unitInput?.focus();
        return;
    }

    const functionInput = document.getElementById('probeFunction');
    const startAddressInput = document.getElementById('probeStartAddress');
    const endAddressInput = document.getElementById('probeEndAddress');

    const startAddressRaw = startAddressInput?.value ?? '';
    if (startAddressRaw === '') {
        showAlert('Start address is required for probing.', 'warning');
        startAddressInput?.focus();
        return;
    }

    const startAddress = Number(startAddressRaw);
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
        showAlert('Start address must be between 0 and 65535.', 'warning');
        startAddressInput?.focus();
        return;
    }

    const endAddressRaw = endAddressInput?.value ?? '';
    let endAddress = endAddressRaw === '' ? startAddress : Number(endAddressRaw);
    if (!Number.isInteger(endAddress) || endAddress < 0 || endAddress > 65535) {
        showAlert('End address must be between 0 and 65535.', 'warning');
        endAddressInput?.focus();
        return;
    }

    if (endAddress < startAddress) {
        endAddress = startAddress;
    }

    if (endAddressInput) {
        endAddressInput.value = String(endAddress);
    }

    const payload = {
        deviceId: device,
        baudRate,
        parity,
        dataBits,
        stopBits,
        unitId,
        function: functionInput?.value ?? 'HoldingRegister',
        startAddress,
        endAddress
    };

    state.addressProbeSummary = buildSerialSummary(device, unitId, baudRate, dataBits, parity, stopBits);
    renderProbePendingRow();

    try {
        const response = await request(state.probeEndpoint, { method: 'POST', data: payload });
        const results = Array.isArray(response?.results) ? response.results : [];
        state.addressProbeRequest = response?.request ?? payload;
        updateAddressProbeControls();
        if (response?.request) {
            state.addressProbeSummary = buildSerialSummary(
                response.request.deviceId,
                response.request.unitId,
                response.request.baudRate,
                response.request.dataBits,
                response.request.parity,
                response.request.stopBits
            );
        }
        setAddressProbeResults(results, { resetSelections: true });
        renderAddressProbeResults();
        showAlert(`Probe completed with ${state.addressProbeResults.length} result${state.addressProbeResults.length === 1 ? '' : 's'}.`, 'success');

        if (isProbePollingEnabled() && state.addressProbeResults.length) {
            startProbePolling();
        }
    } catch (error) {
        showAlert(`Probe failed: ${error.message}`, 'danger');
        state.addressProbeRequest = null;
        updateAddressProbeControls();
        state.addressProbeSummary = '';
        setAddressProbeResults([], { resetSelections: true });
        renderAddressProbeResults();
        disableProbePolling();
    }
}

function renderAddressProbeResults() {
    const body = elements.addressProbeResultsBody;
    if (!body) {
        return;
    }

    const showSelection = shouldShowProbeSelection();
    const totalColumns = 7;
    const placeholderSpan = showSelection ? totalColumns - 1 : totalColumns;
    pruneProbeSelections(showSelection);

    if (!state.addressProbeResults.length) {
        if (showSelection) {
            body.innerHTML = `<tr class="text-monospace"><td class="probe-select-cell text-center"></td><td colspan="${placeholderSpan}" class="text-center small py-3 text-bumblebee">No probes yet.</td></tr>`;
        } else {
            body.innerHTML = `<tr class="text-monospace"><td colspan="${placeholderSpan}" class="text-center small py-3 text-bumblebee">No probes yet.</td></tr>`;
        }
        updateProbeSelectionUI(showSelection);
        updateSelectAllState();
        updateCloneLinkVisibility();
        return;
    }

    body.innerHTML = state.addressProbeResults
        .map((result) => {
            const defaultType = getDefaultProbeType(result.function);
            const selectedType = state.addressProbeSelections[result.address] ?? defaultType;
            state.addressProbeSelections[result.address] = selectedType;

            const fullyQualified = getFullyQualifiedAddress(result.function, result.address);
            const wordHtml = formatProbeWord(result);
            const selectHtml = result.error
                ? '—'
                : buildProbeTypeSelect(result.function, selectedType, false, result.address);
            const decodedHtml = result.error
                ? '<span class="text-monospace">Unavailable</span>'
                : formatProbeDecodedValue(result.address, selectedType);
            const statusHtml = result.error
                ? `<span class="text-danger">${result.error}</span>`
                : '<span class="text-success">OK</span>';
            const isSelected = state.addressProbeSelected.has(result.address);
            const checkboxHtml = showSelection
                ? `<td class="probe-select-cell text-center" data-probe-select-cell="${result.address}"><input class="form-check-input" type="checkbox" data-probe-select="${result.address}" ${isSelected ? 'checked' : ''} aria-label="Select address ${fullyQualified}"></td>`
                : '';
            const summaryHtml = `<td><code>${result.commSummary ?? '—'}</code></td>`;

            return `
                <tr data-probe-row="${result.address}">
                    ${checkboxHtml}
                    ${summaryHtml}
                    <td><code>${fullyQualified}</code></td>
                    <td>${wordHtml}</td>
                    <td data-probe-type-cell="${result.address}">${selectHtml}</td>
                    <td data-probe-decoded="${result.address}">${decodedHtml}</td>
                    <td data-probe-status="${result.address}">${statusHtml}</td>
                </tr>
            `;
        })
        .join('');

    updateProbeSelectionUI(showSelection);
    updateMultiWordRowVisibility();
    updateSelectAllState();
    updateCloneLinkVisibility();
}

function renderProbePendingRow() {
    if (!elements.addressProbeResultsBody) {
        return;
    }

    const totalColumns = 7;
    const showSelection = shouldShowProbeSelection();
    const placeholderSpan = showSelection ? totalColumns - 1 : totalColumns;
    if (showSelection) {
        elements.addressProbeResultsBody.innerHTML = `<tr class="text-monospace"><td class="probe-select-cell text-center"></td><td colspan="${placeholderSpan}" class="text-center small py-3 text-bumblebee">Probing...</td></tr>`;
    } else {
        elements.addressProbeResultsBody.innerHTML = `<tr class="text-monospace"><td colspan="${placeholderSpan}" class="text-center small py-3 text-bumblebee">Probing...</td></tr>`;
    }
}

function shouldShowProbeSelection() {
    return Array.isArray(state.addressProbeResults) && state.addressProbeResults.length > 0;
}

function ensureProbeSelectionSet() {
    if (!(state.addressProbeSelected instanceof Set)) {
        state.addressProbeSelected = new Set();
    }
}

function pruneProbeSelections(showSelection) {
    ensureProbeSelectionSet();
    if (!showSelection) {
        state.addressProbeSelected.clear();
        return;
    }

    const validAddresses = new Set(state.addressProbeResults.map((result) => result.address));
    for (const address of Array.from(state.addressProbeSelected)) {
        if (!validAddresses.has(address)) {
            state.addressProbeSelected.delete(address);
        }
    }
}

function updateProbeSelectionUI(showSelection) {
    const headerCell = elements.probeSelectAll?.closest('th');
    if (headerCell) {
        headerCell.classList.toggle('d-none', !showSelection);
    }
    if (elements.probeSelectAll) {
        elements.probeSelectAll.disabled = !showSelection || !state.addressProbeResults.length;
    }
    if (elements.probeActions) {
        elements.probeActions.classList.toggle('d-none', !showSelection);
    }
}


function handleProbeSelectionChange(address, selected) {
    ensureProbeSelectionSet();
    if (selected) {
        state.addressProbeSelected.add(address);
    } else {
        state.addressProbeSelected.delete(address);
    }

    updateSelectAllState();
    updateCloneLinkVisibility();
}

function toggleAllProbeSelections(checked) {
    if (!shouldShowProbeSelection()) {
        return;
    }

    ensureProbeSelectionSet();
    state.addressProbeSelected.clear();

    const checkboxes = elements.addressProbeResultsBody?.querySelectorAll('[data-probe-select]');
    if (!checkboxes) {
        updateSelectAllState();
        updateCloneLinkVisibility();
        return;
    }

    for (const checkbox of checkboxes) {
        const cell = checkbox.closest('[data-probe-select-cell]');
        if (cell?.classList.contains('d-none')) {
            checkbox.checked = false;
            continue;
        }

        checkbox.checked = checked;
        const address = Number(checkbox.dataset.probeSelect);
        if (checked && Number.isFinite(address)) {
            state.addressProbeSelected.add(address);
        }
    }

    updateSelectAllState();
    updateCloneLinkVisibility();
}

function updateSelectAllState() {
    const selectAll = elements.probeSelectAll;
    if (!selectAll) {
        return;
    }

    const checkboxes = elements.addressProbeResultsBody?.querySelectorAll('[data-probe-select]');
    if (!shouldShowProbeSelection() || !checkboxes || !checkboxes.length) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectAll.disabled = true;
        return;
    }

    let total = 0;
    let selectedCount = 0;
    for (const checkbox of checkboxes) {
        const cell = checkbox.closest('[data-probe-select-cell]');
        if (cell?.classList.contains('d-none')) {
            checkbox.checked = false;
            continue;
        }

        total += 1;
        if (checkbox.checked) {
            selectedCount += 1;
        }
    }

    if (!total) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectAll.disabled = true;
        return;
    }

    selectAll.disabled = false;
    selectAll.checked = selectedCount === total;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < total;
}

function updateCloneLinkVisibility() {
    const link = elements.cloneProbeLink;
    if (!link) {
        return;
    }

    ensureProbeSelectionSet();
    const hasResults = Array.isArray(state.addressProbeResults) && state.addressProbeResults.length > 0;
    const shouldShow = hasResults && state.addressProbeSelected.size > 0;
    link.classList.toggle('d-none', !shouldShow);
}

function clearProbeSelections() {
    ensureProbeSelectionSet();
    state.addressProbeSelected.clear();

    const checkboxes = elements.addressProbeResultsBody?.querySelectorAll('[data-probe-select]');
    if (checkboxes) {
        for (const checkbox of checkboxes) {
            checkbox.checked = false;
        }
    }

    updateSelectAllState();
    updateCloneLinkVisibility();
}

function getSelectedProbeAddresses() {
    ensureProbeSelectionSet();
    return Array.from(state.addressProbeSelected).sort((a, b) => a - b);
}

async function startCloneProbeWorkflow() {
    if (!shouldShowProbeSelection()) {
        return;
    }

    const selected = getSelectedProbeAddresses();
    if (!selected.length) {
        showAlert('Select at least one probe address to clone.', 'warning');
        return;
    }

    const servers = Array.isArray(state.servers) ? state.servers : [];
    populateCloneProbeProjectSelect();
    populateProbeCloneServerSelect(servers);
    cloneProbeModal?.show();
    if (state.activeConfiguration && servers.length) {
        elements.cloneProbeServerSelect?.focus();
    } else if (!state.activeConfiguration) {
        if ((elements.cloneProbeProjectSelect?.options.length ?? 0) > 1) {
            elements.cloneProbeProjectSelect?.focus();
        } else {
            elements.cloneProbeCreateProjectBtn?.focus();
        }
    } else {
        elements.cloneProbeCreateDeviceBtn?.focus();
    }
}

function populateProbeCloneServerSelect(servers) {
    const select = elements.cloneProbeServerSelect;
    if (!select) {
        return;
    }

    const options = servers
        .map((server) => `<option value="${server.id}">${server.name ?? 'Unnamed Device'}</option>`)
        .join('');
    select.innerHTML = options;
    updateCloneProbeModalState(servers);
}

function updateCloneProbeModalState(servers) {
    const serverList = Array.isArray(servers) ? servers : [];
    const hasActiveProject = Boolean(state.activeConfiguration);
    const hasDevices = hasActiveProject && serverList.length > 0;
    const hasSavedProjects = Array.isArray(state.savedConfigs) && state.savedConfigs.length > 0;

    elements.cloneProbeServerGroup?.classList.toggle('d-none', !hasActiveProject);
    elements.cloneProbeNoDevices?.classList.toggle('d-none', !(hasActiveProject && !hasDevices));

    if (elements.cloneProbeServerSelect) {
        if (hasActiveProject) {
            elements.cloneProbeServerSelect.disabled = !hasDevices;
            if (!hasDevices) {
                elements.cloneProbeServerSelect.innerHTML = '';
            } else if (elements.cloneProbeServerSelect.options.length) {
                elements.cloneProbeServerSelect.selectedIndex = 0;
            }
        } else {
            elements.cloneProbeServerSelect.disabled = true;
            elements.cloneProbeServerSelect.innerHTML = '';
        }
    }

    if (elements.confirmCloneProbeBtn) {
        elements.confirmCloneProbeBtn.disabled = !hasDevices;
    }

    if (elements.cloneProbeProjectSelect) {
        elements.cloneProbeProjectSelect.disabled = !hasSavedProjects;
    }
    elements.cloneProbeNoProjects?.classList.toggle('d-none', hasSavedProjects);
    elements.cloneProbeCreateDeviceBtn?.classList.toggle('d-none', !hasActiveProject);

    updateCloneProbeProjectControls();
}

function populateCloneProbeProjectSelect() {
    const select = elements.cloneProbeProjectSelect;
    if (!select) {
        return;
    }

    const previousValue = select.value;
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select project…';
    select.appendChild(placeholder);

    const projects = Array.isArray(state.savedConfigs) ? state.savedConfigs : [];
    for (const project of projects) {
        const option = document.createElement('option');
        option.value = project.key;
        option.textContent = project.name;
        if (project.key === previousValue) {
            option.selected = true;
        }
        select.appendChild(option);
    }

    if (!select.value && previousValue) {
        const matching = select.querySelector(`option[value="${previousValue}"]`);
        if (matching) {
            select.value = previousValue;
        }
    }

    updateCloneProbeProjectControls();
}

function updateCloneProbeProjectControls() {
    if (!elements.cloneProbeProjectSelect || !elements.cloneProbeLoadProjectBtn) {
        return;
    }

    const hasSelection = Boolean(elements.cloneProbeProjectSelect.value);
    const hasSavedProjects = Array.isArray(state.savedConfigs) && state.savedConfigs.length > 0;
    elements.cloneProbeLoadProjectBtn.disabled = !hasSelection || !hasSavedProjects;
}

async function confirmCloneProbeSelection() {
    const select = elements.cloneProbeServerSelect;
    if (!select) {
        return;
    }

    if (!state.activeConfiguration) {
        showAlert('Load or create a project before cloning probe registers.', 'warning');
        if (elements.cloneProbeProjectSelect && !elements.cloneProbeProjectSelect.disabled) {
            elements.cloneProbeProjectSelect.focus();
        } else {
            elements.cloneProbeCreateProjectBtn?.focus();
        }
        return;
    }

    if (!select.options.length) {
        showAlert('Create a MODBUS device before cloning probe registers.', 'warning');
        elements.cloneProbeCreateDeviceBtn?.focus();
        return;
    }

    const serverId = select.value;
    if (!serverId) {
        showAlert('Select a destination device.', 'warning');
        return;
    }

    await cloneProbeRegistersToServer(serverId);
}

function buildProbeTypeSelect(func, selected, disabled, address) {
    const options = getProbeTypeOptions(func);
    const disabledAttr = disabled ? ' disabled' : '';

    return `
        <select class="form-select form-select-sm"${disabledAttr} data-probe-type="${address}">
            ${options
                .map((option) => `<option value="${option}"${option === selected ? ' selected' : ''}>${option}</option>`)
                .join('')}
        </select>
    `;
}

function getProbeTypeOptions(func) {
    if (func === 'Coil' || func === 'DiscreteInput') {
        return ['Boolean', 'UInt16', 'Int16'];
    }

    return ['UInt16', 'Int16', 'UInt32', 'Int32', 'Float32', 'Double', 'Boolean'];
}

function getDefaultProbeType(func) {
    return func === 'Coil' || func === 'DiscreteInput' ? 'Boolean' : 'UInt16';
}

function formatProbeWord(result) {
    if (result.error || result.word === null || result.word === undefined) {
        return '—';
    }

    const hex = result.word.toString(16).toUpperCase().padStart(4, '0');
    if (result.function === 'Coil' || result.function === 'DiscreteInput') {
        const label = result.bitValue ? 'True' : 'False';
        return `${result.word} ${label}`;
    }

    return `${result.word} 0x${hex}`;
}

function formatProbeDecodedValue(address, dataType) {
    const decoded = decodeProbeValue(address, dataType, getProbeByteOrder());
    if (!decoded.success) {
        return `<span class="text-monospace">${decoded.reason}</span>`;
    }

    return `<span class="text-monospace">${decoded.value}</span>`;
}

function decodeProbeValue(address, dataType, byteOrder) {
    const wordLength = dataTypeWordLengths[dataType] ?? 1;
    const order = normalizeProbeByteOrder(byteOrder);
    const results = [];

    for (let offset = 0; offset < wordLength; offset++) {
        const targetAddress = address + offset;
        const result = findProbeResult(targetAddress);

        if (!result) {
            return { success: false, reason: 'Missing data' };
        }

        if (result.error) {
            return { success: false, reason: 'Dependent address error' };
        }

        if (result.word === null || result.word === undefined) {
            return { success: false, reason: 'No data' };
        }

        results.push(result);
    }

    switch (dataType) {
        case 'Boolean':
        {
            const bit = results[0]?.bitValue;
            if (bit != null) {
                return { success: true, value: bit ? 'True' : 'False' };
            }
            const word = results[0]?.word ?? 0;
            return { success: true, value: word ? 'True' : 'False' };
        }
        default: {
            const words = results.map((entry) => entry.word ?? 0);
            const baseBytes = wordsToBytes(words);
            const orderedBytes = applyProbeByteOrder(baseBytes, order, words.length);
            const bufferLength = Math.max(orderedBytes.length, 2);
            const buffer = new ArrayBuffer(bufferLength);
            const view = new DataView(buffer);
            for (let index = 0; index < orderedBytes.length; index++) {
                view.setUint8(index, orderedBytes[index]);
            }

            switch (dataType) {
                case 'UInt16':
                    return { success: true, value: view.getUint16(0, false).toString() };
                case 'Int16':
                    return { success: true, value: view.getInt16(0, false).toString() };
                case 'UInt32':
                    return { success: true, value: view.getUint32(0, false).toString() };
                case 'Int32':
                    return { success: true, value: view.getInt32(0, false).toString() };
                case 'Float32': {
                    const value = view.getFloat32(0, false);
                    return { success: true, value: formatFloatValue(value) };
                }
                case 'Double': {
                    const value = view.getFloat64(0, false);
                    return { success: true, value: formatFloatValue(value) };
                }
                default:
                    return { success: false, reason: 'Unsupported' };
            }
        }
    }
}

function findProbeResult(address) {
    return state.addressProbeResults.find((entry) => entry.address === address);
}

function updateProbeDecodedValue(address) {
    const cell = document.querySelector(`[data-probe-decoded="${address}"]`);
    if (!cell) {
        return;
    }

    const result = findProbeResult(address);
    if (!result || result.error) {
        cell.innerHTML = '<span class="text-monospace">Unavailable</span>';
        return;
    }

    const dataType = state.addressProbeSelections[address] ?? getDefaultProbeType(result.function);
    cell.innerHTML = formatProbeDecodedValue(address, dataType);
}

function formatFloatValue(value) {
    if (!Number.isFinite(value)) {
        return value.toString();
    }

    const abs = Math.abs(value);
    if ((abs >= 1_000_000) || (abs > 0 && abs < 0.001)) {
        return value.toExponential(4);
    }

    return value.toFixed(6).replace(/\.?0+$/, '');
}

function setProbeByteOrder(order) {
    const normalized = normalizeProbeByteOrder(order);
    if (state.probeByteOrder === normalized) {
        return;
    }

    state.probeByteOrder = normalized;
    if (elements.probeByteOrder && elements.probeByteOrder.value !== normalized) {
        elements.probeByteOrder.value = normalized;
    }
    refreshProbeDecodedValues();
}

function getProbeByteOrder() {
    return normalizeProbeByteOrder(state.probeByteOrder);
}

function normalizeProbeByteOrder(order) {
    if (typeof order !== 'string') {
        return 'BigEndian';
    }

    const candidate = order.trim();
    return probeByteOrderModes.has(candidate) ? candidate : 'BigEndian';
}

function refreshProbeDecodedValues() {
    if (!Array.isArray(state.addressProbeResults) || !state.addressProbeResults.length) {
        return;
    }

    for (const result of state.addressProbeResults) {
        updateProbeDecodedValue(result.address);
    }

    updateMultiWordRowVisibility();
}

function updateMultiWordRowVisibility() {
    const body = elements.addressProbeResultsBody;
    if (!body) {
        return;
    }

    ensureProbeSelectionSet();

    const typeCells = body.querySelectorAll('[data-probe-type-cell]');
    for (const cell of typeCells) {
        cell.classList.remove('d-none', 'probe-cell-hidden');
    }

    const decodedCells = body.querySelectorAll('[data-probe-decoded]');
    for (const cell of decodedCells) {
        cell.classList.remove('d-none', 'probe-cell-hidden');
    }

    const selectCells = body.querySelectorAll('[data-probe-select-cell]');
    for (const cell of selectCells) {
        cell.classList.remove('d-none', 'probe-cell-hidden');
    }

    if (!Array.isArray(state.addressProbeResults) || !state.addressProbeResults.length) {
        return;
    }

    for (const result of state.addressProbeResults) {
        const baseAddress = result.address;
        const selectedType = state.addressProbeSelections[baseAddress] ?? getDefaultProbeType(result.function);
        const wordLength = dataTypeWordLengths[selectedType] ?? 1;
        if (wordLength <= 1) {
            continue;
        }

        for (let offset = 1; offset < wordLength; offset++) {
            const targetAddress = baseAddress + offset;
            const typeCell = body.querySelector(`[data-probe-type-cell="${targetAddress}"]`);
            const decodedCell = body.querySelector(`[data-probe-decoded="${targetAddress}"]`);
            const selectCell = body.querySelector(`[data-probe-select-cell="${targetAddress}"]`);
            if (typeCell) {
                typeCell.classList.add('probe-cell-hidden');
            }
            if (decodedCell) {
                decodedCell.classList.add('probe-cell-hidden');
            }
            if (selectCell) {
                selectCell.classList.add('probe-cell-hidden');
                const checkbox = selectCell.querySelector('[data-probe-select]');
                if (checkbox) {
                    checkbox.checked = false;
                }
            }
            if (state.addressProbeSelected instanceof Set) {
                state.addressProbeSelected.delete(targetAddress);
            }
        }
    }

    updateSelectAllState();
    updateCloneLinkVisibility();
}

function wordsToBytes(words) {
    const bytes = [];
    for (const word of words) {
        bytes.push((word >> 8) & 0xff, word & 0xff);
    }
    return bytes;
}

function applyProbeByteOrder(bytes, order, wordLength) {
    switch (order) {
        case 'LittleEndian':
            return [...bytes].reverse();
        case 'WordSwap':
            return swapWordOrderBytes(bytes, wordLength);
        case 'ByteSwap':
            return swapBytesWithinWords(bytes);
        case 'BigEndian':
        default:
            return [...bytes];
    }
}

function swapWordOrderBytes(bytes, wordLength) {
    if (!Array.isArray(bytes) || bytes.length <= 2 || wordLength <= 1) {
        return [...bytes];
    }

    const chunkSize = 2;
    const chunks = [];
    for (let index = 0; index < bytes.length; index += chunkSize) {
        chunks.push(bytes.slice(index, index + chunkSize));
    }

    return chunks.reverse().flat();
}

function swapBytesWithinWords(bytes) {
    if (!Array.isArray(bytes) || bytes.length <= 1) {
        return [...bytes];
    }

    const swapped = [];
    for (let index = 0; index < bytes.length; index += 2) {
        const high = bytes[index];
        const low = bytes[index + 1];
        if (bytes.length === index + 1 || low === undefined) {
            swapped.push(high);
        } else {
            swapped.push(low, high);
        }
    }

    return swapped;
}

function isRegisterFunction(func) {
    return func === 'HoldingRegister' || func === 'InputRegister';
}

function getDataTypeRange(dataType) {
    switch (dataType) {
        case 'Boolean':
            return { min: 0, max: 1 };
        case 'UInt16':
            return { min: 0, max: 65535 };
        case 'Int16':
            return { min: -32768, max: 32767 };
        case 'UInt32':
            return { min: 0, max: 4294967295 };
        case 'Int32':
            return { min: -2147483648, max: 2147483647 };
        case 'Float32':
        case 'Double':
            return { min: -1000, max: 1000 };
        default:
            return null;
    }
}

function formatProbeAddress(func, address) {
    return getFullyQualifiedAddress(func, address);
}

function hasRegisterConflict(server, func, startAddress, wordLength) {
    if (!server || !Array.isArray(server.registers)) {
        return false;
    }

    const newStart = startAddress;
    const newEnd = startAddress + wordLength - 1;

    return server.registers.some((existing) => {
        if (!existing || existing.function !== func) {
            return false;
        }

        const existingStart = Number(existing.address ?? 0);
        const existingLength = getWordLengthFor(existing.dataType);
        const existingEnd = existingStart + existingLength - 1;

        return existingEnd >= newStart && existingStart <= newEnd;
    });
}

async function cloneProbeRegistersToServer(serverId) {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) {
        showAlert('Selected device is unavailable.', 'danger');
        return;
    }

    const selectedAddresses = getSelectedProbeAddresses();
    if (!selectedAddresses.length) {
        showAlert('Select at least one probe address to clone.', 'warning');
        return;
    }

    const conflicts = [];
    const unsupported = [];
    const errors = [];
    const created = [];

    let nameCounter = 1;

    for (const address of selectedAddresses) {
        const result = state.addressProbeResults.find((entry) => entry.address === address);
        if (!result) {
            continue;
        }

        if (!isRegisterFunction(result.function)) {
            unsupported.push(formatProbeAddress(result.function, address));
            continue;
        }

        const dataType = state.addressProbeSelections[address] ?? getDefaultProbeType(result.function);
        const range = getDataTypeRange(dataType);
        if (!range) {
            unsupported.push(formatProbeAddress(result.function, address));
            continue;
        }

        const wordLength = dataTypeWordLengths[dataType] ?? 1;
        if (hasRegisterConflict(server, result.function, address, wordLength)) {
            conflicts.push(formatProbeAddress(result.function, address));
            continue;
        }

        const description = `addres-${String(nameCounter).padStart(3, '0')}`;
        nameCounter += 1;

        const payload = {
            description,
            function: result.function,
            address,
            dataType,
            accessMode: 'ReadOnly',
            minimum: range.min,
            maximum: range.max,
            slope: 1,
            offset: 0,
            randomize: true,
            forcedValue: null
        };

        try {
            await request(`/api/servers/${server.id}/registers`, {
                method: 'POST',
                data: payload
            });
            created.push(formatProbeAddress(result.function, address));
        } catch (error) {
            errors.push(`${formatProbeAddress(result.function, address)} (${error.message})`);
        }
    }

    cloneProbeModal?.hide();

    if (created.length) {
        showAlert(`Cloned ${created.length} register${created.length === 1 ? '' : 's'} to ${server.name}.`, 'success');
    } else if (!conflicts.length && !unsupported.length && !errors.length) {
        showAlert('No probe registers were cloned.', 'info');
    }

    if (conflicts.length) {
        showAlert(`Skipped conflicting addresses: ${conflicts.join(', ')}`, 'warning');
    }

    if (unsupported.length) {
        showAlert(`Skipped unsupported probe entries: ${unsupported.join(', ')}`, 'info');
    }

    if (errors.length) {
        showAlert(`Failed to add some registers: ${errors.join(', ')}`, 'danger');
    }

    if (created.length) {
        await loadServers();
        await saveActiveConfiguration();
        await loadConfigurations();
    }

    clearProbeSelections();
    renderAddressProbeResults();
}

function renderServers() {
    updateProbeSelectionUI(shouldShowProbeSelection());
    updateCloneLinkVisibility();

    if (!elements.serversContainer) {
        return;
    }

    if (!state.servers.length) {
        elements.serversContainer.innerHTML = '';
        elements.serverEmptyState?.classList.remove('d-none');
        updateBulkDeviceButtons();
        return;
    }

    elements.serverEmptyState?.classList.add('d-none');
    elements.serversContainer.innerHTML = state.servers.map((server, index) => renderServer(server, index)).join('');

    for (const server of state.servers) {
        const stats = state.runtimeStats[server.id];
        if (stats) {
            updateRegisterRuntimeDisplay(server.id, stats);
        }
    }

    updateBulkDeviceButtons();
    renderAddressProbeResults();
}

function renderServer(server, index) {
    const runtimeMap = state.runtimeRegisterMaps[server.id] || {};
    const registers = Array.isArray(server.registers) ? server.registers : [];
    const registerRows = registers.length
        ? registers.map((register) => renderRegisterRow(server.id, register, runtimeMap[register.id])).join('')
        : '<tr><td colspan="6" class="text-monospace text-center small py-3">No registers defined.</td></tr>';

    const stats = state.runtimeStats[server.id];
    const isRunning = stats == null ? null : Boolean(stats.isRunning);
    return `
        <div class="accordion-item" data-server-id="${server.id}" style="padding-bottom:5px;">
            <h2 class="accordion-header" id="server-heading-${index}">
                <div class="d-flex align-items-center gap-3 px-3 py-2 server-accordion-header">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-sm server-action-btn" data-action="edit-server" data-server-id="${server.id}"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm server-action-btn${isRunning === true ? ' is-active' : ''}" data-action="start-server" data-start-btn="${server.id}" data-server-id="${server.id}"><i class="bi bi-play-fill"></i></button>
                        <button class="btn btn-sm server-action-btn${isRunning === false ? ' is-active' : ''}" data-action="stop-server" data-stop-btn="${server.id}" data-server-id="${server.id}"><i class="bi bi-stop-fill"></i></button>
                        <button class="btn btn-sm server-action-btn" data-action="delete-server" data-server-id="${server.id}"><i class="bi bi-x-circle"></i></button>
                    </div>
                        <button class="accordion-button collapsed flex-grow-1" type="button" data-bs-toggle="collapse" data-bs-target="#server-collapse-${server.id}" aria-expanded="false" aria-controls="server-collapse-${server.id}">
                        <span class="d-flex flex-column text-start">
                            <span class="fw-semibold">${server.name}</span>
                            <span class="small server-endpoint"><code class="ip-address">${server.hostAddress}</code>:${server.port} · Unit ${server.unitId}</span>
                        </span>
                    </button>
                </div>
            </h2>
            <div id="server-collapse-${server.id}" class="accordion-collapse collapse" aria-labelledby="server-heading-${index}">
                <div class="accordion-body">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <div class="small server-runtime-meta" data-server-meta="${server.id}">
                            Status pending...
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h3 class="h6 mb-0">Registers</h3>
                        <div class="d-flex align-items-center gap-3">
                            <a href="#" class="small" data-action="clone-server" data-server-id="${server.id}">Clone Device</a>
                            <button class="btn btn-sm btn-outline-success" data-action="add-register" data-server-id="${server.id}"><i class="bi bi-plus-circle me-1"></i>Add Register</button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm align-middle server-registers-table">
                            <thead>
                                <tr>
                                    <th scope="col">Description</th>
                                    <th scope="col">Address</th>
                                    <th scope="col">Access</th>
                                    <th scope="col">Raw Value</th>
                                    <th scope="col">Eng. Value</th>
                                    <th scope="col" class="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${registerRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateRegisterRuntimeDisplay(serverId, stats) {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server || !Array.isArray(server.registers)) {
        return;
    }

    const map = state.runtimeRegisterMaps[serverId] || {};
    for (const register of server.registers) {
        const snapshot = map[register.id] || null;
        const rawCell = document.querySelector(`[data-register-raw="${serverId}:${register.id}"]`);
        const engCell = document.querySelector(`[data-register-eng="${serverId}:${register.id}"]`);

        applyValueToCell(rawCell, buildRawValue(register, snapshot));
        applyValueToCell(engCell, buildEngineeringValue(register, snapshot));
    }
}

function applyValueToCell(cell, html) {
    if (!cell) {
        return;
    }

    cell.innerHTML = html;
}

function renderRegisterRow(serverId, register, snapshot) {
    const fullyQualified = getFullyQualifiedAddress(register.function, register.address);
    const rawHtml = buildRawValue(register, snapshot);
    const engHtml = buildEngineeringValue(register, snapshot);

    return `
        <tr data-register-row="${serverId}:${register.id}">
            <td class="description-cell">${register.description ?? '<span class="description-empty">—</span>'}</td>
            <td><code class="ip-address">${fullyQualified}</code></td>
            <td>${humanize(register.accessMode)}</td>
            <td data-register-raw="${serverId}:${register.id}">${rawHtml}</td>
            <td class="eng-cell" data-register-eng="${serverId}:${register.id}">${engHtml}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    ${register.accessMode === 'ReadWrite' ? `<button class="btn btn-outline-success" data-action="write-register" data-server-id="${serverId}" data-register-id="${register.id}"><i class="bi bi-arrow-up-circle"></i></button>` : ''}
                    <button class="btn btn-outline-warning" data-action="edit-register" data-server-id="${serverId}" data-register-id="${register.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" data-action="delete-register" data-server-id="${serverId}" data-register-id="${register.id}">
                        <i class="bi bi-x-circle"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function updateServerStatus(serverId, stats) {
    const meta = document.querySelector(`[data-server-meta="${serverId}"]`);
    const startButton = document.querySelector(`[data-start-btn="${serverId}"]`);
    const stopButton = document.querySelector(`[data-stop-btn="${serverId}"]`);
    const editButton = document.querySelector(`[data-action="edit-server"][data-server-id="${serverId}"]`);
    const deleteButton = document.querySelector(`[data-action="delete-server"][data-server-id="${serverId}"]`);
    const cloneLink = document.querySelector(`[data-action="clone-server"][data-server-id="${serverId}"]`);

    if (!meta) {
        return;
    }

    const setButtonStates = (running) => {
        const isRunning = Boolean(running);
        if (startButton) {
            startButton.classList.toggle('is-active', isRunning);
        }
        if (stopButton) {
            stopButton.classList.toggle('is-active', !isRunning);
        }
    };

    if (!stats) {
        meta.textContent = 'Unable to determine status.';
        setButtonStates(false);
        if (editButton) {
            editButton.disabled = true;
        }
        if (deleteButton) {
            deleteButton.disabled = true;
        }
        if (cloneLink) {
            cloneLink.classList.remove('disabled', 'text-monospace');
            cloneLink.setAttribute('aria-disabled', 'false');
        }
        updateBulkDeviceButtons();
        return;
    }

    // badge removed from header; status conveyed via buttons/meta

    setButtonStates(stats.isRunning);

    const running = Boolean(stats.isRunning);
    if (editButton) {
        editButton.disabled = running;
    }
    if (deleteButton) {
        deleteButton.disabled = running;
    }
    if (cloneLink) {
        cloneLink.classList.toggle('disabled', running);
        cloneLink.classList.toggle('text-monospace', running);
        cloneLink.setAttribute('aria-disabled', running ? 'true' : 'false');
    }

    const started = stats.startedAt ? new Date(stats.startedAt) : null;
    const summary = [stats.isRunning ? 'Running' : 'Stopped'];
    if (started) {
        summary.push(`Started ${started.toLocaleTimeString()}`);
    }
    const pollRate = clampNumber(stats.pollRateMilliseconds ?? 0, 0, Number.MAX_SAFE_INTEGER);
    if (pollRate > 0) {
        summary.push(`<a href="#" class="text-sky" data-action="edit-server-poll" data-server-id="${serverId}" data-current-poll="${pollRate}">Poll ${pollRate} ms</a>`);
    }
    meta.innerHTML = summary.join(' • ');
    updateBulkDeviceButtons();
}

function humanize(value) {
    return (value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function getFullyQualifiedAddress(func, address) {
    const base = functionAddressBases[func] ?? 0;
    if (!Number.isFinite(address)) {
        return '—';
    }

    return (base + Number(address)).toString().padStart(5, '0');
}

function formatRange(min, max) {
    if (min == null && max == null) {
        return '<span class="text-monospace">Auto</span>';
    }

    if (min != null && max != null) {
        return `${formatNumber(min)} to ${formatNumber(max)}`;
    }

    if (min != null) {
        return `≥ ${formatNumber(min)}`;
    }

    return `≤ ${formatNumber(max)}`;
}

function getDecimalPrecision(value) {
    if (value == null || value === '') {
        return 0;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    if (Number.isInteger(numeric)) {
        return 0;
    }

    const fixed = numeric.toFixed(12);
    const decimals = fixed.replace(/^-?\d+\./, '').replace(/0+$/, '');
    return decimals.length;
}

function formatNumber(value, precision = null) {
    if (value == null) {
        return '<span class="text-monospace">—</span>';
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '<span class="text-monospace">—</span>';
    }

    if (precision != null) {
        const clamped = Math.max(0, Math.min(12, Number(precision) || 0));
        return numeric.toLocaleString(undefined, {
            minimumFractionDigits: clamped,
            maximumFractionDigits: clamped
        });
    }

    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function showAlert(message, type = 'info', timeout = 5000) {
    if (!elements.alerts) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    const alert = wrapper.firstElementChild;
    elements.alerts.appendChild(alert);

    if (timeout > 0) {
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, timeout);
    }
}

async function request(url, options = {}) {
    const { method = 'GET', data } = options;
    const fetchOptions = {
        method,
        headers: {
            'Accept': 'application/json'
        }
    };

    if (data !== undefined) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(data);
    }

    if (method === 'GET') {
        fetchOptions.cache = 'no-store';
    }

    const requestUrl = method === 'GET'
        ? `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now().toString(36)}`
        : url;

    const response = await fetch(requestUrl, fetchOptions);
    if (!response.ok) {
        const errorMessage = await parseError(response);
        throw new Error(errorMessage);
    }

    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    return response.text();
}

async function parseError(response) {
    try {
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
            return (await response.text()) || response.statusText;
        }

        const payload = await response.json();
        if (payload?.title) {
            return payload.title;
        }

        if (payload?.detail) {
            return payload.detail;
        }

        if (typeof payload === 'string') {
            return payload;
        }

        return response.statusText || 'Request failed.';
    } catch {
        return response.statusText || 'Request failed.';
    }
}

function setScanningState(isRunning) {
    if (!elements.scanProgressWrapper || !elements.cancelScanBtn) {
        return;
    }

    elements.scanProgressWrapper.classList.toggle('d-none', !isRunning);
    elements.cancelScanBtn.classList.toggle('d-none', !isRunning);
    updateProgress(0, 1);
}

function setNetworkDiscoveryInProgress(isRunning) {
    state.networkDiscoveryInProgress = isRunning;
    if (elements.discoverNetworkLink) {
        elements.discoverNetworkLink.classList.toggle('disabled', isRunning);
        if (isRunning) {
            elements.discoverNetworkLink.setAttribute('aria-disabled', 'true');
        } else {
            elements.discoverNetworkLink.removeAttribute('aria-disabled');
        }
    }
    if (elements.networkDiscoveryProgress) {
        elements.networkDiscoveryProgress.classList.toggle('d-none', !isRunning);
    }
}

async function handleDiscoverNetworkDevices(event) {
    event.preventDefault();
    if (state.networkDiscoveryInProgress) {
        return;
    }

    const interfaceAddress = elements.scanInterfaceSelect?.value?.trim() ?? '0.0.0.0';
    if (elements.networkDiscoveryTableBody) {
        elements.networkDiscoveryTableBody.innerHTML = '<tr class="text-monospace"><td class="text-center small py-3 text-muted">Scanning for active hosts…</td></tr>';
        elements.networkDiscoveryResultsWrapper?.classList.remove('d-none');
    }

    setNetworkDiscoveryInProgress(true);
    try {
        const devices = await request(`/api/network-devices?interfaceAddress=${encodeURIComponent(interfaceAddress)}`);
        renderNetworkDiscoveryResults(Array.isArray(devices) ? devices : []);
    } catch (error) {
        showAlert(`Device discovery failed: ${error.message}`, 'danger');
        clearNetworkDiscoveryResults();
    } finally {
        setNetworkDiscoveryInProgress(false);
    }
}

function handleNetworkDiscoveryTableClick(event) {
    const target = event.target;
    if (!target) {
        return;
    }
    if (!(target instanceof Element)) {
        return;
    }

    const link = target.closest('[data-device-ip]');
    if (!link) {
        return;
    }

    event.preventDefault();
    const ip = link.dataset.deviceIp?.trim();
    if (!ip) {
        return;
    }

    if (elements.scanStartIp) {
        elements.scanStartIp.value = ip;
        elements.scanStartIp.focus();
    }
}

function handleClearNetworkDiscovery(event) {
    event.preventDefault();
    clearNetworkDiscoveryResults();
}

function renderNetworkDiscoveryResults(devices = []) {
    state.networkDiscoveryDevices = Array.isArray(devices) ? devices : [];
    const body = elements.networkDiscoveryTableBody;
    if (!body) {
        return;
    }

    if (!state.networkDiscoveryDevices.length) {
        body.innerHTML = '<tr class="text-monospace"><td class="text-center small py-3 text-muted">No active network devices were detected.</td></tr>';
        elements.networkDiscoveryResultsWrapper?.classList.remove('d-none');
        return;
    }

    body.innerHTML = state.networkDiscoveryDevices.map((device) => {
        const ipAddress = device?.ipAddress ?? '';
        const safeAddress = escapeHtml(ipAddress);
        const hostname = device?.hostname ? `<div class="small text-muted mt-1">${escapeHtml(device.hostname)}</div>` : '';
        return `
            <tr>
                <td>
                    <a href="#" class="text-sky text-decoration-none d-inline-flex align-items-baseline gap-1" data-device-ip="${ipAddress}">
                        <span class="text-monospace">${safeAddress}</span>
                    </a>
                    ${hostname}
                </td>
            </tr>
        `;
    }).join('');
    elements.networkDiscoveryResultsWrapper?.classList.remove('d-none');
}

function clearNetworkDiscoveryResults() {
    state.networkDiscoveryDevices = [];
    if (!elements.networkDiscoveryTableBody) {
        return;
    }

    elements.networkDiscoveryTableBody.innerHTML = '<tr class="text-monospace"><td class="text-center small py-3 text-muted">Run discovery to display active hosts.</td></tr>';
    elements.networkDiscoveryResultsWrapper?.classList.add('d-none');
}

function escapeHtml(value) {
    return (value ?? '').replace(/[&<>"']/g, (char) => {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;'
        }[char] ?? char;
    });
}

function renderScan(status) {
    if (!elements.scanProgressBar || !elements.scanResultsBody) {
        return;
    }

    if (state.scanContext === 'serial') {
        renderSerialScan(status);
        return;
    }

    updateProgress(status.completedProbes, status.totalProbes);

    const results = Array.isArray(status.results) ? status.results : [];

    if (!results.length) {
        elements.scanResultsBody.innerHTML = '<tr class="text-monospace"><td colspan="5" class="text-center small py-3">Scanning...</td></tr>';
        return;
    }

    elements.scanResultsBody.innerHTML = results.map((result) => {
        const actionHtml = result.success
            ? `<button class="btn btn-outline-primary btn-sm" data-action="probe-host" data-ip="${result.ipAddress}" data-port="${result.port}">Probe</button>`
            : '<span class="text-monospace">—</span>';

        const detailHtml = result.error
            ? `<span class="${result.error.trim().toLowerCase() === 'timeout' ? 'text-terra' : 'text-ash'}">${result.error}</span>`
            : '<span class="text-clean-green">OK</span>';

        return `
            <tr>
                <td><code class="ip-address">${result.ipAddress}</code></td>
                <td>${result.port}</td>
                <td class="text-center">${renderScanStatusBadge(result)}</td>
                <td class="detail-cell">${detailHtml}</td>
                <td class="text-end">${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

function renderSerialScan(status) {
    updateProgress(status.completedProbes, status.totalProbes);

    const results = Array.isArray(status.results) ? status.results : [];

    if (!results.length) {
        elements.scanResultsBody.innerHTML = '<tr class="text-monospace"><td colspan="5" class="text-center small py-3">Scanning...</td></tr>';
        return;
    }

    const request = status.request ?? {};
    const summaryBase = {
        deviceId: request.deviceId ?? '',
        baudRate: request.baudRate ?? 9600,
        dataBits: request.dataBits ?? 8,
        parity: request.parity ?? 'None',
        stopBits: request.stopBits ?? 1
    };

    elements.scanResultsBody.innerHTML = results.map((result) => {
        const summary = buildSerialSummary(summaryBase.deviceId, result.unitId, summaryBase.baudRate, summaryBase.dataBits, summaryBase.parity, summaryBase.stopBits);
        const detailHtml = result.error
            ? `<span class="text-danger">${result.error}</span>`
            : '<span class="text-clean-green">OK</span>';
        const actionHtml = result.success
            ? `<button class="btn btn-outline-primary btn-sm" data-action="probe-host" data-device="${summaryBase.deviceId}" data-baud="${summaryBase.baudRate}" data-parity="${summaryBase.parity}" data-databits="${summaryBase.dataBits}" data-stopbits="${summaryBase.stopBits}" data-unit="${result.unitId}">Probe</button>`
            : '<span class="text-monospace">—</span>';

        return `
            <tr>
                <td><code class="ip-address">${summary}</code></td>
                <td>${result.unitId}</td>
                <td class="text-center">${renderScanStatusBadge(result)}</td>
                <td class="detail-cell">${detailHtml}</td>
                <td class="text-end">${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

function renderScanStatusBadge(result) {
    if (result.success) {
        return '<span class="badge bg-success">Reachable</span>';
    }

    return '<span class="badge bg-danger">No response</span>';
}

function updateProgress(completed, total) {
    if (!elements.scanProgressBar) {
        return;
    }

    const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
    elements.scanProgressBar.style.width = `${percent}%`;
    elements.scanProgressBar.textContent = `${percent}%`;
}

function resetScanState() {
    if (state.scanTimer) {
        clearInterval(state.scanTimer);
    }
    state.scanTimer = null;
    state.scanJobId = null;
    setScanningState(false);
}

document.addEventListener('DOMContentLoaded', init);
