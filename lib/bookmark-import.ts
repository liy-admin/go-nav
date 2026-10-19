import type { NavCategory, NavSite, WebsiteData } from "@/types";
import { isScriptableUrl } from "@/lib/external-url";

const DEFAULT_CHILD_NAME = "默认分类";
const FALLBACK_ROOT_NAME = "导入书签";
const SYSTEM_ROOT_FOLDER_KEYS = new Set([
	"bookmarksbar",
	"bookmarkbar",
	"bookmarkstoolbar",
	"favoritesbar",
	"otherbookmarks",
	"otherfavorites",
	"bookmarksmenu",
	"mobilebookmarks",
	"mobilefavorites",
	"书签栏",
	"书签工具栏",
	"收藏栏",
	"收藏夹栏",
	"其他书签",
	"其它书签",
	"其他收藏",
	"其它收藏",
	"书签菜单",
	"移动书签",
	"手机书签",
]);

interface BookmarkLink {
	title: string;
	url: string;
	icon?: string;
}

interface BookmarkFolder {
	name: string;
	links: BookmarkLink[];
	children: BookmarkFolder[];
}

interface BookmarkTree {
	links: BookmarkLink[];
	folders: BookmarkFolder[];
}

export interface BookmarkImportResult {
	websiteData: WebsiteData;
	topCategoryCount: number;
	childCategoryCount: number;
	siteCount: number;
}

export interface WebsiteDataSummary {
	topCategoryCount: number;
	childCategoryCount: number;
	siteCount: number;
}

/**
 * 解析浏览器导出的书签 HTML，并压平成当前后台使用的两层分类结构：
 * - 顶级文件夹 => 顶级分类
 * - 直接网址 => 放到“默认分类”
 * - 更深层文件夹 => 展平为同一顶级分类下的子分类
 */
export function parseBookmarksHtml(html: string): BookmarkImportResult {
	const source = html.trim();
	if (!source) {
		throw new Error("请先提供浏览器导出的书签 HTML 内容");
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(source, "text/html");
	const rootList = doc.querySelector("dl");
	if (!rootList) {
		throw new Error("未找到书签目录，请确认导入的是浏览器导出的 HTML 书签文件");
	}

	const tree = normalizeBookmarkTree(parseBookmarkTree(rootList));
	if (tree.links.length === 0 && tree.folders.length === 0) {
		throw new Error("没有解析到可导入的书签内容");
	}

	const websiteData = toWebsiteData(tree);
	const summary = summarizeWebsiteData(websiteData);

	if (summary.siteCount === 0) {
		throw new Error("没有解析到可导入的网址");
	}

	return {
		websiteData,
		...summary,
	};
}

export function summarizeWebsiteData(websiteData: WebsiteData): WebsiteDataSummary {
	return {
		topCategoryCount: websiteData.categories.length,
		childCategoryCount: countChildCategories(websiteData.categories),
		siteCount: countSites(websiteData.categories),
	};
}

export function mergeWebsiteData(
	existing: WebsiteData,
	imported: WebsiteData,
): WebsiteData {
	const normalizedExisting: WebsiteData = {
		categories: existing.categories.map((category) =>
			normalizeTopLevelCategory(category),
		),
	};
	const usedIds = collectCategoryIds(normalizedExisting.categories);
	const mergedCategories = normalizedExisting.categories.map((category) =>
		cloneCategory(category),
	);

	for (const importedCategory of imported.categories) {
		const normalizedImported = normalizeTopLevelCategory(importedCategory);
		const existingIndex = mergedCategories.findIndex(
			(category) =>
				normalizeNameKey(category.name) ===
				normalizeNameKey(normalizedImported.name),
		);

		if (existingIndex < 0) {
			mergedCategories.push(
				cloneCategoryWithUniqueIds(normalizedImported, usedIds),
			);
			continue;
		}

		mergedCategories[existingIndex] = mergeCategoryNode(
			mergedCategories[existingIndex],
			normalizedImported,
			usedIds,
		);
	}

	return { categories: mergedCategories };
}

function parseBookmarkTree(container: Element): BookmarkTree {
	const links: BookmarkLink[] = [];
	const folders: BookmarkFolder[] = [];
	const items = Array.from(container.children);

	for (const item of items) {
		if (item.tagName.toUpperCase() !== "DT") continue;

		const anchor = findDirectChild(item, ["A"]);
		if (anchor) {
			const parsedLink = parseBookmarkLink(anchor);
			if (parsedLink) {
				links.push(parsedLink);
			}
			continue;
		}

		const heading = findDirectChild(item, ["H1", "H2", "H3"]);
		if (!heading) continue;

		const folderName = cleanText(heading.textContent) || "未命名分类";
		const nestedList = findNestedList(item);
		const subtree = nestedList
			? parseBookmarkTree(nestedList)
			: { links: [], folders: [] };

		folders.push({
			name: folderName,
			links: subtree.links,
			children: subtree.folders,
		});
	}

	return { links, folders };
}

function normalizeBookmarkTree(tree: BookmarkTree): BookmarkTree {
	let current = tree;

	for (let i = 0; i < 4; i += 1) {
		const { nextTree, changed } = collapseSystemRootFolders(current);
		current = nextTree;
		if (!changed) break;
	}

	return current;
}

function collapseSystemRootFolders(tree: BookmarkTree): {
	nextTree: BookmarkTree;
	changed: boolean;
} {
	let changed = false;
	const folders: BookmarkFolder[] = [];

	for (const folder of tree.folders) {
		const shouldCollapse = isSystemRootFolder(folder.name) && folder.children.length > 0;
		if (!shouldCollapse) {
			folders.push(folder);
			continue;
		}

		changed = true;

		if (folder.links.length > 0) {
			folders.push({
				name: folder.name,
				links: folder.links,
				children: [],
			});
		}

		folders.push(...folder.children);
	}

	return {
		nextTree: changed ? { links: [...tree.links], folders } : tree,
		changed,
	};
}

function findDirectChild(
	container: Element,
	tags: string[],
): HTMLElement | null {
	const wanted = new Set(tags.map((tag) => tag.toUpperCase()));
	for (const child of Array.from(container.children)) {
		if (wanted.has(child.tagName.toUpperCase())) {
			return child as HTMLElement;
		}
	}
	return null;
}

function findNestedList(container: Element): HTMLElement | null {
	for (const child of Array.from(container.children)) {
		if (child.tagName.toUpperCase() === "DL") {
			return child as HTMLElement;
		}
	}

	let current = container.nextElementSibling;
	while (current) {
		const tagName = current.tagName.toUpperCase();
		if (tagName === "DL") {
			return current as HTMLElement;
		}
		if (tagName === "DT") {
			return null;
		}
		current = current.nextElementSibling;
	}

	return null;
}

function parseBookmarkLink(anchor: HTMLElement): BookmarkLink | null {
	const url = cleanText(anchor.getAttribute("href"));
	if (!url || isScriptableUrl(url)) {
		return null;
	}

	const title = cleanText(anchor.textContent) || deriveTitleFromUrl(url);
	const icon = sanitizeIcon(
		cleanText(anchor.getAttribute("icon")) ||
			cleanText(anchor.getAttribute("icon_uri")) ||
			undefined,
	);

	return {
		title,
		url,
		icon,
	};
}

function sanitizeIcon(icon: string | undefined): string | undefined {
	if (!icon) return undefined;
	if (
		icon.startsWith("data:image/") ||
		icon.startsWith("http://") ||
		icon.startsWith("https://") ||
		icon.startsWith("/")
	) {
		return icon;
	}
	return undefined;
}

function deriveTitleFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname || "未命名网址";
	} catch {
		return url || "未命名网址";
	}
}

function toWebsiteData(tree: BookmarkTree): WebsiteData {
	const usedIds = new Set<string>();
	const categories = tree.folders
		.map((folder, index) =>
			buildTopCategory(folder, usedIds, `category-${index + 1}`),
		)
		.filter((category): category is NavCategory => category !== null);

	if (tree.links.length > 0) {
		const fallbackCategory = buildTopCategory(
			{
				name: FALLBACK_ROOT_NAME,
				links: tree.links,
				children: [],
			},
			usedIds,
			"imported-root",
		);
		if (fallbackCategory) {
			categories.push(fallbackCategory);
		}
	}

	return { categories };
}

function buildTopCategory(
	folder: BookmarkFolder,
	usedIds: Set<string>,
	fallbackId: string,
): NavCategory | null {
	const topId = createUniqueId(folder.name, fallbackId, usedIds);
	const defaultSites = toSites(folder.links);
	const children: NavCategory[] = [
		{
			id: createUniqueId(`${topId}-default`, `${topId}-default`, usedIds),
			name: DEFAULT_CHILD_NAME,
			sites: defaultSites,
		},
	];

	const flattenedChildren = new Map<string, BookmarkLink[]>();
	collectChildFolders(folder.children, [], flattenedChildren);

	let childIndex = 1;
	for (const [name, links] of flattenedChildren) {
		const sites = toSites(links);
		if (sites.length === 0) continue;
		children.push({
			id: createUniqueId(
				`${topId}-${name}`,
				`${topId}-child-${childIndex}`,
				usedIds,
			),
			name,
			sites,
		});
		childIndex += 1;
	}

	const hasAnySite = children.some((child) => (child.sites?.length ?? 0) > 0);
	if (!hasAnySite) {
		return null;
	}

	return {
		id: topId,
		name: folder.name,
		children,
	};
}

function collectChildFolders(
	folders: BookmarkFolder[],
	path: string[],
	result: Map<string, BookmarkLink[]>,
) {
	for (const folder of folders) {
		const currentPath = [...path, folder.name];
		if (folder.links.length > 0) {
			const childName = currentPath.join(" / ");
			const currentLinks = result.get(childName) ?? [];
			currentLinks.push(...folder.links);
			result.set(childName, currentLinks);
		}
		if (folder.children.length > 0) {
			collectChildFolders(folder.children, currentPath, result);
		}
	}
}

function toSites(links: BookmarkLink[]): NavSite[] {
	return dedupeSites(
		links.map((link) => ({
			title: link.title,
			description: "",
			url: link.url,
			icon: link.icon,
			tags: [],
		})),
	);
}

function normalizeUrlKey(url: string): string {
	return cleanText(url).replace(/\/+$/, "");
}

function isSystemRootFolder(name: string): boolean {
	return SYSTEM_ROOT_FOLDER_KEYS.has(
		cleanText(name).toLowerCase().replace(/[\s_-]+/g, ""),
	);
}

function countSites(categories: NavCategory[]): number {
	let total = 0;
	for (const category of categories) {
		total += category.sites?.length ?? 0;
		if (category.children?.length) {
			total += countSites(category.children);
		}
	}
	return total;
}

function countChildCategories(categories: NavCategory[]): number {
	let total = 0;
	for (const category of categories) {
		const children = category.children ?? [];
		total += children.length;
		total += countChildCategories(children);
	}
	return total;
}

function normalizeTopLevelCategory(category: NavCategory): NavCategory {
	const nextChildren = (category.children ?? []).map((child) => cloneCategory(child));
	const directSites = dedupeSites(category.sites ?? []);

	if (directSites.length > 0) {
		const defaultChildIndex = nextChildren.findIndex((child) =>
			isDefaultChildName(child.name),
		);
		if (defaultChildIndex >= 0) {
			nextChildren[defaultChildIndex] = {
				...nextChildren[defaultChildIndex],
				sites: mergeSites(
					nextChildren[defaultChildIndex].sites ?? [],
					directSites,
				),
			};
		} else {
			nextChildren.unshift({
				id: category.id ? `${category.id}-default` : "default",
				name: DEFAULT_CHILD_NAME,
				sites: directSites,
			});
		}
	}

	return {
		...cloneCategory(category),
		sites: undefined,
		children: nextChildren.length > 0 ? nextChildren : undefined,
	};
}

function mergeCategoryNode(
	existing: NavCategory,
	incoming: NavCategory,
	usedIds: Set<string>,
): NavCategory {
	const next = cloneCategory(existing);
	const nextSites = mergeSites(existing.sites ?? [], incoming.sites ?? []);
	const nextChildren = (next.children ?? []).map((child) => cloneCategory(child));

	for (const incomingChild of incoming.children ?? []) {
		const existingChildIndex = nextChildren.findIndex(
			(child) =>
				normalizeNameKey(child.name) === normalizeNameKey(incomingChild.name),
		);

		if (existingChildIndex < 0) {
			nextChildren.push(cloneCategoryWithUniqueIds(incomingChild, usedIds));
			continue;
		}

		nextChildren[existingChildIndex] = mergeCategoryNode(
			nextChildren[existingChildIndex],
			incomingChild,
			usedIds,
		);
	}

	return {
		...next,
		sites: nextSites.length > 0 ? nextSites : undefined,
		children: nextChildren.length > 0 ? nextChildren : undefined,
	};
}

function cloneCategory(category: NavCategory): NavCategory {
	return {
		...category,
		sites: category.sites?.map((site) => ({
			...site,
			tags: site.tags ? [...site.tags] : undefined,
		})),
		children: category.children?.map((child) => cloneCategory(child)),
	};
}

function cloneCategoryWithUniqueIds(
	category: NavCategory,
	usedIds: Set<string>,
): NavCategory {
	const nextId = createUniqueId(category.id || category.name, category.name, usedIds);
	return {
		...cloneCategory(category),
		id: nextId,
		children: category.children?.map((child) =>
			cloneCategoryWithUniqueIds(child, usedIds),
		),
	};
}

function collectCategoryIds(categories: NavCategory[]): Set<string> {
	const ids = new Set<string>();
	const walk = (items: NavCategory[]) => {
		for (const item of items) {
			if (item.id) ids.add(item.id);
			if (item.children?.length) {
				walk(item.children);
			}
		}
	};
	walk(categories);
	return ids;
}

function mergeSites(existing: NavSite[], incoming: NavSite[]): NavSite[] {
	return dedupeSites([...existing.map((site) => ({ ...site })), ...incoming]);
}

function dedupeSites(sites: NavSite[]): NavSite[] {
	const seen = new Set<string>();
	const result: NavSite[] = [];

	for (const site of sites) {
		const dedupeKey = normalizeUrlKey(site.url);
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		result.push({
			...site,
			tags: site.tags ? [...site.tags] : [],
		});
	}

	return result;
}

function isDefaultChildName(name: string): boolean {
	return normalizeNameKey(name) === normalizeNameKey(DEFAULT_CHILD_NAME);
}

function normalizeNameKey(name: string): string {
	return cleanText(name).toLowerCase();
}

function createUniqueId(
	value: string,
	fallback: string,
	usedIds: Set<string>,
): string {
	const base = slugify(value) || slugify(fallback) || "category";
	let candidate = base;
	let index = 2;

	while (usedIds.has(candidate)) {
		candidate = `${base}-${index}`;
		index += 1;
	}

	usedIds.add(candidate);
	return candidate;
}

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

function cleanText(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}
