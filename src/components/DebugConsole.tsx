import React, { useEffect, useState } from 'react';

export const DebugConsole = () => {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // 1. Load existing logs from storage immediately
    const saved = localStorage.getItem('onyx_debug_logs');
    if (saved) {
        try {
            setLogs(JSON.parse(saved));
        } catch (e) {
            console.warn("Failed to parse logs");
        }
    }

    // 2. Override console methods to capture new logs
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
      const msg = args.map(a => {
          try {
              return (typeof a === 'object' ? JSON.stringify(a) : String(a));
          } catch(e) {
              return "[Circular]";
          }
      }).join(' ');
      
      const newLog = `[LOG] ${new Date().toLocaleTimeString()}: ${msg}`;
      setLogs(prev => {
        const updated = [...prev, newLog].slice(-50); // Keep last 50
        localStorage.setItem('onyx_debug_logs', JSON.stringify(updated));
        return updated;
      });
      originalLog(...args);
    };

    console.error = (...args) => {
      const msg = args.map(a => {
          try {
              return (typeof a === 'object' ? JSON.stringify(a) : String(a));
          } catch(e) {
              return "[Circular]";
          }
      }).join(' ');

      const newLog = `[ERR] ${new Date().toLocaleTimeString()}: ${msg}`;
      setLogs(prev => {
        const updated = [...prev, newLog].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(updated));
        return updated;
      });
      originalError(...args);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '100%',
      height: '300px',
      backgroundColor: 'rgba(20, 0, 0, 0.95)', // Dark Red tint to be visible
      color: '#00FF00',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 2147483647, // Max Z-Index
      overflowY: 'scroll',
      borderTop: '2px solid red',
      pointerEvents: 'auto', // Ensure we can click the clear button
      padding: '10px'
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
        <strong>ONYX DEBUGGER</strong>
        <button onClick={() => { localStorage.removeItem('onyx_debug_logs'); setLogs([]); }} style={{background:'red', color:'white'}}>CLEAR LOGS</button>
      </div>
      {logs.map((log, i) => (
        <div key={i} style={{ borderBottom: '1px solid #333' }}>{log}</div>
      ))}
    </div>
  );
};