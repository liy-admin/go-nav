const AUTHOR_BAIDU_TN = "68018901_11_oem_dg";

/**
 * 是否为会在当前页面执行脚本的协议（javascript: / vbscript: / data:）。
 * window.open / location.href 不经过 React 的 href 过滤，必须自己拦截。
 * 浏览器解析协议时会忽略空白与控制字符，这里先去掉再判断。
 */
export function isScriptableUrl(rawUrl: string | undefined): boolean {
	const compact = (rawUrl ?? "").replace(/[\u0000- \u007f]/g, "").toLowerCase();
	return /^(javascript|vbscript|data):/.test(compact);
}

/**
 * 这是开源项目作者为了一些收益加的个人代码；
 * 如果有特殊要求，可以自行删除本函数及其调用。
 */
export function withAuthorBaiduTracking(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") return rawUrl;

		const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
		if (hostname !== "baidu.com" && !hostname.endsWith(".baidu.com")) {
			return rawUrl;
		}

		// URLSearchParams.set 会添加 tn，并在已存在时替换原值。
		url.searchParams.set("tn", AUTHOR_BAIDU_TN);
		return url.toString();
	} catch {
		return rawUrl;
	}
}
