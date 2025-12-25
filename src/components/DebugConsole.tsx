import React, { useEffect, useState } from 'react';

export default function DebugConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // 1. Load existing logs
    const saved = localStorage.getItem('onyx_debug_logs');
    if (saved) {
        try {
            setLogs(JSON.parse(saved));
        } catch(e) {}
    }

    // 2. Override console methods
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
      const msg = args.map(a => {
        try { return (typeof a === 'object' ? JSON.stringify(a) : String(a)); } 
        catch (e) { return '[Circular]'; }
      }).join(' ');
      
      const newLog = `[LOG] ${new Date().toLocaleTimeString()}: ${msg}`;
      
      setLogs(prev => {
        const updated = [...prev, newLog].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(updated));
        return updated;
      });
      originalLog.apply(console, args);
    };

    console.error = (...args) => {
      const msg = args.map(a => {
        try { return (typeof a === 'object' ? JSON.stringify(a) : String(a)); } 
        catch (e) { return '[Circular]'; }
      }).join(' ');

      const newLog = `[ERR] ${new Date().toLocaleTimeString()}: ${msg}`;
      setLogs(prev => {
        const updated = [...prev, newLog].slice(-50);
        localStorage.setItem('onyx_debug_logs', JSON.stringify(updated));
        return updated;
      });
      originalError.apply(console, args);
    };

    return () => {
        // Optional: restore console if needed, but for this app we want it persistent
    };
  }, []);

  const handleSystemReset = () => {
      if(window.confirm("RESET SYSTEM? This clears logs and storage.")) {
          localStorage.clear();
          sessionStorage.clear();
          window.location.reload();
      }
  };

  if (!isVisible) {
      return (
          <button 
            onClick={() => setIsVisible(true)}
            style={{
                position: 'fixed', bottom: '10px', right: '10px', 
                zIndex: 2147483647, background: 'red', color: 'white', padding: '5px'
            }}
          >
              SHOW DEBUG
          </button>
      );
  }

  return (
    <div style={{
      position: 'fixed', 
      bottom: 0, 
      left: 0, 
      right: 0, 
      height: '300px',
      backgroundColor: 'rgba(30, 0, 0, 0.95)', 
      color: '#0f0',
      zIndex: 2147483647, 
      overflowY: 'scroll', 
      padding: '10px',
      borderTop: '2px solid red', 
      fontSize: '11px', 
      fontFamily: 'monospace',
      pointerEvents: 'auto'
    }}>
      <div style={{
          borderBottom: '1px solid #444', 
          marginBottom: '5px', 
          display:'flex', 
          justifyContent:'space-between',
          position: 'sticky',
          top: 0,
          background: 'rgba(30,0,0,1)'
      }}>
        <strong>ONYX DEBUGGER (SRC)</strong>
        <div style={{display:'flex', gap:'10px'}}>
            <button onClick={() => setIsVisible(false)} style={{background: '#444', color:'white', border:'none', padding:'2px 5px'}}>HIDE</button>
            <button onClick={() => {localStorage.removeItem('onyx_debug_logs'); setLogs([]);}} style={{background: 'orange', color: 'black', border: 'none', padding: '2px 5px'}}>CLEAR LOGS</button>
            <button onClick={handleSystemReset} style={{background: 'red', color: 'white', border: 'none', padding: '2px 5px'}}>SYSTEM RESET</button>
        </div>
      </div>
      {logs.map((l, i) => <div key={i} style={{borderBottom:'1px solid #222', padding:'2px 0'}}>{l}</div>)}
    </div>
  );
}