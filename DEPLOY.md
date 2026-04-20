# Young Life Sacramento — Map Admin Guide

---

## How to update the map via Google Sheets

Your Google Sheet is the admin panel. Sign in at sheets.google.com with your Google account — only people you share it with can edit.

### Step 1 — Import the starter data (first time only)
1. Open your Google Sheet
2. Click **File → Import**
3. Upload `schools-import.csv` from this folder
4. Choose **Replace current sheet** → Import

---

## Columns you own (edit these anytime)

These are the columns you'll regularly update. Changes appear on the map within a minute.

| Column | What it does | Example values |
|---|---|---|
| `staffPerson` | YL staff person assigned to this school | `Jackson Long` |
| `progress` | Ministry readiness stage | See values below |
| `notes` | Short blurb shown to donors on the school card | `We have a leader with strong ties here.` |
| `status` | Whether YL is active or targeting this school | `existing` or `target` |
| `photoUrl` | Link to a photo shown at the top of the sidebar | Paste any image URL |

### Progress values (copy exactly)
| Value | Meaning |
|---|---|
| `not_started` | On our radar, no active steps yet |
| `exploring` | Initial conversations happening |
| `leader_identified` | A leader is ready and engaged |
| `club_launched` | Active club running |
| `active` | Use this for existing YL schools |

---

## Columns that are reference data (update if numbers are wrong)

These come from public sources (CA Dept. of Education). Update them if you know a number is incorrect.

`enrollment` · `frpm` · `attendance` · `chronicAbsenteeism` · `suspensionRate` · `graduationRate` · `ela` · `math` · `medianIncome`

---

## Columns you should NOT change

These control where pins appear on the map and how schools are categorized. Only change if you're adding a new school.

`id` · `lat` · `lng` · `name` · `shortName` · `type` · `district` · `grades` · `address`

---

## Adding a new school

1. Add a new row at the bottom of the sheet
2. Give it the next `id` number (e.g. 24)
3. Fill in at minimum: `id`, `name`, `shortName`, `type`, `status`, `progress`, `lat`, `lng`, `district`, `grades`, `address`, `enrollment`
4. Find lat/lng by right-clicking the school on Google Maps → "What's here?"
5. Save — the map updates within a minute

---

## Hosting on GitHub Pages

### First time setup
1. Go to github.com → sign in → New repository named `younglife-sacramento` (Public)
2. Upload all files from this folder
3. Settings → Pages → Branch: main → Save
4. Live at: `https://YOUR-USERNAME.github.io/younglife-sacramento/`

### Updating map code (not data)
When code files change (app.js, styles.css, etc.):
1. Go to your GitHub repo
2. Click the file → pencil icon → paste new content → Commit changes

### Pushing from Terminal (if git is set up)
```bash
cd "/Users/jacksonlong/Claude Coding/younglife-sacramento"
git push origin main
```
Use your GitHub Personal Access Token as the password (Settings → Developer settings → Personal access tokens → Tokens classic → Generate).
