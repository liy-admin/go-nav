# Go Nav 安全审计报告

- 审计日期：2026-10-18
- 范围：`app/`、`components/`、`hooks/`、`lib/`、`types/`、`scripts/`、`next.config.ts` 中全部 TS/JS/CSS 源码（203 个文件，34,760 行）。不含构建产物 `web/`、`.next/` 与 `node_modules/`。
- 方法：逐文件人工阅读（覆盖清单见文末），并辅以危险写法检索（`dangerouslySetInnerHTML`、`innerHTML`、`eval`、`window.open`、`location.href`、`fetch`、文件读写、路径拼接）与 `npm audit --omit=dev`。
- 验证：`tsc --noEmit` 与 eslint 通过；修复未在浏览器中实测。

## 已修复

| # | 等级 | 问题 | 修复位置 |
|---|---|---|---|
| 1 | 中 | 后台登录无失败次数限制，可无限爆破 | `lib/server/rate-limit.ts`、`app/api/auth/login/route.server.ts`（15 分钟内 5 次失败即锁定） |
| 2 | 低 | 投稿 / 访问密码限流表无上限，伪造来源可撑爆内存 | `lib/server/rate-limit.ts`（最多 1 万条，过期优先清理） |
| 3 | 低 | `themeMode` 未校验直接拼进 `<head>` 脚本 | `app/layout.tsx`（只接受 light/dark/system） |
| 4 | 中 | HTML 构建把含 `accessProtection.passwordHash` 的 `nav.json` 公开发布 | `scripts/finalize-html-build.mjs` |
| 5 | 中 | 站点 / 搜索 / 联系链接经 `window.open`、`location.href` 打开，不经 React 过滤，`javascript:` 可执行脚本 | `lib/external-url.ts`（`isScriptableUrl`）、`lib/client/site-link.ts`、`components/search-bar/index.tsx`、`components/floating-actions.tsx` |
| 6 | 低 | 后台与接口缺少防嵌入响应头（点击劫持） | `next.config.ts`（`/admin`、`/api` 加 `X-Frame-Options`、`frame-ancestors` 等） |
| 7 | 中 | 抓取的第三方 SVG 图标原样保存，静态 / HTML 部署下同源打开可执行脚本 | `lib/server/image-hosting.ts`（拒绝含脚本、事件属性、`foreignObject` 等的 SVG） |
| 8 | 低 | 书签导入只拦截字面量 `javascript:`，变体可绕过 | `lib/bookmark-import.ts` |
| 9 | 中 | CSS 插件内容可用 `</style><script>` 闭合标签执行脚本，绕过“还原备份 / 远端拉取时禁用脚本插件” | `components/site-head-insertions.tsx` |

## 需要部署方处理

1. **默认管理员密码（高）**：未设置 `ADMIN_PASS` 时为 `admin123`（`docker-compose.yml` 亦如此）。
2. **限流依赖可信反向代理**：限流按 `X-Forwarded-For` / `X-Real-IP` 区分来源，需由反向代理覆盖该头，不要直接暴露 Node 端口。访问密码校验使用 PBKDF2，绕过限流时可被用来消耗 CPU。
3. **GitHub 同步仓库需私有**：推送的 `nav.json` 含访问密码哈希。
4. **上游作者内容**：`lib/external-url.ts` 给百度链接追加作者推广参数；`lib/server/store.ts` 默认配置含作者广告、备案号、投稿邮箱；后台打赏页为作者收款码；`app/sitemap.ts` 未设 `SITE_URL` 时使用 `nav.gotab.cn`。
5. **Docker 以 root 运行**：建议在 Dockerfile 加 `USER node`。

## 低风险，暂未处理

- 开启访问保护后，`/uploads/` 图片仍可直接访问。
- 访问密码最短 4 位。
- 投稿图标可填外部地址，管理员查看审核列表时会加载，可泄露 IP 与查看时间。
- 搜索联想通过 JSONP 实时把输入发给百度，并在本站执行其返回脚本。
- 服务端抓取网址存在 DNS 重绑定与少数 IPv6 写法的绕过可能（仅登录后可用）。
- WebDAV 拉取备份未限制下载大小（地址由管理员配置）。
- 会话为无状态令牌，退出后 7 天内仍有效；删除 `data/.session-secret` 可全部失效。
- `sitemap` 为构建期静态生成，开启访问保护后需重新构建。
- 插件（JS / 外链脚本）按设计可在前台执行任意代码，仅管理员可配置。

## 已确认安全的要点

- 所有写入 / 管理接口与后台页面均在服务端校验登录；会话 HMAC 签名、定长比较。
- 图床与同步密钥只写不读，接口仅返回 `hasToken` 等标记，配置文件权限 600。
- 上传、备份还原、GitHub / WebDAV 拉取、分片上传、素材清理均防住路径穿越；zip 解析限制条目数与解压大小并校验 CRC。
- 还原与远端拉取会自动禁用 JS 类插件。
- 访问密码 PBKDF2-SHA256（21 万次、随机盐）；前台与后台下发的配置都剥离了哈希。
- 访问验证页跳转仅允许站内路径；访客投稿内容一律以文本渲染；Markdown 不渲染 HTML。
- `npm audit --omit=dev`：0 个已知漏洞。

## 覆盖清单

每个文件均已完整阅读。

| 文件 | 行数 |
|---|---|
| `app/(site)/layout.tsx` | 31 |
| `app/(site)/page.tsx` | 5 |
| `app/(site)/site/[slug]/page.tsx` | 63 |
| `app/access/page.server.tsx` | 56 |
| `app/admin/(dashboard)/ads/page.html.tsx` | 5 |
| `app/admin/(dashboard)/ads/page.server.tsx` | 5 |
| `app/admin/(dashboard)/backup/page.server.tsx` | 5 |
| `app/admin/(dashboard)/batch/page.server.tsx` | 5 |
| `app/admin/(dashboard)/categories/page.html.tsx` | 5 |
| `app/admin/(dashboard)/categories/page.server.tsx` | 5 |
| `app/admin/(dashboard)/donation/page.server.tsx` | 5 |
| `app/admin/(dashboard)/engines/page.html.tsx` | 5 |
| `app/admin/(dashboard)/engines/page.server.tsx` | 5 |
| `app/admin/(dashboard)/image-host/page.server.tsx` | 5 |
| `app/admin/(dashboard)/import/page.html.tsx` | 5 |
| `app/admin/(dashboard)/import/page.server.tsx` | 5 |
| `app/admin/(dashboard)/layout.html.tsx` | 20 |
| `app/admin/(dashboard)/layout.server.tsx` | 31 |
| `app/admin/(dashboard)/loading.html.tsx` | 1 |
| `app/admin/(dashboard)/loading.server.tsx` | 1 |
| `app/admin/(dashboard)/page.html.tsx` | 5 |
| `app/admin/(dashboard)/page.server.tsx` | 8 |
| `app/admin/(dashboard)/plugins/page.html.tsx` | 5 |
| `app/admin/(dashboard)/plugins/page.server.tsx` | 5 |
| `app/admin/(dashboard)/sites/page.html.tsx` | 5 |
| `app/admin/(dashboard)/sites/page.server.tsx` | 5 |
| `app/admin/(dashboard)/source-file/page.server.tsx` | 5 |
| `app/admin/(dashboard)/submissions/page.html.tsx` | 5 |
| `app/admin/(dashboard)/submissions/page.server.tsx` | 5 |
| `app/admin/(dashboard)/sync/page.server.tsx` | 5 |
| `app/admin/(dashboard)/website-access/page.server.tsx` | 5 |
| `app/admin/(dashboard)/website-footer/page.html.tsx` | 5 |
| `app/admin/(dashboard)/website-footer/page.server.tsx` | 5 |
| `app/admin/(dashboard)/website-layout/page.html.tsx` | 5 |
| `app/admin/(dashboard)/website-layout/page.server.tsx` | 5 |
| `app/admin/(dashboard)/website-theme/page.html.tsx` | 5 |
| `app/admin/(dashboard)/website-theme/page.server.tsx` | 5 |
| `app/admin/(dashboard)/website/page.html.tsx` | 5 |
| `app/admin/(dashboard)/website/page.server.tsx` | 5 |
| `app/admin/login/page.server.tsx` | 156 |
| `app/api/auth/login/route.server.ts` | 65 |
| `app/api/auth/logout/route.server.ts` | 11 |
| `app/api/backup/cleanup/route.server.ts` | 115 |
| `app/api/backup/route.server.ts` | 150 |
| `app/api/config/route.server.ts` | 105 |
| `app/api/fetch-website/route.server.ts` | 118 |
| `app/api/image-host/config/route.server.ts` | 39 |
| `app/api/site-access/unlock/route.server.ts` | 98 |
| `app/api/source-file/route.server.ts` | 83 |
| `app/api/submissions/route.server.ts` | 382 |
| `app/api/sync/action/route.server.ts` | 118 |
| `app/api/sync/config/route.server.ts` | 36 |
| `app/api/sync/webdav-backups/route.server.ts` | 35 |
| `app/api/tools/capturePreview/route.server.ts` | 167 |
| `app/api/tools/uploadFavicon/route.server.ts` | 37 |
| `app/api/upload/route.server.ts` | 73 |
| `app/globals.css` | 662 |
| `app/img/[...path]/route.server.ts` | 41 |
| `app/layout.tsx` | 99 |
| `app/not-found.tsx` | 23 |
| `app/sitemap.ts` | 58 |
| `app/uploads/[...path]/route.server.ts` | 73 |
| `components/ad-banner.tsx` | 364 |
| `components/admin/admin-shell.tsx` | 833 |
| `components/admin/admin-switch.tsx` | 56 |
| `components/admin/ads-editor.tsx` | 701 |
| `components/admin/backup-editor.tsx` | 420 |
| `components/admin/batch-operations-editor.tsx` | 1273 |
| `components/admin/categories-editor.tsx` | 998 |
| `components/admin/data-sync-editor.tsx` | 1096 |
| `components/admin/donation-editor.tsx` | 65 |
| `components/admin/engines-editor.tsx` | 481 |
| `components/admin/external-import-editor.tsx` | 822 |
| `components/admin/html-admin-runtime.tsx` | 124 |
| `components/admin/icon-picker.tsx` | 261 |
| `components/admin/image-host-editor.tsx` | 1278 |
| `components/admin/loading-indicator.tsx` | 14 |
| `components/admin/loading.tsx` | 14 |
| `components/admin/login-form.tsx` | 184 |
| `components/admin/navigation.tsx` | 99 |
| `components/admin/plugins-editor.tsx` | 947 |
| `components/admin/scroll-top-button.tsx` | 52 |
| `components/admin/sites-editor.tsx` | 2088 |
| `components/admin/source-file-editor.tsx` | 638 |
| `components/admin/submission-editor.tsx` | 777 |
| `components/admin/website-editor.tsx` | 1066 |
| `components/app-footer.tsx` | 141 |
| `components/app-header.tsx` | 75 |
| `components/app-layout.tsx` | 188 |
| `components/app-layout/app-layout-home-content.tsx` | 107 |
| `components/app-layout/app-layout.types.ts` | 18 |
| `components/app-layout/site-detail-gallery.tsx` | 1425 |
| `components/app-layout/site-detail-markdown.tsx` | 36 |
| `components/app-layout/site-detail-page.tsx` | 176 |
| `components/app-layout/use-app-layout-view.ts` | 110 |
| `components/app-layout/use-home-route-state.ts` | 185 |
| `components/app-sidebar.tsx` | 71 |
| `components/app-toast-provider.tsx` | 7 |
| `components/category-section/category-section-content.tsx` | 72 |
| `components/category-section/category-section-header.tsx` | 36 |
| `components/category-section/index.tsx` | 48 |
| `components/category-section/subcategory-tabs.tsx` | 47 |
| `components/category-sidebar.tsx` | 462 |
| `components/engine-drawer.tsx` | 77 |
| `components/floating-actions.tsx` | 380 |
| `components/focus-ring-guard.tsx` | 53 |
| `components/header-bundle.tsx` | 281 |
| `components/header-drawer-shell.tsx` | 42 |
| `components/header.types.ts` | 34 |
| `components/icon-view.tsx` | 54 |
| `components/layout.types.ts` | 18 |
| `components/mobile-nav-drawer.tsx` | 37 |
| `components/portal/portal-home.tsx` | 170 |
| `components/recent-visits/index.tsx` | 70 |
| `components/recent-visits/recent-visits-grid.tsx` | 56 |
| `components/recent-visits/recent-visits-header.tsx` | 24 |
| `components/recent-visits/use-recent-visits-display.ts` | 113 |
| `components/recent-visits/use-recent-visits-entrance.ts` | 122 |
| `components/runtime-document-config.tsx` | 154 |
| `components/runtime-loading-screen.tsx` | 16 |
| `components/runtime-site-shell.tsx` | 138 |
| `components/search-bar/index.tsx` | 202 |
| `components/search-bar/search-bar-engine-select.tsx` | 93 |
| `components/search-bar/search-bar.types.ts` | 14 |
| `components/search-bar/search-bar.utils.ts` | 53 |
| `components/search-bar/search-local-results-panel.tsx` | 78 |
| `components/search-bar/search-panel-shell.tsx` | 19 |
| `components/search-bar/search-suggestions-panel.tsx` | 58 |
| `components/search-bar/use-local-search.ts` | 112 |
| `components/search-bar/use-search-engine-state.ts` | 67 |
| `components/search-bar/use-search-interactions.ts` | 176 |
| `components/search-bar/use-search-suggestions.ts` | 89 |
| `components/site-access-form.tsx` | 169 |
| `components/site-card/index.tsx` | 11 |
| `components/site-card/site-card-compact.tsx` | 46 |
| `components/site-card/site-card-item.tsx` | 34 |
| `components/site-card/site-card-link-shell.tsx` | 44 |
| `components/site-card/site-card-preview.tsx` | 63 |
| `components/site-card/site-card.types.ts` | 43 |
| `components/site-card/site-grid.tsx` | 43 |
| `components/site-card/use-site-card-navigation.ts` | 132 |
| `components/site-card/use-site-grid-batch.ts` | 80 |
| `components/site-head-insertions.tsx` | 51 |
| `components/site-icon.tsx` | 163 |
| `components/site-shell.tsx` | 111 |
| `components/submission-dialog-host.tsx` | 14 |
| `components/submission-dialog.tsx` | 308 |
| `components/submission-trigger.tsx` | 34 |
| `components/theme-provider.tsx` | 52 |
| `components/ui/crud-pagination.tsx` | 61 |
| `components/ui/empty-state-blocks.tsx` | 29 |
| `components/ui/horizontal-scroll.tsx` | 299 |
| `components/ui/table-shell.module.css` | 79 |
| `components/ui/table-shell.tsx` | 39 |
| `components/ui/ui.constants.ts` | 14 |
| `components/ui/virtualized-table.tsx` | 68 |
| `hooks/use-active-section.ts` | 321 |
| `hooks/use-overlay-after-close.ts` | 24 |
| `hooks/use-recent-visits.ts` | 138 |
| `hooks/use-scroll-containment.ts` | 75 |
| `lib/ad-display.ts` | 112 |
| `lib/backup-import.ts` | 10 |
| `lib/bookmark-export.ts` | 84 |
| `lib/bookmark-import.ts` | 599 |
| `lib/client/home-restore.ts` | 51 |
| `lib/client/html-admin.ts` | 102 |
| `lib/client/image-upload.ts` | 111 |
| `lib/client/pinyin-search.ts` | 61 |
| `lib/client/search-engine-preference.ts` | 32 |
| `lib/client/site-link.ts` | 309 |
| `lib/config.ts` | 39 |
| `lib/external-url.ts` | 33 |
| `lib/icon.ts` | 20 |
| `lib/plugin-config.ts` | 26 |
| `lib/search-config.ts` | 14 |
| `lib/server/api-auth.ts` | 7 |
| `lib/server/auth.ts` | 190 |
| `lib/server/backup-upload.ts` | 185 |
| `lib/server/backup.ts` | 232 |
| `lib/server/data-sync.ts` | 1398 |
| `lib/server/favicon.ts` | 249 |
| `lib/server/fetch-utils.ts` | 162 |
| `lib/server/image-hosting.ts` | 1351 |
| `lib/server/paths.ts` | 129 |
| `lib/server/rate-limit.ts` | 63 |
| `lib/server/revalidate-frontend.ts` | 18 |
| `lib/server/site-access-request.ts` | 42 |
| `lib/server/site-access.ts` | 150 |
| `lib/server/store.ts` | 421 |
| `lib/server/submissions.ts` | 133 |
| `lib/server/zip.ts` | 241 |
| `lib/site-access-config.ts` | 37 |
| `lib/site-detail.ts` | 152 |
| `lib/store/admin.ts` | 334 |
| `lib/store/hydrate.tsx` | 79 |
| `lib/store/site.ts` | 225 |
| `lib/submission.ts` | 85 |
| `next.config.ts` | 108 |
| `scripts/copy-standalone-assets.mjs` | 22 |
| `scripts/finalize-html-build.mjs` | 150 |
| `scripts/html-preview-server.mjs` | 189 |
| `scripts/sync-uploads.mjs` | 69 |
| `types/index.ts` | 426 |
