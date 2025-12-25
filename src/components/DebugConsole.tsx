import React, { useEffect, useState } from 'react';

export default function DebugConsole() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // 1. Load existing logs from storage immediately
    const saved = localStorage.getItem('onyx_debug_logs');
    if (saved) {
        try {
            setLogs(JSON.parse(saved));
        } catch(e) {}
    }

    // 2. Override console methods to capture new logs
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
      // Create log string
      const msg = args.map(a => {
        try {
           return (typeof a === 'object' ? JSON.stringify(a) : String(a));
        } catch (e) { return '[Circular]'; }
      }).join(' ');
      
      const newLog = `[LOG] ${new Date().toLocaleTimeString()}: ${msg}`;
      
      // Update state wrapper
      setLogs(prev => {
        const updated = [...prev, newLog].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(updated));
        return updated;
      });
      originalLog.apply(console, args);
    };

    console.error = (...args) => {
      const msg = args.map(a => {
        try {
           return (typeof a === 'object' ? JSON.stringify(a) : String(a));
        } catch (e) { return '[Circular]'; }
      }).join(' ');

      const newLog = `[ERR] ${new Date().toLocaleTimeString()}: ${msg}`;
      setLogs(prev => {
        const updated = [...prev, newLog].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(updated));
        return updated;
      });
      originalError.apply(console, args);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: '300px',
      backgroundColor: 'rgba(50, 0, 0, 0.95)', color: '#0f0',
      zIndex: 9999999, overflowY: 'scroll', padding: '10px',
      borderTop: '2px solid red', fontSize: '12px', fontFamily: 'monospace',
      pointerEvents: 'auto'
    }}>
      <div style={{borderBottom: '1px solid #444', marginBottom: '5px', display:'flex', justifyContent:'space-between'}}>
        <strong>ONYX SYSTEM LOGS</strong>
        <button onClick={() => {localStorage.removeItem('onyx_debug_logs'); setLogs([]);}} style={{marginLeft: '10px', background: 'red', color: 'white', border: 'none', padding: '2px 8px'}}>CLEAR</button>
      </div>
      {logs.map((l, i) => <div key={i} style={{borderBottom:'1px solid #333'}}>{l}</div>)}
    </div>
  );
}