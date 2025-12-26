import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 1. Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Registers the SW from the public directory (served at root /)
    navigator.serviceWorker
      .register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('SW registered with scope: ', registration.scope);
      })
      .catch((err) => {
        console.error('SW registration failed:', err.message, err);
      });
  });
}

console.log("VITE_BUILD_CHECK: SRC/INDEX_LOADED");

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);