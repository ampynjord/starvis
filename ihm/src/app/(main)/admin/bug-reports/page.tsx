'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bug, CheckCheck, ChevronDown, ChevronRight, Clock, ExternalLink, Loader2, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';

interface BugReport {
  id: number;
  title: string;
  description: string;
  attachments: { name: string; type: string; data: string }[];
  status: string;
  createdAt: string;
  user: { id: number; username: string; email: string };
}

const STATUS_COLORS: Record<string, string> = {
  open: 'text-red-400 bg-red-950/30 border-red-800/40',
  in_progress: 'text-amber-400 bg-amber-950/30 border-amber-800/40',
  resolved: 'text-green-400 bg-green-950/30 border-green-800/40',
  closed: 'text-slate-500 bg-slate-900 border-slate-700',
};

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

function ReportRow({ report }: { report: BugReport }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(report.status);
  const queryClient = useQueryClient();

  const { mutate: updateStatus, isPending } = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/admin/bug-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Update failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] }),
  });

  const images = report.attachments.filter((a) => a.type.startsWith('image/'));
  const otherFiles = report.attachments.filter((a) => !a.type.startsWith('image/'));

  return (
    <div className="sci-panel overflow-hidden">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="mt-0.5 shrink-0 text-slate-600">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-orbitron text-xs font-bold text-slate-300">#{report.id}</span>
            <span className="font-rajdhani text-sm text-slate-200 flex-1 min-w-0 truncate">{report.title}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-mono-sc text-[10px] text-slate-600">{report.user.username}</span>
            <span className="font-mono-sc text-[10px] text-slate-700 flex items-center gap-1">
              <Clock size={9} />
              {new Date(report.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            {report.attachments.length > 0 && (
              <span className="font-mono-sc text-[10px] text-slate-600 flex items-center gap-1">
                <Paperclip size={9} />
                {report.attachments.length}
              </span>
            )}
          </div>
        </div>
        <span className={`font-mono-sc text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm border shrink-0 ${STATUS_COLORS[report.status] ?? STATUS_COLORS.open}`}>
          {report.status.replace('_', ' ')}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-slate-800/60 px-4 py-4 space-y-4">
          <p className="font-rajdhani text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {report.description}
          </p>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <a
                  key={i}
                  href={`data:${img.type};base64,${img.data}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-sm overflow-hidden border border-slate-700 hover:border-cyan-700/50 transition-colors"
                >
                  <img
                    src={`data:${img.type};base64,${img.data}`}
                    alt={img.name}
                    className="h-32 w-auto object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {otherFiles.map((f, i) => (
            <a
              key={i}
              href={`data:${f.type};base64,${f.data}`}
              download={f.name}
              className="inline-flex items-center gap-1.5 text-xs text-cyan-500 hover:text-cyan-300 font-mono-sc"
            >
              <ExternalLink size={11} />
              {f.name}
            </a>
          ))}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-800/40">
            <span className="text-xs font-mono-sc text-slate-600 uppercase tracking-wider">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="sci-input py-1 px-2 text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <button
              onClick={() => updateStatus(selectedStatus)}
              disabled={isPending || selectedStatus === report.status}
              className="flex items-center gap-1.5 py-1 px-3 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 text-cyan-300 font-mono-sc text-xs rounded transition-colors disabled:opacity-40"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
              Update
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBugReportsPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bug-reports', statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/bug-reports${qs}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: user?.role === 'admin',
  });

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader title="Bug Reports" subtitle="Admin only." />
        <div className="sci-panel p-8 text-center">
          <p className="text-slate-500 font-rajdhani">Access denied.</p>
        </div>
      </div>
    );
  }

  const reports: BugReport[] = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader
        title="Bug Reports"
        subtitle={`${data?.total ?? 0} report${(data?.total ?? 0) !== 1 ? 's' : ''} total`}
      />

      <div className="flex items-center gap-3">
        <span className="text-xs font-mono-sc text-slate-600 uppercase tracking-wider">Filter:</span>
        <div className="flex items-center gap-1.5">
          {(['', 'open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`font-mono-sc text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-sm border transition-colors ${
                statusFilter === s
                  ? 'border-cyan-700/60 text-cyan-400 bg-cyan-950/30'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
              }`}
            >
              {s || 'all'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="sci-panel p-8 flex items-center justify-center gap-2 text-slate-600">
          <Loader2 size={16} className="animate-spin" />
          <span className="font-mono-sc text-xs">Loading…</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="sci-panel p-8 text-center">
          <Bug size={28} className="text-slate-700 mx-auto mb-2" />
          <p className="text-slate-600 font-rajdhani text-sm">No reports found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => <ReportRow key={r.id} report={r} />)}
        </div>
      )}
    </div>
  );
}
