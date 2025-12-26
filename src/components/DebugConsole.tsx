import React, { useEffect, useState } from 'react';

export default function DebugConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    // 1. Recover logs from localStorage (Vital for iOS reload debugging)
    const saved = localStorage.getItem('onyx_debug_logs');
    if (saved) {
      try {
        setLogs(JSON.parse(saved));
      } catch (e) {
        console.warn("Failed to parse saved logs");
      }
    }

    // 2. Hijack console.log
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog.apply(console, args);
      
      const msg = args.map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
        catch (e) { return '[Circular]'; }
      }).join(' ');
      
      const logLine = `[LOG] ${new Date().toLocaleTimeString().split(' ')[0]}: ${msg}`;
      
      setLogs(prev => {
        const next = [...prev, logLine].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(next));
        return next;
      });
    };

    // 3. Hijack console.error
    const originalError = console.error;
    console.error = (...args) => {
      originalError.apply(console, args);
      
      const msg = args.map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
        catch (e) { return '[Circular]'; }
      }).join(' ');

      const logLine = `[ERR] ${new Date().toLocaleTimeString().split(' ')[0]}: ${msg}`;
      
      setLogs(prev => {
        const next = [...prev, logLine].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(next));
        return next;
      });
    };

    return () => {
        // We typically don't restore in this debug mode to keep capturing
    };
  }, []);

  if (minimized) {
    return (
        <button 
            onClick={() => setMinimized(false)}
            style={{
                position: 'fixed', bottom: 10, right: 10, zIndex: 99999,
                background: 'red', color: 'white', border: '1px solid white', padding: '5px'
            }}
        >
            DEBUG
        </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100vw',
      height: '30vh',
      zIndex: 99999,
      backgroundColor: 'rgba(20, 0, 0, 0.95)',
      color: '#00ff00',
      fontSize: '12px',
      overflowY: 'scroll',
      pointerEvents: 'all',
      borderTop: '2px solid red',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
          padding: '5px', background: '#300', display: 'flex', justifyContent: 'space-between', 
          borderBottom: '1px solid #f00', position: 'sticky', top: 0
      }}>
          <strong>ONYX DIAGNOSTIC</strong>
          <div>
            <button onClick={() => { localStorage.removeItem('onyx_debug_logs'); setLogs([]); }} style={{marginRight: 10, color: 'white'}}>CLEAR</button>
            <button onClick={() => setMinimized(true)} style={{color: 'white'}}>MIN</button>
          </div>
      </div>
      <div style={{padding: '5px'}}>
        {logs.map((log, i) => (
            <div key={i} style={{marginBottom: '2px', borderBottom: '1px solid #330'}}>
                {log}
            </div>
        ))}
      </div>
    </div>
  );
}