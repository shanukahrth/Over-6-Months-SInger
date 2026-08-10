/*
  Singer Over 6-Month Dashboard API
  Cloudflare Worker -> GitHub Contents API

  Required Worker secrets / variables:
    GITHUB_TOKEN   Fine-grained PAT with Contents: Read & Write on one repo
    GITHUB_OWNER   e.g. shanukahrth
    GITHUB_REPO    e.g. Over-6-Months-SInger
    GITHUB_BRANCH  e.g. main
    ADMIN_KEY      private key used only for inventory uploads
    ALLOWED_ORIGIN https://shanukahrth.github.io,http://localhost:8000

  The GitHub token NEVER goes to the browser.
*/

const PUBLIC_PATHS = new Set([
  "data/Inventory.xlsx",
  "data/ShowroomTracker.xlsx",
  "data/app-data.json"
]);

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed.includes("*") ? "*" : allowed[0] || "null");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key, X-User-Name, X-User-Department",
    "Access-Control-Expose-Headers": "X-GitHub-Sha",
    "Vary": "Origin"
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders(request, env))
  });
}

function withCors(response, request, env) {
  const h = new Headers(response.headers);
  for (const [k,v] of Object.entries(corsHeaders(request, env))) h.set(k,v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

function requireConfig(env) {
  for (const k of ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"]) {
    if (!env[k]) throw new Error(`Worker variable ${k} is not configured.`);
  }
}

function cleanPath(path) {
  return String(path || "").replace(/^\/+/, "").replace(/\\/g, "/");
}

function isPublicPath(path) {
  return PUBLIC_PATHS.has(path);
}

function ghHeaders(env, raw=false) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": raw ? "application/vnd.github.raw" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function ghUrl(env, path) {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function githubInfo(env, path) {
  const url = `${ghUrl(env,path)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub metadata request failed (HTTP ${res.status}). ${await res.text()}`);
  return res.json();
}

async function githubRaw(env, path) {
  const url = `${ghUrl(env,path)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const res = await fetch(url, { headers: ghHeaders(env, true) });
  if (!res.ok) throw new Error(`GitHub file request failed (HTTP ${res.status}). ${await res.text()}`);
  return res;
}

async function githubPut(env, path, contentB64, message, sha) {
  const body = { message, content: contentB64, branch: env.GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(ghUrl(env,path), {
    method: "PUT",
    headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(env)),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg = `GitHub write failed (HTTP ${res.status})`;
    try { const j = await res.json(); msg = j.message || msg; } catch (_) {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

function b64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i=0; i<bytes.length; i+=chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  }
  return btoa(binary);
}

async function handle(request, env) {
  requireConfig(env);
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/health") {
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`, { headers: ghHeaders(env) });
    if (!r.ok) return json({ ok:false, error:`GitHub connection failed (HTTP ${r.status})` }, 502, request, env);
    return json({ ok:true, repository:`${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, branch:env.GITHUB_BRANCH }, 200, request, env);
  }

  if (request.method === "GET" && path === "/api/file-info") {
    const file = cleanPath(url.searchParams.get("path"));
    if (!isPublicPath(file)) return json({error:"File is not available through this API."}, 403, request, env);
    const info = await githubInfo(env,file);
    if (!info) return json({error:"File not found."},404,request,env);
    return json({ path:file, sha:info.sha, size:info.size, name:info.name },200,request,env);
  }

  if (request.method === "GET" && path === "/api/file") {
    const file = cleanPath(url.searchParams.get("path"));
    if (!isPublicPath(file)) return json({error:"File is not available through this API."},403,request,env);
    const info = await githubInfo(env,file);
    if (!info) return json({error:"File not found."},404,request,env);
    const raw = await githubRaw(env,file);
    const h = new Headers(raw.headers);
    h.set("X-GitHub-Sha", info.sha);
    h.set("Cache-Control", "no-store");
    for (const [k,v] of Object.entries(corsHeaders(request,env))) h.set(k,v);
    return new Response(raw.body,{status:200,headers:h});
  }

  if (request.method === "PUT" && path === "/api/overlay") {
    const user = (request.headers.get("X-User-Name") || "").trim();
    if (!user) return json({error:"User name is required."},401,request,env);
    const body = await request.json();
    if (cleanPath(body.path) !== "data/app-data.json") return json({error:"Only data/app-data.json may be written here."},403,request,env);
    if (!body.contentB64) return json({error:"No content supplied."},400,request,env);
    const result = await githubPut(env,"data/app-data.json",body.contentB64,body.message || `Dashboard update by ${user}`,body.sha || null);
    return json({ok:true,sha:result.content && result.content.sha ? result.content.sha : null},200,request,env);
  }

  if (request.method === "POST" && path === "/api/admin/check") {
    const key = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ok:false,error:"Administrator key is invalid."},403,request,env);
    return json({ok:true},200,request,env);
  }

  if (request.method === "POST" && path === "/api/admin/inventory") {
    const key = request.headers.get("X-Admin-Key") || "";
    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({error:"Administrator key is invalid."},403,request,env);
    const body = await request.json();
    const target = cleanPath(body.path || "data/Inventory.xlsx");
    if (target !== "data/Inventory.xlsx") return json({error:"Only data/Inventory.xlsx may be uploaded."},403,request,env);
    if (!body.contentB64) return json({error:"No workbook supplied."},400,request,env);

    const current = await githubInfo(env,target);
    if (current) {
      const raw = await githubRaw(env,target);
      const backup = `Backup/Inventory_Backup_${new Date().toISOString().replace(/[:.]/g,"-")}.xlsx`;
      await githubPut(env,backup,b64FromArrayBuffer(await raw.arrayBuffer()),`Automatic inventory backup before upload — ${new Date().toISOString()}`,null);
    }

    const result = await githubPut(env,target,body.contentB64,body.message || `Inventory upload — ${new Date().toISOString()}`,current ? current.sha : null);
    return json({ok:true,sha:result.content && result.content.sha ? result.content.sha : null,backupCreated:!!current},200,request,env);
  }

  return json({error:"Not found."},404,request,env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request,env)});
    try { return await handle(request,env); }
    catch(e) {
      console.error(e);
      return json({error:e.message || "Server error."},500,request,env);
    }
  }
};
