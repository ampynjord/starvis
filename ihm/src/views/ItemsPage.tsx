import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { FilterPanel, MobileFilterWrapper } from "@/components/ui/FilterPanel";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { useListQueryState } from "@/hooks/useListQueryState";
import { ITEM_TYPE_LABELS } from "@/utils/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ItemListItem } from "@/types/api";

const LIMIT = 30;

/** Ordered FPS category slugs + static labels (match API CATEGORY_DEFS) */
const FPS_CATEGORIES_STATIC: { slug: string; label: string }[] = [
	{ slug: "weapons",      label: "Weapons" },
	{ slug: "throwable",    label: "Throwable" },
	{ slug: "helmet",       label: "Helmet" },
	{ slug: "core",         label: "Torso" },
	{ slug: "arms",         label: "Arms" },
	{ slug: "legs",         label: "Legs" },
	{ slug: "backpack",     label: "Backpack" },
	{ slug: "undersuit",    label: "Undersuit" },
	{ slug: "tools-medics", label: "Tools & Medics" },
	{ slug: "attachments",  label: "Attachment" },
	{ slug: "magazines",    label: "Magazines" },
	{ slug: "clothing",     label: "Clothing" },
	{ slug: "other",        label: "Other" },
];

type FpsSlug = (typeof FPS_CATEGORIES_STATIC)[number]["slug"];
type ItemsSlug = "all" | "chips" | "food";

const ITEMS_CATEGORIES_STATIC: { slug: ItemsSlug; label: string }[] = [
	{ slug: "all",   label: "All" },
	{ slug: "chips", label: "Chips" },
	{ slug: "food",  label: "Food & Drink" },
];

const ITEMS_SLUG_COLOR: Record<ItemsSlug, string> = {
	all:   "bg-cyan-500",
	chips: "bg-green-500",
	food:  "bg-orange-500",
};

/** FPS types covered by the FPS Gear page — excluded from Items page */
const FPS_COVERED_TYPES = new Set([
	"FPS_Weapon", "Armor_Helmet", "Armor_Torso", "Armor_Arms",
	"Armor_Legs", "Armor_Backpack", "Undersuit", "Tool",
	"Magazine", "Attachment", "Gadget", "Clothing", "Armor",
]);

const SLUG_COLOR: Record<FpsSlug | "all", string> = {
	all:          "bg-cyan-500",
	weapons:      "bg-red-500",
	throwable:    "bg-orange-500",
	helmet:       "bg-blue-400",
	core:         "bg-blue-500",
	arms:         "bg-blue-500",
	legs:         "bg-blue-600",
	backpack:     "bg-blue-700",
	undersuit:    "bg-teal-500",
	"tools-medics": "bg-green-500",
	attachments:  "bg-purple-500",
	magazines:    "bg-amber-500",
	clothing:     "bg-slate-500",
	other:        "bg-yellow-500",
};

const TYPE_COLOR: Record<string, string> = {
	FPS_Weapon:  "bg-red-500",
	Armor:       "bg-blue-500",
	Undersuit:   "bg-teal-500",
	Clothing:    "bg-slate-500",
	Gadget:      "bg-yellow-500",
	Tool:        "bg-green-500",
	Consumable:  "bg-green-400",
	Attachment:  "bg-purple-500",
	Magazine:    "bg-amber-500",
};



/** Sub-type filter options per slug */
const SLUG_SUBTYPES: Record<string, { label: string; value: string }[]> = {
	weapons: [
		"Pistol", "SMG", "Shotgun", "Sniper Rifle", "Assault Rifle",
		"LMG", "Launcher", "Melee", "Medium", "Large", "Small",
	].map((s) => ({ label: s, value: s })),
	throwable: [
		{ label: "Grenades", value: "Throwable" },
		{ label: "Mines", value: "Mine" },
	],
	helmet:  [{ label: "Light", value: "Light" }, { label: "Medium", value: "Medium" }, { label: "Heavy", value: "Heavy" }],
	core:    [{ label: "Light", value: "Light" }, { label: "Medium", value: "Medium" }, { label: "Heavy", value: "Heavy" }],
	arms:    [{ label: "Light", value: "Light" }, { label: "Medium", value: "Medium" }, { label: "Heavy", value: "Heavy" }],
	legs:    [{ label: "Light", value: "Light" }, { label: "Medium", value: "Medium" }, { label: "Heavy", value: "Heavy" }],
	backpack:[{ label: "Light", value: "Light" }, { label: "Medium", value: "Medium" }, { label: "Heavy", value: "Heavy" }],
};

function fNum(v: number | string | null | undefined, dec = 0): string {
	if (v == null) return "—";
	const n = Number(v);
	return Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function ItemStats({ item }: { item: ItemListItem }) {
	const isWeapon = item.type === "FPS_Weapon";
	const isArmor = item.type.startsWith("Armor_") || item.type === "Undersuit";

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
			<div className="flex items-center gap-3 flex-wrap">
				{item.armor_damage_reduction != null && (
					<span className="flex items-center gap-1">
						<span className="text-[10px] font-mono-sc text-slate-600 uppercase">DR</span>
						<span className="text-xs font-mono-sc text-blue-400 font-semibold">
							{fNum(item.armor_damage_reduction * 100, 0)}%
						</span>
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

	const mode: "fps" | "other" = pathname?.startsWith("/items") || pathname?.startsWith("/other-items") ? "other" : "fps";
	const [activeSlug, setActiveSlug] = useState<FpsSlug | "all">("all");
	const [itemsSlug, setItemsSlug] = useState<ItemsSlug>("all");
	const [subType, setSubType] = useState("");
	const [manufacturer, setManufacturer] = useState("");

	/** Load categories with counts (fps mode only) */
	const { data: categoriesData } = useQuery({
		queryKey: ["items.categories", env],
		queryFn: () => api.items.categories(env),
		staleTime: 5 * 60_000,
		enabled: mode === "fps",
	});

	/** For other-items mode: load raw filters to know which types exist */
	const { data: filters } = useQuery({
		queryKey: ["items.filters", env],
		queryFn: () => api.items.filters(env),
		staleTime: 5 * 60_000,
		enabled: mode === "other",
	});

	/** Manufacturer list for the current category */
	const categoryTypes = mode === "fps"
		? (activeSlug === "all" ? undefined : activeSlug)
		: (itemsSlug === "chips" || itemsSlug === "food" ? "Consumable" : undefined);

	const { data: mfrData } = useQuery({
		queryKey: ["items.manufacturers", categoryTypes, env],
		queryFn: () => api.items.manufacturers(categoryTypes, env),
		staleTime: 5 * 60_000,
	});

	// Build chip list — static labels shown immediately, counts added when API responds
	// categoriesData is already unwrapped to the array by the api.get helper
	const countMap = new Map((categoriesData ?? []).map((c) => [c.slug, c.count]));
	const chips: { slug: string; label: string; count: number }[] = mode === "fps"
		? [
				{ slug: "all", label: "All", count: (categoriesData ?? []).reduce((s, c) => s + c.count, 0) },
				...FPS_CATEGORIES_STATIC.map((c) => ({ ...c, count: countMap.get(c.slug) ?? 0 })),
			]
		: [];
	const tc = filters?.typeCounts ?? {};
	const sc = filters?.subTypeCounts ?? {};
	const itemsCountMap: Record<ItemsSlug, number> = {
		all:   (sc.Hacking ?? 0) + (sc.SystemAccess ?? 0) + (sc.Food ?? 0) + (sc.Drink ?? 0),
		chips: (sc.Hacking ?? 0) + (sc.SystemAccess ?? 0),
		food:  (sc.Food ?? 0) + (sc.Drink ?? 0),
	};

	const selectSlug = (slug: FpsSlug | "all") => {
		setActiveSlug(slug);
		setSubType("");
		setPage(1);
	};

	const selectItemsSlug = (slug: ItemsSlug) => {
		setItemsSlug(slug);
		setManufacturer("");
		setPage(1);
	};

	const subTypeOptions = SLUG_SUBTYPES[activeSlug as FpsSlug] ?? [];

	// Build query call
	const isCategory = mode === "fps" && activeSlug !== "all";
	const queryKey = ["items.list", mode, env, activeSlug, itemsSlug, page, debouncedSearch, subType, manufacturer];

	const { data, isLoading, error, refetch } = useQuery({
		queryKey,
		queryFn: () => {
			const base = {
				env,
				page,
				limit: LIMIT,
				search: debouncedSearch || undefined,
				sub_type: subType || undefined,
				manufacturer: manufacturer || undefined,
			};
			if (isCategory) {
				return api.items.category(activeSlug, base);
			}
			if (mode === "fps") {
				// "All" in fps mode: exclude no types, use generic list with all fps types
				return api.items.list({
					...base,
					types: "FPS_Weapon,Armor_Helmet,Armor_Torso,Armor_Arms,Armor_Legs,Armor_Backpack,Undersuit,Tool,Consumable,Magazine,Attachment,Gadget,Clothing",
					exclude_sub_types: "Food,Drink",
				});
			}
			// items mode — all types not covered by FPS Gear
			const otherTypes = (filters?.types ?? []).filter((t) => !FPS_COVERED_TYPES.has(t));

			if (itemsSlug === "chips") {
				return api.items.list({ ...base, type: "Consumable", sub_types: "Hacking,SystemAccess" });
			}
			if (itemsSlug === "food") {
				return api.items.list({ ...base, type: "Consumable", sub_types: "Food,Drink" });
			}

			// "All": everything non-FPS, exclude medical consumables (covered by FPS Gear Tools & Medics)
			const mergedTypes = otherTypes.join(",");
			return api.items.list({ ...base, types: mergedTypes || undefined, exclude_sub_types: "Medical,MedPack,OxygenCap,Stim" });
		},
		enabled: mode === "other" ? !!filters : true,
	});

	const hasFilters = !!(manufacturer || debouncedSearch || subType || activeSlug !== "all" || (mode === "other" && itemsSlug !== "all"));
	const resetFilters = () => {
		resetListState();
		setManufacturer("");
		setSubType("");
		setActiveSlug("all");
		setItemsSlug("all");
	};

	const filterGroups = [
		...(subTypeOptions.length > 0
			? [{
					key: "subtype",
					label: activeSlug === "weapons" ? "Weapon type" : "Weight",
					options: subTypeOptions,
					value: subType,
					onChange: (v: string) => { setSubType(v); setPage(1); },
				}]
			: []),
		{
			key: "mfr",
			label: "Manufacturer",
			options: (mfrData?.manufacturers ?? []).map((m) => ({
				label: m.name,
				value: m.code,
			})),
			value: manufacturer,
			onChange: (v: string) => { setManufacturer(v); setPage(1); },
		},
	];

	const getItemName = (item: ItemListItem) =>
		item.displayName ?? item.display_name ?? item.name;

	const pageTitle = mode === "other" ? "Items" : "FPS Gear";

	return (
		<div className="max-w-(--breakpoint-2xl) mx-auto">
			<PageHeader
				title={pageTitle}
				count={data?.total}
				countLabel="items"
				search={search}
				searchPlaceholder="Search an item…"
				onSearch={updateSearch}
			/>

			{/* Category chips */}
			{mode === "other" && (
				<div className="flex flex-wrap gap-1.5 mb-4">
					{ITEMS_CATEGORIES_STATIC.map((cat) => (
						<button
							key={cat.slug}
							type="button"
							onClick={() => selectItemsSlug(cat.slug)}
							className={[
								"px-3 py-1 rounded-sm text-xs font-rajdhani font-semibold tracking-wider transition-all border",
								itemsSlug === cat.slug
									? "bg-cyan-950/60 border-cyan-700 text-cyan-400"
									: "border-border text-slate-500 hover:text-slate-300 hover:border-slate-600",
							].join(" ")}
						>
							{cat.label}
							{itemsCountMap[cat.slug] > 0 && (
								<span className="ml-1 text-[10px] text-slate-600">{itemsCountMap[cat.slug].toLocaleString()}</span>
							)}
						</button>
					))}
				</div>
			)}
			{mode === "fps" && (
				<div className="flex flex-wrap gap-1.5 mb-4">
					{chips.map((chip) => (
						<button
							key={chip.slug}
							type="button"
							onClick={() => selectSlug(chip.slug)}
							className={[
								"px-3 py-1 rounded-sm text-xs font-rajdhani font-semibold tracking-wider transition-all border",
								activeSlug === chip.slug
									? "bg-cyan-950/60 border-cyan-700 text-cyan-400"
									: "border-border text-slate-500 hover:text-slate-300 hover:border-slate-600",
							].join(" ")}
						>
							{chip.label}
							{chip.count > 0 && (
								<span className="ml-1 text-[10px] text-slate-600">{chip.count.toLocaleString()}</span>
							)}
						</button>
					))}
				</div>
			)}

			<div className="flex gap-4">
				<div className="w-44 shrink-0">
					<MobileFilterWrapper hasFilters={hasFilters}>
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
					</MobileFilterWrapper>
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
										<div className="flex items-center gap-3 sci-panel hover:border-cyan-800/60 transition-colors px-4 py-2.5 group">
											{/* Color bar */}
											<div
												className={`w-0.5 self-stretch rounded-full shrink-0 opacity-50 ${
													mode === "fps"
														? (activeSlug !== "all" ? (SLUG_COLOR[activeSlug] ?? "bg-slate-700") : (TYPE_COLOR[item.type] ?? "bg-slate-700"))
														: (itemsSlug !== "all" ? (ITEMS_SLUG_COLOR[itemsSlug] ?? "bg-slate-700") : (TYPE_COLOR[item.type] ?? "bg-slate-700"))
												}`}
											/>
											{/* Info */}
											<Link href={`/items/${item.uuid}`} className="flex-1 min-w-0">
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
														{ITEM_TYPE_LABELS[item.type] ?? item.type}
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
											</Link>

											{/* Stats */}
											<div className="shrink-0 text-right">
												<ItemStats item={item} />
											</div>

											{/* Mission leads icon */}
											<Link
												href={`/missions?search=${encodeURIComponent(getItemName(item))}`}
												className="shrink-0 text-slate-700 hover:text-amber-400 transition-colors"
												title="Mission leads"
											>
												<ExternalLink size={12} />
											</Link>
										</div>
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
