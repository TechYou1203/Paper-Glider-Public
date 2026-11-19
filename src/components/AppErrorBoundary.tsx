import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

/**
 * Last line of defence for the UI. A render error in one screen must not leave
 * a pilot staring at a blank page while their flight state is still safe.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Paper Glider UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#fffef9] p-6 font-sans text-[#2d2a26]">
          <div className="w-full max-w-md text-center bg-white border-2 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-6">
            <div className="w-14 h-14 mx-auto mb-3 bg-[#fef08a] border-2 border-[#2d2a26] rounded-2xl flex items-center justify-center text-2xl shadow-[3px_3px_0px_#2d2a26]">
              ✈️
            </div>
            <h1 className="font-title text-2xl font-extrabold mb-2">Flight deck hit turbulence</h1>
            <p className="text-sm text-[#64748b] mb-4">
              Your saved progress is safe. Reload to get back to the runway.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="font-sketch font-black text-sm bg-[#fde047] hover:bg-[#facc15] px-4 py-2 rounded-xl border-2 border-[#2d2a26] shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              Reload Game
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
