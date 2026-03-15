import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Production: serve from dist/ (Vite output). Local dev: serve from project root.
const distDir = path.join(__dirname, 'dist');
const staticDir = existsSync(distDir) ? distDir : __dirname;

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

const port = parseInt(process.env.PORT || '8080', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
}).on('error', (err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
