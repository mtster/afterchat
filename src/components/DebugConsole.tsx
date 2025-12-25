import React, { useState, useEffect, useRef } from 'react';

type Log = {
  timestamp: string;
  type: 'log' | 'error' | 'warn' | 'info';
  messages: string[];
};

const MAX_LOGS = 50;
const STORAGE_KEY = 'onyx_debug_logs';

const DebugConsole: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Load existing logs from storage on mount
    try {
      const savedLogs = localStorage.getItem(STORAGE_KEY);
      if (savedLogs) {
        setLogs(JSON.parse(savedLogs));
      }
    } catch (e) {
      console.error("Failed to load logs from localStorage", e);
    }

    // 2. Override console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const addLog = (type: Log['type'], args: any[]) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + new Date().getMilliseconds();
      
      const messages = args.map(arg => {
        try {
          if (typeof arg === 'object') {
             return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        } catch (e) {
          return '[Circular/Unserializable]';
        }
      });

      const newLog: Log = { timestamp, type, messages };

      setLogs(prev => {
        const updated = [...prev, newLog].slice(-MAX_LOGS);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch(e) {
            // Storage might be full
        }
        return updated;
      });
    };

    console.log = (...args) => {
      originalLog.apply(console, args);
      addLog('log', args);
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      addLog('error', args);
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      addLog('warn', args);
    };
    
    console.info = (...args) => {
        originalInfo.apply(console, args);
        addLog('info', args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollTop = bottomRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem(STORAGE_KEY);
    console.log("Logs cleared manually.");
  };

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '300px',
        backgroundColor: 'rgba(0,0,0,0.95)',
        color: '#00FF00',
        fontFamily: 'monospace',
        fontSize: '11px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        borderTop: '2px solid #00FF00',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
        pointerEvents: 'auto'
      }}
    >
      <div style={{ 
        padding: '8px', 
        background: '#111', 
        borderBottom: '1px solid #333', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        fontWeight: 'bold'
      }}>
        <span>DEBUG CONSOLE</span>
        <button 
            onClick={clearLogs} 
            style={{ 
                background: '#333', 
                color: '#fff', 
                border: '1px solid #555', 
                padding: '4px 12px', 
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '10px'
            }}
        >
            CLEAR LOGS
        </button>
      </div>
      
      <div 
        ref={bottomRef}
        style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px',
            wordBreak: 'break-word'
        }}
      >
        {logs.map((log, i) => (
            <div key={i} style={{ marginBottom: '6px', borderBottom: '1px solid #1a1a1a', paddingBottom: '4px' }}>
            <span style={{ color: '#666', marginRight: '6px', fontSize: '10px' }}>[{log.timestamp}]</span>
            <span style={{ 
                color: log.type === 'error' ? '#FF5555' : log.type === 'warn' ? '#FFFF55' : '#00FF00',
                fontWeight: 'bold',
                marginRight: '6px',
                textTransform: 'uppercase'
            }}>
                {log.type}:
            </span>
            {log.messages.map((msg, j) => (
                <span key={j} style={{ whiteSpace: 'pre-wrap' }}>{msg} </span>
            ))}
            </div>
        ))}
      </div>
    </div>
  );
};

export default DebugConsole;