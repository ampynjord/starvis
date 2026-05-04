import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	MapPin,
	Rocket,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { ScifiPanel } from "@/components/ui/ScifiPanel";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { ErrorState } from "@/components/ui/ErrorState";
import { CanonicalMeta } from "@/components/ui/CanonicalMeta";
import { COMPONENT_TYPE_COLORS } from "@/utils/constants";
import { fCredits } from "@/utils/formatters";
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
}: { label: string; value: string; accent?: string }) {
	if (value === "—") return null;
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 min-w-[80px]">
			<span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">
				{label}
			</span>
			<span
				className={`text-lg font-orbitron font-bold tabular-nums leading-none ${accent ?? "text-cyan-400"}`}
			>
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

// ─── Damage breakdown bar ─────────────────────────────────────────────────────

function DamageBreakdown({
	physical,
	energy,
	distortion,
	thermal,
	biochemical,
	stun,
	total,
}: {
	physical?: number | null;
	energy?: number | null;
	distortion?: number | null;
	thermal?: number | null;
	biochemical?: number | null;
	stun?: number | null;
	total: number | null;
}) {
	const t = Number(total) || 0;
	if (t === 0) return null;
	const p = Math.round(((Number(physical) || 0) / t) * 100);
	const e = Math.round(((Number(energy) || 0) / t) * 100);
	const d = Math.round(((Number(distortion) || 0) / t) * 100);
	const th = Math.round(((Number(thermal) || 0) / t) * 100);
	const b = Math.round(((Number(biochemical) || 0) / t) * 100);
	const s = Math.round(((Number(stun) || 0) / t) * 100);
	const hasBreakdown = p > 0 || e > 0 || d > 0 || th > 0 || b > 0 || s > 0;
	if (!hasBreakdown) return null;
	return (
		<div className="mt-2">
			<p className="text-[10px] font-mono-sc text-slate-600 uppercase mb-1">
				Damage breakdown
			</p>
			<div className="flex h-2 rounded-full overflow-hidden gap-px">
				{p > 0 && <div className="bg-orange-500/70 rounded-full" style={{ width: `${p}%` }} title={`Physical ${p}%`} />}
				{e > 0 && <div className="bg-blue-500/70 rounded-full" style={{ width: `${e}%` }} title={`Energy ${e}%`} />}
				{d > 0 && <div className="bg-purple-500/70 rounded-full" style={{ width: `${d}%` }} title={`Distortion ${d}%`} />}
				{th > 0 && <div className="bg-red-500/70 rounded-full" style={{ width: `${th}%` }} title={`Thermal ${th}%`} />}
				{b > 0 && <div className="bg-green-500/70 rounded-full" style={{ width: `${b}%` }} title={`Biochemical ${b}%`} />}
				{s > 0 && <div className="bg-yellow-400/70 rounded-full" style={{ width: `${s}%` }} title={`Stun ${s}%`} />}
			</div>
			<div className="flex flex-wrap gap-3 mt-1">
				{p > 0 && <span className="text-[10px] font-mono-sc text-orange-500">Phys {p}%</span>}
				{e > 0 && <span className="text-[10px] font-mono-sc text-blue-400">Energy {e}%</span>}
				{d > 0 && <span className="text-[10px] font-mono-sc text-purple-400">Dist {d}%</span>}
				{th > 0 && <span className="text-[10px] font-mono-sc text-red-400">Thermal {th}%</span>}
				{b > 0 && <span className="text-[10px] font-mono-sc text-green-400">Biochem {b}%</span>}
				{s > 0 && <span className="text-[10px] font-mono-sc text-yellow-400">Stun {s}%</span>}
			</div>
		</div>
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
			{ label: "Hardening", value: comp.shield_hardening ? fPct(comp.shield_hardening) : "—" },
		];
	if (t === "QuantumDrive")
		return [
			{ label: "Speed", value: fMmps(comp.qd_speed), accent: "text-purple-400" },
			{ label: "Spool", value: fN(comp.qd_spool_time, "s", 1) },
			{ label: "Cooldown", value: fN(comp.qd_cooldown, "s", 1) },
			{ label: "Fuel Rate", value: comp.qd_fuel_rate ? `${Number(comp.qd_fuel_rate).toFixed(4)}/s` : "—" },
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
			{ label: "Ping Range", value: fKm(comp.radar_range ? Number(comp.radar_range) * 1000 : null), accent: "text-indigo-400" },
			{ label: "Ping Duration", value: comp.radar_detection_lifetime ? `${fN(comp.radar_detection_lifetime, "", 1)} s` : "—" },
			{ label: "Tracking", value: fPct(comp.radar_tracking_signal) },
		];
	if (t === "Missile")
		return [
			{ label: "Damage", value: fN(comp.missile_damage), accent: "text-orange-400" },
			{ label: "Signal", value: comp.missile_signal_type ?? "—" },
			{ label: "Speed", value: fN(comp.missile_speed, "m/s", 0) },
			{ label: "Range", value: fN(comp.missile_range, "m", 0) },
			{ label: "Lock Time", value: fN(comp.missile_lock_time, "s", 2) },
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
			{ label: "Radius", value: fN(comp.salvage_radius, "m", 0) },
		];
	if (t === "Countermeasure")
		return [
			{ label: "Ammo", value: fN(comp.cm_ammo_count), accent: "text-slate-300" },
		];
	if (t === "Gimbal")
		return [
			{ label: "Type", value: comp.gimbal_type ?? "—", accent: "text-slate-300" },
		];
	return [];
}

function getSectionTitle(type: string): string {
	const map: Record<string, string> = {
		WeaponGun: "Weapon Stats",
		Shield: "Shield Stats",
		QuantumDrive: "Quantum Drive",
		PowerPlant: "Power Plant",
		Cooler: "Cooler",
		FuelTank: "Fuel Tank",
		FuelIntake: "Fuel Intake",
		Radar: "Radar",
		Missile: "Missile Stats",
		MissileRack: "Missile Rack",
		Thruster: "Thruster",
		EMP: "EMP Stats",
		QuantumInterdictionGenerator: "Quantum Interdiction",
		MiningLaser: "Mining Stats",
		TractorBeam: "Tractor Beam",
		SalvageHead: "Salvage Stats",
		Countermeasure: "Countermeasure",
		Gimbal: "Gimbal",
		Turret: "Turret",
		TurretUnmanned: "Turret (Unmanned)",
		LifeSupport: "Life Support",
	};
	return map[type] ?? "Stats";
}

function getTypeSpecs(comp: Component): { label: string; value: string }[] {
	const t = comp.type;
	if (t === "WeaponGun") {
		const isBeam = comp.weapon_beam_dps != null;
		if (isBeam)
			return [
				{ label: "Physical dmg/s", value: fN(comp.weapon_damage_physical, "", 1) },
				{ label: "Energy dmg/s", value: fN(comp.weapon_damage_energy, "", 1) },
				{ label: "Distortion dmg/s", value: fN(comp.weapon_damage_distortion, "", 1) },
				{ label: "Thermal dmg/s", value: fN(comp.weapon_damage_thermal, "", 1) },
			];
		return [
			{ label: "Alpha Damage", value: fN(comp.weapon_alpha_damage, "", 2) },
			{ label: "Physical", value: fN(comp.weapon_damage_physical, "", 2) },
			{ label: "Energy", value: fN(comp.weapon_damage_energy, "", 2) },
			{ label: "Distortion", value: fN(comp.weapon_damage_distortion, "", 2) },
			{ label: "Thermal", value: fN(comp.weapon_damage_thermal, "", 2) },
			{ label: "Biochemical", value: fN(comp.weapon_damage_biochemical, "", 2) },
			{ label: "Stun", value: fN(comp.weapon_damage_stun, "", 2) },
			{ label: "Pellets / shot", value: fN(comp.weapon_pellets_per_shot) },
			{ label: "Projectile speed", value: fN(comp.weapon_speed, "m/s", 0) },
			{ label: "Ammo capacity", value: fN(comp.weapon_ammo_count) },
		];
	}
	if (t === "Shield")
		return [
			{ label: "Faces", value: fN(comp.shield_faces) },
		];
	if (t === "QuantumDrive")
		return [
			{ label: "Stage 1 accel", value: fN(comp.qd_stage1_accel, "m/s²", 2) },
			{ label: "Stage 2 accel", value: fN(comp.qd_stage2_accel, "m/s²", 2) },
			{ label: "Tuning rate", value: fN(comp.qd_tuning_rate, "", 4) },
			{ label: "Alignment rate", value: fN(comp.qd_alignment_rate, "", 4) },
			{ label: "Disconnect range", value: fN(comp.qd_disconnect_range, "m", 0) },
		];
	if (t === "Missile")
		return [
			{ label: "Lock range", value: fN(comp.missile_lock_range, "m", 0) },
			{ label: "Physical", value: fN(comp.missile_damage_physical, "", 0) },
			{ label: "Energy", value: fN(comp.missile_damage_energy, "", 0) },
			{ label: "Distortion", value: fN(comp.missile_damage_distortion, "", 0) },
			{ label: "Thermal", value: fN(comp.missile_damage_thermal, "", 0) },
			{ label: "Biochemical", value: fN(comp.missile_damage_biochemical, "", 0) },
			{ label: "Stun", value: fN(comp.missile_damage_stun, "", 0) },
		];
	return [];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComponentDetailPage() {
	const params = useParams<{ uuid: string }>();
	const uuid = params?.uuid;
	const router = useRouter();
	const { env } = useEnv();
	const [rawOpen, setRawOpen] = useState(false);

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

	if (isLoading) return <LoadingGrid message="LOADING COMPONENT…" />;
	if (error)
		return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
	if (!comp) return null;

	const typeColor = COMPONENT_TYPE_COLORS[comp.type] ?? "text-slate-400";
	const heroStats = getHeroStats(comp).filter((s) => s.value !== "—");
	const typeSpecs = getTypeSpecs(comp).filter((s) => s.value !== "—");
	const sectionTitle = getSectionTitle(comp.type);
	const rawPayload = comp.game_data ?? comp.data_json ?? null;

	// Core specs (always relevant)
	const coreSpecs: { label: string; value: string }[] = [
		{ label: "Mass", value: fN(comp.mass, "kg", 2) },
		{ label: "HP", value: fN(comp.hp) },
		{ label: "Power base", value: fN(comp.power_base, "W") },
		{ label: "Power draw", value: fN(comp.power_draw, "W") },
		{ label: "Heat generation", value: fN(comp.heat_generation) },
		{ label: "EM signature", value: fN(comp.em_signature) },
		{ label: "IR signature", value: fN(comp.ir_signature) },
	].filter((s) => s.value !== "—");

	const isBeamWeapon = comp.weapon_beam_dps != null;
	const hasDamageBreakdown =
		comp.type === "WeaponGun" &&
		!isBeamWeapon &&
		(Number(comp.weapon_damage_physical) > 0 ||
			Number(comp.weapon_damage_energy) > 0 ||
			Number(comp.weapon_damage_distortion) > 0 ||
			Number(comp.weapon_damage_thermal) > 0 ||
			Number(comp.weapon_damage_biochemical) > 0 ||
			Number(comp.weapon_damage_stun) > 0);

	return (
		<div className="max-w-(--breakpoint-lg) mx-auto space-y-6">
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

			{/* Header card */}
			<div className="sci-panel p-6">
				<div className="flex flex-col gap-4">
					<div>
						<p className={`text-xs font-mono-sc ${typeColor} uppercase tracking-widest mb-1`}>
							{comp.type}
							{comp.sub_type ? ` · ${comp.sub_type}` : ""}
						</p>
						<h1 className="font-orbitron text-2xl font-black text-slate-100">
							{comp.name}
						</h1>
						<div className="flex flex-wrap gap-2 mt-3">
							{comp.grade && (
								<GlowBadge color="amber">{comp.grade}</GlowBadge>
							)}
							{comp.size != null && (
								<GlowBadge color="slate">S{comp.size}</GlowBadge>
							)}
							{comp.manufacturer_name && (
								<GlowBadge color="cyan">{comp.manufacturer_name}</GlowBadge>
							)}
							{comp.class_name && (
								<GlowBadge color="slate">{comp.class_name}</GlowBadge>
							)}
						</div>
					</div>

					{/* Hero stats */}
					{heroStats.length > 0 && (
						<div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
							{heroStats.map((s) => (
								<HeroStat key={s.label} label={s.label} value={s.value} accent={s.accent} />
							))}
						</div>
					)}

					{comp.description && (
						<p className="text-sm text-slate-500 leading-relaxed">
							{comp.description}
						</p>
					)}

					<CanonicalMeta
						sourceType={comp.source_type}
						sourceName={comp.source_name}
						confidenceScore={comp.confidence_score}
						canonicalKey={comp.canonical_component_key}
						normalizedName={comp.normalized_name}
					/>
				</div>
			</div>

			{/* Stats grid */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Type-specific stats */}
				{(heroStats.length > 0 || typeSpecs.length > 0) && (
					<ScifiPanel title={sectionTitle}>
						<div className="divide-y divide-slate-800/40">
							{heroStats.map((s) => (
								<SpecRow key={s.label} label={s.label} value={s.value} />
							))}
							{typeSpecs.map((s) => (
								<SpecRow key={s.label} label={s.label} value={s.value} />
							))}
						</div>
						{hasDamageBreakdown && (
							<DamageBreakdown
								physical={comp.weapon_damage_physical}
								energy={comp.weapon_damage_energy}
								distortion={comp.weapon_damage_distortion}
								thermal={comp.weapon_damage_thermal}
								biochemical={comp.weapon_damage_biochemical}
								stun={comp.weapon_damage_stun}
								total={comp.weapon_damage}
							/>
						)}
						{comp.type === "Missile" && Number(comp.missile_damage) > 0 && (
							<DamageBreakdown
								physical={comp.missile_damage_physical}
								energy={comp.missile_damage_energy}
								distortion={comp.missile_damage_distortion}
								thermal={comp.missile_damage_thermal}
								biochemical={comp.missile_damage_biochemical}
								stun={comp.missile_damage_stun}
								total={comp.missile_damage}
							/>
						)}
					</ScifiPanel>
				)}

				{/* Buy locations */}
				<ScifiPanel
					title="Buy Locations"
					subtitle={buyLocs ? `${buyLocs.length} locations` : undefined}
					actions={<MapPin size={14} className="text-slate-600" />}
				>
					{!buyLocs?.length ? (
						<p className="text-xs text-slate-600 italic py-4 text-center">
							No known buy locations
						</p>
					) : (
						<div className="space-y-1 max-h-72 overflow-y-auto">
							{buyLocs.map((loc, i) => (
								<div key={i} className="sci-panel px-3 py-2">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="text-sm text-slate-300 truncate">
												{loc.shop_name}
											</p>
											<p className="text-xs text-slate-600 truncate">
												{loc.location}
											</p>
											<CanonicalMeta
												compact
												className="mt-1"
												sourceType={
													loc.inventory_source_type ?? loc.shop_source_type
												}
												sourceName={
													loc.inventory_source_name ?? loc.shop_source_name
												}
												confidenceScore={loc.confidence_score}
											/>
										</div>
										{loc.base_price != null && (
											<span className="text-xs font-mono-sc text-amber-400 shrink-0">
												{fCredits(loc.base_price)}
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</ScifiPanel>
			</div>

			{/* Core specs */}
			{coreSpecs.length > 0 && (
				<ScifiPanel title="Core Specifications">
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
						{coreSpecs.map(({ label, value }) => (
							<div key={label} className="sci-panel p-2.5">
								<p className="text-xs text-slate-600 font-mono-sc uppercase">
									{label}
								</p>
								<p className="text-sm font-mono-sc text-slate-300 mt-0.5">
									{value}
								</p>
							</div>
						))}
					</div>
				</ScifiPanel>
			)}

			{/* Equipped Ships — lightweight list */}
			{ships && ships.length > 0 && (
				<ScifiPanel
					title="Equipped on Ships"
					subtitle={`${ships.length} ships`}
					actions={<Rocket size={14} className="text-slate-600" />}
				>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
						{ships.map((s) => (
							<Link
								key={s.uuid}
								href={`/ships/${s.uuid}`}
								className="flex items-center gap-2 sci-panel px-3 py-2 hover:border-cyan-800/60 transition-colors group"
							>
								<div className="min-w-0 flex-1">
									<p className="text-xs font-orbitron text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
										{s.name ?? s.class_name}
									</p>
									{s.manufacturer_code && (
										<p className="text-[10px] font-mono-sc text-slate-600 mt-0.5">
											{s.manufacturer_code}
										</p>
									)}
								</div>
							</Link>
						))}
					</div>
				</ScifiPanel>
			)}

			{/* Raw Game Data — collapsible */}
			{rawPayload && (
				<div className="sci-panel overflow-hidden">
					<button
						type="button"
						onClick={() => setRawOpen((v) => !v)}
						className="w-full flex items-center justify-between px-4 py-3 text-xs font-mono-sc text-slate-500 hover:text-slate-300 transition-colors"
					>
						<span className="uppercase tracking-widest">Raw Game Data</span>
						{rawOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
					</button>
					{rawOpen && (
						<pre className="border-t border-slate-800 px-4 py-3 max-h-96 overflow-auto text-xs text-slate-400 font-mono-sc leading-relaxed">
							{JSON.stringify(rawPayload, null, 2)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
