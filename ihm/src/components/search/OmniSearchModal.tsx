'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Loader2,
  Rocket,
  Zap,
  Shield,
  MapPin,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useEnv } from '@/contexts/EnvContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchOmniSearch } from '@/services/universe-api';
import { localizeCatalogLabel } from '@/lib/catalog-labels';
import type { UniverseOmniResult } from '@/types/universe';

interface OmniSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelectEntity?: (category: string, id: string) => void;
}

export function OmniSearchModal({ open, onClose, onSelectEntity }: OmniSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniverseOmniResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const debouncedQuery = useDebounce(query, 200);
  const { env } = useEnv();
  const { language, t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Handle keyboard navigation & Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        const selected = results[selectedIndex];
        handleSelect(selected);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, results, selectedIndex, onClose]);

  // Fetch search results
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    fetchOmniSearch(debouncedQuery, env, 20, language)
      .then((items) => {
        if (active) {
          setResults(items);
          setSelectedIndex(0);
        }
      })
      .catch((err) => {
        console.error('OmniSearch failed', err);
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, env, language]);

  const handleSelect = (item: UniverseOmniResult) => {
    if (onSelectEntity) {
      onSelectEntity(item.category, item.id);
    }
    onClose();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ships':
        return <Rocket size={15} className="text-cyan-400" />;
      case 'components':
        return <Zap size={15} className="text-amber-400" />;
      case 'items':
        return <Shield size={15} className="text-emerald-400" />;
      case 'locations':
        return <MapPin size={15} className="text-violet-400" />;
      case 'commodities':
        return <TrendingUp size={15} className="text-rose-400" />;
      default:
        return <Search size={15} className="text-slate-400" />;
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-2xl bg-slate-950/90 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-950/40 overflow-hidden backdrop-blur-xl z-50 flex flex-col max-h-[75vh]"
        >
          {/* Header & Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/40">
            <Search size={18} className="text-cyan-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('omni_placeholder')}
              className="flex-1 bg-transparent text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none font-rajdhani tracking-wide"
            />
            {loading && <Loader2 size={16} className="text-cyan-400 animate-spin shrink-0" />}
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono-sc text-slate-400 shrink-0">
              ESC {t('key_close')}
            </div>
          </div>

          {/* Results List */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-800/40 p-2 space-y-1">
            {results.length > 0 ? (
              results.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={`${item.category}-${item.id}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-950/50 border border-cyan-500/40 shadow-sm text-cyan-200'
                        : 'hover:bg-slate-900/60 text-slate-300 border border-transparent'
                    }`}
                  >
                    {/* Icon or Thumbnail */}
                    <div className="w-10 h-10 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        getCategoryIcon(item.category)
                      )}
                    </div>

                    {/* Main Label & Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate font-rajdhani text-white">
                          {item.name}
                        </span>
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono-sc font-medium ${
                              item.badge.color === 'purple'
                                ? 'bg-purple-950/80 text-purple-300 border border-purple-700/50'
                                : item.badge.color === 'amber'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                                : item.badge.color === 'cyan'
                                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/50'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {localizeCatalogLabel(language, item.badge.label)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 truncate font-mono-sc">
                        {item.manufacturer && <span>{item.manufacturer}</span>}
                        {item.type && <span>• {localizeCatalogLabel(language, item.type)}</span>}
                        {item.subType && <span>• {item.subType}</span>}
                        {item.system && <span>• {language === 'fr' ? 'Système' : 'System'} {item.system}</span>}
                      </div>
                    </div>

                    {/* Arrow / Action */}
                    <ArrowRight
                      size={16}
                      className={`shrink-0 transition-transform ${
                        isSelected ? 'text-cyan-400 translate-x-1' : 'text-slate-600'
                      }`}
                    />
                  </div>
                );
              })
            ) : query.trim().length >= 2 && !loading ? (
              <div className="py-12 text-center text-slate-500 font-mono-sc text-sm">
                {t('omni_no_results', { query })}
              </div>
            ) : (
              <div className="py-8 px-4 text-center">
                <p className="text-xs font-mono-sc text-slate-500 mb-3">{t('omni_quick_tags')}</p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  {['Gladius', 'Panther Repeater', 'FR-66', 'Area18', 'Laranite', 'Bengal', 'Stingray'].map(
                    (tag) => (
                      <button
                        key={tag}
                        onClick={() => setQuery(tag)}
                        className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-700/40 text-slate-400 hover:text-cyan-300 transition-colors font-mono-sc"
                      >
                        {tag}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="px-4 py-2 border-t border-slate-900 bg-slate-950/80 flex items-center justify-between text-[11px] font-mono-sc text-slate-500">
            <span>↑↓ {t('key_navigate')} • Enter {t('key_open')}</span>
            <span>STARVIS V2 Nexus</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
