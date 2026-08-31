/* =========================================================================
   Showroom Tracker page
   -------------------------------------------------------------------------
   Loads ShowroomTracker.xlsx from GitHub (source columns: Region, Area,
   District, Showroom, Store Type, Visited, Visit Date, Team Visited,
   Remarks). Visit edits (Visited, Visit Date, Team, Remark) are stored as
   an overlay in the shared data/app-data.json file (keyed by
   Showroom + District), same sync engine as inventory remarks, so writes
   are small/fast and never require rewriting the whole workbook.
   ========================================================================= */

window.Showroom = (function () {
  "use strict";
  const S = window.Shared;

  const state = { rows: [], search: "", visitedFilter: "" };
  const chartRegistry = {};

  function visitKey(showroom, district) { return (showroom || "").trim() + "||" + (district || "").trim(); }

  function normHeader(h) { return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  function normalizeRows(sheetRows) {
    if (!sheetRows.length) return [];
    const headers = Object.keys(sheetRows[0]);
    const find = (aliases) => headers.find((h) => aliases.includes(normHeader(h)));
    const col = {
      region: find(["region"]),
      area: find(["area"]),
      district: find(["district"]),
      showroom: find(["showroom", "store", "outlet", "branch"]),
      storeType: find(["storetype", "type"]),
      visited: find(["visited"]),
      visitDate: find(["visitdate"]),
      team: find(["teamvisited", "team"]),
      remarks: find(["remarks", "remark"])
    };
    return sheetRows.map((r) => {
      const showroom = col.showroom ? String(r[col.showroom] ?? "").trim() : "";
      const district = col.district ? String(r[col.district] ?? "").trim() : "";
      const key = visitKey(showroom, district);
      const ov = S.overlay.showroomVisits[key];
      return {
        region: col.region ? String(r[col.region] ?? "").trim() : "",
        area: col.area ? String(r[col.area] ?? "").trim() : "Unspecified",
        district: district || "Unspecified",
        showroom, storeType: col.storeType ? String(r[col.storeType] ?? "").trim() : "",
        visited: ov ? (ov.visited || "No") : (col.visited ? String(r[col.visited] ?? "No").trim() : "No"),
        visitDate: ov ? (ov.visitDate || "") : (col.visitDate ? String(r[col.visitDate] ?? "").trim() : ""),
        team: ov ? (ov.team || "") : (col.team ? String(r[col.team] ?? "").trim() : ""),
        remark: ov ? (ov.remark || "") : (col.remarks ? String(r[col.remarks] ?? "").trim() : ""),
        updatedBy: ov ? (ov.updatedBy || "") : "",
        updatedDate: ov ? (ov.updatedDate || "") : ""
      };
    });
  }

  async function loadFromGitHub() {
    const { buffer, path } = await GitHubService.getBinaryFromCandidates(["ShowroomTracker.xlsx", "data/ShowroomTracker.xlsx"]);
    if (!buffer) {
      state.rows = [];
      throw new Error('Could not find "ShowroomTracker.xlsx" in your repository (checked the repo root and the "data/" folder). ' +
        "Make sure the file exists, is spelled exactly like that, and that the branch you connected to is correct.");
    }
    state.path = path;
    const wb = XLSX.read(buffer, { type: "array" });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    state.rows = normalizeRows(json);
  }

  function computeKpis() {
    const total = state.rows.length;
    const visited = state.rows.filter((r) => String(r.visited).toLowerCase() === "yes").length;
    const pending = total - visited;
    const coverage = total ? Math.round((visited / total) * 100) : 0;
    const areas = new Set(state.rows.map((r) => r.area)).size;
    const districts = new Set(state.rows.map((r) => r.district)).size;
    return { total, visited, pending, coverage, areas, districts };
  }

  function renderKpis() {
    const k = computeKpis();
    const defs = [
      { label: "Total Showrooms", value: S.fmtInt(k.total), color: "var(--navy-700)", icon: "\u{1F3EA}" },
      { label: "Visited Showrooms", value: S.fmtInt(k.visited), color: "var(--green-600)", icon: "\u2705" },
      { label: "Pending Showrooms", value: S.fmtInt(k.pending), color: "var(--amber-500)", icon: "\u{1F6A9}" },
      { label: "Coverage %", value: k.coverage + "%", color: "var(--red-600)", icon: "\u{1F4CA}" },
      { label: "Areas", value: S.fmtInt(k.areas), color: "var(--navy-800)", icon: "\u{1F30D}" },
      { label: "Districts", value: S.fmtInt(k.districts), color: "#8e44ad", icon: "\u{1F5FA}\uFE0F" }
    ];
    document.getElementById("showroomKpiGrid").innerHTML = defs.map((d) => `
      <div class="kpi-card"><div class="kpi-icon" style="background:${d.color}">${d.icon}</div>
      <div class="kpi-value">${d.value}</div><div class="kpi-label">${d.label}</div></div>`).join("");
  }

  function coverageByField(field) {
    const map = {};
    state.rows.forEach((r) => {
      const k = r[field] || "Unspecified";
      if (!map[k]) map[k] = { total: 0, visited: 0 };
      map[k].total++;
      if (String(r.visited).toLowerCase() === "yes") map[k].visited++;
    });
    return Object.entries(map).map(([k, v]) => ({ label: k, pct: v.total ? Math.round((v.visited / v.total) * 100) : 0, total: v.total, visited: v.visited }))
      .sort((a, b) => b.pct - a.pct);
  }

  function destroyChart(id) { if (chartRegistry[id]) { chartRegistry[id].destroy(); delete chartRegistry[id]; } }

  function renderCoverageChart(canvasId, data) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");
    chartRegistry[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels: data.map((d) => d.label), datasets: [{ label: "Coverage %", data: data.map((d) => d.pct), backgroundColor: S.CHART_COLORS[0], borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.x}% (${data[c.dataIndex].visited}/${data[c.dataIndex].total})` } } },
        scales: { x: { min: 0, max: 100, grid: { color: S.gridColor() }, ticks: { color: S.tickColor(), callback: (v) => v + "%" } }, y: { grid: { display: false }, ticks: { color: S.tickColor() } } }
      }
    });
  }

  // ---- Detailed Pending-by-Area / Pending-by-District tables --------------
  // Same underlying numbers as the coverage charts, but as a sortable table
  // so it's easy to see exactly how many showrooms are still pending in
  // each area/district, not just a visual coverage percentage.
  const pendingSort = { area: { field: "pending", dir: "desc" }, district: { field: "pending", dir: "desc" } };
  const PENDING_COLUMNS = [
    { key: "label", label: "Name" },
    { key: "total", label: "Total", numeric: true },
    { key: "visited", label: "Visited", numeric: true },
    { key: "pending", label: "Pending", numeric: true },
    { key: "pct", label: "Coverage %", numeric: true }
  ];

  function pendingTableData(field) {
    return coverageByField(field).map((d) => ({ label: d.label, total: d.total, visited: d.visited, pending: d.total - d.visited, pct: d.pct }));
  }

  function renderPendingTable(kind, field) {
    const sort = pendingSort[kind];
    const rows = pendingTableData(field).sort((a, b) => {
      const mult = sort.dir === "asc" ? 1 : -1;
      if (sort.field === "label") return String(a.label).localeCompare(String(b.label)) * mult;
      return (a[sort.field] - b[sort.field]) * mult;
    });
    const headEl = document.getElementById(kind === "area" ? "pendingByAreaHead" : "pendingByDistrictHead");
    const bodyEl = document.getElementById(kind === "area" ? "pendingByAreaBody" : "pendingByDistrictBody");

    headEl.innerHTML = PENDING_COLUMNS.map((c) => {
      const isSorted = sort.field === c.key;
      const arrow = isSorted ? (sort.dir === "asc" ? "\u25B2" : "\u25BC") : "";
      return `<th data-key="${c.key}" class="${c.numeric ? "num" : ""}" style="cursor:pointer;">${c.label}${arrow}</th>`;
    }).join("");
    headEl.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        if (sort.field === th.dataset.key) sort.dir = sort.dir === "asc" ? "desc" : "asc";
        else { sort.field = th.dataset.key; sort.dir = "desc"; }
        renderPendingTable(kind, field);
      });
    });

    if (!rows.length) {
      bodyEl.innerHTML = `<tr class="empty-row"><td colspan="${PENDING_COLUMNS.length}">No data.</td></tr>`;
      return;
    }
    bodyEl.innerHTML = rows.map((r) => `
      <tr>
        <td>${S.escapeHtml(r.label)}</td>
        <td class="num">${S.fmtInt(r.total)}</td>
        <td class="num">${S.fmtInt(r.visited)}</td>
        <td class="num" style="${r.pending > 0 ? "color:var(--red-600);font-weight:700;" : ""}">${S.fmtInt(r.pending)}</td>
        <td class="num">${r.pct}%</td>
      </tr>`).join("");
  }

  function filteredRows() {
    let rows = state.rows;
    if (state.visitedFilter) rows = rows.filter((r) => String(r.visited) === state.visitedFilter);
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter((r) => r.showroom.toLowerCase().includes(q) || r.area.toLowerCase().includes(q) || r.district.toLowerCase().includes(q));
    }
    return rows;
  }

  const COLUMNS = ["Area", "District", "Showroom", "Store Type", "Visited", "Visit Date", "Team", "Remark", "Updated By", "Updated Date"];

  function renderTable() {
    const rows = filteredRows();
    document.getElementById("showroomHeadRow").innerHTML = COLUMNS.map((c) => `<th>${c}</th>`).join("");
    const tbody = document.getElementById("showroomBody");
    if (!rows.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="${COLUMNS.length}">No showrooms match the current filters.</td></tr>`; return; }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${S.escapeHtml(r.area)}</td>
        <td>${S.escapeHtml(r.district)}</td>
        <td>${S.escapeHtml(r.showroom)}</td>
        <td>${S.escapeHtml(r.storeType)}</td>
        <td><select data-showroom="${S.escapeHtml(r.showroom)}" data-district="${S.escapeHtml(r.district)}" data-field="visited">
              <option value="No" ${r.visited === "No" ? "selected" : ""}>No</option>
              <option value="Yes" ${r.visited === "Yes" ? "selected" : ""}>Yes</option>
            </select></td>
        <td><input type="date" value="${S.escapeHtml(r.visitDate)}" data-showroom="${S.escapeHtml(r.showroom)}" data-district="${S.escapeHtml(r.district)}" data-field="visitDate"></td>
        <td><input type="text" value="${S.escapeHtml(r.team)}" placeholder="Team\u2026" data-showroom="${S.escapeHtml(r.showroom)}" data-district="${S.escapeHtml(r.district)}" data-field="team"></td>
        <td class="remark-cell"><input type="text" value="${S.escapeHtml(r.remark)}" placeholder="Remark\u2026" data-showroom="${S.escapeHtml(r.showroom)}" data-district="${S.escapeHtml(r.district)}" data-field="remark"></td>
        <td class="meta-cell">${S.escapeHtml(r.updatedBy)}</td>
        <td class="meta-cell">${S.escapeHtml(r.updatedDate)}</td>
      </tr>`).join("");

    tbody.querySelectorAll("select[data-field], input[data-field]").forEach((el) => {
      el.addEventListener("change", () => handleEdit(el));
    });
  }

  function handleEdit(el) {
    const showroom = el.dataset.showroom, district = el.dataset.district, field = el.dataset.field;
    const key = visitKey(showroom, district);
    const row = state.rows.find((r) => r.showroom === showroom && r.district === district);
    if (!row) return;
    row[field] = el.value;
    const session = S.getSession();
    const who = session ? session.name : "Unknown";
    const np = S.nowParts();
    row.updatedBy = who; row.updatedDate = np.date;
    S.overlay.showroomVisits[key] = { visited: row.visited, visitDate: row.visitDate, team: row.team, remark: row.remark, updatedBy: who, updatedDate: np.date };
    S.markShowroomDirty(key);
    S.logActivity(who, `updated ${showroom} showroom (${field}: ${el.value || "cleared"})`);
    renderKpis();
    renderTable();
  }

  function wireControls() {
    document.getElementById("showroomSearch").addEventListener("input", S.debounce((e) => { state.search = e.target.value; renderTable(); }, 200));
    document.getElementById("showroomVisitedFilter").addEventListener("change", (e) => { state.visitedFilter = e.target.value; renderTable(); });
    document.getElementById("showroomExportXlsxBtn").addEventListener("click", exportExcel);
    document.getElementById("showroomExportCsvBtn").addEventListener("click", exportCsv);
  }

  // ---- Export (current search/filter scope, all columns) ------------------
  function exportRowsToAOA() {
    const rows = filteredRows();
    const header = ["Area", "District", "Showroom", "Store Type", "Visited", "Visit Date", "Team", "Remark", "Updated By", "Updated Date"];
    const body = rows.map((r) => [r.area, r.district, r.showroom, r.storeType, r.visited, r.visitDate, r.team, r.remark, r.updatedBy, r.updatedDate]);
    return [header, ...body];
  }

  function exportExcel() {
    const aoa = exportRowsToAOA();
    if (aoa.length <= 1) { alert("There is no data in the current view to export."); return; }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aoa[0].map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Showroom Tracker");
    XLSX.writeFile(wb, `Singer_Showroom_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportCsv() {
    const aoa = exportRowsToAOA();
    if (aoa.length <= 1) { alert("There is no data in the current view to export."); return; }
    const csv = aoa.map((line) => line.map((cell) => {
      const s = cell === null || cell === undefined ? "" : String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Singer_Showroom_Tracker_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function renderError(message) {
    document.getElementById("showroomKpiGrid").innerHTML = "";
    const err = document.createElement("div");
    err.className = "card";
    err.style.borderColor = "var(--red-600)";
    err.innerHTML = `<div class="card-head"><h2 style="color:var(--red-600)">Showroom data not found</h2></div>
      <p style="font-size:13px;color:var(--text-sub);line-height:1.5;margin:0;">${S.escapeHtml(message)}</p>`;
    const kpiSection = document.getElementById("showroomKpiGrid").parentElement;
    const existing = document.getElementById("showroomErrorCard");
    if (existing) existing.remove();
    err.id = "showroomErrorCard";
    kpiSection.parentElement.insertBefore(err, kpiSection.nextSibling);
    document.getElementById("showroomHeadRow").innerHTML = "";
    document.getElementById("showroomBody").innerHTML = "";
    ["pendingByAreaHead", "pendingByAreaBody", "pendingByDistrictHead", "pendingByDistrictBody"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";
    });
  }

  function clearError() {
    const existing = document.getElementById("showroomErrorCard");
    if (existing) existing.remove();
  }

  function renderAll() {
    renderKpis();
    renderCoverageChart("areaCoverageChart", coverageByField("area"));
    renderCoverageChart("districtCoverageChart", coverageByField("district"));
    renderPendingTable("area", "area");
    renderPendingTable("district", "district");
    renderTable();
  }

  let wired = false;
  async function init() {
    if (!wired) { wireControls(); wired = true; }
    try {
      await loadFromGitHub();
      clearError();
      renderAll();
    } catch (e) {
      console.error(e);
      renderError(e.message);
    }
  }

  async function loadAndRender() {
    try {
      await loadFromGitHub();
      clearError();
      renderAll();
    } catch (e) {
      console.error(e);
      renderError(e.message);
    }
  }

  return { init, renderAll, loadAndRender };
})();
