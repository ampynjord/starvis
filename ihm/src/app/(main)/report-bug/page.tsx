'use client';

import { AlertCircle, CheckCircle, Paperclip, Send, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';

const MAX_FILES = 5;
const MAX_FILE_MB = 4;

interface AttachmentPreview {
  name: string;
  type: string;
  data: string; // base64
  previewUrl?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ReportBugPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setFileError(null);
    const newAttachments: AttachmentPreview[] = [];

    for (const file of Array.from(files)) {
      if (attachments.length + newAttachments.length >= MAX_FILES) {
        setFileError(`Maximum ${MAX_FILES} attachments.`);
        break;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setFileError(`${file.name} exceeds ${MAX_FILE_MB} MB limit.`);
        continue;
      }
      const data = await fileToBase64(file);
      const isImage = file.type.startsWith('image/');
      newAttachments.push({
        name: file.name,
        type: file.type,
        data,
        previewUrl: isImage ? `data:${file.type};base64,${data}` : undefined,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          attachments: attachments.map(({ name, type, data }) => ({ name, type, data })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, message: 'Report submitted successfully. Thank you!' });
        setTitle('');
        setDescription('');
        setAttachments([]);
      } else {
        setResult({ ok: false, message: json.error ?? 'Submission failed.' });
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <PageHeader title="Report a bug" subtitle="Help us improve Starvis by reporting issues." />
        <div className="sci-panel p-8 text-center">
          <p className="text-slate-500 font-rajdhani">You must be logged in to submit a bug report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHeader
        title="Report a bug"
        subtitle="Encountered something broken? Let us know — every report helps."
      />

      <form onSubmit={handleSubmit} className="sci-panel p-6 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short description of the issue"
            maxLength={200}
            required
            className="sci-input w-full"
          />
          <p className="text-[10px] font-mono-sc text-slate-700 text-right">{title.length}/200</p>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the bug in detail — steps to reproduce, expected vs. actual behaviour, URLs visited, etc."
            rows={8}
            maxLength={20000}
            required
            className="sci-input w-full resize-y min-h-[160px]"
          />
          <p className="text-[10px] font-mono-sc text-slate-700 text-right">{description.length}/20 000</p>
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
            Attachments <span className="text-slate-600">(optional, max {MAX_FILES} files · {MAX_FILE_MB} MB each)</span>
          </label>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative group rounded-sm border border-slate-700 bg-slate-900 overflow-hidden">
                  {a.previewUrl ? (
                    <img src={a.previewUrl} alt={a.name} className="w-20 h-20 object-cover" />
                  ) : (
                    <div className="w-20 h-20 flex items-center justify-center">
                      <Paperclip size={16} className="text-slate-500" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5">
                    <p className="text-[9px] font-mono-sc text-slate-400 truncate">{a.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={9} className="text-slate-300" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {fileError && (
            <p className="text-xs text-red-400 font-mono-sc">{fileError}</p>
          )}

          {attachments.length < MAX_FILES && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.log,.json"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 py-1.5 px-3 border border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300 rounded-sm text-xs font-mono-sc transition-colors"
              >
                <Paperclip size={12} />
                Add file
              </button>
            </>
          )}
        </div>

        {/* Feedback */}
        {result && (
          <div className={`flex items-start gap-2 px-3 py-2.5 rounded-sm border text-sm font-rajdhani ${
            result.ok
              ? 'bg-green-950/30 border-green-800/40 text-green-400'
              : 'bg-red-950/30 border-red-800/40 text-red-400'
          }`}>
            {result.ok ? <CheckCircle size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
            {result.message}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !title.trim() || !description.trim()}
          className="flex items-center gap-2 py-2 px-5 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={13} />
          {submitting ? 'SUBMITTING…' : 'SUBMIT REPORT'}
        </button>
      </form>
    </div>
  );
}
