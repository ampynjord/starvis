import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { FilterPanel } from "@/components/ui/FilterPanel";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { useListQueryState } from "@/hooks/useListQueryState";
import type { ItemListItem } from "@/types/api";

const LIMIT = 30;

interface FpsCategory {
	label: string;
	/** DB item types to include */
	types: string[];
	/** If set, additionally filter sub_type IN (subTypes) */
	subTypes?: string[];
	color: string;
}

/** FPS categories in user-requested order */
const FPS_CATEGORIES: FpsCategory[] = [
	{ label: "Tools & Medics", types: ["Tool", "Consumable"],  color: "bg-green-500" },
	{ label: "Arms",           types: ["Armor_Arms"],           color: "bg-blue-500" },
	{ label: "Weapons",        types: ["FPS_Weapon"],           color: "bg-red-500" },
	{ label: "Helmet",         types: ["Armor_Helmet"],         color: "bg-blue-400" },
	{ label: "Core",           types: ["Armor_Torso"],          color: "bg-blue-500" },
	{ label: "Legs",           types: ["Armor_Legs"],           color: "bg-blue-600" },
	{ label: "Backpack",       types: ["Armor_Backpack"],       color: "bg-blue-700" },
	{ label: "Droppables",     types: ["FPS_Weapon"], subTypes: ["Throwable", "Mine"], color: "bg-orange-500" },
	{ label: "Magazines",      types: ["Magazine"],             color: "bg-amber-500" },
	{ label: "Attachments",    types: ["Attachment"],           color: "bg-purple-500" },
	{ label: "Gadgets",        types: ["Gadget"],               color: "bg-yellow-500" },
	{ label: "Clothing",       types: ["Clothing"],             color: "bg-slate-500" },
	{ label: "Undersuit",      types: ["Undersuit"],            color: "bg-teal-500" },
];

const TYPE_LABEL: Record<string, string> = {
	FPS_Weapon:     "Weapon",
	Armor_Torso:    "Core",
	Armor_Arms:     "Arms",
	Armor_Legs:     "Legs",
	Armor_Helmet:   "Helmet",
	Armor_Backpack: "Backpack",
	Undersuit:      "Undersuit",
	Clothing:       "Clothing",
	Gadget:         "Gadget",
	Tool:           "Tool",
	Consumable:     "Consumable",
	Attachment:     "Attachment",
	Magazine:       "Magazine",
};

const TYPE_COLOR: Record<string, string> = {
	FPS_Weapon:     "bg-red-500",
	Armor_Torso:    "bg-blue-500",
	Armor_Arms:     "bg-blue-500",
	Armor_Legs:     "bg-blue-600",
	Armor_Helmet:   "bg-blue-400",
	Armor_Backpack: "bg-blue-700",
	Undersuit:      "bg-teal-500",
	Clothing:       "bg-slate-500",
	Gadget:         "bg-yellow-500",
	Tool:           "bg-green-500",
	Consumable:     "bg-green-400",
	Attachment:     "bg-purple-500",
	Magazine:       "bg-amber-500",
};

const ARMOR_SUBTYPES = ["Light", "Medium", "Heavy"];
const WEAPON_SUBTYPES = [
	"Pistol", "SMG", "Rifle", "Sniper Rifle", "Assault Rifle",
	"Shotgun", "LMG", "Launcher", "Melee", "Large", "Medium",
];

function fNum(v: number | string | null | undefined, dec = 0): string {
	if (v == null) return "—";
	const n = Number(v);
	return Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function ItemStats({ item }: { item: ItemListItem }) {
	const isWeapon = item.type === "FPS_Weapon";
	const isArmor = item.type.startsWith("Armor_");

	if (isWeapon) {
		const hasStat = item.weapon_dps != null || item.weapon_range != null || item.weapon_fire_rate != null;
		if (!hasStat) return null;
		return (
			<div className="flex items-center gap-3 flex-wrap">
				{item.weapon_dps != null && (
					<span className="flex items-center gap-1">
						<span className="text-[10px] font-mono-sc text-slate-600 uppercase">DPS</span>
						<span className="text-xs font-mono-sc text-red-400 font-semibold">{fNum(item.weapon_dps, 1)}</span>
					</span>
				)}
				{item.weapon_range != null && (
					<span className="flex items-center gap-1">
						<span className="text-[10px] font-mono-sc text-slate-600 uppercase">Range</span>
						<span className="text-xs font-mono-sc text-slate-300 font-semibold">{fNum(item.weapon_range)}m</span>
					</span>
				)}
				{item.weapon_fire_rate != null && (
					<span className="flex items-center gap-1">
						<span className="text-[10px] font-mono-sc text-slate-600 uppercase">RPM</span>
						<span className="text-xs font-mono-sc text-slate-300 font-semibold">{fNum(item.weapon_fire_rate)}</span>
					</span>
				)}
				{item.weapon_damage_type && (
					<span className="text-[10px] font-mono-sc text-slate-600 uppercase">{item.weapon_damage_type}</span>
				)}
			</div>
		);
	}

	if (isArmor) {
		const hasStat = item.armor_damage_reduction != null || item.armor_temp_min != null;
		if (!hasStat) return null;
		return (
			<div className="flex items-center gap-3">
				{item.armor_damage_reduction != null && (
					<span className="flex items-center gap-1">
						<span className="text-[10px] font-mono-sc text-slate-600 uppercase">DR</span>
						<span className="text-xs font-mono-sc text-blue-400 font-semibold">{fNum(item.armor_damage_reduction, 1)}%</span>
					</span>
				)}
				{item.armor_temp_min != null && item.armor_temp_max != null && (
					<span className="flex items-center gap-1">
						<span className="text-[10px] font-mono-sc text-slate-600 uppercase">Temp</span>
						<span className="text-xs font-mono-sc text-slate-300 font-semibold">
							{fNum(item.armor_temp_min)}–{fNum(item.armor_temp_max)} °C
						</span>
					</span>
				)}
			</div>
		);
	}

	return null;
}

export default function ItemsPage() {
	const pathname = usePathname();
	const { env } = useEnv();
	const {
		page, search, debouncedSearch,
		updateSearch, updatePageWithScroll, resetListState, setPage,
	} = useListQueryState();

	const mode: "fps" | "other" = pathname?.startsWith("/other-items") ? "other" : "fps";
	const [activeCategory, setActiveCategory] = useState("");
	const [subType, setSubType] = useState("");
	const [manufacturer, setManufacturer] = useState("");

	const { data: filters } = useQuery({
		queryKey: ["items.filters", env],
		queryFn: () => api.items.filters(env),
		staleTime: 5 * 60_000,
	});

	const categories = useMemo(() => {
		const rawTypes = new Set<string>(filters?.types ?? []);
		if (mode === "fps") {
			const available = FPS_CATEGORIES.filter((c) =>
				c.types.some((t) => rawTypes.has(t)),
			);
			const allTypes = [...new Set(available.flatMap((c) => c.types))];
			return [{ label: "All", types: allTypes, color: "bg-cyan-500" } as FpsCategory, ...available];
		}
		const fpsCovered = new Set(FPS_CATEGORIES.flatMap((c) => c.types));
		const otherTypes = [...rawTypes].filter((t) => !fpsCovered.has(t));
		return [{ label: "All", types: otherTypes, color: "bg-slate-500" } as FpsCategory];
	}, [filters?.types, mode]);

	const selectedCategory =
		categories.find((c) => c.label === activeCategory) ?? categories[0] ?? { label: "", types: [], color: "" };

	const selectCategory = (label: string) => {
		setActiveCategory(label);
		setSubType("");
		setPage(1);
	};

	const chipTypes = selectedCategory.types ?? [];
	const chipSubTypes = (selectedCategory as FpsCategory).subTypes ?? [];

	// Build API type/types params
	const effectiveType = chipTypes.length === 1 && chipSubTypes.length === 0 ? chipTypes[0] : undefined;
	const effectiveTypes = chipTypes.length > 1 || (chipTypes.length === 1 && chipSubTypes.length > 0)
		? chipTypes.join(",")
		: undefined;
	// Droppables category has fixed subTypes; otherwise use user-selected filter
	const effectiveSubTypes = chipSubTypes.length > 0 ? chipSubTypes.join(",") : undefined;
	const effectiveSubType = chipSubTypes.length === 0 ? (subType || undefined) : undefined;

	const isWeaponCategory = selectedCategory.label === "Weapons";
	const isArmorCategory = ["Helmet", "Core", "Arms", "Legs"].includes(selectedCategory.label);
	const hasFixedSubTypes = chipSubTypes.length > 0;

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["items.list", env, { page, search: debouncedSearch, type: effectiveType, types: effectiveTypes, sub_types: effectiveSubTypes, sub_type: effectiveSubType, manufacturer }],
		queryFn: () =>
			api.items.list({
				env,
				page,
				limit: LIMIT,
				search: debouncedSearch || undefined,
				type: effectiveType,
				types: effectiveTypes,
				sub_types: effectiveSubTypes,
				sub_type: effectiveSubType,
				manufacturer: manufacturer || undefined,
			}),
		enabled: !!filters && categories.length > 0,
	});

	const hasFilters = !!(manufacturer || debouncedSearch || subType || (activeCategory && activeCategory !== categories[0]?.label));
	const resetFilters = () => {
		resetListState();
		setManufacturer("");
		setSubType("");
		setActiveCategory(categories[0]?.label ?? "");
	};

	const subTypeOptions = hasFixedSubTypes
		? []
		: isWeaponCategory
			? WEAPON_SUBTYPES.map((s) => ({ label: s, value: s }))
			: isArmorCategory
				? ARMOR_SUBTYPES.map((s) => ({ label: s, value: s }))
				: [];

	const filterGroups = filters
		? [
				...(subTypeOptions.length > 0
					? [{
							key: "subtype",
							label: isWeaponCategory ? "Weapon type" : "Armor weight",
							options: subTypeOptions,
							value: subType,
							onChange: (v: string) => { setSubType(v); setPage(1); },
						}]
					: []),
				{
					key: "mfr",
					label: "Manufacturer",
					options: (filters.manufacturers ?? []).map((m) => ({
						label: m.name,
						value: m.code,
					})),
					value: manufacturer,
					onChange: (v: string) => { setManufacturer(v); setPage(1); },
				},
			]
		: [];

	const getItemName = (item: ItemListItem) =>
		item.displayName ?? item.display_name ?? item.name;

	const pageTitle = mode === "other" ? "Other Items" : "FPS Gear";

	const activeCat = activeCategory || categories[0]?.label;

	return (
		<div className="max-w-(--breakpoint-2xl) mx-auto">
			<div className="mb-4 flex items-center justify-between gap-4">
				<div>
					<h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
						{pageTitle}
					</h1>
					{data && (
						<p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
							{data.total.toLocaleString("en-US")} items
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
						placeholder="Search an item…"
						className="sci-input w-full pl-8 text-xs"
					/>
				</div>
			</div>

			{/* Category chips */}
			<div className="flex flex-wrap gap-1.5 mb-4">
				{categories.map((chip) => (
					<button
						key={chip.label}
						type="button"
						onClick={() => selectCategory(chip.label)}
						className={[
							"px-3 py-1 rounded-sm text-xs font-rajdhani font-semibold tracking-wider transition-all border",
							activeCat === chip.label
								? "bg-cyan-950/60 border-cyan-700 text-cyan-400"
								: "border-border text-slate-500 hover:text-slate-300 hover:border-slate-600",
						].join(" ")}
					>
						{chip.label}
					</button>
				))}
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
						<LoadingGrid message="LOADING…" />
					) : error ? (
						<ErrorState error={error as Error} onRetry={() => void refetch()} />
					) : data?.data.length === 0 ? (
						<EmptyState icon="🛡" title="No items found" message="Try adjusting your filters." />
					) : (
						<>
							<div className="space-y-1">
								{data?.data.map((item, i) => (
									<motion.div
										key={item.uuid}
										initial={{ opacity: 0, x: -8 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: Math.min(i * 0.02, 0.3) }}
									>
										<Link
											href={`/items/${item.uuid}`}
											className="flex items-center gap-3 sci-panel hover:border-cyan-800/60 transition-colors px-4 py-2.5 group"
										>
											{/* Color bar */}
											<div
												className={`w-0.5 self-stretch rounded-full shrink-0 opacity-50 ${TYPE_COLOR[item.type] ?? "bg-slate-700"}`}
											/>

											{/* Info */}
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="font-orbitron text-sm text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
														{getItemName(item)}
													</span>
													{item.grade && (
														<GlowBadge color="amber" size="xs">{item.grade}</GlowBadge>
													)}
													{item.size != null && (
														<GlowBadge color="slate" size="xs">S{item.size}</GlowBadge>
													)}
												</div>
												<div className="flex items-center gap-3 mt-0.5 flex-wrap">
													<span className="text-xs font-mono-sc text-cyan-700">
														{TYPE_LABEL[item.type] ?? item.type}
													</span>
													{item.sub_type && item.sub_type !== "UNDEFINED" && (
														<span className="text-xs text-slate-600">
															{item.sub_type}
														</span>
													)}
													{item.manufacturer_name && (
														<span className="text-xs text-slate-600">
															{item.manufacturer_name}
														</span>
													)}
												</div>
											</div>

											{/* Stats */}
											<div className="shrink-0 text-right">
												<ItemStats item={item} />
											</div>

											{/* Mission leads icon */}
											<Link
												href={`/missions?search=${encodeURIComponent(getItemName(item))}`}
												onClick={(e) => e.stopPropagation()}
												className="shrink-0 text-slate-700 hover:text-amber-400 transition-colors"
												title="Mission leads"
											>
												<ExternalLink size={12} />
											</Link>
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
