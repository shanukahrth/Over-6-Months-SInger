/* =========================================================================
   Option 1 data service
   -------------------------------------------------------------------------
   The browser NEVER receives the GitHub token.
   All GitHub traffic goes through the Cloudflare Worker API.
   Users only identify themselves with their name/department.
   ========================================================================= */
const GitHubService = (function () {
  "use strict";

  const API_BASE = String((window.APP_CONFIG && window.APP_CONFIG.API_BASE) || "").replace(/\/$/, "");
  const USER_KEY = "over6_session_v1";

  function getSessionHeaders() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); } catch (_) {}
    const h = { "Accept": "application/json" };
    if (s && s.name) {
      h["X-User-Name"] = s.name;
      if (s.dept) h["X-User-Department"] = s.dept;
    }
    return h;
  }

  function ensureApi() {
    if (!API_BASE || API_BASE.includes("REPLACE-WITH-YOUR-WORKER")) {
      throw new Error("Dashboard API is not configured. Set API_BASE in js/config.js to your Cloudflare Worker URL.");
    }
  }

  async function request(path, options) {
    ensureApi();
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, getSessionHeaders(), opts.headers || {});
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) {
      const type = res.headers.get("content-type") || "";
      let message = `API request failed (HTTP ${res.status})`;
      try {
        if (type.includes("application/json")) {
          const j = await res.json();
          message = j.error || j.message || message;
        } else {
          const t = await res.text();
          if (t) message = t;
        }
      } catch (_) {}
      const e = new Error(message);
      e.status = res.status;
      throw e;
    }
    return res;
  }

  async function testConnection() {
    const res = await request("/api/health", { method: "GET" });
    return res.json();
  }

  async function getFileInfo(path) {
    const res = await request(`/api/file-info?path=${encodeURIComponent(path)}`, { method: "GET" });
    return res.json();
  }

  async function getBinary(path) {
    const res = await request(`/api/file?path=${encodeURIComponent(path)}`, { method: "GET" });
    const buffer = await res.arrayBuffer();
    return { sha: res.headers.get("X-GitHub-Sha") || null, buffer };
  }

  async function getBinaryFromCandidates(paths) {
    for (const path of paths) {
      try {
        const result = await getBinary(path);
        if (result.buffer && result.buffer.byteLength > 0) return Object.assign({ path }, result);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    return { sha: null, buffer: null, path: null };
  }

  async function getJson(path) {
    const res = await request(`/api/file?path=${encodeURIComponent(path)}`, { method: "GET" });
    const data = await res.json();
    return { sha: res.headers.get("X-GitHub-Sha") || null, data };
  }

  function arrayBufferToB64(buf) {
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function putJson(path, dataObj, message, sha) {
    const res = await request("/api/overlay", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, contentB64: arrayBufferToB64(new TextEncoder().encode(JSON.stringify(dataObj, null, 2))), message, sha })
    });
    return (await res.json()).sha;
  }

  async function verifyAdmin(adminKey) {
    if (!adminKey) throw new Error("Administrator key is required.");
    const res = await request("/api/admin/check", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey }
    });
    return res.json();
  }

  async function adminUploadBinary(path, arrayBuffer, message, adminKey) {
    if (!adminKey) throw new Error("Administrator key is required for inventory upload.");
    const res = await request("/api/admin/inventory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey
      },
      body: JSON.stringify({ path, contentB64: arrayBufferToB64(arrayBuffer), message })
    });
    return res.json();
  }

  function isConfigured() { return !!API_BASE && !API_BASE.includes("REPLACE-WITH-YOUR-WORKER"); }
  function getConfig() { return { apiBase: API_BASE }; }
  function setConfig() {}
  function clearConfig() {}

  return { isConfigured, getConfig, setConfig, clearConfig, testConnection, getFileInfo, getBinary, getBinaryFromCandidates, getJson, putJson, verifyAdmin, adminUploadBinary };
})();
