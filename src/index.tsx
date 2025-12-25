import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary';
import { DebugConsole } from './components/DebugConsole';

// 1. Dynamic Safe Area Meta Tag for iPhone X+
const meta = document.createElement('meta');
meta.name = "viewport";
meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
document.getElementsByTagName('head')[0].appendChild(meta);

// 2. Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration.scope);
      })
      .catch((err) => {
        console.log('SW registration failed: ', err);
      });
  });
}

// 3. Initial Log for Debugger
console.log("--- APP STARTED / RELOADED ---");
console.log("User Agent:", navigator.userAgent);
console.log("Window Location:", window.location.href);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <DebugConsole />
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);