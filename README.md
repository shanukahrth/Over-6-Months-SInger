# Singer Sri Lanka — Over 6-Month Inventory Dashboard

**v2 — fixes the "blank dashboard" and "edits sometimes not saving" issues
from v1.** See Section 9 for what changed if you're upgrading from an
earlier copy.

A multi-user, GitHub-synced inventory clearance dashboard. Everyone who opens
the site sees the same live data; remarks, showroom visits and an activity
feed are saved straight back into your GitHub repository, so there's nothing
to install and no database to run.

No backend server, no build step (no `npm install`, no Vite/React
toolchain) — just static files hosted on **GitHub Pages**, talking directly
to the **GitHub REST API**.

---

## 1. What's inside

```
singer-inventory-dashboard/
├─ index.html            # Page shell: login, GitHub setup, nav, dashboard, showroom, activity
├─ css/style.css          # Corporate navy + red theme, with dark mode
├─ js/
│  ├─ config.js            # OPTIONAL: shared GitHub connection (edit once, see Section 3.4)
│  ├─ github.js           # Thin GitHub Contents API client (read/write files)
│  ├─ app.js               # Dashboard logic: filters, drilldown, charts, table, remarks, sync
│  └─ showroom.js          # Showroom Tracker page logic
├─ vendor/
│  ├─ xlsx.full.min.js     # SheetJS, vendored locally (no CDN dependency)
│  └─ chart.umd.js         # Chart.js, vendored locally
├─ data/
│  ├─ Inventory.xlsx       # Your master over-6-month inventory export
│  └─ ShowroomTracker.xlsx # Your master showroom visit list
└─ README.md
```

> **This time, follow Section 3 exactly** — the most common setup mistake is
> ending up with these files nested one level too deep in the repo (e.g.
> `Over-6-Months-SInger/singer-inventory-dashboard/index.html` instead of
> `Over-6-Months-SInger/index.html`). GitHub Pages only serves what's at the
> **repository root**, so if the files are nested, the site either 404s or
> serves a stale/different copy. Section 3 uses GitHub's web upload UI,
> which makes this mistake much harder to make than a zip-and-drag.

> **Note:** `data/Inventory.xlsx` and `data/ShowroomTracker.xlsx` in this
> folder are just your starting files, included so the repo is ready to
> push. The live app does **not** read from `data/` at runtime — it reads
> `Inventory.xlsx` and `ShowroomTracker.xlsx` from the **root** of your
> GitHub repository via the API (see Section 3). Move/copy them to the repo
> root before your first push, or update the paths in `js/app.js` /
> `js/showroom.js` if you'd rather keep them under `data/`.

---

## 2. How it works (architecture)

- **No database.** All shared state lives as files inside your Git
  repository:
  - `Inventory.xlsx` — the master workbook (replaced only when someone uses
    **Upload New Inventory**).
  - `ShowroomTracker.xlsx` — the master showroom list.
  - `data/app-data.json` — a small JSON **overlay** file holding every
    remark, every showroom visit edit, and the last 50 activity-log
    entries. This is created automatically the first time anyone saves
    something.
- **Why an overlay file instead of rewriting the whole Excel file on every
  edit?** `Inventory.xlsx` has ~59,000 rows (~5–6 MB). Rewriting and
  committing that on every keystroke would be slow, would flood your repo's
  commit history, and risks conflicts. Instead, remarks/visits are written
  to the small `app-data.json` overlay (a few KB), committed in ~1 second,
  and merged back onto the workbook rows in the browser every time the app
  loads. The master `.xlsx` files themselves are only rewritten when an
  administrator explicitly uploads a refreshed export — at which point the
  overlay is automatically re-merged onto the new rows using **Part
  Code + Shop** as the match key, so remarks are never lost.
- **Multi-user:** every teammate's browser talks directly to
  `api.github.com` using their own Personal Access Token (stored only in
  their own browser). Whoever saves last within a short window is
  automatically merged (the app re-fetches the overlay, re-applies just the
  fields you personally changed, and retries) rather than blindly
  overwriting someone else's edits.
- **Live save status** in the top bar shows Saving… / Saved / Connection
  Error / Retrying… for every remark/visit edit.

---

## 3. One-time setup

### 3.1 Prepare your GitHub repository (web upload method — recommended)

This is the method least likely to end up with nested folders.

1. Unzip the download you got from Claude onto your computer. You should
   see a folder called `singer-inventory-dashboard` containing `index.html`,
   `css/`, `js/`, `vendor/`, `data/`, `README.md` directly inside it.
2. **If you're reusing an existing repo that already has files in it from a
   previous attempt:** open the repo on github.com, select **all** files and
   folders at the root (click one, then Ctrl/Cmd+A or shift-click the last
   one), and delete them first, so you start from an empty repo. This avoids
   ending up with old and new copies side by side.
3. On github.com, open your repository (or **New repository** if you don't
   have one yet — any visibility works).
4. Click **Add file → Upload files**.
5. On your computer, open the `singer-inventory-dashboard` folder so you can
   see its *contents* (`index.html`, `css`, `js`, `vendor`, `data`,
   `README.md`).
6. Select **all of those items** (not the `singer-inventory-dashboard`
   folder itself — go one level inside it first) and drag them all into the
   GitHub upload box together. Modern browsers will upload whole folders
   (`css/`, `js/`, etc.) correctly when dragged this way.
7. Scroll down, add a commit message like "Deploy dashboard", and click
   **Commit changes**.
8. Go back to the repo's main **Code** tab and confirm `index.html`,
   `Inventory.xlsx`... wait, you'll actually see `data/Inventory.xlsx` at
   this point (see the note below) — sits at the **top level** of the file
   list, not inside a `singer-inventory-dashboard` subfolder.
9. **Move the two data files to the repo root** (the app reads them from
   the root by default, though it will also fall back to `data/` — see
   Section 6 note — so this step is optional but recommended for a clean
   layout):
   - Click into `data/Inventory.xlsx` on github.com → click the pencil
     (Edit) icon's dropdown / use **... → Rename** (or delete + re-upload at
     root) to move it to just `Inventory.xlsx`. Repeat for
     `ShowroomTracker.xlsx`.
   - If that feels fiddly, skip it — the app will find the files under
     `data/` automatically.
10. Go to **Settings → Pages**. Under **Build and deployment**, set
    **Source** to `Deploy from a branch`, branch `main` (or whatever your
    default branch is called), folder `/ (root)`. Save.
11. GitHub will publish the site at
    `https://<your-username>.github.io/<your-repo>/` within 1–2 minutes.
    (If your repo is literally named `<your-username>.github.io`, the site
    publishes at `https://<your-username>.github.io/` with no extra path —
    make sure you're editing the *same* repo you're viewing in the browser.)

### 3.1-alt Prepare your GitHub repository (git command line)

If you're comfortable with git, this avoids any drag-and-drop ambiguity
entirely:

```bash
cd singer-inventory-dashboard
mv data/Inventory.xlsx ./Inventory.xlsx
mv data/ShowroomTracker.xlsx ./ShowroomTracker.xlsx
rmdir data
git init
git add .
git commit -m "Deploy over-6-month inventory dashboard"
git branch -M main
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

Then do step 10–11 above (enable Pages).

### 3.2 Create a Personal Access Token (each user who will *save* changes)

Anyone who only wants to *view* the dashboard doesn't strictly need write
access, but since there's no separate "read-only" mode, every user should
set up a token so remarks they enter actually save.

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.**
2. **Resource owner:** your org/user. **Repository access:** *Only select
   repositories* → choose this repo.
3. **Permissions → Repository permissions → Contents:** set to
   **Read and write**. Nothing else is required.
4. Generate, copy the token. You'll paste it into the dashboard's "Connect
   to GitHub" screen the first time you open the site on a device.

Tokens are stored **only** in that browser's `localStorage` — never
committed, never sent anywhere except `api.github.com`. Each teammate sets
this up once per device/browser they use.

### 3.3 First launch

1. Open the GitHub Pages URL.
2. **Connect to GitHub** screen: enter the repo owner (your GitHub
   username/org — not the full URL), the repo name exactly as it appears on
   github.com (case-sensitive), leave **Branch blank** to auto-detect, and
   paste your token. Click **Connect & Continue**.
   - If this step fails, the error message here tells you specifically
     whether it's a bad owner/repo/token — fix it here before moving on.
3. **Login** screen: enter your name (and optional department). No
   password. This is stored for the browser session only and is what gets
   recorded against every remark/showroom edit you make.
4. You're in. The dashboard loads `Inventory.xlsx` and
   `ShowroomTracker.xlsx` straight from your repo (checking both the repo
   root and a `data/` folder automatically).
5. **Verify it actually loaded data**, not just an empty shell: the KPI
   cards at the top should show real numbers (not blank, not all zero
   unless your workbook is genuinely empty). If they're blank, open your
   browser's DevTools Console (F12) — a red error there will say exactly
   what went wrong.

To change the connected repository later, use **Change GitHub repository
connection** on the login screen.

### 3.4 Skip per-user GitHub setup entirely (recommended for your team)

By default, every teammate has to go through Section 3.2–3.3 once on their
own device. If you'd rather set this up **once** and have everyone else
only ever see the Name/Department login screen, edit **`js/config.js`**:

```js
window.OVER6_SHARED_GITHUB_CONFIG = {
  owner: "shanukahrth",
  repo: "Over-6-Months-SInger",
  branch: "main",
  token: "github_pat_xxx..."   // paste your token here
};
```

Fill in `token` with a fine-grained PAT (Contents: Read and write, scoped to
only this repo — see Section 3.2), commit `js/config.js` to the repo, and
redeploy. From then on, nobody else needs to enter a repo, owner, or token —
they'll land straight on the login screen.

**Read this before filling in the token:** `config.js` is a plain JavaScript
file served to anyone who opens the site. If your GitHub Pages site is
public, anyone can view the page source and read the token, then use it to
write to your repository. To limit the blast radius: use a fine-grained
token scoped to *only* this one repo with *only* Contents read/write, don't
reuse a token that touches other repos, and if you ever suspect misuse,
revoke it on GitHub immediately and paste in a fresh one. If you have many
external or less-trusted users, leaving `token` blank (the default) and
having each person connect individually remains the more secure option.

---

## 4. Using the dashboard

### KPI cards
Eleven cards: Total Inventory Value, Total Units, Total SKUs, Total Areas,
Total Districts, Total Shops, Total Brands, Total Product Families, Average
Inventory Age, Pending Remarks, Completed Actions. They recompute live from
whatever filters/drilldown are currently active.

> **On "Average Inventory Age":** the standard Singer export doesn't
> include a per-row numeric age in days — every row in the "over 6 month"
> extract already sits in a single aging bracket (see Section 6). When no
> numeric age column is present, this card shows that bracket label
> instead of a day-count. If a future export includes a real per-row age
> column, the app detects and uses it automatically.

### Filters
Searchable/typeahead fields for Area, District, Shop, Product Family,
Brand, Part Code, and Commodity (each is a text box backed by an
auto-complete list — start typing and matching values appear), plus a
dropdown for Stock Status and a free-text Product Description filter.
Every field is cascading — its suggestions narrow based on whatever else is
currently selected.

> The spec also asked for a "Manager" filter. The current inventory export
> has no manager/owner column, so this filter isn't shown. If your export
> gains one, add it to `HEADER_ALIASES.manager` in `js/app.js` and a filter
> field for it in `index.html`.

### Drilldown
Click a bar in the main chart to drill down:

```
Area → District → Shop → Product Family → Brand → Part Code → Inventory List
```

The breadcrumb bar shows exactly where you are; click any crumb to jump
back up.

- **At Shop level** (deepest = Shop, before Product Family is chosen), the
  second chart card switches from "Unit Mix by Brand" to two big tiles:
  **Total Over-6 Units** and **Total Over-6 Value** for that shop.
- **At Part Code level** (or whenever the Part Code filter is set directly,
  independent of drilldown), the three top charts switch to **Area
  Distribution**, **District Distribution**, and **Shop Distribution**
  (all by units, per spec), and the Ageing chart shows that part code's
  ageing-status breakdown.
- All pie/donut charts show **units**, not value, per spec; the bar charts
  (main drill chart, Top 20 Highest Value) show value.

### Inventory table
Part Code, Description, Brand, Product Family, Commodity, Area, District,
Shop, Quantity, Inventory Value, Age, Remark, Commented By, Comment Date,
Last Updated. Search, sort (click header), resize (drag the column edge),
show/hide columns (**Columns** button), sticky header, pagination
(25/50/100/250).

### Remarks
Type directly into a row's Remark cell; it saves the moment you tab/click
away (on blur/change — no separate save button). Every remark records
**Commented By**, **Comment Date**, **Comment Time**, and **Last Updated**
automatically, using your logged-in name. Saves are committed to
`data/app-data.json` in GitHub a couple of seconds after you stop typing
(debounced), and the top-bar status shows progress.

### Upload New Inventory
**Upload New Inventory** in the top bar lets anyone with a write-scoped
token replace the master workbook:
1. The new file is parsed and matched against the existing overlay by
   **Part Code + Shop**, so all existing remarks re-attach automatically.
2. The current `Inventory.xlsx` is copied to
   `Backup/Inventory_Backup_<date>_<timestamp>.xlsx` in GitHub **before**
   being replaced.
3. The new file is committed as `Inventory.xlsx`.
4. The dashboard immediately reflects the new data for every user next
   time they load or refresh.

### Download / Print
**Export Excel** / **Export CSV** download whatever is currently
filtered/searched/sorted (not just the current page), including all remark
columns. **Print** opens the browser's print dialog with the nav/filters
hidden for a clean printout.

### Refresh from GitHub
One click, top-left nav: re-pulls the latest `Inventory.xlsx`,
`ShowroomTracker.xlsx` and the overlay file without a full page reload.

### Unsaved changes
If a save is still in flight (or a network error is being retried) and you
try to close/navigate away, the browser will warn you before leaving.

---

## 5. Showroom Tracker page

Loads `ShowroomTracker.xlsx` from GitHub. Shows Total/Visited/Pending
Showrooms, Coverage %, Areas, Districts as KPI cards, plus Coverage-by-Area
and Coverage-by-District bar charts. Each row is editable in place —
Visited (Yes/No), Visit Date, Team, Remark — and every edit records
Updated By / Updated Date automatically. Saves go through the same
`data/app-data.json` overlay and live-save-status indicator as inventory
remarks.

---

## 6. Data notes (for IT / power users)

All column recognition lives near the top of `js/app.js`:

```js
const HEADER_ALIASES = {
  area: ["area"],
  store: ["sitedes", "store", "storename", "branch", "showroom", "outlet"],
  partNo: ["partno", "partnumber", "part"],
  closingBalance: ["clbal", "closingbalance", "quantity", "qty", "closingqty"],
  sellingPrice: ["selcashprice", "sellingprice", "price", "cashprice"],
  ...
};
```

Add a new alias (lower-case, no spaces/punctuation) if a future export uses
a header the app doesn't recognise.

> **On "Store":** the column literally named `store` in the source export
> is a channel/type flag (Shop / Warehouse / Service Centre / Others). The
> real showroom name lives in `Site Des`, so the dashboard maps **Shop →
> Site Des**.

> **On "Aging Status":** the export's aging column header typically reads
> like `90 % to 100 Aging SKUs`, with every cell just repeating that row's
> Part No — a quirk of the report generator, not a real per-row value. The
> app detects this pattern and labels every row's Aging Status using the
> percentage range parsed out of the header instead (e.g. "90% - 100%").
> If a future export includes a genuine, varying per-row Aging Status
> column, the app uses its real values automatically.

---

## 7. Security notes

- Personal Access Tokens are stored only in `localStorage` on each user's
  own device/browser. They are never written to the repository, never sent
  to any server other than `api.github.com`, and are cleared if the user
  clears their browser's site data.
- Use **fine-grained tokens scoped to only this one repository** with
  **Contents: Read and write** — nothing broader is needed.
- There is no password/login security on top of GitHub's own access
  control — anyone with the Pages URL can view the dashboard, and anyone
  who configures a valid token for the repo can write to it. If you need
  tighter access control, put the GitHub Pages site behind your
  organisation's SSO/VPN, or make the repository private and restrict who
  can be issued a token.

---

## 8. Browser support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari) on desktop,
tablet or mobile.

---

## 9. Changelog

**v2 (this version):**
- Fixed: `Inventory.xlsx` / `ShowroomTracker.xlsx` are now found
  automatically whether they sit at the repo root or under `data/` —
  previously a 404 on the exact hardcoded path failed silently or with a
  generic error.
- Fixed: the GitHub connect screen now auto-detects your repository's real
  default branch instead of assuming `main`, which was the most common
  cause of "file not found" errors when a repo actually used `master` (or
  vice versa).
- Fixed: **remarks, showroom visits, and any text-field edit are now saved
  as you type** (debounced, ~1 second after you stop typing), not only when
  the field loses focus. Previously, an edit could be silently lost if you
  navigated away before the field blurred.
- Fixed: editing a Showroom Tracker field no longer triggers a full table
  rebuild, which could destroy/detach the very input you were about to
  click into next (a real focus-loss bug when editing two fields on the
  same row back to back).
- Fixed: the Showroom Tracker page now shows a clear on-screen error if
  `ShowroomTracker.xlsx` can't be found, instead of silently rendering all
  zeros.
- Verified end-to-end against the real ~59,500-row inventory export and the
  real showroom tracker file: load, drilldown (including Shop and Part Code
  views), remark edits, showroom edits, and a full save → reload cycle all
  confirmed working correctly.

