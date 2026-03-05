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

## Push to GitHub & Deploy to Vercel

### Push to GitHub

1. **Create a repo on GitHub** (if you don’t have one): [github.com/new](https://github.com/new). Don’t add a README if the project already has one.

2. **Add GitHub as `origin`** (only if you haven’t already):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   ```
   Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "Your commit message"
   git push -u origin main
   ```
   If your default branch is `master`, use `git push -u origin master` instead.

### Deploy to Vercel

1. **Sign in:** Go to [vercel.com](https://vercel.com) and sign in (GitHub login is easiest).

2. **Import the project:**
   - Click **Add New…** → **Project**.
   - Select **Import Git Repository** and choose your GitHub repo (e.g. `donegrading`).
   - Vercel will detect the Vite app and use the included `vercel.json` settings.

3. **Environment variables:** In the import screen (or later in **Settings → Environment Variables**), add:
   - **Name:** `VITE_GEMINI_API_KEY`  
   - **Value:** your Gemini API key  
   So the built app can call the Gemini API.

4. **Deploy:** Click **Deploy**. Vercel will run `npm run build` and serve the `dist` folder. Each push to `main` will trigger a new deployment.

**Preview URLs:** Every branch and pull request gets a unique preview URL. Production uses the URL Vercel assigns (e.g. `your-project.vercel.app`) or your custom domain.

---

## Mobile App (iOS & Android)

The project is set up with **Capacitor** so you can build and run native iOS and Android apps. See **[MOBILE.md](MOBILE.md)** for:

- Building and syncing to native projects
- Opening the app in Android Studio or Xcode
- Adding your API key for mobile builds
- Adding the iOS platform (requires CocoaPods on Mac)
