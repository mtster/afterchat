import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import DebugConsole from './components/DebugConsole'; 
import './index.css';

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
      .catch((err) => {
        console.error('SW registration failed: ', err);
      });
  });
}

// 3. Initial Log
console.log("--- APP BOOTSTRAP ---");

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

// Render DebugConsole OUTSIDE of App to ensure it shows even if App crashes
root.render(
  <React.StrictMode>
    <DebugConsole />
    <App />
  </React.StrictMode>
);