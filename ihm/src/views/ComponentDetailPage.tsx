'use client';

import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ChevronRight,
	FlaskConical,
	Rocket,
	Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { ScifiPanel } from "@/components/ui/ScifiPanel";
import { PageShell } from "@/components/ui/PageShell";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { ErrorState } from "@/components/ui/ErrorState";
import { SmartTag } from "@/components/ui/SmartTag";
import { generateComponentTags } from "@/lib/smart-tags";
import { PriceAvailabilityPanel } from "@/components/economy/PriceAvailabilityPanel";
import { COMPONENT_TYPE_COLORS } from "@/utils/constants";
import { getComponentMetricGroups, type ComponentMetricGroup } from "@/utils/componentMetrics";
import type { Component } from "@/types/api";

// ─── Formatters ──────────────────────────────────────────────────────────────

function fN(v: number | null | undefined, unit = "", digits = 0): string {
	if (v == null) return "—";
	const n = Number(v);
	if (Number.isNaN(n)) return "—";
	const formatted =
		digits > 0
			? n.toFixed(digits)
			: n.toLocaleString("en-US", { maximumFractionDigits: 0 });
	return unit ? `${formatted} ${unit}` : formatted;
}

function fMmps(v: number | null | undefined): string {
	if (v == null) return "—";
	const n = Number(v);
	if (Number.isNaN(n) || n === 0) return "—";
	const Mm = n / 1_000_000;
	return Mm >= 1000
		? `${(Mm / 1000).toFixed(0)} Gm/s`
		: `${Mm.toFixed(0)} Mm/s`;
}

function fPct(v: number | null | undefined): string {
	if (v == null) return "—";
	return `${(Number(v) * 100).toFixed(1)}%`;
}

function fKm(v: number | null | undefined): string {
	if (v == null) return "—";
	const n = Number(v);
	if (n >= 1000) return `${(n / 1000).toFixed(0)} km`;
	return `${n.toFixed(0)} m`;
}

// ─── Stat pill ───────────────────────────────────────────────────────────────

function HeroStat({
	label,
	value,
	accent,
	icon,
}: { label: string; value: string; accent?: string; icon?: React.ReactNode }) {
	if (value === "—") return null;
	return (
		<div className="flex flex-col items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 min-w-[72px]">
			<div className="flex items-center gap-1 text-slate-600">
				{icon ?? <Zap size={9} />}
				<span className="text-[9px] font-mono-sc uppercase tracking-widest">{label}</span>
			</div>
			<span className={`text-sm font-orbitron font-bold tabular-nums ${accent ?? "text-cyan-400"}`}>
				{value}
			</span>
		</div>
	);
}

// ─── Spec row ────────────────────────────────────────────────────────────────

function SpecRow({ label, value }: { label: string; value: string }) {
	if (value === "—") return null;
	return (
		<div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
			<span className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">
				{label}
			</span>
			<span className="text-xs font-mono-sc text-slate-300 font-semibold">
				{value}
			</span>
		</div>
	);
}

function ComponentMetricPanels({ groups }: { groups: ComponentMetricGroup[] }) {
	if (!groups.length) return null;

	return (
		<ScifiPanel title="Component Data">
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
				{groups.map((group) => (
					<div key={group.key} className="sci-panel p-3 bg-slate-950/30">
						<p className="text-[10px] font-mono-sc uppercase tracking-widest text-cyan-600 mb-2">
							{group.title}
						</p>
						<div className="divide-y divide-slate-800/50">
							{group.metrics.map((metric) => (
								<SpecRow
									key={`${group.key}-${metric.label}`}
									label={metric.label}
									value={metric.value}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</ScifiPanel>
	);
}

// ─── Type configs ─────────────────────────────────────────────────────────────

function getHeroStats(comp: Component) {
	const t = comp.type;
	if (t === "WeaponGun") {
		const isBeam = comp.weapon_beam_dps != null;
		if (isBeam)
			return [
				{ label: "Beam DPS", value: fN(comp.weapon_beam_dps, "", 1), accent: "text-red-400" },
				{ label: "Full Range", value: fN(comp.weapon_full_damage_range, "m", 0) },
				{ label: "Zero Range", value: fN(comp.weapon_zero_damage_range, "m", 0) },
				{ label: "Heat/s", value: fN(comp.weapon_heat_per_second, "", 0) },
				{ label: "Capacity", value: fN(comp.weapon_beam_capacity, "", 0) },
				{ label: "Regen CD", value: fN(comp.weapon_beam_regen_cooldown, "s", 1) },
			];
		return [
			{ label: "DPS", value: fN(comp.weapon_dps, "", 1), accent: "text-red-400" },
			{ label: "Burst DPS", value: fN(comp.weapon_burst_dps, "", 1) },
			{ label: "Sust. DPS", value: fN(comp.weapon_sustained_dps, "", 1) },
			{ label: "Range", value: fN(comp.weapon_range, "m", 0) },
			{ label: "Fire Rate", value: comp.weapon_fire_rate ? `${fN(comp.weapon_fire_rate, "", 0)} rpm` : "—" },
			{ label: "Type", value: comp.weapon_damage_type ?? "—" },
		];
	}
	if (t === "Shield")
		return [
			{ label: "HP", value: fN(comp.shield_hp), accent: "text-blue-400" },
			{ label: "Regen", value: comp.shield_regen ? `${fN(comp.shield_regen, "", 1)}/s` : "—" },
			{ label: "Regen Delay", value: fN(comp.shield_regen_delay, "s", 2) },
			{ label: "Downed Delay", value: comp.shield_downed_regen_delay ? fN(comp.shield_downed_regen_delay, "s", 1) : "—" },
			{ label: "Hardening", value: comp.shield_hardening ? fPct(comp.shield_hardening) : "—" },
		];
	if (t === "QuantumDrive")
		return [
			{ label: "Speed", value: fMmps(comp.qd_speed), accent: "text-purple-400" },
			{ label: "Spool", value: fN(comp.qd_spool_time, "s", 1) },
			{ label: "Range", value: fKm(comp.qd_range) },
			{ label: "Cooldown", value: fN(comp.qd_cooldown, "s", 1) },
			{ label: "Fuel Rate", value: comp.qd_fuel_rate ? `${Number(comp.qd_fuel_rate).toFixed(4)}/s` : "—" },
			{ label: "Cal. Rate", value: comp.qd_calibration_rate ? fN(comp.qd_calibration_rate, "", 2) : "—" },
			{ label: "Max Cal. Angle", value: comp.qd_calibration_max_angle ? fN(comp.qd_calibration_max_angle, "°", 1) : "—" },
		];
	if (t === "PowerPlant")
		return [
			{ label: "Output", value: fN(comp.power_output, "W"), accent: "text-yellow-400" },
			{ label: "Draw", value: fN(comp.power_draw, "W") },
		];
	if (t === "Cooler")
		return [
			{ label: "Cooling", value: fN(comp.cooling_rate), accent: "text-cyan-400" },
			{ label: "Heat Gen", value: fN(comp.heat_generation) },
		];
	if (t === "FuelTank")
		return [
			{ label: "Capacity", value: fN(comp.fuel_capacity, "L"), accent: "text-green-400" },
		];
	if (t === "FuelIntake")
		return [
			{ label: "Rate", value: comp.fuel_intake_rate ? `${fN(comp.fuel_intake_rate, "", 2)}/s` : "—", accent: "text-green-400" },
		];
	if (t === "Radar")
		return [
			{ label: "Ping Range", value: fKm(comp.radar_ping_range ?? comp.radar_range), accent: "text-indigo-400" },
			{ label: "Ping Cooldown", value: comp.radar_ping_cooldown ? `${fN(comp.radar_ping_cooldown, "", 1)} s` : "—" },
			{ label: "Track Signal", value: fPct(comp.radar_tracking_signal) },
			{ label: "Det. Lifetime", value: comp.radar_detection_lifetime ? `${fN(comp.radar_detection_lifetime, "", 1)} s` : "—" },
		];
	if (t === "Missile" || t === "Bomb" || t === "Torpedo")
		return [
			{ label: "Damage", value: fN(comp.missile_damage), accent: "text-orange-400" },
			{ label: "Guidance", value: comp.missile_guidance_mode ?? comp.missile_signal_type ?? "—" },
			{ label: "Speed", value: fN(comp.missile_speed, "m/s", 0) },
			{ label: "Range", value: fN(comp.missile_range, "m", 0) },
			{ label: "Lock Time", value: fN(comp.missile_lock_time, "s", 2) },
			{ label: "Blast Radius", value: comp.missile_explosion_radius ? fN(comp.missile_explosion_radius, "m", 0) : "—" },
		];
	if (t === "MissileRack")
		return [
			{ label: "Racks", value: fN(comp.rack_count), accent: "text-orange-400" },
			{ label: "Missile Size", value: comp.rack_missile_size ? `S${comp.rack_missile_size}` : "—" },
		];
	if (t === "Thruster")
		return [
			{ label: "Thrust", value: comp.thruster_max_thrust ? `${(Number(comp.thruster_max_thrust) / 1000).toFixed(0)} kN` : "—", accent: "text-amber-400" },
			{ label: "Type", value: comp.thruster_type ?? "—" },
		];
	if (t === "EMP")
		return [
			{ label: "Damage", value: fN(comp.emp_damage), accent: "text-red-400" },
			{ label: "Radius", value: fN(comp.emp_radius, "m", 0) },
			{ label: "Charge", value: fN(comp.emp_charge_time, "s", 1) },
			{ label: "Cooldown", value: fN(comp.emp_cooldown, "s", 1) },
		];
	if (t === "QuantumInterdictionGenerator")
		return [
			{ label: "Jammer Range", value: fN(comp.qig_jammer_range, "m", 0), accent: "text-purple-400" },
			{ label: "Snare Radius", value: fN(comp.qig_snare_radius, "m", 0) },
			{ label: "Charge", value: fN(comp.qig_charge_time, "s", 1) },
			{ label: "Cooldown", value: fN(comp.qig_cooldown, "s", 1) },
		];
	if (t === "MiningLaser")
		return [
			{ label: "Speed", value: comp.mining_speed ? fN(comp.mining_speed, "", 2) : "—", accent: "text-amber-400" },
			{ label: "Range", value: fN(comp.mining_range, "m", 0) },
			{ label: "Resistance", value: comp.mining_resistance ? fPct(comp.mining_resistance) : "—" },
			{ label: "Instability", value: comp.mining_instability ? fPct(comp.mining_instability) : "—" },
		];
	if (t === "TractorBeam")
		return [
			{ label: "Force", value: comp.tractor_max_force ? `${(Number(comp.tractor_max_force) / 1000).toFixed(0)} kN` : "—", accent: "text-teal-400" },
			{ label: "Range", value: fN(comp.tractor_max_range, "m", 0) },
		];
	if (t === "SalvageHead")
		return [
			{ label: "Speed", value: fN(comp.salvage_speed, "", 2), accent: "text-amber-400" },
			{ label: "Range", value: fN(comp.salvage_range, "m", 0) },
			{ label: "Radius", value: fN(comp.salvage_radius, "m", 0) },
		];
	if (t === "Countermeasure")
		return [
			{ label: "Type", value: comp.cm_type ?? "—", accent: "text-slate-300" },
			{ label: "Ammo", value: fN(comp.cm_ammo_count) },
		];
	if (t === "Gimbal")
		return [
			{ label: "Type", value: comp.gimbal_type ?? "—", accent: "text-slate-300" },
			{ label: "Max Angle", value: comp.gimbal_max_angle ? fN(comp.gimbal_max_angle, "°", 1) : "—" },
			{ label: "Pitch Speed", value: comp.gimbal_pitch_speed ? fN(comp.gimbal_pitch_speed, "°/s", 0) : "—" },
			{ label: "Yaw Speed", value: comp.gimbal_yaw_speed ? fN(comp.gimbal_yaw_speed, "°/s", 0) : "—" },
		];
	if (t === "Turret" || t === "TurretUnmanned")
		return [
			{ label: "Pitch", value: (comp.turret_min_pitch != null && comp.turret_max_pitch != null) ? `${fN(comp.turret_min_pitch, "°", 0)} / ${fN(comp.turret_max_pitch, "°", 0)}` : "—", accent: "text-cyan-400" },
			{ label: "Yaw", value: (comp.turret_min_yaw != null && comp.turret_max_yaw != null) ? `${fN(comp.turret_min_yaw, "°", 0)} / ${fN(comp.turret_max_yaw, "°", 0)}` : "—" },
		];
	return [];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComponentDetailPage() {
	const params = useParams<{ uuid: string }>();
	const uuid = params?.uuid;
	const router = useRouter();
	const { env } = useEnv();

	const {
		data: comp,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["components.get", uuid, env],
		queryFn: () => api.components.get(uuid!, env),
		enabled: !!uuid,
	});
	const { data: ships } = useQuery({
		queryKey: ["components.ships", uuid, env],
		queryFn: () => api.components.ships(uuid!, env),
		enabled: !!uuid,
	});
	const { data: buyLocs } = useQuery({
		queryKey: ["components.buyLocs", uuid, env],
		queryFn: () => api.components.buyLocations(uuid!, env),
		enabled: !!uuid,
	});
	const { data: craftingData } = useQuery({
		queryKey: ["crafting.byOutput", uuid, env],
		queryFn: () => api.crafting.recipes({ outputItemUuid: uuid!, env, limit: 5 }),
		enabled: !!uuid,
	});

	if (isLoading) return <LoadingGrid message="LOADING COMPONENT…" />;
	if (error)
		return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
	if (!comp) return null;

	const typeColor = COMPONENT_TYPE_COLORS[comp.type] ?? "text-slate-400";
	const heroStats = getHeroStats(comp).filter((s) => s.value !== "—");
	const componentMetricGroups = getComponentMetricGroups(comp);

	return (
		<PageShell size="xl">
			{/* Breadcrumb */}
			<div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
				<button
					type="button"
					onClick={() => router.back()}
					className="hover:text-slate-400 transition-colors flex items-center gap-1"
				>
					<ArrowLeft size={12} /> Back
				</button>
				<ChevronRight size={10} />
				<Link href="/components" className="hover:text-slate-400 transition-colors">
					Components
				</Link>
				<ChevronRight size={10} />
				<span className="text-slate-400">{comp.name}</span>
			</div>

			{/* Hero */}
			<div className="sci-panel overflow-hidden">
				{/* Image placeholder */}
				<div className="relative w-full h-48 bg-slate-900">
					<div className="w-full h-full flex items-center justify-center">
						<span className="font-orbitron text-6xl font-black text-slate-800 select-none tracking-widest">
							{comp.type.slice(0, 3).toUpperCase()}
						</span>
					</div>
					<div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#0A1628] to-transparent" />
				</div>

				{/* Header info */}
				<div className="px-6 pb-6 -mt-8 relative">
					<div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
						<div>
							<p className={`text-xs font-mono-sc ${typeColor} uppercase tracking-widest mb-1`}>
								{comp.type}{comp.sub_type ? ` · ${comp.sub_type}` : ""}
							</p>
							<h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">
								{comp.name}
							</h1>
							<div className="flex flex-wrap gap-2 mt-3">
								{generateComponentTags(comp as unknown as import('@/types/api').ComponentListItem).map((tag) => (
									<SmartTag key={tag} id={tag} label={tag.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} />
								))}
								{comp.grade && <GlowBadge color="amber">{comp.grade}</GlowBadge>}
								{comp.size != null && <GlowBadge color="slate">S{comp.size}</GlowBadge>}
								{comp.manufacturer_name && <GlowBadge color="cyan">{comp.manufacturer_name}</GlowBadge>}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Quick stats bar */}
			{heroStats.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{heroStats.map((s) => (
						<HeroStat key={s.label} label={s.label} value={s.value} accent={s.accent} />
					))}
				</div>
			)}

			{/* Description */}
			{comp.description && (
				<p className="text-sm text-slate-400 leading-relaxed border-l-2 border-cyan-900/40 pl-4">
					{comp.description}
				</p>
			)}

			<ComponentMetricPanels groups={componentMetricGroups} />

			<PriceAvailabilityPanel rows={buyLocs} />

			{/* Blueprint & Crafting */}
			{craftingData && craftingData.data.length > 0 && (
				<ScifiPanel
					title="Crafting"
					subtitle={`${craftingData.total} recipe${craftingData.total !== 1 ? 's' : ''}`}
					actions={<FlaskConical size={14} className="text-purple-500" />}
				>
					<div className="space-y-3">
						{craftingData.data.map((recipe) => (
							<Link
								key={recipe.uuid}
								href={`/crafting?recipe=${recipe.uuid}`}
								className="block sci-panel p-3 bg-purple-950/10 border-purple-900/30 hover:border-purple-500/40 transition-colors"
							>
								<div className="flex items-start justify-between gap-2 mb-2">
									<p className="text-xs font-orbitron text-slate-200 leading-tight">
										{recipe.display_name ?? recipe.name ?? 'Crafting recipe'}
									</p>
									<div className="flex gap-1 shrink-0">
										{recipe.station_type && (
											<span className="text-[9px] font-mono-sc text-purple-400 border border-purple-900/40 bg-purple-950/20 rounded-sm px-1.5 py-0.5 leading-none">
												{recipe.station_type}
											</span>
										)}
										{recipe.skill_level != null && (
											<span className="text-[9px] font-mono-sc text-amber-400 border border-amber-900/40 bg-amber-950/20 rounded-sm px-1.5 py-0.5 leading-none">
												Lvl {recipe.skill_level}
											</span>
										)}
									</div>
								</div>
								{recipe.crafting_time_s != null && (
									<p className="text-[10px] font-mono-sc text-slate-500 mb-2">
										⏱ {recipe.crafting_time_s < 60 ? `${recipe.crafting_time_s}s` : `${Math.round(recipe.crafting_time_s / 60)} min`}
										{recipe.output_quantity != null && recipe.output_quantity > 1 && ` · ×${recipe.output_quantity}`}
									</p>
								)}
								{recipe.ingredients && recipe.ingredients.length > 0 && (
									<div className="flex flex-wrap gap-1">
										{recipe.ingredients.map((ing, i) => (
											<span key={i} className="text-[9px] font-mono-sc text-slate-500 border border-slate-800 bg-slate-900/40 rounded-sm px-1.5 py-0.5 leading-none">
												{ing.quantity != null ? `×${ing.quantity} ` : ''}{ing.display_item_name ?? ing.displayItemName ?? ing.item_name}
											</span>
										))}
									</div>
								)}
							</Link>
						))}
					</div>
				</ScifiPanel>
			)}

			<ScifiPanel
				title="Default Loadouts"
				subtitle={ships?.length ? `${ships.length} ship${ships.length !== 1 ? "s" : ""} equipped by default` : "Not equipped by default"}
				actions={<Rocket size={14} className="text-slate-600" />}
			>
				{!ships?.length ? (
					<div className="py-5 text-center">
						<p className="text-sm font-rajdhani text-slate-400">No default ship loadout uses this component</p>
						<p className="text-xs text-slate-600 mt-1">
							It can still be compatible or buyable, but it is not present in any stock loadout.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
						{ships.map((s) => (
							<Link
								key={s.uuid}
								href={`/ships/${s.uuid}`}
								className="flex items-center gap-2 sci-panel px-2 py-1.5 hover:border-cyan-800/60 transition-colors group overflow-hidden"
							>
								{s.thumbnail && (
									<div className="relative w-14 h-9 shrink-0 rounded-sm overflow-hidden bg-slate-900">
										<Image src={s.thumbnail} alt={s.name ?? ''} fill className="object-cover" unoptimized />
									</div>
								)}
								<div className="min-w-0 flex-1">
									<p className="text-xs font-orbitron text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
										{s.name ?? 'Unnamed ship'}
									</p>
									{s.manufacturer_code && (
										<p className="text-[10px] font-mono-sc text-slate-600 mt-0.5">
											{s.manufacturer_code}
											{s.equipped_count ? ` · ${s.equipped_count} slot${s.equipped_count > 1 ? "s" : ""}` : ""}
										</p>
									)}
									{Array.isArray(s.equipped_ports) && s.equipped_ports.length > 0 && (
										<p className="text-[10px] font-mono-sc text-slate-700 truncate mt-0.5">
											{s.equipped_ports.slice(0, 3).join(", ")}
											{s.equipped_ports.length > 3 ? ` +${s.equipped_ports.length - 3}` : ""}
										</p>
									)}
								</div>
							</Link>
						))}
					</div>
				)}
			</ScifiPanel>
		</PageShell>
	);
}
