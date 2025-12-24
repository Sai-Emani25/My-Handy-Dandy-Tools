// ====== CONFIGURATION ======
// Get your Client ID from: https://console.cloud.google.com/apis/credentials
// 1. Create a new project or select existing one
// 2. Enable Google Drive API
// 3. Create OAuth 2.0 Client ID (Web application)
// 4. Add http://localhost:8000 to Authorized JavaScript origins
// 5. Copy the Client ID here
const GOOGLE_CLIENT_ID = "837832619942-5am0qt26hkjqo3uaqnpclkkovnrlf26o.apps.googleusercontent.com";

// Google Drive API Configuration
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
// ==============================================

let currentUser = null;
let worksheets = [];
let currentWorksheet = null;
let tabs = [];
let currentTabIndex = -1;
let worksheetToRename = null;
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

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
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      console.error(resp);
      alert("Authentication failed: " + resp.error);
      return;
    }
    // Set the token in gapi.client first
    gapi.client.setToken(resp);
    // Now we can get the access token
    accessToken = resp.access_token;
    await onSignIn();
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

async function onSignIn() {
  // Get user info
  try {
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Handle both success and failure cases gracefully
    const userData = userInfo.ok ? await userInfo.json() : {};

    currentUser = {
      email: userData.email || "user@example.com",
      name: userData.name || "User",
      picture: userData.picture || ""
    };

    // Update UI
    const gButtonContainer = document.getElementById("gButtonContainer");
    const userProfile = document.getElementById("userProfile");

    gButtonContainer.classList.remove("active");
    userProfile.classList.add("active");
    document.getElementById("userName").textContent = currentUser.name;
    document.getElementById("userEmail").textContent = currentUser.email;

    // Load worksheets
    await loadWorksheets();
  } catch (err) {
    console.error("Sign-in error:", err);
    // Still set a basic user to allow the app to function
    currentUser = { email: "user@example.com", name: "User", picture: "" };

    // Update UI anyway
    const gButtonContainer = document.getElementById("gButtonContainer");
    const userProfile = document.getElementById("userProfile");
    gButtonContainer.classList.remove("active");
    userProfile.classList.add("active");
    document.getElementById("userName").textContent = currentUser.name;
    document.getElementById("userEmail").textContent = currentUser.email;

    await loadWorksheets();
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    accessToken = null;
  }

  // Clear state
  currentUser = null;
  currentWorksheet = null;
  worksheets = [];
  tabs = [];

  // Update UI
  const gButtonContainer = document.getElementById("gButtonContainer");
  const userProfile = document.getElementById("userProfile");

  gButtonContainer.classList.add("active");
  userProfile.classList.remove("active");

  renderWorksheets();
  renderTabs();
  updateAddButtonState();
  renderTabs();
  updateAddButtonState();
  // document.getElementById("iframe").src = "about:blank"; // Iframe removed
}

// ==================== GOOGLE DRIVE API HELPERS ====================
const DATA_FILE_NAME = 'handy_dandy_tools_data.json';

async function getOrCreateDataFile() {
  try {
    // Search for existing file
    // We order by modifiedTime desc to get the most recent one if duplicates exist
    const response = await gapi.client.drive.files.list({
      q: `name='${DATA_FILE_NAME}' and trashed=false`,
      spaces: 'appDataFolder',
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    // Handle duplicates: if found, keep the newest, delete others (optional but good for hygiene)
    if (response.result.files && response.result.files.length > 0) {
      const files = response.result.files;
      const mainFile = files[0];

      // If duplicates exist, log it (can't easily delete safely without knowing content, but we take newest)
      if (files.length > 1) {
        console.warn("Multiple data files found. Using the most recent one.");
      }

      return mainFile.id;
    }

    // Create new file if it doesn't exist (Metadata only first)
    const fileMetadata = {
      name: DATA_FILE_NAME,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    };

    const file = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });

    const newFileId = file.result.id;

    // Initialize with default data immediately
    const initialData = { worksheets: [] };
    await saveDataToFile(newFileId, initialData);

    return newFileId;
  } catch (err) {
    console.error('Error getting/creating data file:', err);
    const errorMsg = err.result?.error?.message || err.message || JSON.stringify(err);

    if (err.status === 403 || (err.result?.error?.code === 403)) {
      alert("Action Required: Enable Google Drive API\n\nPlease visit this link to enable it:\nhttps://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=837832619942");
    } else {
      alert('Error accessing Google Drive: ' + errorMsg);
    }
    // Throw a specific error so callers know we already handled the UI
    throw new Error("HANDLED_ERROR");
  }
}

async function loadData() {
  try {
    const fileId = await getOrCreateDataFile();
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });

    // Ensure we handle string body vs obj result
    let content = response.body;

    // Sometimes gapi returns the parsed object in result if body is empty or auto-parsed
    if (!content && response.result && typeof response.result === 'object') {
      // If result is the metadata usually, but check if it resembles our data
      if (response.result.worksheets) return response.result;
    }

    if (typeof content === 'string') {
      // If empty string, return default
      if (!content.trim()) return { worksheets: [] };
      return JSON.parse(content);
    }

    return content || { worksheets: [] };
  } catch (err) {
    console.error('Error loading data:', err);
    return { worksheets: [] };
  }
}

// Helper to save to specific ID
async function saveDataToFile(fileId, data) {
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Failed to save data: ' + errorText);
  }
  return true;
}

async function saveData(data) {
  try {
    const fileId = await getOrCreateDataFile();
    await saveDataToFile(fileId, data);
    return true;
  } catch (err) {
    if (err.message === "HANDLED_ERROR") {
      throw err; // Already alerted
    }
    console.error('Error saving data:', err);
    alert('Failed to save data. Please check your connection and try again.');
    throw err;
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

// Manual Save
document.getElementById("manualSaveBtn").onclick = async () => {
  if (!currentWorksheet || !currentUser) return;

  const btn = document.getElementById("manualSaveBtn");
  const originalText = btn.innerHTML;

  try {
    btn.textContent = "Saving...";
    btn.disabled = true;

    await saveData({ worksheets });

    btn.innerHTML = "✅ Saved!";
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error("Manual save failed:", err);
    btn.textContent = "❌ Failed";
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  }
};

// Add tab
document.getElementById("addBtn").onclick = async () => {
  const input = document.getElementById("urlInput");
  let url = input.value.trim();

  if (!url) return;
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }
  if (!currentWorksheet) {
    alert("Please select a worksheet first.");
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  const tabData = {
    url,
    name: url.replace(/^https?:\/\//, "").split("/")[0],
    created: new Date().toISOString()
  };

  try {
    tabs.push(tabData);

    const worksheet = worksheets.find(w => w.id === currentWorksheet.id);
    if (worksheet) {
      worksheet.tabs = tabs;
      await saveData({ worksheets });
      input.value = "";
      renderTabs();
    }
  } catch (err) {
    console.error(err);
    alert("Failed to save link.");
  }
};

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
  const loginBtn = document.createElement("button");
  loginBtn.textContent = "🔐 Sign in with Google";
  loginBtn.style.cssText = `
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #4285f4, #34a853);
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        font-size: 15px;
        transition: all 0.3s ease;
        box-shadow: 0 6px 20px rgba(66, 133, 244, 0.3);
      `;
  loginBtn.onmouseover = () => {
    loginBtn.style.transform = 'translateY(-2px)';
    loginBtn.style.boxShadow = '0 10px 30px rgba(66, 133, 244, 0.4)';
  };
  loginBtn.onmouseout = () => {
    loginBtn.style.transform = 'translateY(0)';
    loginBtn.style.boxShadow = '0 6px 20px rgba(66, 133, 244, 0.3)';
  };
  loginBtn.onclick = handleAuthClick;

  const container = document.getElementById("gButtonContainer");
  container.innerHTML = '<div class="google-signin-text">Sign in to save your worksheets</div>';
  container.appendChild(loginBtn);
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
