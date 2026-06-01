'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Bug, CheckCircle, Clock, GitMerge, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';

type BugReport = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_STYLES: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  open: { label: 'Open', icon: <AlertCircle size={11} />, cls: 'text-amber-400 bg-amber-950/30 border-amber-700/40' },
  in_progress: { label: 'In progress', icon: <Clock size={11} />, cls: 'text-cyan-400 bg-cyan-950/30 border-cyan-700/40' },
  resolved: { label: 'Resolved', icon: <CheckCircle size={11} />, cls: 'text-green-400 bg-green-950/30 border-green-700/40' },
  closed: { label: 'Closed', icon: <XCircle size={11} />, cls: 'text-slate-400 bg-slate-800/30 border-slate-600/40' },
  duplicate: { label: 'Duplicate', icon: <GitMerge size={11} />, cls: 'text-violet-300 bg-violet-950/30 border-violet-700/40' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[10px] font-mono-sc ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

async function fetchMyReports(page: number) {
  const res = await fetch(`/api/bug-reports?page=${page}&limit=10`);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function MyReportsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-bug-reports', page],
    queryFn: () => fetchMyReports(page),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <PageHeader title="My reports" subtitle="Your submitted bug reports." />
        <div className="sci-panel p-8 text-center">
          <p className="text-slate-500 font-rajdhani">You must be logged in to view your reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHeader title="My reports" subtitle="Track the status of your submitted bug reports." />

      <div className="sci-panel divide-y divide-border">
        {isLoading && (
          <div className="p-8 text-center text-slate-500 font-rajdhani text-sm">Loading…</div>
        )}
        {isError && (
          <div className="p-8 text-center text-red-400 font-rajdhani text-sm">Failed to load reports.</div>
        )}
        {data?.data?.length === 0 && (
          <div className="p-8 text-center">
            <Bug size={28} className="mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500 font-rajdhani text-sm">No reports yet.</p>
            <a href="/report-bug" className="text-cyan-500 hover:text-cyan-300 text-xs font-mono-sc mt-2 inline-block">
              Submit your first report →
            </a>
          </div>
        )}
        {data?.data?.map((r: BugReport) => (
          <div key={r.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">
                <span className="text-slate-600 font-mono-sc text-xs mr-2">#{r.id}</span>
                {r.title}
              </p>
              <p className="text-[10px] font-mono-sc text-slate-600 mt-0.5">
                {new Date(r.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="py-1 px-3 text-xs font-mono-sc text-slate-400 border border-slate-700 hover:border-slate-500 rounded-sm disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-xs font-mono-sc text-slate-500">{page} / {data.pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
            className="py-1 px-3 text-xs font-mono-sc text-slate-400 border border-slate-700 hover:border-slate-500 rounded-sm disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
