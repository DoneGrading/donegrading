import './global.css';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { checkEnv } from './lib/envCheck';
import { initSentry } from './lib/sentry';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';

checkEnv();
initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
