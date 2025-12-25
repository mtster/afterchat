import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  // Defined state as a class property to satisfy TS
  public state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '24px', 
          backgroundColor: '#991b1b', /* Red-800 */
          color: '#ffffff', 
          height: '100vh', 
          width: '100vw',
          overflow: 'auto',
          fontFamily: 'monospace',
          boxSizing: 'border-box'
        }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 'bold' }}>Something went wrong</h3>
          <p>The application crashed before it could load.</p>
          
          <div style={{ marginTop: '20px' }}>
            <strong>Error Message:</strong>
            <pre style={{ 
              backgroundColor: '#000000', 
              padding: '16px', 
              marginTop: '8px', 
              borderRadius: '8px', 
              whiteSpace: 'pre-wrap',
              border: '1px solid #ef4444' 
            }}>
              {this.state.error?.message}
            </pre>
          </div>

          <div style={{ marginTop: '20px' }}>
             <strong>Troubleshooting:</strong>
             <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginTop: '8px' }}>
               <li>Check the console (F12) for "Firebase Config Check" logs.</li>
               <li>Verify Vercel Environment Variables are set correctly.</li>
               <li>Ensure environment variables start with <code>VITE_</code>.</li>
             </ul>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;