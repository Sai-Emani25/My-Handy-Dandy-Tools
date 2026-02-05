// ====== CONFIGURATION ======
// Get your Client ID from: https://console.cloud.google.com/apis/credentials
// 1. Create a new project or select existing one
// 2. Enable Google Drive API
// 3. Create OAuth 2.0 Client ID (Web application)
// 4. Add http://localhost:8000 AND your production URL (e.g., https://handydandytools.netlify.app) to Authorized JavaScript origins
// 5. Copy the Client ID here
const GOOGLE_CLIENT_ID = "837832619942-5am0qt26hkjqo3uaqnpclkkovnrlf26o.apps.googleusercontent.com";

// Google Drive API Configuration
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
// ==============================================

// Set default user since Google login is disabled
let currentUser = {
  email: "local@user.com",
  name: "Local User",
  picture: ""
};
let worksheets = [];
let currentWorksheet = null;
let tabs = [];
let currentTabIndex = -1;
let worksheetToRename = null;
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

// Initialize the app
window.addEventListener("load", async () => {
  await loadWorksheets();
  renderWorksheets();
  updateAddButtonState();
});

// ==================== INITIALIZATION ====================
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined later
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    // Ready to show login button
    setupLoginButton();
  }
}

// Load GAPI and GIS
window.addEventListener("load", () => {
  setTimeout(() => {
    if (typeof gapi !== 'undefined') {
      gapiLoaded();
    }
    if (window.google && google.accounts && google.accounts.oauth2) {
      gisLoaded();
    }
  }, 500);
});

// ==================== AUTHENTICATION ====================
function handleAuthClick() {
  alert('Google login is currently disabled. Please use the import/export buttons to manage your data.');
}

function handleSignoutClick() {
  alert('Google logout is currently disabled.');
}

// Disable Google login button setup
function setupLoginButton() {
  const container = document.getElementById("gButtonContainer");
  container.innerHTML = '<div class="google-signin-text">Google login is currently disabled. Please use the import/export buttons to manage your data.</div>';
  container.classList.add("active");
}

// ==================== LOCAL STORAGE FUNCTIONS ====================
async function saveData(data) {
  try {
    localStorage.setItem('handy_dandy_tools_data', JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Error saving data:', err);
    alert('Failed to save data locally.');
    throw err;
  }
}

async function loadData() {
  try {
    const data = localStorage.getItem('handy_dandy_tools_data');
    return data ? JSON.parse(data) : { worksheets: [] };
  } catch (err) {
    console.error('Error loading data:', err);
    return { worksheets: [] };
  }
}

// ==================== WORKSHEETS ====================
async function loadWorksheets() {
  try {
    const data = await loadData();
    worksheets = data.worksheets || [];
    renderWorksheets();

    // Auto-select first worksheet if none selected
    if (!currentWorksheet && worksheets.length > 0) {
      selectWorksheet(worksheets[0].id);
    }
  } catch (err) {
    console.error('Error loading worksheets:', err);
    alert('Failed to load worksheets');
  }
}

function renderWorksheets() {
  const container = document.getElementById("worksheetsList");
  container.innerHTML = "";

  if (worksheets.length === 0) {
    container.innerHTML = '<div style="color: #94a3b8; font-size: 13px; padding: 10px;">No worksheets yet. Create one to get started!</div>';
    return;
  }

  worksheets.forEach(ws => {
    const el = document.createElement("div");
    el.className = "worksheet-item" + (currentWorksheet && currentWorksheet.id === ws.id ? " active" : "");

    const nameEl = document.createElement("span");
    nameEl.className = "worksheet-name";
    nameEl.textContent = ws.name;

    const actionsEl = document.createElement("div");
    actionsEl.className = "worksheet-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn";
    renameBtn.textContent = "✏️";
    renameBtn.title = "Rename";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      openRenameWorksheetModal(ws.id);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "Delete";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteWorksheet(ws.id);
    };

    actionsEl.appendChild(renameBtn);
    actionsEl.appendChild(deleteBtn);

    el.appendChild(nameEl);
    el.appendChild(actionsEl);

    el.onclick = () => selectWorksheet(ws.id);
    container.appendChild(el);
  });
}

function selectWorksheet(worksheetId) {
  const worksheet = worksheets.find(w => w.id === worksheetId);
  if (!worksheet) return;

  currentWorksheet = worksheet;
  currentTabIndex = -1;
  tabs = worksheet.tabs || [];

  // Update UI
  document.getElementById("currentWorksheetDisplay").textContent = worksheet.name;
  renderWorksheets();
  renderTabs();
  updateAddButtonState();
}

async function createWorksheet() {
  const input = document.getElementById("newWorksheetInput");
  const name = input.value.trim();

  if (!name) {
    alert("Please enter a worksheet name");
    return;
  }

  if (!currentUser) {
    alert("Please log in first");
    return;
  }

  try {
    const newWorksheet = {
      id: Date.now().toString(),
      name: name,
      tabs: [],
      created: new Date().toISOString()
    };

    worksheets.push(newWorksheet);
    await saveData({ worksheets });

    input.value = "";
    closeNewWorksheetModal();
    renderWorksheets();

    // Auto-select the new worksheet
    selectWorksheet(newWorksheet.id);
  } catch (err) {
    console.error(err);
    alert("Failed to create worksheet");
  }
}

async function deleteWorksheet(worksheetId) {
  if (!confirm("Delete this worksheet and all its links? This cannot be undone.")) return;

  try {
    worksheets = worksheets.filter(w => w.id !== worksheetId);
    await saveData({ worksheets });

    // Clear current worksheet if it was deleted
    if (currentWorksheet && currentWorksheet.id === worksheetId) {
      currentWorksheet = null;
      tabs = [];
      renderTabs();
      updateAddButtonState();
      // document.getElementById("iframe").src = "about:blank"; // Iframe removed
    }

    renderWorksheets();
  } catch (err) {
    console.error(err);
    alert("Failed to delete worksheet");
  }
}

function openRenameWorksheetModal(worksheetId) {
  worksheetToRename = worksheets.find(w => w.id === worksheetId);
  if (!worksheetToRename) return;

  document.getElementById("renameWorksheetInput").value = worksheetToRename.name;
  document.getElementById("renameWorksheetModal").classList.add("active");
}

function closeRenameWorksheetModal() {
  worksheetToRename = null;
  document.getElementById("renameWorksheetModal").classList.remove("active");
}

async function confirmRenameWorksheet() {
  if (!worksheetToRename) return;

  const input = document.getElementById("renameWorksheetInput");
  const newName = input.value.trim();

  if (!newName) {
    alert("Please enter a name");
    return;
  }

  try {
    const worksheet = worksheets.find(w => w.id === worksheetToRename.id);
    if (worksheet) {
      worksheet.name = newName;
      await saveData({ worksheets });

      if (currentWorksheet && currentWorksheet.id === worksheetToRename.id) {
        currentWorksheet.name = newName;
        document.getElementById("currentWorksheetDisplay").textContent = newName;
      }

      renderWorksheets();
    }

    closeRenameWorksheetModal();
  } catch (err) {
    console.error(err);
    alert("Failed to rename worksheet");
  }
}

// ==================== TABS ====================
function renderTabs() {
  const container = document.getElementById("tabs");
  container.innerHTML = "";

  if (!currentWorksheet) {
    container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔗</div>
            <div>Select or create a worksheet to start adding links</div>
          </div>
        `;
    return;
  }

  if (tabs.length === 0) {
    container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔗</div>
            <div>No links yet. Add your first link above!</div>
          </div>
        `;
    return;
  }

  tabs.forEach((tab, index) => {
    const el = document.createElement("div");
    el.className = "tab" + (index === currentTabIndex ? " active" : "");

    const textEl = document.createElement("span");
    textEl.textContent = tab.name || tab.url.replace(/^https?:\/\//, "").split("/")[0];

    const deleteBtn = document.createElement("span");
    deleteBtn.className = "tab-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteTab(index);
    };

    el.appendChild(textEl);
    el.appendChild(deleteBtn);
    el.title = tab.url;
    el.onclick = () => openTab(index);
    container.appendChild(el);
  });
}

function openTab(index) {
  currentTabIndex = index;
  const tab = tabs[index];
  window.open(tab.url, '_blank');
  document.querySelectorAll(".tab").forEach((t, i) => {
    t.classList.toggle("active", i === index);
  });
}

async function deleteTab(tabIndex) {
  if (!currentWorksheet || !currentUser) return;

  try {
    tabs.splice(tabIndex, 1);

    const worksheet = worksheets.find(w => w.id === currentWorksheet.id);
    if (worksheet) {
      worksheet.tabs = tabs;
      await saveData({ worksheets });
      renderTabs();
    }
  } catch (err) {
    console.error(err);
    alert("Failed to delete link");
  }
}

// Updated Save Changes button to download JSON file
document.getElementById("manualSaveBtn").onclick = () => {
  const dataStr = JSON.stringify({ worksheets }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'handy_dandy_tools_data.json';
  a.click();
  URL.revokeObjectURL(url);
};

// Updated Import Save button to load JSON file
document.getElementById("importDataInput").addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      if (importedData.worksheets) {
        worksheets = importedData.worksheets;
        await saveData({ worksheets });
        renderWorksheets();
        alert('Data imported successfully!');
      } else {
        alert('Invalid file format. Please upload a valid JSON file.');
      }
    } catch (err) {
      console.error('Error importing data:', err);
      alert('Failed to import data. Please check the file format.');
    }
  };
  reader.readAsText(file);
});

document.getElementById("importDataBtn").addEventListener('click', () => {
  document.getElementById("importDataInput").click();
});

// Enter to add
document.getElementById("urlInput").addEventListener("keypress", e => {
  if (e.key === "Enter") document.getElementById("addBtn").click();
});

function updateAddButtonState() {
  const addBtn = document.getElementById("addBtn");
  const saveBtn = document.getElementById("manualSaveBtn");
  const disabled = !currentUser || !currentWorksheet;
  addBtn.disabled = disabled;
  saveBtn.disabled = disabled;
}

// ==================== UI INTERACTIONS ====================
document.getElementById("sidebarToggle").onclick = () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
};

document.getElementById("newWorksheetBtn").onclick = () => {
  document.getElementById("newWorksheetModal").classList.add("active");
};

function closeNewWorksheetModal() {
  document.getElementById("newWorksheetModal").classList.remove("active");
  document.getElementById("newWorksheetInput").value = "";
}

// Setup login button
function setupLoginButton() {
  const container = document.getElementById("gButtonContainer");
  container.innerHTML = '<div class="google-signin-text">Google login is currently disabled. Please use the import/export buttons to manage your data.</div>';
  container.classList.add("active");
}

document.getElementById("logoutBtn").onclick = handleSignoutClick;

// Close modals on outside click
document.getElementById("newWorksheetModal").onclick = (e) => {
  if (e.target.id === "newWorksheetModal") closeNewWorksheetModal();
};

document.getElementById("renameWorksheetModal").onclick = (e) => {
  if (e.target.id === "renameWorksheetModal") closeRenameWorksheetModal();
};

// Enter key in modals
document.getElementById("newWorksheetInput").addEventListener("keypress", e => {
  if (e.key === "Enter") createWorksheet();
});

document.getElementById("renameWorksheetInput").addEventListener("keypress", e => {
  if (e.key === "Enter") confirmRenameWorksheet();
});

// Export Data
function exportData() {
  const dataStr = JSON.stringify({ worksheets }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'handy_dandy_tools_data.json';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('exportDataBtn').addEventListener('click', exportData);
