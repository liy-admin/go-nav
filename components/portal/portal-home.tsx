"use client";

import { memo, useMemo, useState } from "react";
import type { LayoutConfig, NavCategory, NavSite } from "@/types";
import type { CardGridModel } from "../layout.types";
import { IconView } from "../icon-view";
import { SiteGrid } from "../site-card";
import { InlineEmptyHint } from "../ui/empty-state-blocks";
import { FOCUS_RING_CLASS } from "../ui/ui.constants";

/** 板块默认展示的网站数量，点击"更多+"后展开全部 */
const COLLAPSED_LIMIT = 12;

function collectSites(category: NavCategory): NavSite[] {
	return [
		...(category.sites ?? []),
		...(category.children ?? []).flatMap(collectSites),
	];
}

interface PortalTab {
	id: string;
	name: string;
	sites: NavSite[];
}

function buildTabs(category: NavCategory): PortalTab[] {
	const children = category.children ?? [];
	if (children.length === 0) {
		return [{ id: category.id, name: category.name, sites: category.sites ?? [] }];
	}
	const tabs = children.map((child) => ({
		id: child.id,
		name: child.name,
		sites: collectSites(child),
	}));
	if (category.sites && category.sites.length > 0) {
		tabs.unshift({ id: category.id, name: "推荐", sites: category.sites });
	}
	return tabs;
}

/** 顶部分类导航：点击平滑滚动到对应板块 */
export function PortalNav({ categories }: { categories: NavCategory[] }) {
	return (
		<nav
			aria-label="分类导航"
			className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-900/80"
		>
			<ul className="mx-auto flex max-w-350 gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
				{categories.map((category) => (
					<li key={category.id} className="shrink-0">
						<a
							href={`#${category.id}`}
							className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-nowrap transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${FOCUS_RING_CLASS}`}
						>
							<IconView icon={category.icon} size={14} />
							{category.name}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

const PortalSection = memo(function PortalSection({
	category,
	cards,
	layout,
}: {
	category: NavCategory;
	cards: CardGridModel;
	layout: Required<LayoutConfig>;
}) {
	const tabs = useMemo(() => buildTabs(category), [category]);
	const [activeId, setActiveId] = useState(tabs[0]?.id);
	const [expanded, setExpanded] = useState(false);
	const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
	const sites = active?.sites ?? [];
	const canExpand = sites.length > COLLAPSED_LIMIT;
	const visible = expanded || !canExpand ? sites : sites.slice(0, COLLAPSED_LIMIT);

	return (
		<section
			id={category.id}
			data-category-id={category.id}
			className="category-anchor scroll-mt-16 overflow-hidden rounded-2xl bg-black/3 pb-2 dark:bg-white/5"
		>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4">
				<h2 className="flex items-center gap-2 border-l-4 border-primary pl-2 text-lg font-semibold text-nowrap">
					<IconView icon={category.icon} size={18} />
					{category.name}
				</h2>
				{tabs.length > 1 ? (
					<div
						role="tablist"
						aria-label={`${category.name}的子分类`}
						className="flex min-w-0 flex-1 gap-3 overflow-x-auto text-sm [scrollbar-width:none]"
					>
						{tabs.map((tab) => (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={tab.id === active?.id}
								onClick={() => {
									setActiveId(tab.id);
									setExpanded(false);
								}}
								className={`shrink-0 cursor-pointer text-nowrap transition-colors ${FOCUS_RING_CLASS} ${
									tab.id === active?.id
										? "font-semibold text-primary"
										: "text-muted hover:text-foreground"
								}`}
							>
								{tab.name}
							</button>
						))}
					</div>
				) : (
					<span className="flex-1" />
				)}
				{canExpand ? (
					<button
						type="button"
						onClick={() => setExpanded((value) => !value)}
						className={`cursor-pointer text-sm text-muted transition-colors hover:text-primary ${FOCUS_RING_CLASS}`}
					>
						{expanded ? "收起 -" : "更多 +"}
					</button>
				) : null}
			</div>
			{category.description ? (
				<p className="px-4 pt-1 text-xs text-muted">{category.description}</p>
			) : null}
			{visible.length > 0 ? (
				<SiteGrid sites={visible} cards={cards} layout={layout} />
			) : (
				<InlineEmptyHint>暂无内容</InlineEmptyHint>
			)}
		</section>
	);
});

/** 门户风格首页：每个一级分类一个板块，子分类以标签切换 */
export function PortalHome({
	categories,
	cards,
	layout,
	sectionsStyle,
}: {
	categories: NavCategory[];
	cards: CardGridModel;
	layout: Required<LayoutConfig>;
	sectionsStyle: React.CSSProperties;
}) {
	return (
		<div style={sectionsStyle}>
			{categories.map((category) => (
				<PortalSection
					key={category.id}
					category={category}
					cards={cards}
					layout={layout}
				/>
			))}
		</div>
	);
}
