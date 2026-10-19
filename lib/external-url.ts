/**
 * 是否为会在当前页面执行脚本的协议（javascript: / vbscript: / data:）。
 * window.open / location.href 不经过 React 的 href 过滤，必须自己拦截。
 * 浏览器解析协议时会忽略空白与控制字符，这里先去掉再判断。
 */
export function isScriptableUrl(rawUrl: string | undefined): boolean {
	const compact = (rawUrl ?? "").replace(/[\u0000- \u007f]/g, "").toLowerCase();
	return /^(javascript|vbscript|data):/.test(compact);
}

