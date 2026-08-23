/* =========================================================================
   Singer Sri Lanka — Over 6-Month Inventory Dashboard (multi-user, GitHub-synced)
   Sections:
     0. Shared namespace / session
     1. Config (header aliases, drill levels, columns)
     2. State
     3. Utilities
     4. Sync engine (overlay JSON in GitHub: remarks + showroom visits + activity)
     5. Auth flow (GitHub setup screen, login screen)
     6. Data loading & normalisation (inventory workbook)
     7. Filtering & drilldown
     8. KPI cards
     9. Filter fields (search/typeahead)
    10. Drill breadcrumb
    11. Charts
    12. Table (search/sort/resize/hide/sticky/pagination/remark edit)
    13. Export (Excel/CSV/Print)
    14. Upload new inventory + backup
    15. Activity log
    16. Theme + nav + init
   ========================================================================= */

window.Shared = (function () {
  "use strict";

  /* ======================================================================
     0. SESSION
     ====================================================================== */
  const SESSION_KEY = "over6_session_v1";
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function setSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }

  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  const HEADER_ALIASES = {
    year: ["year"], month: ["month"],
    area: ["area"], district: ["district"],
    location: ["location"],
    site: ["site", "sitecode"],
    store: ["sitedes", "store", "storename", "branch", "showroom", "outlet"],
    channel: ["store"],
    partNo: ["partno", "partnumber", "part"],
    description: ["proddes", "productdescription", "description", "desc"],
    brand: ["branddes", "brand"],
    productFamily: ["prodfamilydes", "productfamily", "family"],
    commodity: ["comdes", "commodity"],
    closingBalance: ["clbal", "closingbalance", "quantity", "qty", "closingqty"],
    sellingPrice: ["selcashprice", "sellingprice", "price", "cashprice"],
    stockStatus: ["partstatus", "stockstatus", "status"],
    agingStatus: ["agingstatus", "aging"],
    ageInDays: ["ageindays", "daysinstock", "stockage"],
    manager: ["manager", "areamanager", "storemanager"],
    mrp: ["mrp"],
    mop: ["mop"],
    currentDiscountPct: ["currentdiscount", "discountpercentage", "discountpct"],
    discountGuideline: ["commentsdiscountguideline", "discountguideline"]
  };
  const CODE_COLUMN_HINTS = ["code", "id"];

  const DRILL_LEVELS = [
    { field: "area", label: "Area" },
    { field: "district", label: "District" },
    { field: "store", label: "Shop" },
    { field: "productFamily", label: "Product Family" },
    { field: "brand", label: "Brand" },
    { field: "partNo", label: "Part Code" }
  ];

  const TABLE_COLUMNS = [
    { key: "partNo", label: "Part Code", width: 130, sticky: true },
    { key: "description", label: "Description", width: 230 },
    { key: "brand", label: "Brand", width: 110 },
    { key: "productFamily", label: "Product Family", width: 160 },
    { key: "area", label: "Area", width: 160 },
    { key: "district", label: "District", width: 140 },
    { key: "store", label: "Shop", width: 180 },
    { key: "location", label: "Location", width: 160 },
    { key: "closingBalance", label: "Quantity", width: 90, numeric: true },
    { key: "value", label: "Inventory Value", width: 140, numeric: true },
    { key: "mrp", label: "MRP", width: 110, numeric: true },
    { key: "mop", label: "MOP", width: 110, numeric: true },
    { key: "currentDiscountPct", label: "Current Discount %", width: 140, numeric: true },
    { key: "discountGuideline", label: "Comments / Discount Guideline", width: 260, adminOnly: true },
    { key: "sold", label: "Sold", width: 80, isSold: true, salesOnly: true },
    { key: "soldComment", label: "Sold Comment", width: 200, isSoldComment: true, salesOnly: true },
    { key: "remark", label: "Remark", width: 210, isRemark: true },
    { key: "commentedBy", label: "Commented By", width: 130, isMeta: true },
    { key: "commentDate", label: "Comment Date", width: 110, isMeta: true },
    { key: "lastUpdated", label: "Last Updated", width: 150, isMeta: true }
  ];

  const CHART_COLORS = ["#0e2340", "#d81e2c", "#1b4278", "#e7a232", "#1f9d55", "#7c8798", "#8e44ad", "#0f9b8e", "#c0392b", "#2c3e6b"];

  /* ======================================================================
     2. STATE
     ====================================================================== */
  const state = {
    rawData: [],
    filters: { area: "", district: "", store: "", brand: "", productFamily: "", commodity: "", location: "", partNo: "", description: "" },
    tableSearch: "",
    sort: { field: "value", dir: "desc" },
    page: 1,
    pageSize: 50,
    hiddenCols: {},
    lastLoadedAt: null,
    inventorySha: null,
    lastRemoteFetchAt: null
  };

  const overlay = { remarks: {}, showroomVisits: {}, soldMarks: {}, activity: [] };
  const overlayMeta = { sha: null, dirtyRemarks: new Set(), dirtyShowroom: new Set(), dirtySold: new Set(), pendingActivity: [], saveTimer: null, saving: false, loadFailed: false };

  const chartRegistry = {};

  /* ======================================================================
     3. UTILITIES
     ====================================================================== */
  function normHeader(h) { return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function fmtInt(n) { if (n === null || n === undefined || isNaN(n)) return "-"; return Math.round(n).toLocaleString("en-LK"); }
  function fmtMoney(n) { if (n === null || n === undefined || isNaN(n)) return "-"; return "Rs " + Math.round(n).toLocaleString("en-LK"); }
  function fmtMoneyShort(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    const abs = Math.abs(n);
    if (abs >= 1e9) return "Rs " + (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "Rs " + (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return "Rs " + (n / 1e3).toFixed(1) + "K";
    return "Rs " + Math.round(n).toLocaleString("en-LK");
  }
  function debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
  function escapeHtml(s) { return String(s === undefined || s === null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function remarkKey(partNo, store) { return (partNo || "").trim() + "||" + (store || "").trim(); }
  function isSalesRole() { const s = getSession(); return !!(s && s.role === "sales"); }
  function nowParts() {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 8), iso: d.toISOString() };
  }
  function setLoading(visible, text) {
    const overlayEl = document.getElementById("loadingOverlay");
    if (text) document.getElementById("loadingText").textContent = text;
    if (visible) overlayEl.classList.remove("hidden"); else overlayEl.classList.add("hidden");
  }

  /* ======================================================================
     4. SYNC ENGINE — data/app-data.json overlay in GitHub
     ====================================================================== */
  const OVERLAY_PATH = "data/app-data.json";

  function setSaveStatus(kind, text) {
    const el = document.getElementById("saveStatus");
    if (!el) return;
    el.className = "save-status save-" + kind;
    el.textContent = text;
  }

  async function loadOverlay() {
    // Retry a couple of times before giving up — the same intermittent
    // network hiccups that can interrupt the larger Inventory.xlsx download
    // can just as easily interrupt this smaller fetch, and this file is
    // what every remark/showroom-visit/sold-mark the whole team has ever
    // entered lives in. Silently showing blank data here (with no
    // indication anything failed) is dangerous: someone could enter new
    // remarks on top of what looks like a "fresh" sheet, and if a save
    // then also failed to fetch fresh data, could momentarily believe
    // data is missing when it's actually just not loaded yet.
    const attempts = 3;
    for (let i = 1; i <= attempts; i++) {
      try {
        const { sha, data } = await GitHubService.getJson(OVERLAY_PATH);
        overlayMeta.sha = sha;
        if (data) {
          overlay.remarks = data.remarks || {};
          overlay.showroomVisits = data.showroomVisits || {};
          overlay.soldMarks = data.soldMarks || {};
          overlay.activity = data.activity || [];
        }
        overlayMeta.loadFailed = false;
        return;
      } catch (e) {
        console.warn(`Overlay load attempt ${i}/${attempts} failed:`, e);
        if (i < attempts) await new Promise((r) => setTimeout(r, 800 * i));
      }
    }
    // All attempts failed. Do NOT silently continue as if there's simply no
    // data yet — that's how existing remarks/showroom visits appear to
    // "disappear" from the screen with zero explanation. Make it visible.
    overlayMeta.loadFailed = true;
    console.error("Overlay failed to load after " + attempts + " attempts. Remarks/showroom/sold data will show blank until this succeeds \u2014 this does NOT mean the data was lost from GitHub.");
  }

  function renderOverlayLoadWarningIfNeeded() {
    const el = document.getElementById("overlayLoadWarning");
    if (!el) return;
    el.classList.toggle("hidden", !overlayMeta.loadFailed);
  }

  function logActivity(user, action) {
    const np = nowParts();
    const entry = { user: user || "Unknown", date: np.date, time: np.time, iso: np.iso, action };
    overlay.activity.unshift(entry);
    overlay.activity = overlay.activity.slice(0, 50);
    overlayMeta.pendingActivity.unshift(entry);
    renderActivityLog();
  }

  function markRemarkDirty(key) { overlayMeta.dirtyRemarks.add(key); scheduleOverlaySave(); }
  function markShowroomDirty(key) { overlayMeta.dirtyShowroom.add(key); scheduleOverlaySave(); }
  function markSoldDirty(key) { overlayMeta.dirtySold.add(key); scheduleOverlaySave(); }

  function scheduleOverlaySave() {
    setSaveStatus("saving", "Saving\u2026");
    clearTimeout(overlayMeta.saveTimer);
    overlayMeta.saveTimer = setTimeout(performOverlaySave, 2200);
  }

  async function performOverlaySave() {
    if (overlayMeta.saving) { overlayMeta.saveTimer = setTimeout(performOverlaySave, 1500); return; }
    if (!GitHubService.isConfigured()) return;
    overlayMeta.saving = true;
    setSaveStatus("saving", "Saving\u2026");

    // Always fetch the current remote overlay fresh, right before writing,
    // then re-apply only OUR locally-dirty keys on top of it. This avoids
    // ever attempting a write with a stale or missing SHA (a SHA cached
    // once at page-load time can go stale by the time a save actually
    // fires, minutes or hours later) — GitHub rejects that with a
    // '"sha" wasn\'t supplied' 422 error even though the file exists.
    async function fetchFreshAndMerge() {
      const remote = await GitHubService.getJson(OVERLAY_PATH);
      const remoteData = remote.data || { remarks: {}, showroomVisits: {}, soldMarks: {}, activity: [] };
      remoteData.remarks = remoteData.remarks || {};
      remoteData.showroomVisits = remoteData.showroomVisits || {};
      remoteData.soldMarks = remoteData.soldMarks || {};
      remoteData.activity = remoteData.activity || [];
      overlayMeta.dirtyRemarks.forEach((k) => { if (overlay.remarks[k]) remoteData.remarks[k] = overlay.remarks[k]; else delete remoteData.remarks[k]; });
      overlayMeta.dirtyShowroom.forEach((k) => { if (overlay.showroomVisits[k]) remoteData.showroomVisits[k] = overlay.showroomVisits[k]; else delete remoteData.showroomVisits[k]; });
      overlayMeta.dirtySold.forEach((k) => { if (overlay.soldMarks[k]) remoteData.soldMarks[k] = overlay.soldMarks[k]; else delete remoteData.soldMarks[k]; });
      const existingIso = new Set((remoteData.activity || []).map((a) => a.iso));
      remoteData.activity = [...overlayMeta.pendingActivity.filter((a) => !existingIso.has(a.iso)), ...(remoteData.activity || [])].slice(0, 50);
      overlay.remarks = remoteData.remarks;
      overlay.showroomVisits = remoteData.showroomVisits;
      overlay.soldMarks = remoteData.soldMarks;
      overlay.activity = remoteData.activity;
      overlayMeta.sha = remote.sha;
    }

    async function attemptSave(label) {
      const session = getSession();
      const who = session ? session.name : "Someone";
      const msg = `${label} \u2014 ${who} \u2014 ${new Date().toISOString()}`;
      const newSha = await GitHubService.putJson(OVERLAY_PATH, overlay, msg, overlayMeta.sha);
      overlayMeta.sha = newSha;
      overlayMeta.dirtyRemarks.clear();
      overlayMeta.dirtyShowroom.clear();
      overlayMeta.dirtySold.clear();
      overlayMeta.pendingActivity = [];
      setSaveStatus("ok", "Saved");
    }

    try {
      await fetchFreshAndMerge();
      await attemptSave("Update remarks/showroom/sold via dashboard");
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        // Still a conflict even with a freshly-fetched SHA (e.g. another
        // save landed in the split second in between) — one more retry.
        try {
          setSaveStatus("saving", "Retrying\u2026");
          await fetchFreshAndMerge();
          await attemptSave("Merge update via dashboard");
        } catch (e2) {
          console.error("Overlay save failed even after a fresh SHA retry:", e2);
          setSaveStatus("error", "Connection Error");
        }
      } else {
        console.error("Overlay save failed:", e);
        setSaveStatus("error", "Connection Error");
      }
    } finally {
      overlayMeta.saving = false;
    }
  }

  function hasUnsavedWork() {
    return overlayMeta.dirtyRemarks.size > 0 || overlayMeta.dirtyShowroom.size > 0 || overlayMeta.dirtySold.size > 0 || overlayMeta.saving;
  }

  window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedWork()) { e.preventDefault(); e.returnValue = ""; return ""; }
  });

  /* ======================================================================
     5. AUTH FLOW
     ====================================================================== */
  function showScreen(id) {
    ["githubSetupScreen", "loginScreen", "appShell"].forEach((s) => document.getElementById(s).classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
    setLoading(false);
  }

  function wireAuthScreens() {
    const connectBtn = document.getElementById("ghConnectBtn");
    const errEl = document.getElementById("ghSetupError");

    connectBtn.addEventListener("click", async () => {
      const shared = window.OVER6_SHARED_GITHUB_CONFIG || {};
      const owner = String(shared.owner || "").trim();
      const repo = String(shared.repo || "").trim();
      const branch = String(shared.branch || "main").trim();
      const name = document.getElementById("login-name").value.trim();
      const dept = document.getElementById("login-dept").value.trim();
      const roleEl = document.getElementById("login-role");
      const role = roleEl ? roleEl.value : "admin";
      const rawToken = document.getElementById("login-token").value.trim();
      // A real GitHub PAT only ever contains letters, digits, and underscores.
      // Copy-pasting (especially from Word, some chat apps, or PDFs) can
      // silently inject invisible or "smart" characters — zero-width
      // spaces, curly quotes, non-breaking spaces — that are outside the
      // range HTTP headers can carry. Left in, those cause a cryptic
      // browser-level "non ISO-8859-1 code point" error. Strip them here
      // so a stray character doesn't block sign-in.
      const token = rawToken.replace(/[^\x21-\x7E]/g, "");

      errEl.classList.add("hidden");

      if (!name) {
        document.getElementById("login-name").focus();
        errEl.textContent = "Please enter your name.";
        errEl.classList.remove("hidden");
        return;
      }
      if (!token) {
        document.getElementById("login-token").focus();
        errEl.textContent = "Please enter your GitHub Personal Access Token.";
        errEl.classList.remove("hidden");
        return;
      }
      if (!owner || !repo) {
        errEl.textContent = "The dashboard repository configuration is missing.";
        errEl.classList.remove("hidden");
        return;
      }
      if (role === "admin" && window.OVER6_ADMIN_PASSWORD) {
        const enteredPassword = document.getElementById("login-admin-password").value;
        if (enteredPassword !== window.OVER6_ADMIN_PASSWORD) {
          document.getElementById("login-admin-password").focus();
          errEl.textContent = "Incorrect admin password.";
          errEl.classList.remove("hidden");
          return;
        }
      }

      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting…";

      try {
        await GitHubService.testConnection({ owner, repo, branch, token });
        GitHubService.setConfig({ owner, repo, branch, token });
        setSession({ name, dept, role, loggedInAt: new Date().toISOString() });
        document.getElementById("login-token").value = "";
        document.getElementById("login-admin-password").value = "";
        showScreen("appShell");
        await bootApp();
      } catch (e) {
        console.error(e);
        const friendly = /ISO-8859-1|code point/i.test(e.message || "")
          ? "Your token contains an invalid character (likely picked up from copy-pasting). Please clear the token field and paste it again directly from GitHub's token page."
          : (e.message || "Could not connect to GitHub. Check that the token is active and has Contents: Read and write access to this repository.");
        errEl.textContent = friendly;
        errEl.classList.remove("hidden");
      } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = "Sign In & Continue";
      }
    });

    const fallback = document.getElementById("loginBtn");
    if (fallback) {
      fallback.addEventListener("click", async () => {
        const name = document.getElementById("login-name-fallback").value.trim();
        const dept = document.getElementById("login-dept-fallback").value.trim();
        const roleEl2 = document.getElementById("login-role-fallback");
        const role = roleEl2 ? roleEl2.value : "admin";
        if (!name) return;
        if (role === "admin" && window.OVER6_ADMIN_PASSWORD) {
          const pwField = document.getElementById("login-admin-password-fallback");
          if (!pwField || pwField.value !== window.OVER6_ADMIN_PASSWORD) {
            if (pwField) pwField.focus();
            alert("Incorrect admin password.");
            return;
          }
          pwField.value = "";
        }
        setSession({ name, dept, role, loggedInAt: new Date().toISOString() });
        showScreen("appShell");
        await bootApp();
      });
    }

    // Show the Admin Password field only when "Full Access (Admin)" is
    // selected, and only if a password is actually configured — keeps the
    // Sales Team flow completely unchanged.
    function wireAdminPasswordVisibility(roleSelectId, fieldId) {
      const roleSelect = document.getElementById(roleSelectId);
      const field = document.getElementById(fieldId);
      if (!roleSelect || !field) return;
      const update = () => {
        const needsPassword = roleSelect.value === "admin" && !!window.OVER6_ADMIN_PASSWORD;
        field.classList.toggle("hidden", !needsPassword);
      };
      roleSelect.addEventListener("change", update);
      update();
    }
    wireAdminPasswordVisibility("login-role", "adminPasswordField");
    wireAdminPasswordVisibility("login-role-fallback", "adminPasswordFieldFallback");
  }

  function initAuthGate() {
    wireAuthScreens();

    const shared = window.OVER6_SHARED_GITHUB_CONFIG || {};
    const owner = String(shared.owner || "").trim();
    const repo = String(shared.repo || "").trim();
    const branch = String(shared.branch || "main").trim();

    // If this browser has already supplied a valid PAT, reuse it.
    // Repository credentials remain automatic from config.js.
    const existing = GitHubService.getConfig();
    const hasMatchingRepo = existing &&
      existing.owner === owner &&
      existing.repo === repo &&
      existing.branch === branch &&
      existing.token;

    if (hasMatchingRepo) {
      const session = getSession();
      if (session && session.name) {
        showScreen("appShell");
        bootApp();
        return;
      }
      // Token exists, but this is a new user/session. Ask for name/department
      // only. The combined screen accepts the token again if needed.
      document.getElementById("login-token").value = "";
      showScreen("githubSetupScreen");
      return;
    }

    // No local token yet. User enters PAT once.
    showScreen("githubSetupScreen");
  }

  /* ======================================================================
     6. DATA LOADING & NORMALISATION
     ====================================================================== */
  function buildHeaderMap(headers) {
    const map = {}; const used = new Set();
    Object.keys(HEADER_ALIASES).forEach((canonical) => {
      for (const alias of HEADER_ALIASES[canonical]) {
        if (map[canonical]) break;
        for (const header of headers) {
          if (used.has(header)) continue;
          if (normHeader(header) === alias) { map[canonical] = header; used.add(header); break; }
        }
      }
    });
    Object.keys(HEADER_ALIASES).forEach((canonical) => {
      if (map[canonical]) return;
      for (const header of headers) {
        if (used.has(header)) continue;
        const nh = normHeader(header);
        if (CODE_COLUMN_HINTS.some((h) => nh.includes(h))) continue;
        if (HEADER_ALIASES[canonical].some((a) => nh.includes(a))) { map[canonical] = header; used.add(header); break; }
      }
    });
    return map;
  }

  function extractAgingLabelFromHeader(header) {
    if (!header) return null;
    const m = String(header).match(/(\d{1,3})\s*%?\s*to\s*(\d{1,3})\s*%?/i);
    return m ? m[1] + "% - " + m[2] + "%" : null;
  }

  function normalizeSheetRows(sheetRows) {
    if (!sheetRows.length) return [];
    const headers = Object.keys(sheetRows[0]);
    const map = buildHeaderMap(headers);

    let agingConstant = null, agingIsConstant = false;
    if (map.agingStatus) {
      const sampleVals = sheetRows.slice(0, 50).map((r) => r[map.agingStatus]);
      const samplePartNos = sheetRows.slice(0, 50).map((r) => r[map.partNo]);
      const dup = sampleVals.length > 0 && sampleVals.every((v, i) => String(v) === String(samplePartNos[i]));
      if (dup) { agingIsConstant = true; agingConstant = extractAgingLabelFromHeader(map.agingStatus) || "Over 6 Months"; }
    } else { agingIsConstant = true; agingConstant = "Over 6 Months"; }

    const out = [];
    for (const r of sheetRows) {
      const partNo = map.partNo ? String(r[map.partNo] ?? "").trim() : "";
      if (!partNo) continue;
      const closingBalance = map.closingBalance ? Number(r[map.closingBalance]) || 0 : 0;
      const sellingPrice = map.sellingPrice && r[map.sellingPrice] !== undefined && r[map.sellingPrice] !== "" ? Number(r[map.sellingPrice]) : null;
      const value = closingBalance * (sellingPrice || 0);
      const store = map.store ? String(r[map.store] ?? "").trim() : "Unspecified";
      const ageInDays = map.ageInDays && r[map.ageInDays] !== undefined && r[map.ageInDays] !== "" ? Number(r[map.ageInDays]) : null;
      const row = {
        area: map.area ? String(r[map.area] ?? "").trim() : "Unspecified",
        district: map.district ? String(r[map.district] ?? "").trim() : "Unspecified",
        store: store,
        location: map.location ? String(r[map.location] ?? "").trim() : "",
        partNo, description: map.description ? String(r[map.description] ?? "").trim() : "",
        brand: map.brand ? String(r[map.brand] ?? "").trim() : "Unspecified",
        productFamily: map.productFamily ? String(r[map.productFamily] ?? "").trim() : "Unspecified",
        commodity: map.commodity ? String(r[map.commodity] ?? "").trim() : "Unspecified",
        manager: map.manager ? String(r[map.manager] ?? "").trim() : "",
        closingBalance, sellingPrice, value,
        stockStatus: map.stockStatus ? (String(r[map.stockStatus] ?? "").trim() || "NORMAL") : "NORMAL",
        agingStatus: agingIsConstant ? agingConstant : String(r[map.agingStatus] ?? "").trim(),
        ageInDays: isNaN(ageInDays) ? null : ageInDays,
        mrp: map.mrp && r[map.mrp] !== undefined && r[map.mrp] !== "" ? Number(r[map.mrp]) || 0 : 0,
        mop: map.mop && r[map.mop] !== undefined && r[map.mop] !== "" ? Number(r[map.mop]) || 0 : 0,
        currentDiscountPct: map.currentDiscountPct && r[map.currentDiscountPct] !== undefined && r[map.currentDiscountPct] !== "" ? Number(r[map.currentDiscountPct]) || 0 : 0,
        discountGuideline: (() => {
          const raw = map.discountGuideline ? r[map.discountGuideline] : "";
          if (raw === undefined || raw === null) return "";
          const s = String(raw).trim();
          return (s === "" || s === "0") ? "" : s;
        })()
      };
      const rk = remarkKey(row.partNo, row.store);
      const rem = overlay.remarks[rk];
      row.remark = rem ? rem.remark : "";
      row.commentedBy = rem ? rem.commentedBy : "";
      row.commentDate = rem ? rem.commentDate : "";
      row.commentTime = rem ? rem.commentTime : "";
      row.lastUpdated = rem ? rem.lastUpdated : "";
      const soldRec = overlay.soldMarks[rk];
      row.sold = soldRec ? !!soldRec.sold : false;
      row.soldComment = soldRec ? (soldRec.comment || "") : "";
      row.soldBy = soldRec ? (soldRec.updatedBy || "") : "";
      row.soldDate = soldRec ? (soldRec.updatedDate || "") : "";
      out.push(row);
    }
    return out;
  }

  function workbookToRows(workbook) {
    const sheetName = workbook.SheetNames[0];
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    return normalizeSheetRows(json);
  }

  async function loadInventoryFromGitHub(showSpinner) {
    if (showSpinner) setLoading(true, "Loading inventory data from GitHub\u2026");
    // Prefer a CSV master file if one exists (much smaller download, faster to
    // parse) — falls back to the .xlsx workbook if no CSV is present, so
    // nothing breaks for repos that keep using the original Excel file.
    const { sha, buffer, path } = await GitHubService.getBinaryFromCandidates([
      "Inventory.csv", "data/Inventory.csv",
      "Inventory.xlsx", "data/Inventory.xlsx"
    ]);
    state.inventorySha = sha;
    if (!buffer) {
      state.rawData = [];
      throw new Error('Could not find "Inventory.csv" or "Inventory.xlsx" in your repository (checked the repo root and the "data/" folder). ' +
        "Make sure one of these exists, is spelled exactly like that, and that the branch you connected to is correct.");
    }
    state.inventoryPath = path;
    const workbook = XLSX.read(buffer, { type: "array" });
    state.rawData = workbookToRows(workbook);
    state.lastLoadedAt = new Date();
  }

  function updateDataMeta() {
    const el = document.getElementById("dataMeta");
    const when = state.lastLoadedAt ? state.lastLoadedAt.toLocaleString("en-GB") : "";
    el.textContent = `Loaded ${when} \u00b7 ${state.rawData.length.toLocaleString()} rows`;
  }

  /* ======================================================================
     7. FILTERING & DRILLDOWN
     ====================================================================== */
  function resetFiltersAndView() {
    state.filters = { area: "", district: "", store: "", brand: "", productFamily: "", commodity: "", location: "", partNo: "", description: "" };
    state.tableSearch = "";
    const s = document.getElementById("tableSearch"); if (s) s.value = "";
    state.page = 1;
  }

  function applyFilters(rows, excludeField) {
    const f = state.filters;
    return rows.filter((r) => {
      if (excludeField !== "area" && f.area && r.area !== f.area) return false;
      if (excludeField !== "district" && f.district && r.district !== f.district) return false;
      if (excludeField !== "store" && f.store && r.store !== f.store) return false;
      if (excludeField !== "productFamily" && f.productFamily && r.productFamily !== f.productFamily) return false;
      if (excludeField !== "brand" && f.brand && r.brand !== f.brand) return false;
      if (excludeField !== "partNo" && f.partNo && r.partNo !== f.partNo) return false;
      if (excludeField !== "commodity" && f.commodity && r.commodity !== f.commodity) return false;
      if (excludeField !== "location" && f.location && r.location !== f.location) return false;
      if (f.description && !r.description.toLowerCase().includes(f.description.toLowerCase())) return false;
      return true;
    });
  }

  function applyTableSearch(rows) {
    if (!state.tableSearch) return rows;
    const q = state.tableSearch.toLowerCase();
    return rows.filter((r) => r.partNo.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) ||
      r.brand.toLowerCase().includes(q) || r.store.toLowerCase().includes(q) || r.area.toLowerCase().includes(q) ||
      r.district.toLowerCase().includes(q) || r.productFamily.toLowerCase().includes(q) ||
      (r.location || "").toLowerCase().includes(q) ||
      String(r.mrp || "").toLowerCase().includes(q) || String(r.mop || "").toLowerCase().includes(q) ||
      String((r.currentDiscountPct * 100).toFixed(1)).includes(q) ||
      (r.discountGuideline || "").toLowerCase().includes(q));
  }

  function getFilteredData() { return applyFilters(state.rawData, null); }

  function getDrillDepth() {
    let depth = 0;
    for (const level of DRILL_LEVELS) { if (state.filters[level.field]) depth++; else break; }
    return depth;
  }

  function drillInto(field, value) {
    state.filters[field] = value; state.page = 1;
    setTimeout(renderAll, 0);
  }

  function resetDrillToDepth(depth) {
    DRILL_LEVELS.forEach((level, i) => { if (i >= depth) state.filters[level.field] = ""; });
    state.page = 1;
    setTimeout(renderAll, 0);
  }

  /* ======================================================================
     8. KPI CARDS
     ====================================================================== */
  const KPI_DEFS = [
    { key: "value", label: "Total Inventory Value", icon: "\u{1F4B0}", color: "var(--red-600)", fmt: fmtMoneyShort },
    { key: "qty", label: "Total Units", icon: "\u{1F4E6}", color: "var(--navy-700)", fmt: fmtInt },
    { key: "skus", label: "Total SKUs", icon: "\u{1F3F7}\uFE0F", color: "var(--amber-500)", fmt: fmtInt },
    { key: "areas", label: "Total Areas", icon: "\u{1F30D}", color: "var(--green-600)", fmt: fmtInt },
    { key: "districts", label: "Total Districts", icon: "\u{1F5FA}\uFE0F", color: "var(--navy-800)", fmt: fmtInt },
    { key: "stores", label: "Total Shops", icon: "\u{1F3EA}", color: "var(--red-700)", fmt: fmtInt },
    { key: "brands", label: "Total Brands", icon: "\u{1F3F7}\uFE0F", color: "#8e44ad", fmt: fmtInt },
    { key: "families", label: "Product Families", icon: "\u{1F4E6}", color: "#0f9b8e", fmt: fmtInt },
    { key: "avgAge", label: "Average Inventory Age", icon: "\u{23F3}", color: "#c0392b", fmt: (v) => v },
    { key: "pending", label: "Pending Remarks", icon: "\u{1F6A9}", color: "#e7a232", fmt: fmtInt },
    { key: "completed", label: "Completed Actions", icon: "\u2705", color: "#1f9d55", fmt: fmtInt }
  ];

  function computeKpis(rows) {
    let value = 0, qty = 0, pending = 0, completed = 0, ageSum = 0, ageCount = 0;
    const skus = new Set(), areas = new Set(), districts = new Set(), stores = new Set(), brands = new Set(), families = new Set();
    const agingLabelCounts = {};
    for (const r of rows) {
      value += r.value; qty += r.closingBalance;
      skus.add(r.partNo); areas.add(r.area); districts.add(r.district); stores.add(r.store); brands.add(r.brand); families.add(r.productFamily);
      if (r.remark && r.remark.trim()) completed++; else pending++;
      if (r.ageInDays !== null && !isNaN(r.ageInDays)) { ageSum += r.ageInDays; ageCount++; }
      agingLabelCounts[r.agingStatus] = (agingLabelCounts[r.agingStatus] || 0) + 1;
    }
    let avgAge;
    if (ageCount > 0) avgAge = Math.round(ageSum / ageCount) + " days";
    else {
      const topLabel = Object.keys(agingLabelCounts).sort((a, b) => agingLabelCounts[b] - agingLabelCounts[a])[0];
      avgAge = topLabel || "-";
    }
    return { value, qty, skus: skus.size, areas: areas.size, districts: districts.size, stores: stores.size, brands: brands.size, families: families.size, avgAge, pending, completed };
  }

  function renderKpis(rows) {
    const kpis = computeKpis(rows);
    const grid = document.getElementById("kpiGrid");
    grid.innerHTML = KPI_DEFS.map((def) => `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:${def.color}">${def.icon}</div>
        <div class="kpi-value" title="${escapeHtml(def.fmt(kpis[def.key]))}">${escapeHtml(def.fmt(kpis[def.key]))}</div>
        <div class="kpi-label">${def.label}</div>
      </div>`).join("");
  }

  /* ======================================================================
     9. FILTER FIELDS (typeahead via <datalist>)
     ====================================================================== */
  const TEXT_FILTER_FIELDS = [
    { id: "f-area", field: "area", dl: "dl-area" },
    { id: "f-district", field: "district", dl: "dl-district" },
    { id: "f-store", field: "store", dl: "dl-store" },
    { id: "f-family", field: "productFamily", dl: "dl-family" },
    { id: "f-brand", field: "brand", dl: "dl-brand" },
    { id: "f-partno", field: "partNo", dl: "dl-partno" },
    { id: "f-commodity", field: "commodity", dl: "dl-commodity" },
    { id: "f-location", field: "location", dl: "dl-location" }
  ];

  function uniqueSorted(rows, field) {
    return Array.from(new Set(rows.map((r) => r[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }

  function refreshFilterOptions() {
    TEXT_FILTER_FIELDS.forEach((cfg) => {
      const scoped = applyFilters(state.rawData, cfg.field);
      const opts = uniqueSorted(scoped, cfg.field);
      const dl = document.getElementById(cfg.dl);
      dl.innerHTML = opts.map((o) => `<option value="${escapeHtml(o)}">`).join("");
    });
  }

  /* ======================================================================
     10. DRILL BREADCRUMB
     ====================================================================== */
  function renderDrillBar() {
    const crumbs = document.getElementById("drillCrumbs");
    const depth = getDrillDepth();
    let html = `<button class="crumb ${depth === 0 ? "crumb-active" : ""}" data-depth="0">All Inventory</button>`;
    DRILL_LEVELS.forEach((level, i) => {
      if (i < depth) {
        html += ` <span class="crumb-sep">&rsaquo;</span> <button class="crumb ${i === depth - 1 ? "crumb-active" : ""}" data-depth="${i + 1}">${escapeHtml(state.filters[level.field])}</button>`;
      }
    });
    crumbs.innerHTML = html;
    crumbs.querySelectorAll("button[data-depth]").forEach((btn) => {
      btn.addEventListener("click", () => resetDrillToDepth(Number(btn.dataset.depth)));
    });
    const hint = document.getElementById("drillHint");
    hint.textContent = depth >= DRILL_LEVELS.length ? "Deepest level \u2014 viewing Part Code analysis below" : "Click a bar to drill down \u2192";
  }

  /* ======================================================================
     11. CHARTS
     ====================================================================== */
  function destroyChart(id) { if (chartRegistry[id]) { chartRegistry[id].destroy(); delete chartRegistry[id]; } }

  function groupSum(rows, field, valueFn) {
    const map = {};
    rows.forEach((r) => { const k = r[field] || "Unspecified"; map[k] = (map[k] || 0) + valueFn(r); });
    return map;
  }

  function topN(map, n) {
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function gridColor() { return isDark() ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)"; }
  function tickColor() { return isDark() ? "#93a1b8" : "#4a5568"; }

  function renderBarChart(canvasId, labels, values, title, colorField, onClick) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");
    chartRegistry[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: title, data: values, backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]), borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + fmtMoney(c.parsed.x) } } },
        scales: { x: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: (v) => fmtMoneyShort(v) } }, y: { grid: { display: false }, ticks: { color: tickColor() } } },
        onClick: onClick ? (evt, els) => { if (els.length) onClick(labels[els[0].index]); } : undefined
      }
    });
  }

  function renderDonut(canvasId, labels, values, unitLabel) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");
    chartRegistry[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { color: tickColor(), boxWidth: 10, font: { size: 10.5 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtInt(c.parsed)} ${unitLabel || "units"}` } } }
      }
    });
  }

  function renderChartsSection(rows) {
    const depth = getDrillDepth();
    const partCodeMode = !!state.filters.partNo;
    const shopMode = !partCodeMode && depth === 3; // store chosen, family not yet

    const wideCard = document.getElementById("drillChartTitle").closest(".chart-card");
    const secondaryTitleEl = document.getElementById("secondaryTitle");
    const secondaryWrap = document.getElementById("secondaryWrap");
    const topValueCard = document.getElementById("topValueChart").closest(".chart-card");
    const ageingCard = document.getElementById("ageingChart").closest(".chart-card");

    if (partCodeMode) {
      // Card 1: Area distribution, Card 2 (secondary): District distribution, Card3(status donut): Shop distribution
      document.getElementById("drillChartTitle").textContent = `Area Distribution \u2014 ${state.filters.partNo}`;
      document.getElementById("drillChartSub").textContent = "By units";
      wideCard.classList.remove("chart-card-wide");
      const areaMap = groupSum(rows, "area", (r) => r.closingBalance);
      renderBarToDonutFallback("drillChart", areaMap);

      secondaryTitleEl.textContent = "District Distribution";
      secondaryWrap.innerHTML = '<canvas id="brandDonut"></canvas>';
      const distMap = groupSum(rows, "district", (r) => r.closingBalance);
      renderDonut("brandDonut", Object.keys(distMap), Object.values(distMap));

      document.querySelector('[id="statusDonut"]').closest(".chart-card").querySelector("h2").textContent = "Shop Distribution";
      const shopMap = groupSum(rows, "store", (r) => r.closingBalance);
      renderDonut("statusDonut", Object.keys(shopMap), Object.values(shopMap));

      topValueCard.style.display = "none";
      ageingCard.style.gridColumn = "1 / -1";
      const ageMap = groupSum(rows, "agingStatus", (r) => r.closingBalance);
      renderDonut("ageingChart", Object.keys(ageMap), Object.values(ageMap));
    } else {
      wideCard.classList.add("chart-card-wide");
      topValueCard.style.display = "";
      ageingCard.style.gridColumn = "";
      const nextLevel = DRILL_LEVELS[depth];
      document.getElementById("drillChartTitle").textContent = `Inventory Value by ${nextLevel ? nextLevel.label : "Part Code"}`;
      document.getElementById("drillChartSub").textContent = "Top 15 \u00b7 click a bar to drill down";
      const field = nextLevel ? nextLevel.field : "partNo";
      const valMap = groupSum(rows, field, (r) => r.value);
      const top = topN(valMap, 15);
      renderBarChart("drillChart", top.map((t) => t[0]), top.map((t) => t[1]), "Inventory Value",
        null, nextLevel ? (label) => drillInto(nextLevel.field, label) : null);

      document.querySelector('[id="statusDonut"]').closest(".chart-card").querySelector("h2").textContent = "Stock Status Breakdown";
      const statusMap = groupSum(rows, "stockStatus", (r) => r.closingBalance);
      renderDonut("statusDonut", Object.keys(statusMap), Object.values(statusMap));

      if (shopMode) {
        secondaryTitleEl.textContent = "Shop Summary";
        const totalUnits = rows.reduce((s, r) => s + r.closingBalance, 0);
        const totalValue = rows.reduce((s, r) => s + r.value, 0);
        secondaryWrap.innerHTML = `<div class="stat-tiles">
          <div class="stat-tile"><div class="stv">${fmtInt(totalUnits)}</div><div class="stl">Total Over 6M Units</div></div>
          <div class="stat-tile"><div class="stv">${fmtMoney(totalValue)}</div><div class="stl">Total Over 6M Value</div></div>
        </div>`;
      } else {
        secondaryTitleEl.textContent = "Unit Mix by Brand";
        secondaryWrap.innerHTML = '<canvas id="brandDonut"></canvas>';
        const brandMap = groupSum(rows, "brand", (r) => r.closingBalance);
        const topBrands = topN(brandMap, 8);
        renderDonut("brandDonut", topBrands.map((t) => t[0]), topBrands.map((t) => t[1]));
      }

      const topValRows = [...rows].sort((a, b) => b.value - a.value).slice(0, 20);
      renderBarChart("topValueChart", topValRows.map((r) => r.partNo), topValRows.map((r) => r.value), "Inventory Value");
      const ageMap = groupSum(rows, "agingStatus", (r) => r.value);
      renderDonut("ageingChart", Object.keys(ageMap), Object.values(ageMap), "value");
    }
  }

  // drillChart canvas is a <canvas id="drillChart"> which normally hosts a bar
  // chart; in Part Code mode we still want a chart there, so render a donut
  // into the same canvas id.
  function renderBarToDonutFallback(canvasId, map) {
    renderDonut(canvasId, Object.keys(map), Object.values(map));
  }

  function renderScopeStrip(rows) {
    const strip = document.getElementById("scopeStrip");
    const f = state.filters;
    const chips = [];
    DRILL_LEVELS.forEach((l) => { if (f[l.field]) chips.push(`<span class="scope-chip">${l.label}: <b>${escapeHtml(f[l.field])}</b></span>`); });
    if (f.commodity) chips.push(`<span class="scope-chip">Commodity: <b>${escapeHtml(f.commodity)}</b></span>`);
    if (f.location) chips.push(`<span class="scope-chip">Location: <b>${escapeHtml(f.location)}</b></span>`);
    if (f.description) chips.push(`<span class="scope-chip">Description contains: <b>${escapeHtml(f.description)}</b></span>`);
    chips.push(`<span class="scope-chip">Rows in scope: <b>${fmtInt(rows.length)}</b></span>`);
    strip.innerHTML = chips.join("");
  }

  /* ======================================================================
     12. TABLE
     ====================================================================== */
  function visibleColumns() {
    const sales = isSalesRole();
    return TABLE_COLUMNS.filter((c) => !state.hiddenCols[c.key] && !(sales && c.adminOnly) && !(!sales && c.salesOnly));
  }

  function renderTableHead() {
    const row = document.getElementById("tableHeadRow");
    row.innerHTML = visibleColumns().map((col) => {
      const isSorted = state.sort.field === col.key;
      const arrow = isSorted ? (state.sort.dir === "asc" ? "\u25B2" : "\u25BC") : "";
      return `<th data-key="${col.key}" style="width:${col.width}px" class="${col.numeric ? "num" : ""} ${col.sticky ? "sticky-col" : ""}">
        ${col.label}<span class="sort-arrow">${arrow}</span><span class="th-resizer" data-key="${col.key}"></span></th>`;
    }).join("");

    row.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", (e) => {
        if (e.target.classList.contains("th-resizer")) return;
        const key = th.dataset.key;
        if (state.sort.field === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        else { state.sort.field = key; state.sort.dir = "asc"; }
        renderTable(getFilteredData());
      });
    });
    row.querySelectorAll(".th-resizer").forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        const key = handle.dataset.key;
        const col = TABLE_COLUMNS.find((c) => c.key === key);
        const startX = e.clientX, startW = col.width;
        function onMove(ev) { col.width = Math.max(60, startW + (ev.clientX - startX)); renderTableHead(); }
        function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
      });
    });
  }

  function statusPillClass(status) {
    const s = (status || "").toUpperCase();
    if (s.includes("NORMAL")) return "status-normal";
    if (s.includes("CLEAR")) return "status-clearance";
    if (s.includes("DEFECT") || s.includes("DAMAGE")) return "status-defective";
    return "status-other";
  }

  function sortRows(rows) {
    const { field, dir } = state.sort;
    const col = TABLE_COLUMNS.find((c) => c.key === field);
    const mult = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[field], bv = b[field];
      if (col && col.numeric) { av = Number(av) || 0; bv = Number(bv) || 0; return (av - bv) * mult; }
      return String(av || "").localeCompare(String(bv || "")) * mult;
    });
  }

  function renderTableBody(pageRows) {
    const tbody = document.getElementById("tableBody");
    const cols = visibleColumns();
    if (!pageRows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols.length}">No rows match the current filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = pageRows.map((r) => {
      return "<tr>" + cols.map((col) => {
        const stickyClass = col.sticky ? "sticky-col" : "";
        if (col.isRemark) {
          return `<td class="remark-cell ${stickyClass}"><input type="text" value="${escapeHtml(r.remark)}" data-partno="${escapeHtml(r.partNo)}" data-store="${escapeHtml(r.store)}" placeholder="Add remark\u2026"></td>`;
        }
        if (col.isMeta) return `<td class="meta-cell ${stickyClass}">${escapeHtml(r[col.key])}</td>`;
        if (col.key === "value") return `<td class="num ${stickyClass}">${fmtMoney(r.value)}</td>`;
        if (col.key === "closingBalance") return `<td class="num ${stickyClass}">${fmtInt(r.closingBalance)}</td>`;
        if (col.key === "mrp") return `<td class="num ${stickyClass}">${fmtMoney(r.mrp)}</td>`;
        if (col.key === "mop") return `<td class="num ${stickyClass}">${fmtMoney(r.mop)}</td>`;
        if (col.key === "currentDiscountPct") return `<td class="num ${stickyClass}">${(r.currentDiscountPct * 100).toFixed(1)}%</td>`;
        if (col.key === "discountGuideline") return `<td class="${stickyClass}" title="${escapeHtml(r.discountGuideline)}">${escapeHtml(r.discountGuideline)}</td>`;
        if (col.isSold) {
          return `<td class="${stickyClass}" style="text-align:center;"><input type="checkbox" class="sold-checkbox" ${r.sold ? "checked" : ""} data-sold-partno="${escapeHtml(r.partNo)}" data-sold-store="${escapeHtml(r.store)}"></td>`;
        }
        if (col.isSoldComment) {
          return `<td class="remark-cell ${stickyClass}"><input type="text" value="${escapeHtml(r.soldComment)}" class="sold-comment-input" data-sold-partno="${escapeHtml(r.partNo)}" data-sold-store="${escapeHtml(r.store)}" placeholder="Optional comment\u2026"></td>`;
        }
        return `<td class="${stickyClass}" title="${escapeHtml(r[col.key])}">${escapeHtml(r[col.key])}</td>`;
      }).join("") + "</tr>";
    }).join("");

    tbody.querySelectorAll('input[data-partno]').forEach((input) => {
      input.addEventListener("change", (e) => handleRemarkEdit(e.target));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
    });

    tbody.querySelectorAll('input.sold-checkbox').forEach((cb) => {
      cb.addEventListener("change", (e) => handleSoldEdit(e.target, "checkbox", { log: true }));
    });
    tbody.querySelectorAll('input.sold-comment-input').forEach((input) => {
      const debouncedSilentSave = debounce(() => handleSoldEdit(input, "comment", { log: false }), 700);
      input.addEventListener("input", debouncedSilentSave);
      input.addEventListener("change", (e) => handleSoldEdit(e.target, "comment", { log: true }));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
    });
  }

  function handleSoldEdit(el, kind, opts) {
    const shouldLog = !opts || opts.log !== false;
    const partNo = el.dataset.soldPartno, store = el.dataset.soldStore;
    const key = remarkKey(partNo, store);
    const row = state.rawData.find((r) => r.partNo === partNo && r.store === store);
    if (!row) return;
    const session = getSession();
    const who = session ? session.name : "Unknown";
    const np = nowParts();
    if (kind === "checkbox") row.sold = el.checked;
    else row.soldComment = el.value.trim();
    row.soldBy = who; row.soldDate = np.date;
    overlay.soldMarks[key] = { sold: row.sold, comment: row.soldComment, updatedBy: who, updatedDate: np.date };
    markSoldDirty(key);
    if (shouldLog) {
      const desc = kind === "checkbox"
        ? `marked ${partNo} at ${store} as ${row.sold ? "Sold" : "Not Sold"}`
        : `updated sold comment for ${partNo} at ${store}${row.soldComment ? ": \u201C" + row.soldComment + "\u201D" : " (cleared)"}`;
      logActivity(who, desc);
    }
    renderKpis(getFilteredData());
  }

  function handleRemarkEdit(input) {
    const partNo = input.dataset.partno, store = input.dataset.store;
    const text = input.value.trim();
    const key = remarkKey(partNo, store);
    const session = getSession();
    const who = session ? session.name : "Unknown";
    const np = nowParts();
    if (text) {
      overlay.remarks[key] = { remark: text, commentedBy: who, commentDate: np.date, commentTime: np.time, lastUpdated: np.iso };
    } else {
      delete overlay.remarks[key];
    }
    const row = state.rawData.find((r) => r.partNo === partNo && r.store === store);
    if (row) { row.remark = text; row.commentedBy = who; row.commentDate = np.date; row.commentTime = np.time; row.lastUpdated = np.iso; }
    markRemarkDirty(key);
    logActivity(who, `updated remark for ${partNo} at ${store}${text ? ": \u201C" + text + "\u201D" : " (cleared)"}`);
    renderKpis(getFilteredData());
  }

  function renderPager(totalRows) {
    const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
    const p = Math.min(state.page, totalPages);
    state.page = p;
    const start = totalRows === 0 ? 0 : (p - 1) * state.pageSize + 1;
    const end = Math.min(totalRows, p * state.pageSize);
    document.getElementById("tableRangeLabel").textContent = `Showing ${fmtInt(start)}\u2013${fmtInt(end)} of ${fmtInt(totalRows)}`;

    const pager = document.getElementById("pager");
    const pages = [];
    const windowSize = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= p - windowSize && i <= p + windowSize)) pages.push(i);
      else if (pages[pages.length - 1] !== "...") pages.push("...");
    }
    let html = `<button id="pagerPrev" ${p === 1 ? "disabled" : ""}>&laquo; Prev</button>`;
    pages.forEach((pg) => { html += pg === "..." ? `<button disabled>&hellip;</button>` : `<button data-page="${pg}" class="${pg === p ? "active" : ""}">${pg}</button>`; });
    html += `<button id="pagerNext" ${p === totalPages ? "disabled" : ""}>Next &raquo;</button>`;
    pager.innerHTML = html;
    pager.querySelectorAll("button[data-page]").forEach((btn) => btn.addEventListener("click", () => { state.page = Number(btn.dataset.page); renderTable(getFilteredData()); }));
    const prevBtn = document.getElementById("pagerPrev"), nextBtn = document.getElementById("pagerNext");
    if (prevBtn) prevBtn.addEventListener("click", () => { if (state.page > 1) { state.page--; renderTable(getFilteredData()); } });
    if (nextBtn) nextBtn.addEventListener("click", () => { if (state.page < totalPages) { state.page++; renderTable(getFilteredData()); } });
  }

  function renderTable(allFilteredRows) {
    const searched = applyTableSearch(allFilteredRows);
    const sorted = sortRows(searched);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = sorted.slice(start, start + state.pageSize);
    renderTableHead();
    renderTableBody(pageRows);
    renderPager(sorted.length);
  }

  function renderColsMenu() {
    const menu = document.getElementById("colsMenu");
    const sales = isSalesRole();
    menu.innerHTML = TABLE_COLUMNS.filter((c) => !(sales && c.adminOnly) && !(!sales && c.salesOnly)).map((c) => `<label><input type="checkbox" data-key="${c.key}" ${state.hiddenCols[c.key] ? "" : "checked"}> ${c.label}</label>`).join("");
    menu.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => { state.hiddenCols[cb.dataset.key] = !cb.checked; renderTable(getFilteredData()); });
    });
  }

  /* ======================================================================
     13. EXPORT
     ====================================================================== */
  function currentExportRows() { return sortRows(applyTableSearch(getFilteredData())); }

  function rowsToAOA(rows) {
    const header = ["Area", "District", "Shop", "Location", "Part Code", "Description", "Brand", "Product Family",
      "Quantity", "Selling Price", "Inventory Value", "Stock Status", "MRP", "MOP", "Current Discount %", "Comments / Discount Guideline",
      "Remark", "Commented By", "Comment Date", "Comment Time", "Last Updated"];
    const body = rows.map((r) => [r.area, r.district, r.store, r.location, r.partNo, r.description, r.brand, r.productFamily,
      r.closingBalance, r.sellingPrice, r.value, r.stockStatus, r.mrp, r.mop, (r.currentDiscountPct * 100).toFixed(1) + "%", r.discountGuideline,
      r.remark, r.commentedBy, r.commentDate, r.commentTime, r.lastUpdated]);
    return [header, ...body];
  }

  function downloadExcel() {
    const rows = currentExportRows();
    if (!rows.length) { alert("There is no data in the current view to export."); return; }
    const aoa = rowsToAOA(rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aoa[0].map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Over 6M Inventory");
    XLSX.writeFile(wb, `Singer_Over6Month_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadCsv() {
    const rows = currentExportRows();
    if (!rows.length) { alert("There is no data in the current view to export."); return; }
    const aoa = rowsToAOA(rows);
    const csv = aoa.map((line) => line.map((cell) => {
      const s = cell === null || cell === undefined ? "" : String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Singer_Over6Month_Inventory_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  /* ======================================================================
     14. UPLOAD NEW INVENTORY + BACKUP
     ====================================================================== */
  async function handleUpload(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      setLoading(true, "Reading new workbook\u2026");
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const newRows = workbookToRows(workbook);
        if (!newRows.length) throw new Error("No usable rows found in the uploaded file.");

        // Target path is based on the UPLOADED file's own extension, kept in
        // the same folder as whatever was previously loaded (root or data/).
        // This avoids writing e.g. binary .xlsx bytes into a path GitHub/the
        // app expects to be plain-text .csv (or vice versa) if you ever
        // switch formats.
        const uploadExt = /\.csv$/i.test(file.name) ? "csv" : "xlsx";
        const prevPath = state.inventoryPath || "Inventory.xlsx";
        const folder = prevPath.includes("/") ? prevPath.slice(0, prevPath.lastIndexOf("/") + 1) : "";
        const invPath = `${folder}Inventory.${uploadExt}`;

        setLoading(true, `Backing up current ${prevPath.split("/").pop()} on GitHub\u2026`);
        // Fetch the current file's raw base64 to copy it verbatim as a backup
        // (avoids re-encoding drift versus reading it through SheetJS).
        const rawCurrent = await GitHubService.getFileRaw(prevPath);
        if (rawCurrent.contentB64) {
          const stamp = new Date().toISOString().slice(0, 10) + "_" + Date.now();
          const prevExt = prevPath.split(".").pop();
          const bk = await GitHubService.getFileRaw(`Backup/Inventory_Backup_${stamp}.${prevExt}`);
          await GitHubService.putFile(`Backup/Inventory_Backup_${stamp}.${prevExt}`, rawCurrent.contentB64, `Backup before inventory upload \u2014 ${new Date().toISOString()}`, bk.sha);
        }

        setLoading(true, `Committing new ${invPath} to GitHub\u2026`);
        const buf = e.target.result;
        // If the target path differs from where the old file lived (a format
        // switch, e.g. .xlsx -> .csv), there's no existing SHA to supply for
        // THAT path — fetch it fresh so a stale/previous file at the new
        // path (if any) doesn't cause a conflict.
        const targetRaw = invPath === prevPath ? rawCurrent : await GitHubService.getFileRaw(invPath);
        const newSha = await GitHubService.putBinary(invPath, buf, `Upload new inventory export \u2014 ${new Date().toISOString()}`, targetRaw.sha);
        state.inventorySha = newSha;
        state.inventoryPath = invPath;
        state.rawData = newRows;
        state.lastLoadedAt = new Date();
        resetFiltersAndView();
        renderAll();
        updateDataMeta();

        const session = getSession();
        logActivity(session ? session.name : "Someone", `uploaded a new inventory workbook (${newRows.length.toLocaleString()} rows)`);
        scheduleOverlaySave();
      } catch (err) {
        console.error(err);
        alert("Could not upload the new inventory.\n\n" + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => alert("Could not read the selected file.");
    reader.readAsArrayBuffer(file);
  }

  /* ======================================================================
     15. ACTIVITY LOG
     ====================================================================== */
  function renderActivityLog() {
    const list = document.getElementById("activityList");
    if (!list) return;
    if (!overlay.activity.length) { list.innerHTML = `<div class="activity-empty">No activity yet.</div>`; return; }
    list.innerHTML = overlay.activity.slice(0, 20).map((a) => {
      const when = a.date && a.time ? `${a.date} ${a.time}` : (a.iso ? new Date(a.iso).toLocaleString("en-GB") : "");
      return `<li><span class="act-text"><b>${escapeHtml(a.user)}</b> ${escapeHtml(a.action)}</span><span class="act-time">${escapeHtml(when)}</span></li>`;
    }).join("");
  }

  /* ======================================================================
     MASTER RENDER (dashboard page)
     ====================================================================== */
  function renderAll() {
    const filtered = getFilteredData();
    renderKpis(filtered);
    refreshFilterOptions();
    renderDrillBar();
    renderChartsSection(filtered);
    renderScopeStrip(filtered);
    renderTable(filtered);
  }

  /* ======================================================================
     16. THEME + NAV + INIT
     ====================================================================== */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("over6_theme", theme);
    document.getElementById("themeToggleLabel").textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }

  function wireNav() {
    document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item[data-page]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        ["dashboard", "showroom", "activity"].forEach((p) => document.getElementById("page-" + p).classList.add("hidden"));
        document.getElementById("page-" + btn.dataset.page).classList.remove("hidden");
        document.getElementById("pageTitle").textContent = btn.textContent.trim();
        document.getElementById("uploadLabel").style.display = btn.dataset.page === "dashboard" ? "" : "none";
        if (btn.dataset.page === "activity") renderActivityLog();
        if (btn.dataset.page === "showroom" && window.Showroom) window.Showroom.renderAll();
        document.getElementById("sideNav").classList.remove("open");
        document.getElementById("navBackdrop") && document.getElementById("navBackdrop").classList.remove("open");
      });
    });

    // Sidebar visibility: below 640px it's an off-canvas drawer (existing
    // .open/backdrop pattern); at 640px and up it's a persistent panel that
    // can now be collapsed to free up screen width (handy on tablets, where
    // 230px matters more than on a wide desktop). Same button drives both,
    // the mode is picked based on current viewport width at click time.
    const MOBILE_BREAKPOINT = 640;
    function isMobileWidth() { return window.innerWidth <= MOBILE_BREAKPOINT; }

    function setDesktopCollapsed(collapsed) {
      document.getElementById("appShell").classList.toggle("nav-collapsed", collapsed);
      try { localStorage.setItem("over6_nav_collapsed", collapsed ? "1" : "0"); } catch (e) {}
    }
    function toggleNav() {
      if (isMobileWidth()) {
        document.getElementById("sideNav").classList.toggle("open");
      } else {
        const collapsed = document.getElementById("appShell").classList.contains("nav-collapsed");
        setDesktopCollapsed(!collapsed);
      }
    }
    // Restore the user's last collapse preference (tablet/desktop only \u2014
    // mobile always starts closed, that's the existing/expected behaviour).
    try {
      if (!isMobileWidth() && localStorage.getItem("over6_nav_collapsed") === "1") setDesktopCollapsed(true);
    } catch (e) {}

    document.getElementById("navHamburger").addEventListener("click", toggleNav);
    document.getElementById("navRevealTab").addEventListener("click", () => setDesktopCollapsed(false));

    // Swipe gesture: swipe left anywhere on the sidebar to collapse it;
    // swipe right starting near the screen's left edge to bring it back.
    // Tablet/desktop widths only \u2014 mobile keeps its existing tap-hamburger
    // and tap-backdrop-to-close behaviour, which already works well with touch.
    let touchStartX = null, touchStartY = null;
    function onTouchStart(e) {
      if (isMobileWidth()) { touchStartX = null; return; }
      const t = e.touches[0];
      touchStartX = t.clientX; touchStartY = t.clientY;
    }
    function onTouchEnd(e) {
      if (touchStartX === null || isMobileWidth()) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) setDesktopCollapsed(true);
        else if (touchStartX < 40) setDesktopCollapsed(false);
      }
      touchStartX = null;
    }
    document.getElementById("sideNav").addEventListener("touchstart", onTouchStart, { passive: true });
    document.getElementById("sideNav").addEventListener("touchend", onTouchEnd, { passive: true });
    document.body.addEventListener("touchstart", onTouchStart, { passive: true });
    document.body.addEventListener("touchend", onTouchEnd, { passive: true });

    document.getElementById("themeToggleBtn").addEventListener("click", () => applyTheme(isDark() ? "light" : "dark"));
    document.getElementById("refreshBtn").addEventListener("click", async () => {
      setLoading(true, "Refreshing from GitHub\u2026");
      try {
        await loadOverlay();
        await loadInventoryFromGitHub(false);
        resetFiltersAndView();
        renderAll(); updateDataMeta(); renderActivityLog();
        renderOverlayLoadWarningIfNeeded();
        if (window.Showroom && !isSalesRole()) await window.Showroom.loadAndRender();
      } catch (e) { alert("Refresh failed: " + e.message); }
      finally { setLoading(false); }
    });
  }

  function wireStaticControls() {
    TEXT_FILTER_FIELDS.forEach((cfg) => {
      document.getElementById(cfg.id).addEventListener("input", debounce((e) => { state.filters[cfg.field] = e.target.value; state.page = 1; renderAll(); }, 250));
    });
    document.getElementById("f-desc").addEventListener("input", debounce((e) => { state.filters.description = e.target.value; state.page = 1; renderAll(); }, 250));
    document.getElementById("clearFiltersBtn").addEventListener("click", () => { resetFiltersAndView(); renderAll(); });
    document.getElementById("tableSearch").addEventListener("input", debounce((e) => { state.tableSearch = e.target.value; state.page = 1; renderTable(getFilteredData()); }, 200));
    document.getElementById("pageSizeSelect").addEventListener("change", (e) => { state.pageSize = Number(e.target.value); state.page = 1; renderTable(getFilteredData()); });
    document.getElementById("uploadInput").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) handleUpload(f); e.target.value = ""; });
    document.getElementById("exportXlsxBtn").addEventListener("click", downloadExcel);
    document.getElementById("exportCsvBtn").addEventListener("click", downloadCsv);
    document.getElementById("printBtn").addEventListener("click", () => window.print());
    document.getElementById("colsBtn").addEventListener("click", () => { renderColsMenu(); document.getElementById("colsMenu").classList.toggle("hidden"); });
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("colsMenu"), btn = document.getElementById("colsBtn");
      if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== btn) menu.classList.add("hidden");
    });
  }

  async function bootApp() {
    const session = getSession();
    document.getElementById("sessionChip").textContent = session ? `${session.name}${session.dept ? " \u00b7 " + session.dept : ""}` : "";
    const savedTheme = localStorage.getItem("over6_theme") || "light";
    applyTheme(savedTheme);

    // Sales role: no Showroom Tracker access at all.
    const showroomNavBtn = document.querySelector('.nav-item[data-page="showroom"]');
    if (showroomNavBtn) showroomNavBtn.style.display = isSalesRole() ? "none" : "";

    setLoading(true, "Loading data from GitHub\u2026");
    try {
      await loadOverlay();
      await loadInventoryFromGitHub(true);
      resetFiltersAndView();
      renderAll();
      updateDataMeta();
      renderActivityLog();
      renderOverlayLoadWarningIfNeeded();
      if (window.Showroom && !isSalesRole()) await window.Showroom.init();
    } catch (e) {
      console.error(e);
      const isNetworkFailure = /Failed to fetch|NetworkError|network/i.test(e.message || "") || e.name === "TypeError";
      const msg = isNetworkFailure
        ? "Could not load data from GitHub \u2014 the connection was interrupted while downloading Inventory.xlsx (a multi-MB file).\n\n" +
          "This is usually a network issue, not a problem with your account or the data itself. Try:\n" +
          "\u2022 Reloading the page (it already retried automatically a few times)\n" +
          "\u2022 A different network or an Incognito/Private window\n" +
          "\u2022 Waiting a minute and trying again\n\n" +
          "Your data on GitHub is safe either way \u2014 this only affects loading it into the browser."
        : "Could not load data from GitHub.\n\n" + e.message;
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireAuthScreens();
    wireNav();
    wireStaticControls();
    initAuthGate();

    // Register the service worker so the dashboard is installable as an app
    // (Chrome "Install App" / Android home screen / APK-wrapping via
    // PWABuilder). Purely additive — never touches GitHub API calls.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });

  return {
    state, overlay, overlayMeta, getSession, setSession,
    getFilteredData, renderAll, fmtInt, fmtMoney, fmtMoneyShort, escapeHtml, debounce,
    remarkKey, nowParts, setLoading, markShowroomDirty, scheduleOverlaySave, logActivity,
    renderActivityLog, destroyChart, renderDonut, renderBarChart, tickColor, gridColor,
    CHART_COLORS
  };
})();
