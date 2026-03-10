// Log immediately so Cloud Run logs show we started (helps debug container startup)
console.error('[server] Starting server.js');

import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.error('[server] __dirname=', __dirname);

const app = express();

// Production: serve from dist/ (Vite output). Local dev: serve from project root.
const distDir = path.join(__dirname, 'dist');
const isProd = process.env.NODE_ENV === 'production' || process.env.K_SERVICE != null;
if (isProd && !existsSync(distDir)) {
  console.error('FATAL: dist/ missing in production. Build may have failed.');
  process.exit(1);
}
const staticDir = existsSync(distDir) ? distDir : __dirname;
console.error('[server] staticDir=', staticDir, 'distExists=', existsSync(distDir));

// Cloud Run / App Hosting readiness probe – respond before any heavy middleware
app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.use(express.static(staticDir));

// Rewrite /Privacy-Policy and /Terms-of-Service to their .html files (matches firebase.json)
app.get('/Privacy-Policy', (_req, res) => {
  res.sendFile(path.join(staticDir, 'Privacy-Policy.html'));
});
app.get('/Terms-of-Service', (_req, res) => {
  res.sendFile(path.join(staticDir, 'Terms-of-Service.html'));
});

// SPA: all other routes -> index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

const portEnv = process.env.PORT || '8080';
const port = parseInt(portEnv, 10) || 8080;
app.listen(port, '0.0.0.0', () => {
  console.error('[server] Listening on 0.0.0.0:' + port);
}).on('error', (err) => {
  console.error('[server] Listen failed:', err);
  process.exit(1);
});
