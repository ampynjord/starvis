import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { error: Error; onRetry?: () => void; }

export function ErrorState({ error, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="text-red-500" size={32} />
      <div>
        <p className="font-orbitron text-red-400 text-sm tracking-widest uppercase">Network error</p>
        <p className="text-xs text-slate-600 mt-1 max-w-sm">{error.message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="sci-btn-primary flex items-center gap-2">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}
