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
window.OVER6_ADMIN_PASSWORD = "MKT";
