'use client';

/**
 * RankingPage — ship ranking table + bar chart
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
	BarChart2,
	ChevronDown,
	ChevronUp,
	ChevronsUpDown,
	Table2,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterPanel } from "@/components/ui/FilterPanel";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { fDimension, fMass, fNumber, fSpeed } from "@/utils/formatters";
import type { ShipListItem } from "@/types/api";

interface StatDef {
	key: keyof ShipListItem;
	label: string;
	unit?: string;
	format: (v: number | null) => string;
	higher_is_better: boolean;
	category: string;
	/** undefined = all vehicle categories */
	vehicleCategories?: string[];
}

const STATS: StatDef[] = [
	// Flight — ships & gravlev only
	{
		key: "scm_speed",
		label: "SCM Speed",
		unit: "m/s",
		format: fSpeed,
		higher_is_better: true,
		category: "Flight",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "max_speed",
		label: "Max Speed",
		unit: "m/s",
		format: fSpeed,
		higher_is_better: true,
		category: "Flight",
	},
	{
		key: "boost_speed_forward",
		label: "AB Forward",
		unit: "m/s",
		format: fSpeed,
		higher_is_better: true,
		category: "Flight",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "pitch_max",
		label: "Pitch",
		unit: "°/s",
		format: (v) => (v != null ? `${fNumber(v, 0)}°/s` : "—"),
		higher_is_better: true,
		category: "Flight",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "yaw_max",
		label: "Yaw",
		unit: "°/s",
		format: (v) => (v != null ? `${fNumber(v, 0)}°/s` : "—"),
		higher_is_better: true,
		category: "Flight",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "roll_max",
		label: "Roll",
		unit: "°/s",
		format: (v) => (v != null ? `${fNumber(v, 0)}°/s` : "—"),
		higher_is_better: true,
		category: "Flight",
		vehicleCategories: ["ship", "gravlev"],
	},
	// Combat
	{
		key: "total_hp",
		label: "Hull HP",
		unit: "HP",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Combat",
	},
	{
		key: "shield_hp",
		label: "Shield HP",
		unit: "HP",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Combat",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "weapon_damage_total",
		label: "Weapon DPS",
		unit: "DPS",
		format: (v) => fNumber(v, 1),
		higher_is_better: true,
		category: "Combat",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "missile_damage_total",
		label: "Missile Dmg",
		unit: "",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Combat",
		vehicleCategories: ["ship", "gravlev"],
	},
	// Transport
	{
		key: "cargo_capacity",
		label: "Cargo",
		unit: "SCU",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Transport",
	},
	{
		key: "crew_size",
		label: "Crew",
		unit: "",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Transport",
	},
	// Fuel
	{
		key: "hydrogen_fuel_capacity",
		label: "H² Fuel",
		unit: "L",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Fuel",
		vehicleCategories: ["ship", "gravlev"],
	},
	{
		key: "quantum_fuel_capacity",
		label: "QT Fuel",
		unit: "L",
		format: (v) => fNumber(v, 0),
		higher_is_better: true,
		category: "Fuel",
		vehicleCategories: ["ship"],
	},
	// Dimensions
	{
		key: "mass",
		label: "Mass",
		unit: "",
		format: fMass,
		higher_is_better: false,
		category: "Dimensions",
	},
	{
		key: "cross_section_z",
		label: "Length",
		unit: "m",
		format: fDimension,
		higher_is_better: false,
		category: "Dimensions",
	},
	{
		key: "cross_section_x",
		label: "Width",
		unit: "m",
		format: fDimension,
		higher_is_better: false,
		category: "Dimensions",
	},
	{
		key: "cross_section_y",
		label: "Height",
		unit: "m",
		format: fDimension,
		higher_is_better: false,
		category: "Dimensions",
	},
];

const STAT_CATEGORIES = ["All", "Flight", "Combat", "Transport", "Fuel", "Dimensions"];

const VEHICLE_CATS = [
	{ label: "Ships", value: "ship" },
	{ label: "Ground", value: "ground" },
	{ label: "Grav-lev", value: "gravlev" },
];

const TOP_N_OPTIONS: { label: string; value: number }[] = [
	{ label: "Top 25", value: 25 },
	{ label: "Top 50", value: 50 },
	{ label: "Top 100", value: 100 },
	{ label: "All", value: 0 },
];

/** Default sort key per vehicle category */
const DEFAULT_SORT: Record<string, keyof ShipListItem> = {
	ship: "scm_speed",
	ground: "max_speed",
	gravlev: "scm_speed",
};

function StatBar({
	value,
	max,
	invert,
}: { value: number; max: number; invert?: boolean }) {
	const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
	const isTop = pct >= 95;
	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
				<motion.div
					className={`h-full rounded-full ${isTop ? "bg-amber-400" : invert ? "bg-rose-500/70" : "bg-cyan-500/80"}`}
					initial={{ width: 0 }}
					animate={{ width: `${pct}%` }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				/>
			</div>
			<span className="text-[10px] font-mono-sc text-slate-500 w-8 text-right">
				{pct.toFixed(0)}%
			</span>
		</div>
	);
}

function SortIcon({
	col,
	active,
	order,
}: { col: string; active: string; order: "asc" | "desc" }) {
	if (col !== active) return <ChevronsUpDown size={12} className="text-slate-700" />;
	return order === "desc" ? (
		<ChevronDown size={12} className="text-cyan-400" />
	) : (
		<ChevronUp size={12} className="text-cyan-400" />
	);
}

export default function RankingPage() {
	const { env } = useEnv();
	const [sortKey, setSortKey] = useState<keyof ShipListItem>("scm_speed");
	const [order, setOrder] = useState<"asc" | "desc">("desc");
	const [vehicleCat, setVehicleCat] = useState("ship");
	const [statCat, setStatCat] = useState("Flight");
	const [viewMode, setViewMode] = useState<"table" | "chart">("table");
	const [topN, setTopN] = useState(50);
	const [manufacturer, setManufacturer] = useState("");

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["ships.ranking", sortKey, order, vehicleCat, env],
		queryFn: () => api.ships.ranking(String(sortKey), order, vehicleCat, env),
		staleTime: 5 * 60_000,
	});

	const { data: filters } = useQuery({
		queryKey: ["ships.filters", env],
		queryFn: () => api.ships.filters(env),
		staleTime: Number.POSITIVE_INFINITY,
	});

	const handleSort = (key: keyof ShipListItem) => {
		if (key === sortKey) setOrder((o) => (o === "desc" ? "asc" : "desc"));
		else {
			setSortKey(key);
			setOrder("desc");
		}
	};

	const switchVehicleCat = (cat: string) => {
		setVehicleCat(cat);
		setManufacturer("");
		// Reset sort key if it's not valid for the new category
		const validStats = STATS.filter(
			(s) => !s.vehicleCategories || s.vehicleCategories.includes(cat),
		);
		if (!validStats.find((s) => s.key === sortKey)) {
			setSortKey(DEFAULT_SORT[cat] ?? "max_speed");
			setOrder("desc");
		}
	};

	// Stats valid for current vehicle category
	const categoryStats = STATS.filter(
		(s) =>
			(!s.vehicleCategories || s.vehicleCategories.includes(vehicleCat)) &&
			(statCat === "All" || s.category === statCat),
	);

	const activeStatDef = STATS.find((s) => s.key === sortKey) ?? STATS[0];

	// All ships from API, filtered client-side by manufacturer
	const allShips = (data ?? []).filter(
		(s) => !manufacturer || s.manufacturer_code === manufacturer,
	);

	// Apply top-N
	const displayShips = topN > 0 ? allShips.slice(0, topN) : allShips;

	// Max per stat for percentage bars
	const maxByKey: Partial<Record<keyof ShipListItem, number>> = {};
	for (const stat of categoryStats) {
		const vals = allShips
			.map((s) => parseFloat(String(s[stat.key] ?? 0)))
			.filter((v) => v > 0);
		maxByKey[stat.key] = vals.length ? Math.max(...vals) : 1;
	}

	// Chart data for active stat
	const chartData = displayShips
		.filter(
			(s) =>
				(s[activeStatDef.key] as number | null) != null &&
				(s[activeStatDef.key] as number) > 0,
		)
		.map((s) => ({
			name: (s.name ?? s.class_name ?? "").slice(0, 22),
			value: parseFloat(String(s[activeStatDef.key])),
			uuid: s.uuid,
		}));

	const manufacturerOptions = (filters?.manufacturers ?? []).map((m) => ({
		label: m.name,
		value: m.code,
	}));

	const hasFilters = !!manufacturer;

	return (
		<div className="max-w-(--breakpoint-2xl) mx-auto space-y-4">
			<PageHeader
				title="Ranking"
				subtitle={`${displayShips.length}${topN > 0 && allShips.length > topN ? `/${allShips.length}` : ""} ships · sorted by ${activeStatDef.label}`}
				actions={
					<div className="flex items-center gap-2 flex-wrap">
						<select
							value={topN}
							onChange={(e) => setTopN(Number(e.target.value))}
							className="sci-input text-xs py-1.5"
						>
							{TOP_N_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
						<div className="flex gap-1 border border-slate-800 rounded-sm p-0.5">
							<button
								type="button"
								onClick={() => setViewMode("table")}
								title="Table view"
								className={`p-1.5 rounded-sm transition-colors ${viewMode === "table" ? "bg-cyan-950/60 text-cyan-400" : "text-slate-600 hover:text-slate-300"}`}
							>
								<Table2 size={14} />
							</button>
							<button
								type="button"
								onClick={() => setViewMode("chart")}
								title="Chart view"
								className={`p-1.5 rounded-sm transition-colors ${viewMode === "chart" ? "bg-cyan-950/60 text-cyan-400" : "text-slate-600 hover:text-slate-300"}`}
							>
								<BarChart2 size={14} />
							</button>
						</div>
						<div className="flex gap-1">
							{VEHICLE_CATS.map(({ label, value }) => (
								<button
									key={value}
									type="button"
									onClick={() => switchVehicleCat(value)}
									className={`px-3 py-1.5 text-xs font-rajdhani font-semibold uppercase tracking-wider rounded border transition-all ${
										vehicleCat === value
											? "bg-cyan-950/60 border-cyan-800 text-cyan-400"
											: "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-600"
									}`}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				}
			/>

			<div className="flex gap-4">
				{/* Left panel: stat category + manufacturer */}
				<div className="w-40 shrink-0 space-y-3">
					<FilterPanel
						hasFilters={hasFilters || statCat !== "All"}
						onReset={() => {
							setStatCat("All");
							setManufacturer("");
						}}
						groups={[
							{
								key: "cat",
								label: "Stat category",
								options: STAT_CATEGORIES.map((c) => ({ label: c, value: c })),
								value: statCat,
								onChange: (v: string) => setStatCat(v),
							},
							{
								key: "manufacturer",
								label: "Manufacturer",
								options: manufacturerOptions,
								value: manufacturer,
								onChange: (v: string) => setManufacturer(v),
							},
						]}
					/>
				</div>

				{/* Table / Chart */}
				<div className="flex-1 min-w-0 overflow-x-auto">
					{isLoading ? (
						<LoadingGrid message="COMPUTING RANKINGS…" />
					) : error ? (
						<ErrorState error={error as Error} onRetry={() => void refetch()} />
					) : viewMode === "chart" ? (
						/* ─── Bar Chart view — active stat only ─── */
						<div className="sci-panel p-4">
							<p className="font-orbitron text-xs font-bold uppercase tracking-widest mb-1 text-cyan-400">
								{activeStatDef.label}
								{activeStatDef.unit ? ` (${activeStatDef.unit})` : ""}
							</p>
							<p className="text-[10px] font-mono-sc text-slate-600 mb-4">
								Click a stat column in table view to change the chart
							</p>
							{chartData.length === 0 ? (
								<p className="text-xs text-slate-600 font-mono-sc py-8 text-center">
									No data for this stat
								</p>
							) : (
								<ResponsiveContainer
									width="100%"
									height={Math.max(300, chartData.length * 24)}
								>
									<BarChart
										data={chartData}
										layout="vertical"
										margin={{ top: 0, right: 80, bottom: 0, left: 8 }}
									>
										<CartesianGrid
											strokeDasharray="3 3"
											horizontal={false}
											stroke="#1e293b"
										/>
										<XAxis
											type="number"
											tick={{
												fill: "#475569",
												fontSize: 10,
												fontFamily: "monospace",
											}}
											tickFormatter={(v: number) => activeStatDef.format(v)}
											axisLine={false}
											tickLine={false}
										/>
										<YAxis
											type="category"
											dataKey="name"
											width={130}
											tick={{
												fill: "#94a3b8",
												fontSize: 10,
												fontFamily: "Rajdhani, sans-serif",
											}}
											axisLine={false}
											tickLine={false}
										/>
										<Tooltip
											contentStyle={{
												background: "#0f172a",
												border: "1px solid #1e293b",
												borderRadius: "6px",
												fontSize: "11px",
											}}
											formatter={(v: number) => [
												activeStatDef.format(v),
												activeStatDef.label,
											]}
											cursor={{ fill: "rgba(255,255,255,0.04)" }}
										/>
										<Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={18}>
											{chartData.map((_, i) => (
												<Cell
													key={i}
													fill={
														i === 0
															? "#fbbf24"
															: i < 3
																? "#22d3ee"
																: "#334155"
													}
												/>
											))}
											<LabelList
												dataKey="value"
												position="right"
												formatter={(v: number) => activeStatDef.format(v)}
												style={{
													fill: "#64748b",
													fontSize: 10,
													fontFamily: "monospace",
												}}
											/>
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					) : (
						/* ─── Table view ─── */
						<table className="w-full text-xs border-collapse">
							<thead>
								<tr className="border-b border-slate-800">
									<th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider w-8">
										#
									</th>
									<th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider">
										Ship
									</th>
									<th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider">
										Mfr
									</th>
									{categoryStats.map((stat) => (
										<th
											key={stat.key as string}
											className={`text-right px-3 py-2 font-mono-sc uppercase tracking-wider cursor-pointer whitespace-nowrap select-none transition-colors ${
												stat.key === sortKey
													? "text-cyan-400"
													: "text-slate-600 hover:text-slate-300"
											}`}
											onClick={() => handleSort(stat.key)}
										>
											<span className="flex items-center justify-end gap-1">
												{stat.label}
												<SortIcon
													col={stat.key as string}
													active={sortKey as string}
													order={order}
												/>
											</span>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{displayShips.map((ship, i) => (
									<motion.tr
										key={ship.uuid}
										initial={{ opacity: 0, x: -10 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: Math.min(i * 0.01, 0.4) }}
										className="border-b border-slate-900 hover:bg-white/2 group"
									>
										<td className="px-3 py-1.5 text-slate-600 font-mono-sc text-center">
											{i === 0 ? (
												<span className="text-amber-400 font-bold">1</span>
											) : i === 1 ? (
												<span className="text-slate-400">2</span>
											) : i === 2 ? (
												<span className="text-amber-700">3</span>
											) : (
												<span className="text-slate-700">{i + 1}</span>
											)}
										</td>
										<td className="px-3 py-1.5">
											<Link
												href={`/ships/${ship.uuid}`}
												className="text-slate-200 hover:text-cyan-400 font-rajdhani font-semibold group-hover:underline transition-colors"
											>
												{ship.name ?? ship.class_name}
											</Link>
										</td>
										<td className="px-3 py-1.5">
											{ship.manufacturer_code && (
												<GlowBadge color="slate" size="xs">
													{ship.manufacturer_code}
												</GlowBadge>
											)}
										</td>
										{categoryStats.map((stat) => {
											const raw = ship[stat.key] as number | null;
											const val = raw != null ? parseFloat(String(raw)) : null;
											const max = maxByKey[stat.key] ?? 1;
											return (
												<td
													key={stat.key as string}
													className={`px-3 py-1.5 text-right ${stat.key === sortKey ? "bg-cyan-950/20" : ""}`}
												>
													{val != null && val > 0 ? (
														<div>
															<div className="text-slate-200 font-mono-sc mb-0.5">
																{stat.format(val)}
															</div>
															<StatBar
																value={val}
																max={max}
																invert={!stat.higher_is_better}
															/>
														</div>
													) : (
														<span className="text-slate-700">—</span>
													)}
												</td>
											);
										})}
									</motion.tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	);
}
