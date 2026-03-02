<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally and **as a mobile app** (iOS & Android).

View your app in AI Studio: https://ai.studio/apps/4f5b250b-1758-4177-8df6-40c514634046

## Run Locally (Web)

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set your Gemini API key: copy `.env.example` to `.env.local` and set `VITE_GEMINI_API_KEY` (get a key from [Google AI Studio](https://aistudio.google.com/apikey)).
3. Run the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173.

## Mobile App (iOS & Android)

The project is set up with **Capacitor** so you can build and run native iOS and Android apps. See **[MOBILE.md](MOBILE.md)** for:

- Building and syncing to native projects
- Opening the app in Android Studio or Xcode
- Adding your API key for mobile builds
- Adding the iOS platform (requires CocoaPods on Mac)
