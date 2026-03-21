# DoneGrading → Mobile App

Your AI Studio app is set up to run as a **native mobile app** on iOS and Android using **Capacitor**. The same React code runs in a native shell with access to the device camera, storage, and app stores.

## What’s in place

- **Vite + React** build so the app compiles to a single bundle.
- **Capacitor** so the built app runs inside a native iOS/Android project.
- **Android** platform added under `android/`. **iOS** can be added once CocoaPods is installed (see below).

## Run in the browser (development)

```bash
npm install
cp .env.example .env.local   # then add your VITE_GEMINI_API_KEY
npm run dev
```

Open http://localhost:5173.

## Build and run on a device / simulator

### 1. Set your Gemini API key

Create `.env.local` in the project root:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). Do not commit `.env.local`.

### 2. Build the web app and sync to native projects

```bash
npm run build
npx cap sync
```

Or use the shortcut:

```bash
npm run cap:sync
```

### 3. Open and run the native app

**Android** (requires [Android Studio](https://developer.android.com/studio) and SDK):

```bash
npm run cap:open:android
```

Then run the app from Android Studio (device or emulator).

**iOS** (Mac only, requires Xcode and CocoaPods):

1. Install CocoaPods if needed:
   ```bash
   brew install cocoapods
   ```
2. Add the iOS platform (one-time):
   ```bash
   npx cap add ios
   ```
3. Open in Xcode and run:
   ```bash
   npm run cap:open:ios
   ```
4. In Xcode, open `ios/App/App/Info.plist` and add a **Camera Usage Description** (e.g. “DoneGrading uses the camera to scan student work and rubrics”) so the app can request camera permission.

## After changing your React/TS code

1. Rebuild and sync:
   ```bash
   npm run cap:sync
   ```
2. Run the app again from Android Studio or Xcode (or use “Run” in the IDE).

## Summary

| Goal                    | Command / step                               |
| ----------------------- | -------------------------------------------- |
| Dev in browser          | `npm run dev`                                |
| Build web output        | `npm run build`                              |
| Sync to native projects | `npm run cap:sync` or `npx cap sync`         |
| Open Android project    | `npm run cap:open:android`                   |
| Open iOS project        | `npm run cap:open:ios` (after `cap add ios`) |
| API key                 | `VITE_GEMINI_API_KEY` in `.env.local`        |

You can keep developing in this repo and deploy the same code as a **web app** (e.g. Vite build + your server) and as **iOS/Android apps** via Capacitor.
