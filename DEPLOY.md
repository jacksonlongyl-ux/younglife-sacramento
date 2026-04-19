# Deploying to GitHub Pages (Free Hosting)

Follow these steps once. After that, any changes you make to the files automatically go live.

---

## Step 1 — Create a free GitHub account
Go to https://github.com and sign up (free).

---

## Step 2 — Create a new repository
1. Click the **+** button in the top right → **New repository**
2. Name it: `younglife-sacramento`
3. Set it to **Public**
4. Do NOT check "Add a README"
5. Click **Create repository**

---

## Step 3 — Upload your files
1. On the new repo page, click **uploading an existing file**
2. Drag and drop ALL files from your `younglife-sacramento` folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `data.js`
   - `config.js`
3. Click **Commit changes**

---

## Step 4 — Enable GitHub Pages
1. Click **Settings** (tab at the top of your repo)
2. Click **Pages** in the left sidebar
3. Under "Branch", select **main** and click **Save**
4. Wait 1-2 minutes

---

## Step 5 — Get your live URL
Your map will be live at:
`https://YOUR-GITHUB-USERNAME.github.io/younglife-sacramento/`

Share this link with donors and stakeholders — no login required.

---

## Updating the map later
When you want to change data or add schools:
1. Edit `data.js` on your computer
2. Go to your GitHub repo → click `data.js` → click the pencil icon
3. Paste the updated content → click **Commit changes**
4. The live map updates within 1 minute

---

## Setting up Google Sheets sync (optional — live updates without touching code)

1. Create a Google Sheet with these column headers in row 1:
   `id, name, shortName, type, status, lat, lng, district, grades, address, enrollment, frpm, attendance, hispanic, asian, black, white, other, ela, math, englishLearners, specialEd, medianIncome`

2. Fill in your school data (copy from data.js as a starting point)

3. In Google Sheets: **File → Share → Publish to web**
   - Choose: Entire Document / Comma-separated values (.csv)
   - Click **Publish** → copy the URL

4. Open `config.js` and paste the URL:
   ```
   const SHEETS_URL = "https://docs.google.com/spreadsheets/d/YOUR-ID/pub?output=csv";
   ```

5. Save and upload `config.js` to GitHub

Now anyone on your team can update school data directly in the Google Sheet and the map refreshes automatically.
