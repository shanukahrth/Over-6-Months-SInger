/* =========================================================================
   Shared GitHub connection (edit this file once, on your own computer,
   then push it to the repo)
   -------------------------------------------------------------------------
   Fill in the four values below and every user who opens the dashboard will
   connect automatically — they will only ever see the Name/Department
   login screen, never the "Connect to GitHub" screen.

   ⚠️ SECURITY NOTE — read this before filling in a token:
   This file is plain JavaScript served to anyone who loads the page. If
   your GitHub Pages site is public, ANYONE who views the page source can
   read the token below and use it to write to your repository. To keep
   this reasonably safe:
     • Use a FINE-GRAINED token scoped to ONLY this one repository.
     • Give it ONLY "Contents: Read and write" — nothing else.
     • Do not reuse a token that has access to other repos.
     • If you ever suspect it's been misused, revoke it immediately on
       GitHub (Settings → Developer settings → Personal access tokens) and
       generate a new one, then update this file and re-deploy.
     • Consider making the repository private if your GitHub plan supports
       private GitHub Pages sites, for an extra layer of protection.

   If you leave `token` blank, the app falls back to asking each user to
   connect individually (the previous behaviour) — that remains the more
   secure option if you have many external/less-trusted users.
   ========================================================================= */

window.OVER6_SHARED_GITHUB_CONFIG = {
  owner: "shanukahrth",              // GitHub username or org
  repo: "Over-6-Months-SInger",      // repository name, exactly as on GitHub
  branch: "main",                    // leave as "main" unless your repo uses a different default branch
  token: ""                          // paste your fine-grained PAT here (Contents: Read and write, this repo only)
};
