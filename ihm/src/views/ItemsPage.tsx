'use client';

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
import { PageShell } from "@/components/ui/PageShell";
import type { ItemListItem } from "@/types/api";

const LIMIT = 30;

type FpsSlug = string;
type ItemsSlug = "all" | "chips" | "other" | `sub:${string}`;

const ITEMS_SLUG_COLOR: Record<string, string> = {
	all: "bg-cyan-500",
	chips: "bg-green-500",
	other: "bg-yellow-500",
};

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

function fNum(v: number | string | null | undefined, dec = 0): string {
	if (v == null) return "—";
	const n = Number(v);
	return Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function ItemStats({ item }: { item: ItemListItem }) {
	const isWeapon = item.type === "FPS_Weapon";
	const isArmor = item.type === "Armor" || item.type.startsWith("Armor_") || item.type === "Undersuit";

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

type TaxonomyGroup = 'armor' | 'clothing' | 'weapons' | 'utility' | 'ammo' | 'sustenance' | undefined;

interface ItemsPageProps { group?: TaxonomyGroup }

const GROUP_LABELS: Record<string, string> = {
  armor: 'Armor', clothing: 'Clothing', weapons: 'Weapons',
  utility: 'Utility', ammo: 'Ammo', sustenance: 'Sustenance',
};

const GROUP_ALL_KEY: Record<string, string> = {
  armor: 'armor_all', clothing: 'clothing_all', weapons: 'weapons_all',
  utility: 'utility_all', ammo: 'ammo_all', sustenance: 'sustenance_all',
};

export default function ItemsPage({ group }: ItemsPageProps = {}) {
	const pathname = usePathname();
	const { env } = useEnv();
	const {
		page, search, debouncedSearch,
		updateSearch, updatePageWithScroll, resetListState, setPage,
	} = useListQueryState();

	// Derive taxonomy group from URL if not passed as prop
	const resolvedGroup: TaxonomyGroup = group
		?? (pathname?.startsWith('/armor')      ? 'armor'
		  : pathname?.startsWith('/clothing')   ? 'clothing'
		  : pathname?.startsWith('/weapons')    ? 'weapons'
		  : pathname?.startsWith('/utility')    ? 'utility'
		  : pathname?.startsWith('/ammo')       ? 'ammo'
		  : pathname?.startsWith('/sustenance') ? 'sustenance'
		  : undefined);

	// All taxonomy pages use the "fps" (category slug) mode
	const mode: "fps" | "other" = "fps";

	const initSlug: FpsSlug | "all" = resolvedGroup ?? "all";
	const [activeSlug, setActiveSlug] = useState<FpsSlug | "all">(initSlug);
	const [itemsSlug, setItemsSlug] = useState<ItemsSlug>("all");
	const [subType, setSubType] = useState("");
	const [manufacturer, setManufacturer] = useState("");

	const { data: navigation } = useQuery({
		queryKey: ["items.navigation", env],
		queryFn: () => api.items.navigation(env),
		staleTime: 5 * 60_000,
	});

	/** Manufacturer list for the current category */
	const categoryTypes = mode === "fps"
		? (activeSlug === "all" ? undefined : activeSlug)
		: undefined;

	const { data: mfrData } = useQuery({
		queryKey: ["items.manufacturers", categoryTypes, env],
		queryFn: () => api.items.manufacturers(categoryTypes, env),
		staleTime: 5 * 60_000,
		enabled: mode === "fps",
	});

	// Filter categories to only show subcategories for the current taxonomy group
	const allFpsCategories = navigation?.fpsCategories ?? [];
	const chips = resolvedGroup
		? allFpsCategories.filter((c) => c.group === resolvedGroup || c.group?.startsWith(resolvedGroup + '-'))
		: allFpsCategories;

	const selectSlug = (slug: FpsSlug | "all") => {
		setActiveSlug(slug);
		setSubType("");
		setPage(1);
	};

	const fpsSubTypeOptions = navigation?.fpsSubTypeOptions[activeSlug as FpsSlug] ?? [];

	// Build query call
	const groupAllKey = resolvedGroup ? (GROUP_ALL_KEY[resolvedGroup] ?? 'fps_all') : 'fps_all';
	const queryKey = ["items.list", resolvedGroup, env, activeSlug, page, debouncedSearch, subType, manufacturer];

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
			// "all" on a grouped page → use the group's aggregate query
			if (activeSlug === "all" || activeSlug === resolvedGroup) {
				return api.items.list({ ...base, item_group: groupAllKey });
			}
			return api.items.category(activeSlug, base);
		},
		enabled: !!navigation,
	});

	const hasFilters = !!(manufacturer || debouncedSearch || subType || (activeSlug !== "all" && activeSlug !== resolvedGroup));
	const resetFilters = () => {
		resetListState();
		setManufacturer("");
		setSubType("");
		setActiveSlug(initSlug);
		setItemsSlug("all");
	};

	const filterGroups = [
		...(fpsSubTypeOptions.length > 0
			? [{
					key: "subtype",
					label: resolvedGroup === "weapons" ? "Weapon type" : resolvedGroup === "armor" ? "Weight" : "Type",
					options: fpsSubTypeOptions,
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
	const isFiltersLoading = !mfrData || !navigation;

	const getItemName = (item: ItemListItem) =>
		item.displayName ?? item.display_name ?? item.name;

	const pageTitle = resolvedGroup ? GROUP_LABELS[resolvedGroup] ?? 'Equipment' : 'Equipment';

	return (
		<PageShell>
			<PageHeader
				title={pageTitle}
				count={data?.total}
				countLabel="items"
				search={search}
				searchPlaceholder="Search an item…"
				onSearch={updateSearch}
			/>

			{/* Category chips — filtered to the current taxonomy group */}
			{chips.length > 0 && (
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
								chip.parentSlug ? "ml-3 text-[11px]" : "",
							].join(" ")}
						>
							{chip.parentSlug && <span className="mr-1 opacity-40">└</span>}
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
					{isFiltersLoading ? (
						<div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">
							Loading…
						</div>
					) : filterGroups.length > 0 ? (
						<FilterPanel
							hasFilters={hasFilters}
							onReset={resetFilters}
							groups={filterGroups}
						/>
					) : (
						<div className="sci-panel p-3 text-xs text-slate-600">
							No extra filters for this category.
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
		</PageShell>
	);
}
