# Handy Dandy Tools - Setup Guide

## 🎉 Now Using Google Drive API!

Your application has been upgraded to use **Google Drive API** instead of Firebase. This means:

- ✅ **100% Free** - No costs ever
- ✅ **Open Source** - Uses Google's official APIs
- ✅ **Your Data** - Everything saves to your Google Drive
- ✅ **Privacy** - You control your data
- ✅ **No Backend** - Runs entirely in the browser

## 📋 Setup Instructions

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Create a new project (or select an existing one)
3. Name it something like "Handy Dandy Tools"

### Step 2: Enable Google Drive API

1. In your project, go to **APIs & Services** > **Library**
2. Search for "Google Drive API"
3. Click on it and press **Enable**

### Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the consent screen:
   - User Type: **External**
   - App name: **Handy Dandy Tools**
   - User support email: (your email)
   - Developer contact: (your email)
   - Save and continue (you can skip Scopes)
   - **Test Users**: Click "Add Users" and add your own email address (IMPORTANT!)
   - Save and continue
4. Back in Credentials, click **Create Credentials** > **OAuth client ID**
5. Application type: **Web application**
6. Name: **Handy Dandy Tools**
8. Add Authorized JavaScript origins:
   - `http://localhost:8000` (for local development)
   - `https://handydandytools.netlify.app` (or your actual production domain)
9. Add Authorized redirect URIs:
   - `https://handydandytools.netlify.app`
   - `https://handydandytools.netlify.app/`
10. Click **Create**
11. Copy the **Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)

### Step 4: Configure Your Application

Open `index.html` and find line ~863:

```javascript
const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com";
```

Replace `YOUR_CLIENT_ID_HERE` with your actual Client ID.

### Step 5: Run the Application

The server is already running at http://localhost:8000

Just refresh the page after updating the Client ID!

## 🚀 How It Works

1. **Sign In**: Click "Sign in with Google" in the sidebar
2. **Grant Permission**: Allow the app to store files in your Google Drive
3. **Create Worksheets**: Organize your links into worksheets (Work, Personal, etc.)
4. **Add Links**: Add URLs to each worksheet
5. **Auto-Save**: Everything saves automatically to a hidden file in your Google Drive

## 📁 Data Storage

Your data is stored in a file called `handy_dandy_tools_data.json` in Google Drive's `appDataFolder`. This is a special hidden folder that only your app can access - you won't see it in your regular Drive files.

## 🔒 Security & Privacy

- All data is stored in YOUR Google Drive
- Only you can access it
- The app only requests Drive permissions (nothing else)
- You can revoke access anytime from your Google Account settings
- No data is sent to any third-party servers

## 🎨 Features

- ✨ Multiple worksheets to organize links
- 🔗 Add any URL quickly
- 🎯 Click to open in iframe
- ✏️ Rename worksheets
- 🗑️ Delete worksheets or individual links
- 💾 Auto-save to Google Drive
- 📱 Responsive design
- 🌙 Beautiful dark theme

## 💡 Tips

- Each worksheet can have unlimited links
- Links auto-format URLs (adds https:// if missing)
- Use the sidebar toggle (☰) to hide/show the sidebar
- On mobile, sidebar is collapsed by default

## 🆘 Troubleshooting

**"Failed to sign in"**
- Make sure you've added http://localhost:8000 to Authorized JavaScript origins
- Try using Incognito mode to avoid cached credentials
- Check the browser console for detailed errors

**"Failed to save data"**
- Make sure Google Drive API is enabled in your Cloud Console
- Check that you granted all requested permissions
- Try signing out and signing in again

**Can't see my data on other devices**
- Data is tied to your Google account
- Sign in with the same account on all devices
- Make sure you granted Drive permissions

Enjoy your new open-source, Google Drive-powered link manager! 🎉
