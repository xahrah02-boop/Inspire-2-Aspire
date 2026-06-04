# Deploy With Google Sheets, Apps Script, and GitHub Pages

This version can be run as:

- Frontend: static files in `public/`, hosted on GitHub Pages.
- Backend: Google Apps Script web app.
- Database: Google Sheets.

## 1. Create Google Sheet Backend

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**.
3. Copy `apps-script/Code.gs` into Apps Script.
4. Run `setupDatabase()` once.
5. Deploy as **Web app**.
6. Use:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the Web App URL.

## 2. Configure Frontend API URL

Edit `public/config.js`:

```js
window.FORGE_HR_CONFIG = {
  apiBaseUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?path="
};
```

When running locally with the Node server, leave `apiBaseUrl` empty.

## 3. Deploy Frontend to GitHub Pages

Create a GitHub repository and upload the remaining frontend files to GitHub. For GitHub Pages, the minimum files are the contents of `public/`.

Recommended GitHub Pages settings:

- Source: Deploy from branch
- Branch: `main`
- Folder: `/root` if `public/` contents are copied to repository root
- Or `/docs` if you copy `public/` contents into a `docs/` folder

The important files for GitHub Pages are:

- `index.html`
- `app.js`
- `styles.css`
- `config.js`

Do not upload Apps Script files into the GitHub Pages site unless you only want them stored as source code. The live backend file belongs in Apps Script as `Code.gs`.

## 4. Demo Login

After running `setupDatabase()`, the Apps Script backend creates demo users:

- `hr.admin@company.test`
- `grace.manager@company.test`
- `john.operator@company.test`

Password:

```text
Password123!
```

## Notes

This Apps Script backend is a prototype backend for Google Sheets. It stores simple demo passwords in the sheet to keep setup straightforward. For production, use Google Workspace identity, stricter authorization, and stronger credential handling.
