/* Shared GitHub repository settings.
   Each user enters their GitHub PAT once in the login screen.
   The PAT is stored only in that browser's localStorage. */
window.OVER6_SHARED_GITHUB_CONFIG = {
  owner: "shanukahrth",
  repo: "Over-6-Months-SInger",
  branch: "main"
};

/* Admin access password — required to log in as "Full Access (Admin)".
   Sales Team login does NOT need this.

   ⚠️ SECURITY NOTE: this is plain JavaScript served to anyone who loads the
   page. It is NOT a secure secret — anyone who views the page source can
   read it. Treat it as a practical gate against someone casually or
   accidentally picking "Full Access" (e.g. a Sales team member clicking
   the wrong dropdown option), not as protection against someone who is
   deliberately trying to bypass it. If you need real access control,
   that requires a real backend/auth service, which this static-site
   architecture doesn't have.

   Change this value any time by editing this file and redeploying —
   nothing else needs to change. Leave it blank ("") to disable the
   password requirement entirely (anyone can pick either role freely). */
window.OVER6_ADMIN_PASSWORD = "";

/* Report periods available to pick at login (e.g. "August 2026", "July
   2026"). Each entry's fileBase is the filename (without extension) the
   app looks for — it checks both the repo root and a "data/" folder, and
   both .csv and .xlsx, automatically (same as the normal inventory file).

   To add a new month: export the new workbook, name it exactly
   "<fileBase>.xlsx" (e.g. "Inventory_September2026.xlsx"), upload it to
   the repo, then add one line below. Put the newest period first — it
   becomes the default selection. No other changes needed.

   Leave this array empty ([]) to go back to the single-file behaviour
   (just "Inventory.xlsx"/"Inventory.csv", no period picker shown). */
window.OVER6_REPORT_PERIODS = [
  { id: "aug2026", label: "August 2026 (Latest)", fileBase: "Inventory_August2026" },
  { id: "jul2026", label: "July 2026", fileBase: "Inventory_July2026" }
];
