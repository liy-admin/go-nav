"use client";

import { useServerInsertedHTML } from "next/navigation";
import type { PluginConfig } from "@/types";

export function SiteHeadInsertions({
	plugins,
}: {
	plugins: PluginConfig[];
}) {
	useServerInsertedHTML(() => (
		<>
			{plugins.map((plugin) => {
				if (plugin.type === "css") {
					return (
						<style
							key={plugin.id}
							data-plugin-id={plugin.id}
							data-plugin-name={plugin.name}
							// 防止 CSS 中的 </style> 提前闭合标签后注入脚本：
							// 备份还原只会禁用脚本类插件，CSS 插件不能成为执行脚本的旁路。
							dangerouslySetInnerHTML={{
								__html: plugin.code.replace(/<\/(style)/gi, "<\\/$1"),
							}}
						/>
					);
				}

				if (plugin.type === "resource-hint" && plugin.href?.trim()) {
					const rel = plugin.resourceHintRel ?? "preconnect";
					return (
						<link
							key={plugin.id}
							data-plugin-id={plugin.id}
							data-plugin-name={plugin.name}
							rel={rel}
							href={plugin.href.trim()}
							crossOrigin={
								rel === "preconnect" ? plugin.crossOrigin || undefined : undefined
							}
						/>
					);
				}

				return null;
			})}
		</>
	));

	return null;
}
