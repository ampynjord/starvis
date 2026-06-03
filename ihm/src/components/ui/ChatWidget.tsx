'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ChevronDown, Grip, LogIn, Send, X } from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface ChatSize {
  width: number;
  height: number;
}

const CHAT_SIZE_STORAGE_KEY = 'starvis-chat-size';
const DEFAULT_CHAT_SIZE: ChatSize = { width: 440, height: 620 };
const CHAT_SIZE_LIMITS = {
  minWidth: 340,
  minHeight: 440,
  viewportMargin: 24,
} as const;

function clampChatSize(size: ChatSize): ChatSize {
  if (typeof window === 'undefined') return size;

  const maxWidth = Math.max(CHAT_SIZE_LIMITS.minWidth, window.innerWidth - CHAT_SIZE_LIMITS.viewportMargin * 2);
  const maxHeight = Math.max(CHAT_SIZE_LIMITS.minHeight, window.innerHeight - CHAT_SIZE_LIMITS.viewportMargin * 2);

  return {
    width: Math.min(Math.max(size.width, CHAT_SIZE_LIMITS.minWidth), maxWidth),
    height: Math.min(Math.max(size.height, CHAT_SIZE_LIMITS.minHeight), maxHeight),
  };
}

export function ChatWidget() {
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState<ChatSize>(DEFAULT_CHAT_SIZE);
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
          content:
            'Hello, I am **Starvis** - your Star Citizen AI assistant. Ask me anything about ships, components, weapons, missions, crafting recipes or mining resources.',
        },
      ]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open, messages.length]);

  useEffect(() => {
    const stored = localStorage.getItem(CHAT_SIZE_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as ChatSize;
      if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) {
        setSize(clampChatSize(parsed));
      }
    } catch {
      localStorage.removeItem(CHAT_SIZE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const onResize = () => setSize((current) => clampChatSize(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resizeChat = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = size;

      const onMove = (moveEvent: PointerEvent) => {
        const nextSize = clampChatSize({
          width: startSize.width - (moveEvent.clientX - startX),
          height: startSize.height - (moveEvent.clientY - startY),
        });
        setSize(nextSize);
        localStorage.setItem(CHAT_SIZE_STORAGE_KEY, JSON.stringify(nextSize));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [size],
  );

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
              const errMsg =
                evt.message?.includes('Rate limit') || evt.message?.includes('rate_limit')
                  ? 'Warning: daily token limit reached. Try again in about 1 hour.'
                  : `Warning: ${evt.message ?? 'Unknown error'}`;
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
          next[assistantIdx] = { role: 'assistant', content: 'Connection error. Please try again.' };
          return next;
        });
      }
    } finally {
      setLoading(false);
      setMessages((prev) => prev.map((m, i) => (i === assistantIdx ? { ...m, streaming: false } : m)));
    }
  }, [input, messages, loading]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (authLoading) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6">
      <AnimatePresence>
        {open && !user && (
          <motion.div
            key="login-prompt"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-72 flex flex-col items-center gap-4 p-6 text-center"
            style={panelStyle}
          >
            <Bot size={28} style={{ color: '#00d4ff' }} />
            <div>
              <p className="font-orbitron text-xs tracking-widest text-cyan-400 uppercase mb-1">STARVIS</p>
              <p className="text-sm text-slate-400">Sign in to access the Star Citizen AI assistant.</p>
            </div>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 border border-cyan-700/50 hover:border-cyan-500/70 bg-cyan-900/20 hover:bg-cyan-900/40 text-cyan-400 hover:text-cyan-300 font-mono-sc text-xs rounded transition-colors"
            >
              <LogIn size={13} />
              SIGN IN
            </Link>
          </motion.div>
        )}

        {open && user && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative flex max-h-[calc(100dvh-6rem)] w-full flex-col overflow-hidden sm:max-w-[calc(100vw-3rem)]"
            style={{
              ...panelStyle,
              width: `min(${size.width}px, calc(100vw - 1.5rem))`,
              height: `min(${size.height}px, calc(100dvh - 6rem))`,
            }}
          >
            <button
              type="button"
              onPointerDown={resizeChat}
              className="absolute left-1 top-1 z-10 hidden cursor-nwse-resize rounded-sm p-1 text-slate-600 transition-colors hover:bg-cyan-950/40 hover:text-cyan-300 sm:block"
              aria-label="Resize Starvis"
              title="Resize Starvis"
            >
              <Grip size={13} />
            </button>

            <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3 sm:pl-7" style={{ borderColor: 'rgba(0,212,255,0.2)' }}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }} />
                <span className="font-orbitron text-xs tracking-widest uppercase text-cyan-400">STARVIS</span>
                <span className="hidden truncate text-xs text-slate-500 font-mono sm:inline">Star Citizen AI</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors p-1" aria-label="Close">
                <ChevronDown size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-4" style={{ minHeight: 0 }}>
              {messages.map((msg, i) => (
                <div key={`${msg.role}-${i}`} className={`flex min-w-0 gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)' }}>
                      <Bot size={12} style={{ color: '#00d4ff' }} />
                    </div>
                  )}
                  <div
                    className={`min-w-0 rounded-sm px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'max-w-[85%] bg-cyan-950/60 border border-cyan-800/50 text-slate-200'
                        : 'max-w-[92%] text-slate-300'
                    }`}
                    style={msg.role === 'assistant' ? { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' } : {}}
                  >
                    <MarkdownText text={msg.content} />
                    {msg.streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse align-middle rounded-[1px] bg-cyan-400" />}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="px-3 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(0,212,255,0.15)' }}>
              <div className="flex items-end gap-2 rounded-sm px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.2)' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask Starvis..."
                  disabled={loading}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none leading-5 min-w-0"
                  style={{ maxHeight: '80px' }}
                />
                <button onClick={send} disabled={loading || !input.trim()} className="flex-shrink-0 p-1 transition-colors disabled:opacity-40 text-cyan-400" aria-label="Send">
                  <Send size={16} />
                </button>
              </div>
              <p className="text-center text-slate-700 text-[10px] mt-1.5 font-mono">Starvis - live Star Citizen data</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label={open ? 'Close chat' : 'Open Starvis chat'}
        className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all shrink-0"
        style={{
          background: open ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.1)',
          border: `1px solid ${open ? 'rgba(0,212,255,0.6)' : 'rgba(0,212,255,0.35)'}`,
          boxShadow: open ? '0 0 20px rgba(0,212,255,0.25)' : '0 0 10px rgba(0,212,255,0.12)',
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
        {!open && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-cyan-glow" />}
      </motion.button>
    </div>
  );
}

const panelStyle = {
  background: 'rgba(8,12,20,0.97)',
  border: '1px solid rgba(0,212,255,0.3)',
  borderRadius: '8px',
  boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(0,212,255,0.1)',
} satisfies CSSProperties;

function MarkdownText({ text }: { text: string }) {
  if (!text) return null;

  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="starvis-markdown">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          const table = parseMarkdownTable(block.content);
          if (table) return <MarkdownTable key={index} table={table} />;

          return (
            <pre key={index}>
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === 'heading') {
          const Heading = `h${Math.min(block.level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
          return <Heading key={index}>{renderInline(block.content)}</Heading>;
        }

        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'quote') {
          return <blockquote key={index}>{renderInline(block.content)}</blockquote>;
        }

        if (block.type === 'table') {
          return <MarkdownTable key={index} table={block} />;
        }

        return <p key={index}>{renderInline(block.content)}</p>;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; content: string }
  | { type: 'code'; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let table: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', content: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: 'list', items: list });
      list = [];
    }
  };
  const flushTable = () => {
    if (!table.length) return;
    const parsed = parseMarkdownTable(table.join('\n'));
    if (parsed) {
      blocks.push(parsed);
    } else {
      blocks.push({ type: 'paragraph', content: table.join(' ') });
    }
    table = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push({ type: 'code', content: code.join('\n').trimEnd() });
        code = null;
      } else {
        flushParagraph();
        flushList();
        flushTable();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (looksLikeTableLine(trimmed)) {
      flushParagraph();
      flushList();
      table.push(trimmed);
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      flushTable();
      list.push(bullet[1]);
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: 'quote', content: trimmed.slice(2) });
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  if (code) blocks.push({ type: 'code', content: code.join('\n').trimEnd() });
  flushParagraph();
  flushList();
  flushTable();

  return blocks;
}

interface ParsedTable {
  type: 'table';
  headers: string[];
  rows: string[][];
}

function MarkdownTable({ table }: { table: ParsedTable }) {
  return (
    <div className="starvis-table-wrap">
      <table>
        <thead>
          <tr>
            {table.headers.map((header, index) => (
              <th key={index}>{renderInline(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {table.headers.map((_, cellIndex) => (
                <td key={cellIndex}>{renderInline(row[cellIndex] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseMarkdownTable(rawTable: string): ParsedTable | null {
  const lines = rawTable
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));

  if (lines.length < 2) return null;

  const separatorIndex = lines.findIndex((line) => isTableSeparator(splitTableRow(line)));
  if (separatorIndex <= 0) return null;

  const headers = splitTableRow(lines[separatorIndex - 1]);
  const rows = lines
    .slice(separatorIndex + 1)
    .map(splitTableRow)
    .filter((row) => row.length > 0);

  if (headers.length < 2 || rows.length === 0) return null;

  return { type: 'table', headers, rows };
}

function looksLikeTableLine(line: string): boolean {
  return line.includes('|') && splitTableRow(line).length >= 2;
}

function isTableSeparator(cells: string[]): boolean {
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.startsWith('|') && trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed;
  return withoutOuterPipes.split('|').map((cell) => cell.trim());
}

function renderInline(text: string): ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith('**')) {
      parts.push(
        <strong key={match.index} className="text-cyan-300 font-semibold">
          {raw.slice(2, -2)}
        </strong>,
      );
    } else if (raw.startsWith('*')) {
      parts.push(<em key={match.index}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith('`')) {
      parts.push(
        <code key={match.index} className="rounded border border-cyan-800/40 bg-cyan-950/40 px-1 py-0.5 font-mono text-xs text-cyan-300">
          {raw.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + raw.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
