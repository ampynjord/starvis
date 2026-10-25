'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowLeft,
  Rocket,
  Zap,
  ExternalLink,
  Box,
  ShoppingCart,
  Loader2,
  Crosshair,
  Target,
  ShieldAlert,
  Sparkles,
  Shield,
  Snowflake,
  Radio,
  HeartPulse,
  Gauge,
  Anchor,
  Cpu,
  Fuel,
  Wrench,
  Compass,
} from 'lucide-react';
import { useEnv } from '@/contexts/EnvContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchEntityNexus } from '@/services/universe-api';
import type { UniverseEntityNexus } from '@/types/universe';
import { fNumber, fSize } from '@/utils/formatters';
import { localizeCatalogLabel } from '@/lib/catalog-labels';
import { buildLoadoutTree, type LoadoutNode } from '@/lib/loadout-formatter';
import { ShipHoloViewer } from '@/components/ship/ShipHoloViewer';

interface EntityNexusSheetProps {
  category: string | null;
  id: string | null;
  open: boolean;
  onClose: () => void;
  onOpenModel3D?: (ship: any) => void;
}

interface HistoryItem {
  category: string;
  id: string;
  name: string;
}

const COMPONENT_CLASS_STYLES: Record<string, { labelFr: string; labelEn: string; color: string }> = {
  military: { labelFr: 'Militaire', labelEn: 'Military', color: 'text-emerald-300 bg-emerald-950/70 border-emerald-500/40' },
  civilian: { labelFr: 'Civil', labelEn: 'Civilian', color: 'text-slate-300 bg-slate-900/80 border-slate-700/60' },
  industrial: { labelFr: 'Industriel', labelEn: 'Industrial', color: 'text-amber-300 bg-amber-950/70 border-amber-500/40' },
  stealth: { labelFr: 'Furtif', labelEn: 'Stealth', color: 'text-purple-300 bg-purple-950/70 border-purple-500/40' },
  competition: { labelFr: 'Course', labelEn: 'Racing', color: 'text-rose-300 bg-rose-950/70 border-rose-500/40' },
  racing: { labelFr: 'Course', labelEn: 'Racing', color: 'text-rose-300 bg-rose-950/70 border-rose-500/40' },
};

function LoadoutNodeCard({
  node,
  depth = 0,
  language,
  onPivot,
}: {
  node: LoadoutNode;
  depth?: number;
  language: string;
  onPivot: (cat: 'ships' | 'components' | 'items' | 'locations' | 'commodities', id: string, name: string) => void;
}) {
  const isFr = language === 'fr';
  const hasChildren = node.children && node.children.length > 0;
  const isJumpModule =
    (node.component_type || '').toLowerCase().includes('jump') ||
    node.port_name.toLowerCase().includes('jump');

  const classKey = (node.component_class || '').trim().toLowerCase();
  const classInfo = COMPONENT_CLASS_STYLES[classKey];

  return (
    <div className={`space-y-1.5 ${depth > 0 ? 'ml-3 sm:ml-4 pl-2 sm:pl-3 border-l-2 border-cyan-500/30' : ''}`}>
      <div
        onClick={() => {
          if (node.docked_ship_uuid) {
            onPivot('ships', node.docked_ship_uuid, node.component_name || '');
          } else if (node.component_uuid) {
            onPivot('components', node.component_uuid, node.component_name || '');
          }
        }}
        className={`p-2.5 rounded-lg border transition-all flex flex-col gap-1.5 ${
          node.component_uuid || node.docked_ship_uuid
            ? depth === 0
              ? 'bg-slate-900/80 hover:bg-cyan-950/40 border-slate-800 hover:border-cyan-500/50 cursor-pointer group'
              : 'bg-slate-950/70 hover:bg-cyan-950/30 border-slate-800/80 hover:border-cyan-500/40 cursor-pointer group'
            : 'bg-slate-950/40 border-slate-800/40 opacity-75'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              {depth > 0 && <span className="text-[10px] font-mono-sc text-cyan-400 font-bold">↳</span>}
              <span className="text-[10px] font-mono-sc text-slate-400 block truncate group-hover:text-slate-300">
                {node.humanPortName}
              </span>
            </div>
            <span className="text-xs font-semibold text-white font-rajdhani truncate block group-hover:text-cyan-300">
              {node.count && node.count > 1 ? `${node.count}x ` : ''}
              {node.component_name ||
                localizeCatalogLabel(language as any, node.component_type) ||
                node.port_type}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {node.docked_ship_uuid && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 font-semibold uppercase">
                {isFr ? 'Parasite Arrimé ↗' : 'Docked Craft ↗'}
              </span>
            )}
            {isJumpModule && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold uppercase">
                {isFr ? 'Saut' : 'Jump'}
              </span>
            )}
            {classInfo && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono-sc font-bold border leading-none shrink-0 ${classInfo.color}`}>
                {isFr ? classInfo.labelFr : classInfo.labelEn}
              </span>
            )}
            {node.component_grade && (
              <span className="px-1 py-0.5 rounded text-[9px] font-mono-sc bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 font-bold leading-none shrink-0">
                Grade {node.component_grade.toUpperCase()}
              </span>
            )}
            {node.component_size != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-sc bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 font-bold leading-none shrink-0">
                {fSize(node.component_size, language)}
              </span>
            )}
          </div>
        </div>

        {/* Telemetry chips in Nexus sheet */}
        {(node.weapon_dps ||
          node.weapon_speed ||
          node.cm_ammo_count ||
          node.shield_hp ||
          node.shield_regen ||
          node.quantum_speed ||
          node.power_output) && (
          <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800/50 text-[9px] font-mono-sc">
            {node.weapon_dps != null && (
              <span className="text-amber-400 bg-amber-950/40 border border-amber-900/40 rounded px-1 py-0.2">
                {Math.round(node.weapon_dps)} DPS
              </span>
            )}
            {node.weapon_speed != null && (
              <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 rounded px-1 py-0.2">
                {Math.round(node.weapon_speed)} m/s
              </span>
            )}
            {node.cm_ammo_count != null && (
              <span className="text-purple-400 bg-purple-950/40 border border-purple-900/40 rounded px-1 py-0.2">
                {node.cm_ammo_count} {isFr ? 'charges' : 'ammo'}
              </span>
            )}
            {node.shield_hp != null && (
              <span className="text-cyan-400 bg-cyan-950/40 border border-cyan-900/40 rounded px-1 py-0.2">
                {Math.round(node.shield_hp)} HP
              </span>
            )}
            {node.shield_regen != null && (
              <span className="text-cyan-300 bg-cyan-950/40 border border-cyan-900/40 rounded px-1 py-0.2">
                {Math.round(node.shield_regen)}/s
              </span>
            )}
            {node.quantum_speed != null && (
              <span className="text-purple-400 bg-purple-950/40 border border-purple-900/40 rounded px-1 py-0.2">
                {Math.round(node.quantum_speed / 1000)} km/s
              </span>
            )}
            {node.power_output != null && (
              <span className="text-yellow-400 bg-yellow-950/40 border border-yellow-900/40 rounded px-1 py-0.2">
                {Math.round(node.power_output)} kW
              </span>
            )}
          </div>
        )}
      </div>

      {hasChildren && (
        <div className="space-y-1.5 pt-0.5">
          {node.children.map((child) => (
            <LoadoutNodeCard
              key={child.id}
              node={child}
              depth={depth + 1}
              language={language}
              onPivot={onPivot}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function EntityNexusSheet({ category, id, open, onClose, onOpenModel3D }: EntityNexusSheetProps) {
  const { env } = useEnv();
  const { language, t } = useLanguage();
  const [data, setData] = useState<UniverseEntityNexus | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [show3D, setShow3D] = useState(false);

  // Current entity target
  const currentTarget = history.length > 0 ? history[history.length - 1] : category && id ? { category, id, name: '' } : null;

  useEffect(() => {
    setShow3D(false);
    if (open && category && id) {
      setHistory([{ category, id, name: '' }]);
    } else if (!open) {
      setHistory([]);
      setData(null);
    }
  }, [open, category, id]);

  useEffect(() => {
    if (!currentTarget?.category || !currentTarget?.id) return;
    let active = true;
    setLoading(true);

    fetchEntityNexus(currentTarget.category, currentTarget.id, env, language)
      .then((res) => {
        if (active) {
          setData(res);
        }
      })
      .catch((err) => console.error('Failed to load nexus sheet', err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentTarget?.category, currentTarget?.id, env, language]);

  const handlePivot = (newCategory: string, newId: string, newName = '') => {
    setShow3D(false);
    setHistory((prev) => [...prev, { category: newCategory, id: newId, name: newName }]);
  };

  const handleBack = () => {
    setShow3D(false);
    setHistory((prev) => prev.slice(0, -1));
  };

  if (!open || !currentTarget) return null;

  const entity = data?.entity;
  const connections = data?.connections;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Slide-over Drawer */}
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="w-screen max-w-2xl bg-slate-950/95 border-l border-cyan-500/30 shadow-2xl backdrop-blur-2xl flex flex-col h-full text-slate-100 z-50"
          >
            {/* Header / Nav toolbar */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/60">
              <div className="flex items-center gap-3">
                {history.length > 1 && (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-950 border border-slate-700 text-xs font-mono-sc text-cyan-300 transition-colors"
                  >
                    <ArrowLeft size={13} />
                    <span>{t('back')}</span>
                  </button>
                )}
                <span className="text-xs uppercase font-mono-sc tracking-widest text-cyan-400">
                  {t('nexus_360_title', { category: currentTarget.category })}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-3">
                  <Loader2 size={32} className="text-cyan-400 animate-spin" />
                  <p className="text-xs font-mono-sc text-slate-500">{t('loading_sheet')}</p>
                </div>
              ) : entity ? (
                <>
                  {/* Entity Hero */}
                  <div className="space-y-4">
                    {/* Thumbnail banner if available */}
                    {entity.thumbnail && (
                      <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                        <img
                          src={entity.thumbnail}
                          alt={entity.name}
                          className="w-full h-full object-cover object-center"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                        {entity.production_status && (
                          <div className="absolute top-3 right-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-mono-sc uppercase tracking-wider font-semibold border ${
                                entity.production_status === 'lore'
                                  ? 'bg-purple-950/90 text-purple-300 border-purple-600'
                                  : entity.production_status === 'flight-ready'
                                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600'
                                  : 'bg-amber-950/90 text-amber-300 border-amber-600'
                              }`}
                            >
                              {entity.production_status === 'flight-ready'
                                ? t('flight_ready')
                                : entity.production_status === 'lore'
                                ? t('lore_vessel')
                                : t('in_concept')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Titles & Manufacturer */}
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-400">
                        {entity.manufacturer_name && (
                          <span className="text-cyan-400 font-medium">{entity.manufacturer_name}</span>
                        )}
                        {entity.role && <span>• {localizeCatalogLabel(language, entity.role)}</span>}
                        {entity.type && entity.type !== entity.role && (
                          <span>• {localizeCatalogLabel(language, entity.type)}</span>
                        )}
                        {entity.system_code && <span>• {language === 'fr' ? 'Système' : 'System'} {entity.system_code}</span>}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold font-rajdhani text-white mt-1">
                        {entity.name}
                      </h2>
                    </div>

                    {/* Actions bar (3D only when RSI CTM exists, Store...) */}
                    {currentTarget.category === 'ships' && (entity.ctm_url || entity.store_url) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {entity.ctm_url && (
                          <button
                            type="button"
                            onClick={() => {
                              setShow3D((v) => !v);
                              if (onOpenModel3D) onOpenModel3D(entity);
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-sc transition-all ${
                              show3D
                                ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20'
                                : 'bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-300'
                            }`}
                          >
                            <Box size={14} />
                            <span>{show3D ? t('btn_close_3d') : t('btn_3d_viewer')}</span>
                          </button>
                        )}
                        {entity.store_url && (
                          <a
                            href={entity.store_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono-sc transition-colors"
                          >
                            <span>{t('btn_official_rsi')}</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Interactive 3D Holoviewer — mounted only when a CTM URL exists */}
                    {currentTarget.category === 'ships' && show3D && entity.ctm_url && (
                      <div className="rounded-xl overflow-hidden border border-cyan-500/40 bg-slate-950 shadow-2xl mt-2">
                        <ShipHoloViewer shipUuid={entity.uuid} shipName={entity.name} hasModel={Boolean(entity.ctm_url)} />
                      </div>
                    )}

                    {/* Description */}
                    {(entity.description || entity.sm_description) && (
                      <p className="text-sm text-slate-300 leading-relaxed font-rajdhani border-l-2 border-cyan-500/50 pl-3 py-0.5">
                        {entity.description || entity.sm_description}
                      </p>
                    )}
                  </div>

                  {/* Telemetry Physical Stats Grid */}
                  {currentTarget.category === 'ships' && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono-sc uppercase text-slate-400 tracking-wider flex items-center gap-2">
                        <Rocket size={14} className="text-cyan-400" />
                        <span>{t('telemetry_title')}</span>
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('dimensions')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-white">
                            {entity.size_y || '-'}m × {entity.size_x || '-'}m
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('mass')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-white">
                            {entity.mass ? `${fNumber(Math.round(entity.mass))} kg` : '-'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('speed')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-white">
                            {entity.scm_speed || '-'} / {entity.max_speed || '-'} m/s
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('cargo')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-white">
                            {entity.cargo_capacity ?? 0} SCU
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('hull_hp')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-cyan-300">
                            {entity.total_hp ? fNumber(entity.total_hp) : '-'} HP
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('crew')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-white">
                            {entity.crew_size || 1}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">{t('quantum_fuel')}</span>
                          <span className="text-sm font-semibold font-mono-sc text-white">
                            {entity.quantum_fuel_capacity ? `${entity.quantum_fuel_capacity} M` : '-'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                          <span className="text-[10px] font-mono-sc text-slate-500 uppercase block">DPS Armes Total</span>
                          <span className="text-sm font-semibold font-mono-sc text-rose-300">
                            {entity.weapon_damage_total ? fNumber(Math.round(entity.weapon_damage_total)) : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Connected Relationships: Where to Buy in Game */}
                  {connections?.purchasableAt && connections.purchasableAt.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono-sc uppercase text-slate-400 tracking-wider flex items-center gap-2">
                        <ShoppingCart size={14} className="text-emerald-400" />
                        <span>{t('shops_title')}</span>
                      </h3>
                      <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                        {connections.purchasableAt.map((shop, i) => (
                          <div
                            key={i}
                            className="p-3 flex items-center justify-between hover:bg-slate-900/80 transition-colors"
                          >
                            <div>
                              <span className="text-sm font-semibold text-white font-rajdhani block">
                                {shop.shop_name}
                              </span>
                              <span className="text-xs font-mono-sc text-slate-400">
                                {shop.city || shop.planet_moon || shop.location} • {language === 'fr' ? 'Système' : 'System'} {shop.system || 'Stanton'}
                              </span>
                            </div>
                            <div className="text-right">
                              {shop.price_auec && (
                                <span className="text-sm font-bold font-mono-sc text-emerald-400 block">
                                  {fNumber(Math.round(shop.price_auec))} aUEC
                                </span>
                              )}
                              {shop.rental_price_1d && (
                                <span className="text-[11px] font-mono-sc text-slate-400">
                                  {language === 'fr' ? 'Location :' : 'Rental:'} {fNumber(Math.round(shop.rental_price_1d))} aUEC/j
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connected Relationships: Structured Default Loadout with Pivots */}
                  {connections?.loadout && connections.loadout.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h3 className="text-xs font-mono-sc uppercase text-slate-300 tracking-wider flex items-center gap-2">
                          <Zap size={14} className="text-amber-400" />
                          <span>{t('loadout_title')}</span>
                        </h3>
                        <span className="text-[11px] font-mono-sc text-slate-500">
                          {connections.loadout.length} {language === 'fr' ? 'emplacements' : 'slots'}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {buildLoadoutTree(connections.loadout as any, language).map((section) => {
                          const IconComp =
                            section.iconName === 'crosshair'
                              ? Crosshair
                              : section.iconName === 'target'
                                ? Target
                                : section.iconName === 'shield-alert'
                                  ? ShieldAlert
                                  : section.iconName === 'rocket'
                                    ? Rocket
                                    : section.iconName === 'sparkles'
                                      ? Sparkles
                                      : section.iconName === 'compass'
                                        ? Compass
                                        : section.iconName === 'shield'
                                          ? Shield
                                          : section.iconName === 'zap'
                                            ? Zap
                                            : section.iconName === 'snowflake'
                                              ? Snowflake
                                              : section.iconName === 'radio'
                                                ? Radio
                                                : section.iconName === 'heart-pulse'
                                                  ? HeartPulse
                                                  : section.iconName === 'gauge'
                                                    ? Gauge
                                                    : section.iconName === 'anchor'
                                                      ? Anchor
                                                      : section.iconName === 'cpu'
                                                        ? Cpu
                                                        : section.iconName === 'fuel'
                                                          ? Fuel
                                                          : Wrench;

                          return (
                            <div key={section.key} className="space-y-2">
                              <div className="flex items-center gap-2 text-[11px] font-mono-sc uppercase text-cyan-400 tracking-wider">
                                <IconComp size={12} className="text-cyan-400 shrink-0" />
                                <span>{section.title}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {section.nodes.map((node) => (
                                  <LoadoutNodeCard
                                    key={node.id}
                                    node={node}
                                    depth={0}
                                    language={language}
                                    onPivot={handlePivot}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Connected Relationships for Components: Equipped on Ships */}
                  {connections?.equippedOn && connections.equippedOn.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono-sc uppercase text-slate-400 tracking-wider flex items-center gap-2">
                        <Rocket size={14} className="text-cyan-400" />
                        <span>{t('compatible_ships_title')}</span>
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {connections.equippedOn.map((ship, i) => (
                          <div
                            key={i}
                            onClick={() => handlePivot('ships', ship.uuid, ship.name)}
                            className="p-2 rounded-lg bg-slate-900/60 hover:bg-cyan-950/50 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-all flex items-center gap-2"
                          >
                            <div className="w-8 h-8 rounded bg-slate-950 shrink-0 overflow-hidden border border-slate-800">
                              {ship.thumbnail ? (
                                <img src={ship.thumbnail} alt={ship.name} className="w-full h-full object-cover" />
                              ) : (
                                <Rocket size={14} className="m-auto text-cyan-400" />
                              )}
                            </div>
                            <span className="text-xs font-semibold text-white font-rajdhani truncate">
                              {ship.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 text-slate-500 font-mono-sc text-sm">
                  {language === 'fr' ? 'Entité introuvable dans le Nexus.' : 'Entity not found in the Nexus.'}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
