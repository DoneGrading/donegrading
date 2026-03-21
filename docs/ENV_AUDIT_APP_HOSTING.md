# App Hosting environment variables – audit

## Current (Firebase Console)

| Variable                          | Status |
| --------------------------------- | ------ |
| VITE_GEMINI_API_KEY               | ✓ Set  |
| VITE_FIREBASE_API_KEY             | ✓ Set  |
| VITE_FIREBASE_PROJECT_ID          | ✓ Set  |
| VITE_FIREBASE_AUTH_DOMAIN         | ✓ Set  |
| VITE_FIREBASE_STORAGE_BUCKET      | ✓ Set  |
| VITE_FIREBASE_MESSAGING_SENDER_ID | ✓ Set  |
| VITE_FIREBASE_APP_ID              | ✓ Set  |

## Missing (add in Console → App Hosting → Settings → Environment)

| Variable                  | Required? | Purpose                                                                                                                                                                                                                               |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VITE_GOOGLE_CLIENT_ID** | **Yes**   | Google OAuth (Sign in with Google). Without it, production uses a fallback in code; set this to your **production** OAuth client ID and add `https://app.donegrading.com` as an authorized JavaScript origin in Google Cloud Console. |
| VITE_APPLE_CLIENT_ID      | Optional  | Sign in with Apple. If unset, users see “Use Sign in with Google for now.”                                                                                                                                                            |
| VITE_SENTRY_DSN           | Optional  | Sentry error monitoring.                                                                                                                                                                                                              |

## Fix

1. **Firebase Console** → **App Hosting** → **donegrading** → **Settings** → **Environment**.
2. Click **Add new**.
3. Add:
   - **Key:** `VITE_GOOGLE_CLIENT_ID`
   - **Value:** your production Google OAuth client ID (e.g. `….apps.googleusercontent.com`).
4. In **Google Cloud Console** → APIs & Services → Credentials → that OAuth 2.0 Client ID → **Authorized JavaScript origins**, add:
   - `https://app.donegrading.com`
5. Save, then trigger a new rollout so the build picks up the new variable.

## Security (optional)

- Console env vars are visible to all project members. For API keys you can use **Cloud Secret Manager** and reference them in `apphosting.yaml` (see [Firebase docs](https://firebase.google.com/docs/app-hosting/configure#secret-parameters)).
- `VITE_*` values are still inlined into the client bundle at build time, so they remain visible in the built JS; Secret Manager mainly avoids storing them in the Console and in repo.

## Verify

- **VITE_FIREBASE_AUTH_DOMAIN** must be exactly `done-grading.firebaseapp.com` (no typo or truncation).
