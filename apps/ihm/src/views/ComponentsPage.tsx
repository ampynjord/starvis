import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { FilterPanel } from "@/components/ui/FilterPanel";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { useListQueryState } from "@/hooks/useListQueryState";
import { COMPONENT_TYPE_COLORS } from "@/utils/constants";
import type { ComponentListItem } from "@/types/api";

const LIMIT = 30;

interface KeyStat {
	label: string;
	value: (c: ComponentListItem) => number | null | undefined;
	format: (v: number) => string;
}

const fNum = (v: number, dec = 0) =>
	v.toLocaleString("en-US", {
		maximumFractionDigits: dec,
		minimumFractionDigits: dec,
	});

/** Key stat(s) to show per component type */
const KEY_STATS: Partial<Record<string, KeyStat[]>> = {
	Shield: [
		{ label: "HP", value: (c) => c.shield_hp, format: (v) => fNum(v) },
		{
			label: "Regen",
			value: (c) => c.shield_regen,
			format: (v) => `${fNum(v, 1)}/s`,
		},
	],
	WeaponGun: [
		{
			label: "DPS",
			value: (c) => c.weapon_dps,
			format: (v) => fNum(v, 1),
		},
		{
			label: "Range",
			value: (c) => c.weapon_range,
			format: (v) => `${fNum(v)}m`,
		},
	],
	WeaponMissile: [
		{
			label: "Dmg",
			value: (c) => c.missile_damage,
			format: (v) => fNum(v),
		},
	],
	MissileRack: [
		{
			label: "Racks",
			value: (c) => c.rack_count,
			format: (v) => String(v),
		},
		{
			label: "Size",
			value: (c) => c.rack_missile_size,
			format: (v) => `S${v}`,
		},
	],
	QuantumDrive: [
		{
			label: "Speed",
			value: (c) => c.qd_speed,
			format: (v) => `${(v / 1e6).toFixed(0)} Mm/s`,
		},
		{
			label: "Spool",
			value: (c) => c.qd_spool_time,
			format: (v) => `${v}s`,
		},
	],
	PowerPlant: [
		{
			label: "Power",
			value: (c) => c.power_output,
			format: (v) => fNum(v),
		},
	],
	Cooler: [
		{
			label: "Cooling",
			value: (c) => c.cooling_rate,
			format: (v) => fNum(v),
		},
	],
	FuelTank: [
		{
			label: "Cap",
			value: (c) => c.fuel_capacity,
			format: (v) => fNum(v),
		},
	],
	FuelIntake: [
		{
			label: "Rate",
			value: (c) => c.fuel_intake_rate,
			format: (v) => `${fNum(v, 1)}/s`,
		},
	],
	Radar: [
		{
			label: "Range",
			value: (c) => c.radar_range,
			format: (v) => `${fNum(v)}m`,
		},
	],
	Countermeasure: [
		{
			label: "Ammo",
			value: (c) => c.cm_ammo_count,
			format: (v) => String(v),
		},
	],
	Thruster: [
		{
			label: "Thrust",
			value: (c) => c.thruster_max_thrust,
			format: (v) => `${(v / 1000).toFixed(0)}kN`,
		},
	],
	EMP: [
		{
			label: "Dmg",
			value: (c) => c.emp_damage,
			format: (v) => fNum(v),
		},
		{
			label: "Radius",
			value: (c) => c.emp_radius,
			format: (v) => `${fNum(v)}m`,
		},
	],
	MiningLaser: [
		{
			label: "Speed",
			value: (c) => c.mining_speed,
			format: (v) => fNum(v, 1),
		},
	],
};

function ComponentStats({ comp }: { comp: ComponentListItem }) {
	const stats = KEY_STATS[comp.type];
	if (!stats) return null;

	const rendered = stats
		.map((s) => ({ ...s, v: s.value(comp) }))
		.filter((s) => s.v != null && s.v > 0);

	if (!rendered.length) return null;

	return (
		<div className="flex items-center gap-3 flex-wrap">
			{rendered.map((s) => (
				<span key={s.label} className="flex items-center gap-1">
					<span className="text-[10px] font-mono-sc text-slate-600 uppercase">
						{s.label}
					</span>
					<span className="text-xs font-mono-sc text-slate-300 font-semibold">
						{s.format(s.v!)}
					</span>
				</span>
			))}
		</div>
	);
}

export default function ComponentsPage() {
	const { env } = useEnv();
	const {
		page,
		search,
		debouncedSearch,
		setPage,
		updateSearch,
		updatePageWithScroll,
		resetListState,
	} = useListQueryState();
	const [type, setType] = useState("");
	const [size, setSize] = useState("");
	const [grade, setGrade] = useState("");
	const [manufacturer, setManufacturer] = useState("");

	const { data: filters } = useQuery({
		queryKey: ["components.filters", env],
		queryFn: () => api.components.filters(env),
		staleTime: Number.POSITIVE_INFINITY,
	});

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [
			"components.list",
			env,
			{ page, search: debouncedSearch, type, size, grade, manufacturer },
		],
		queryFn: () =>
			api.components.list({
				env,
				page,
				limit: LIMIT,
				search: debouncedSearch || undefined,
				type: type || undefined,
				size: size ? Number(size) : undefined,
				grade: grade || undefined,
				manufacturer: manufacturer || undefined,
			}),
	});

	const hasFilters = !!(type || size || grade || manufacturer || debouncedSearch);
	const resetFilters = () => {
		setType("");
		setSize("");
		setGrade("");
		setManufacturer("");
		resetListState();
	};

	const filterGroups = filters
		? [
				{
					key: "type",
					label: "Type",
					options: (filters["types"] ?? []).map((t: string) => ({
						label: t,
						value: t,
					})),
					value: type,
					onChange: (v: string) => {
						setType(v);
						setPage(1);
					},
				},
				{
					key: "size",
					label: "Size",
					options: [...new Set((filters["sizes"] ?? []).map(Number))]
						.sort((a, b) => a - b)
						.map((s) => ({ label: `S${s}`, value: String(s) })),
					value: size,
					onChange: (v: string) => {
						setSize(v);
						setPage(1);
					},
				},
				{
					key: "grade",
					label: "Grade",
					options: (filters["grades"] ?? []).map((g: string) => ({
						label: g,
						value: g,
					})),
					value: grade,
					onChange: (v: string) => {
						setGrade(v);
						setPage(1);
					},
				},
				{
					key: "mfr",
					label: "Manufacturer",
					options: (filters["manufacturers"] ?? []).map((m: string) => ({
						label: m,
						value: m,
					})),
					value: manufacturer,
					onChange: (v: string) => {
						setManufacturer(v);
						setPage(1);
					},
				},
			]
		: [];

	return (
		<div className="max-w-(--breakpoint-2xl) mx-auto">
			<div className="mb-6 flex items-center justify-between gap-4">
				<div>
					<h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
						Components
					</h1>
					{data && (
						<p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
							{data.total.toLocaleString("en-US")} components
						</p>
					)}
				</div>
				<div className="relative w-72">
					<Search
						className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
						size={13}
					/>
					<input
						type="text"
						value={search}
						onChange={(e) => updateSearch(e.target.value)}
						placeholder="Search a component…"
						className="sci-input w-full pl-8 text-xs"
					/>
				</div>
			</div>

			<div className="flex gap-4">
				<div className="w-44 shrink-0">
					{filterGroups.length > 0 ? (
						<FilterPanel
							hasFilters={hasFilters}
							onReset={resetFilters}
							groups={filterGroups}
						/>
					) : (
						<div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">
							Loading…
						</div>
					)}
				</div>

				<div className="flex-1 min-w-0">
					{isLoading ? (
						<LoadingGrid message="LOADING COMPONENTS…" />
					) : error ? (
						<ErrorState error={error as Error} onRetry={() => void refetch()} />
					) : data?.data.length === 0 ? (
						<EmptyState icon="⚙" title="No components" message="Try adjusting your filters." />
					) : (
						<>
							<div className="space-y-1">
								{data?.data.map((comp, i) => (
									<motion.div
										key={comp.uuid}
										initial={{ opacity: 0, x: -8 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: Math.min(i * 0.02, 0.3) }}
									>
										<Link
											href={`/components/${comp.uuid}`}
											className="flex items-center gap-4 sci-panel hover:border-cyan-800/60 transition-colors px-4 py-2.5 group"
										>
											{/* Type color bar */}
											<div
												className={`w-0.5 self-stretch rounded-full shrink-0 ${
													COMPONENT_TYPE_COLORS[comp.type]
														?.replace("text-", "bg-")
														.replace("/", "/") ?? "bg-slate-700"
												} opacity-60`}
											/>

											{/* Main info */}
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="font-orbitron text-sm text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
														{comp.name}
													</span>
													{comp.grade && (
														<GlowBadge color="amber" size="xs">
															{comp.grade}
														</GlowBadge>
													)}
													{comp.size != null && (
														<GlowBadge color="slate" size="xs">
															S{comp.size}
														</GlowBadge>
													)}
												</div>
												<div className="flex items-center gap-3 mt-0.5 flex-wrap">
													<span
														className={`text-xs font-mono-sc ${COMPONENT_TYPE_COLORS[comp.type] ?? "text-slate-500"}`}
													>
														{comp.type}
													</span>
													{comp.sub_type && (
														<span className="text-xs text-slate-600">
															{comp.sub_type}
														</span>
													)}
													{comp.manufacturer_name && (
														<span className="text-xs text-slate-600">
															{comp.manufacturer_name}
														</span>
													)}
												</div>
											</div>

											{/* Key stats */}
											<div className="shrink-0 text-right">
												<ComponentStats comp={comp} />
											</div>
										</Link>
									</motion.div>
								))}
							</div>
							{data && (
								<Pagination
									className="mt-6"
									page={data.page}
									totalPages={data.pages}
									onPageChange={updatePageWithScroll}
								/>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
