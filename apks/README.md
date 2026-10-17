# SMM PRO Android APKs

This folder contains standalone installable Android APKs for both portals of the **Bulletproof Script Management System (SMM PRO)**.

---

## 📱 Available APK Files

| App | Package Name | APK File | Target URL | Description |
|---|---|---|---|---|
| **SMM PRO (Agency / Team)** | `com.bulletproof.smmpro` | [`SMM_PRO_Agency.apk`](./SMM_PRO_Agency.apk) | `https://smm-pro-nayankotadiya.vercel.app` | Internal agency workflow portal for Super Admins, Managers, Script Writers, Shooters, Editors, and SMMs. |
| **SMM PRO Client Portal** | `com.bulletproof.smmpro.portal` | [`SMM_PRO_Client_Portal.apk`](./SMM_PRO_Client_Portal.apk) | `https://smm-client-portal.vercel.app` | Dedicated portal for clients to review scripts, preview videos with timestamped feedback, approve edits, chat, and submit briefs. |

---

## 🚀 How to Install on Android

1. **Transfer the APK to your phone**:
   - Send via WhatsApp / Telegram, email, Google Drive, or transfer via USB cable to your Android phone.
2. **Open the APK**:
   - Tap on `SMM_PRO_Agency.apk` or `SMM_PRO_Client_Portal.apk` in your phone's File Manager / Downloads.
3. **Allow Installation from Unknown Sources**:
   - If prompted by Android: tap **Settings** ➔ Toggle on **Allow from this source** ➔ Tap **Install**.
4. **Launch**:
   - The app icon will appear on your home screen and app drawer with the official Bulletproof logo.

---

## ⚙️ Features Included in Both Apps

- **Native Edge-to-Edge Experience**: Status bar and navigation bar tailored to the SMM PRO dark aesthetic (`#0F172A`).
- **File & Media Picker (`onShowFileChooser`)**: Select and upload raw videos, photos, scripts, and documents directly from device storage or live camera.
- **Video Review & Playback**: Unrestricted media playback for client and editor video version reviews.
- **Integrated Download Manager**: Automatically routes reel exports, PDFs, and client reports to Android's native Downloads folder with system progress notifications.
- **Hardware Back-Button Support**: Intelligently traverses web navigation history, preventing accidental app exits.
- **Offline / Disconnect Fallback**: Displays an integrated reconnect screen with a single-tap **Retry Connection** button.
- **Camera & Mic Permissions**: Configured with dynamic runtime permission requests for in-app media recording.

---

## 🛠️ Rebuilding from Source

The full native Android source code for both apps is located in:
- `android-apps/smm-pro-agency`
- `android-apps/smm-pro-portal`

To rebuild debug APKs:
```powershell
# SMM PRO Agency
cd android-apps/smm-pro-agency
.\gradlew.bat assembleDebug

# SMM PRO Client Portal
cd ../smm-pro-portal
.\gradlew.bat assembleDebug
```
Output files will be generated under `app/build/outputs/apk/debug/`.
