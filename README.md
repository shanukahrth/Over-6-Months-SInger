# Singer Sri Lanka — Over 6-Month Inventory Dashboard

## Option 1: Central GitHub connection

This version removes the GitHub PAT setup from normal users.

### User experience

Every staff member opens the dashboard URL and enters only:

- Name
- Department (optional)

They do **not** enter a GitHub username, repository name, branch, or PAT.

The dashboard reads and writes GitHub through a Cloudflare Worker. The GitHub token is stored only as an encrypted Worker secret and is never placed in the browser. Cloudflare documents Worker secrets as the correct place for API tokens and passwords. urlCloudflare Workers secrets documentationhttps://developers.cloudflare.com/workers/configuration/secrets/

### Permissions in this version

Normal users can:

- View Inventory Dashboard
- Filter and drill down
- Add/edit inventory remarks
- Update Showroom Tracker
- View Activity Log
- Export Excel/CSV
- Refresh shared data

Administrator can additionally:

- Upload a new Inventory.xlsx
- Automatically create a timestamped backup in `Backup/`

The administrator enters an **Admin Key** in the dashboard. This is separate from the GitHub PAT.

---

# 1. Deploy the Worker first

Open a terminal and enter the `worker` folder:

```bash
cd worker
```

Wrangler is Cloudflare's CLI for deploying Workers. The current Cloudflare documentation uses `npx wrangler deploy`. urlCloudflare Wrangler documentationhttps://developers.cloudflare.com/workers/wrangler/

Log in:

```bash
npx wrangler login
```

Set the GitHub PAT as an encrypted Worker secret:

```bash
npx wrangler secret put GITHUB_TOKEN
```

When prompted, paste the fine-grained GitHub PAT.

Set the administrator key:

```bash
npx wrangler secret put ADMIN_KEY
```

Choose a private value that only the administrator should know.

The Worker configuration already contains:

```text
GITHUB_OWNER = shanukahrth
GITHUB_REPO = Over-6-Months-SInger
GITHUB_BRANCH = main
```

Deploy:

```bash
npx wrangler deploy
```

Cloudflare will give you a URL similar to:

```text
https://singer-over6-inventory-api.<your-account>.workers.dev
```

Keep this URL.

---

# 2. Connect the dashboard to the Worker

Open:

```text
js/config.js
```

Change:

```javascript
API_BASE: "https://REPLACE-WITH-YOUR-WORKER.workers.dev"
```

to your actual Worker URL.

For example:

```javascript
API_BASE: "https://singer-over6-inventory-api.example.workers.dev"
```

Do not put the GitHub PAT in this file.

---

# 3. Upload the dashboard to GitHub Pages

Upload/commit the dashboard files to the existing repository.

The important structure is:

```text
Over-6-Months-SInger/
│
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── github.js
│   ├── app.js
│   └── showroom.js
├── vendor/
│   ├── xlsx.full.min.js
│   └── chart.umd.js
├── data/
│   ├── Inventory.xlsx
│   ├── ShowroomTracker.xlsx
│   └── app-data.json
└── worker/
    ├── worker.js
    └── wrangler.toml
```

The Worker files do not need to be served by GitHub Pages. They are deployed separately to Cloudflare.

---

# 4. First login

Open the GitHub Pages dashboard.

Each user sees:

**Over 6-Month Inventory**

Enter:

```text
Your Name:      Shanuka Herath
Department:     Marketing
```

Then click **Enter Dashboard**.

There is no GitHub connection screen.

---

# 5. Administrator upload

Click **Admin** in the top bar.

Enter the Admin Key created with:

```bash
npx wrangler secret put ADMIN_KEY
```

Once verified, **Upload New Inventory** becomes available.

When a new workbook is uploaded, the Worker:

1. Reads the current `data/Inventory.xlsx`.
2. Creates a backup under `Backup/Inventory_Backup_<timestamp>.xlsx`.
3. Replaces `data/Inventory.xlsx`.
4. Returns the new GitHub SHA.
5. The dashboard immediately displays the newly uploaded inventory.

---

# 6. How normal edits work

When a user changes a remark or showroom visit:

```text
Browser
   ↓
Cloudflare Worker
   ↓
GitHub API
   ↓
data/app-data.json
```

The user's name and department are sent as request metadata so the existing Activity Log can record who made the change.

The GitHub PAT remains inside the Worker.

---

# 7. Important security note

The GitHub PAT must never be placed in:

- `index.html`
- `js/config.js`
- `js/github.js`
- GitHub Pages JavaScript
- browser localStorage
- the public repository

Use Cloudflare Worker Secrets instead. Cloudflare specifically recommends secrets for API tokens and other sensitive values. urlCloudflare Secrets documentationhttps://developers.cloudflare.com/workers/configuration/secrets/

The repository should ideally be private if the inventory data is commercially sensitive.

---

# 8. Existing dashboard features retained

This Option 1 version keeps the existing dashboard functionality:

- Inventory KPIs
- Area / District / Shop / Product Family / Brand / Part Code filtering
- Drill-down charts
- Stock status
- Inventory ageing
- Inventory detail table
- Remarks
- Showroom Tracker
- Activity Log
- Excel export
- CSV export
- Print
- Dark/light mode
- Refresh from GitHub
- New inventory upload with backup

The main change is the connection architecture. Normal users no longer connect directly to GitHub.
