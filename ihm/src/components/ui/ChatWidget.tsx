'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ChevronDown, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && !messages.length) {
      setMessages([
        {
          role: 'assistant',
          content: 'Bonjour, je suis **Starvis** — votre assistant Star Citizen. Posez-moi vos questions sur les vaisseaux, composants, armes, missions, recettes de craft ou ressources minières.',
        },
      ]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    const assistantIdx = history.length;
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'chunk') {
              setMessages((prev) => {
                const next = [...prev];
                const msg = next[assistantIdx];
                if (msg) next[assistantIdx] = { ...msg, content: msg.content + evt.text };
                return next;
              });
            } else if (evt.type === 'done') {
              setMessages((prev) => {
                const next = [...prev];
                const msg = next[assistantIdx];
                if (msg) next[assistantIdx] = { ...msg, streaming: false };
                return next;
              });
            } else if (evt.type === 'error') {
              const errMsg = evt.message?.includes('Rate limit') || evt.message?.includes('rate_limit')
                ? '⚠️ Limite de tokens Groq atteinte pour aujourd\'hui. Réessayez dans ~1h (quota gratuit : 100k tokens/jour).'
                : `⚠️ ${evt.message ?? 'Erreur inconnue'}`;
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIdx] = { role: 'assistant', content: errMsg, streaming: false };
                return next;
              });
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setMessages((prev) => {
          const next = [...prev];
          next[assistantIdx] = { role: 'assistant', content: 'Erreur de connexion. Veuillez réessayer.' };
          return next;
        });
      }
    } finally {
      setLoading(false);
      setMessages((prev) =>
        prev.map((m, i) => (i === assistantIdx ? { ...m, streaming: false } : m)),
      );
    }
  }, [input, messages, loading]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-[380px] max-w-[calc(100vw-3rem)] flex flex-col"
            style={{
              height: '520px',
              background: 'rgba(8,12,20,0.97)',
              border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: '8px',
              boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(0,212,255,0.1)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(0,212,255,0.2)' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }}
                />
                <span className="font-orbitron text-xs tracking-widest uppercase" style={{ color: '#00d4ff' }}>
                  STARVIS
                </span>
                <span className="text-xs text-slate-500 font-mono">— AI</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                aria-label="Fermer"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ minHeight: 0 }}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div
                      className="w-6 h-6 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)' }}
                    >
                      <Bot size={12} style={{ color: '#00d4ff' }} />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-sm px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-950/60 border border-cyan-800/50 text-slate-200'
                        : 'text-slate-300'
                    }`}
                    style={
                      msg.role === 'assistant'
                        ? { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }
                        : {}
                    }
                  >
                    <MarkdownText text={msg.content} />
                    {msg.streaming && (
                      <span
                        className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse align-middle"
                        style={{ background: '#00d4ff', borderRadius: '1px' }}
                      />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="px-3 py-3 border-t flex-shrink-0"
              style={{ borderColor: 'rgba(0,212,255,0.15)' }}
            >
              <div
                className="flex items-end gap-2 rounded-sm px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.2)' }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Posez votre question…"
                  disabled={loading}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none leading-5"
                  style={{ maxHeight: '80px' }}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="flex-shrink-0 p-1 transition-colors disabled:opacity-40"
                  style={{ color: '#00d4ff' }}
                  aria-label="Envoyer"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-center text-slate-700 text-[10px] mt-1.5 font-mono">
                Starvis AI · données live Star Citizen
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label={open ? 'Fermer le chat' : 'Ouvrir le chat Starvis'}
        className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all"
        style={{
          background: open ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.1)',
          border: `1px solid ${open ? 'rgba(0,212,255,0.6)' : 'rgba(0,212,255,0.35)'}`,
          boxShadow: open
            ? '0 0 20px rgba(0,212,255,0.25)'
            : '0 0 10px rgba(0,212,255,0.12)',
        }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={22} style={{ color: '#00d4ff' }} />
            </motion.span>
          ) : (
            <motion.span key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Bot size={22} style={{ color: '#00d4ff' }} />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && (
          <span
            className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full"
            style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }}
          />
        )}
      </motion.button>
    </div>
  );
}

/** Minimal inline markdown renderer (bold, code, line breaks) — no external lib needed */
function MarkdownText({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, li) => {
        const parts = renderInline(line);
        return (
          <span key={li}>
            {parts}
            {li < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith('**')) {
      parts.push(<strong key={match.index} className="text-cyan-300">{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith('*')) {
      parts.push(<em key={match.index}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith('`')) {
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>
          {raw.slice(1, -1)}
        </code>
      );
    }
    last = match.index + raw.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
