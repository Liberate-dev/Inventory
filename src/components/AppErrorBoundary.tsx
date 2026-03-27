import React from 'react';

type Props = {
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
    message: string;
};

class AppErrorBoundary extends React.Component<Props, State> {
    state: State = {
        hasError: false,
        message: ''
    };

    static getDerivedStateFromError(error: unknown): State {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga'
        };
    }

    componentDidCatch(error: unknown, info: React.ErrorInfo) {
        console.error('UI crashed:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h1 className="text-lg font-bold text-slate-900 mb-2">Terjadi Error di UI</h1>
                        <p className="text-sm text-slate-600 mb-4">
                            Aplikasi mencegah blank screen total. Anda bisa reload untuk lanjut.
                        </p>
                        <pre className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3 overflow-x-auto">
                            {this.state.message}
                        </pre>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                        >
                            Reload
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;

