import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };
  public readonly props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    if (this.state.error) {
      navigator.clipboard.writeText(this.state.error.toString());
      alert('Error copied to clipboard');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-black text-white p-6 font-sans">
            <div className="max-w-md w-full bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                
                <h2 className="text-2xl font-light tracking-tight mb-2">Application Error</h2>
                <p className="text-zinc-500 text-sm mb-6">Onyx encountered a critical issue.</p>
                
                <div className="bg-black/50 rounded-lg p-4 border border-zinc-800 mb-6 overflow-auto max-h-48">
                    <code className="text-red-400 font-mono text-xs break-all">
                        {this.state.error?.toString()}
                    </code>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={this.handleReload}
                        className="flex-1 bg-white text-black font-medium py-3 rounded-xl text-sm active:scale-95 transition-transform"
                    >
                        Reload App
                    </button>
                    <button 
                        onClick={this.handleCopyError}
                        className="px-4 py-3 bg-zinc-800 text-white font-medium rounded-xl text-sm hover:bg-zinc-700 active:scale-95 transition-transform"
                    >
                        Copy Log
                    </button>
                </div>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;