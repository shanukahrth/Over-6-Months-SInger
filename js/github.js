/* =========================================================================
   GitHub REST API service
   -------------------------------------------------------------------------
   Thin wrapper around the GitHub "Contents" API so the rest of the app can
   read/write files in the repo without knowing about base64, SHAs, etc.

   Config (owner, repo, branch, token) is stored in localStorage on THIS
   device only. It is never sent anywhere except https://api.github.com.
   ========================================================================= */

const GitHubService = (function () {
  "use strict";

  const CFG_KEY = "over6_github_cfg_v1";
  const API = "https://api.github.com";

  function getConfig() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function clearConfig() {
    localStorage.removeItem(CFG_KEY);
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c && c.owner && c.repo && c.branch && c.token);
  }

  function headers(cfg) {
    return {
      "Authorization": "token " + cfg.token,
      "Accept": "application/vnd.github+json"
    };
  }

  // ---- base64 helpers (unicode + binary safe) ----------------------------

  function b64EncodeUnicodeString(str) {
    // For JSON/text files
    return btoa(unescape(encodeURIComponent(str)));
  }

  function b64DecodeToUnicodeString(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
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

  function b64ToArrayBuffer(b64) {
    const binary = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // ---- core calls ---------------------------------------------------------

  async function testConnection(cfg) {
    const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, { headers: headers(cfg) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub connection failed (HTTP ${res.status}). ${body}`.trim());
    }
    return res.json();
  }

  // Returns { sha, contentB64 } or { sha:null, contentB64:null } if file doesn't exist
  async function getFileRaw(path) {
    const cfg = getConfig();
    if (!cfg) throw new Error("GitHub is not configured yet.");
    const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`;
    const res = await fetch(url, { headers: headers(cfg) });
    if (res.status === 404) return { sha: null, contentB64: null };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub read failed for ${path} (HTTP ${res.status}). ${body}`.trim());
    }
    const json = await res.json();
    
if (json.content) {
  return { sha: json.sha, contentB64: json.content };
}
if (json.download_url) {
  const rawRes = await fetch(json.download_url, { headers: headers(cfg) });
  if (!rawRes.ok) throw new Error(`GitHub raw download failed for ${path}`);
  const buf = await rawRes.arrayBuffer();
  return { sha: json.sha, contentB64: arrayBufferToB64(buf) };
}
return { sha: json.sha, contentB64: null };

  }

  async function getJson(path) {
    const { sha, contentB64 } = await getFileRaw(path);
    if (!contentB64) return { sha: null, data: null };
    const text = b64DecodeToUnicodeString(contentB64);
    return { sha, data: JSON.parse(text) };
  }

  async function getBinary(path) {
    const { sha, contentB64 } = await getFileRaw(path);
    if (!contentB64) return { sha: null, buffer: null };
    return { sha, buffer: b64ToArrayBuffer(contentB64) };
  }

  // Tries each path in order and returns the first one that actually exists.
  // Useful for tolerating "file lives at repo root" vs "file lives under data/"
  // without forcing every user to reorganise their repo.
  async function getBinaryFromCandidates(paths) {
    for (const path of paths) {
      const result = await getBinary(path);
      if (result.buffer) return Object.assign({ path }, result);
    }
    return { sha: null, buffer: null, path: null };
  }

  async function putFile(path, contentB64, message, sha) {
    const cfg = getConfig();
    if (!cfg) throw new Error("GitHub is not configured yet.");
    const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
    const body = {
      message,
      content: contentB64,
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers(cfg)),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody.message || `GitHub write failed (HTTP ${res.status})`);
      err.status = res.status;
      err.body = errBody;
      throw err;
    }
    const json = await res.json();
    return json.content.sha;
  }

  async function putJson(path, dataObj, message, sha) {
    const text = JSON.stringify(dataObj, null, 2);
    return putFile(path, b64EncodeUnicodeString(text), message, sha);
  }

  async function putBinary(path, arrayBuffer, message, sha) {
    return putFile(path, arrayBufferToB64(arrayBuffer), message, sha);
  }

  return {
    getConfig, setConfig, clearConfig, isConfigured,
    testConnection,
    getFileRaw, getJson, getBinary, getBinaryFromCandidates,
    putFile, putJson, putBinary
  };
})();
