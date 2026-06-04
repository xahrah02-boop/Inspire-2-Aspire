# Google Apps Script Backend

This folder contains the single Google Apps Script backend file that uses Google Sheets as the database.

## Setup

1. Create a Google Sheet.
2. Open **Extensions > Apps Script**.
3. Copy only `Code.gs` from this folder into Apps Script.
4. Run `setupDatabase()` once from Apps Script.
5. Deploy as **Web app**.
6. Set access to **Anyone**.
7. Copy the Web App URL.

## Frontend Config

In `public/config.js`, set:

```js
window.FORGE_HR_CONFIG = {
  apiBaseUrl: "YOUR_APPS_SCRIPT_WEB_APP_URL?path="
};
```

Important: this scaffold exposes demo-style authentication and stores demo passwords in the sheet for easier prototyping. For production, replace it with Google Workspace sign-in or a hardened auth layer.
