import React, { useEffect, useState } from 'react';

export default function DebugConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    // 1. Recover logs
    const saved = localStorage.getItem('rooms_debug_logs');
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
        const next = [...prev, logLine].slice(-100);
        localStorage.setItem('rooms_debug_logs', JSON.stringify(next));
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
        const next = [...prev, logLine].slice(-100);
        localStorage.setItem('rooms_debug_logs', JSON.stringify(next));
        return next;
      });
    };

    return () => {};
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    alert("Logs Copied to Clipboard!");
  };

  const handleClear = () => {
    localStorage.removeItem('rooms_debug_logs');
    setLogs([]);
  };

  if (minimized) {
    return (
        <button 
            onClick={() => setMinimized(false)}
            style={{
                position: 'fixed', 
                bottom: 20, 
                right: 20, 
                zIndex: 99999,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.8)', 
                color: '#0f0', 
                border: '1px solid #0f0', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                cursor: 'pointer'
            }}
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6"/>
            </svg>
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
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      color: '#0f0',
      fontSize: '12px',
      overflowY: 'scroll',
      pointerEvents: 'all',
      borderTop: '2px solid #0f0',
      fontFamily: '"Courier New", Courier, monospace',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 -4px 20px rgba(0, 255, 0, 0.2)'
    }}>
      <div style={{
          padding: '8px', 
          background: '#001100', 
          display: 'flex', 
          justifyContent: 'space-between', 
          borderBottom: '1px solid #0f0', 
          position: 'sticky', 
          top: 0
      }}>
          <strong style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>:: SYSTEM DIAGNOSTIC ::</strong>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleCopy} style={{
                background: '#003300', color: '#0f0', border: '1px solid #0f0', padding: '2px 8px', cursor: 'pointer'
            }}>COPY</button>
            <button onClick={handleClear} style={{
                background: '#003300', color: '#0f0', border: '1px solid #0f0', padding: '2px 8px', cursor: 'pointer'
            }}>CLR</button>
            <button onClick={() => setMinimized(true)} style={{
                background: 'black', color: '#0f0', border: '1px solid #0f0', padding: '2px 8px', cursor: 'pointer'
            }}>_</button>
          </div>
      </div>
      <div style={{padding: '10px'}}>
        {logs.map((log, i) => (
            <div key={i} style={{
                marginBottom: '4px', 
                borderBottom: '1px solid rgba(0, 255, 0, 0.2)',
                wordBreak: 'break-all'
            }}>
                {log.startsWith('[ERR]') ? <span style={{color: '#ff3333'}}>{log}</span> : log}
            </div>
        ))}
      </div>
    </div>
  );
}
