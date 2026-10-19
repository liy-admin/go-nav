/**
 * 进程内的简单限流工具（单实例部署足够；多实例需换成共享存储）。
 *
 * 注意：客户端标识取自 X-Forwarded-For / X-Real-IP，只有在可信反向代理后面
 * 才可靠；直接暴露公网时这些头可被伪造。
 */

const MAX_TRACKED_KEYS = 10_000;

export function getClientKey(req: Request): string {
	const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

interface Entry {
	count: number;
	resetAt: number;
}

/** 清理过期条目；仍然超限时丢弃最早的条目，防止伪造来源撑爆内存。 */
export function pruneRateLimitMap(map: Map<string, Entry>): void {
	if (map.size < MAX_TRACKED_KEYS) return;
	const now = Date.now();
	for (const [key, entry] of map) {
		if (entry.resetAt <= now) map.delete(key);
	}
	while (map.size >= MAX_TRACKED_KEYS) {
		const oldest = map.keys().next().value;
		if (oldest === undefined) break;
		map.delete(oldest);
	}
}

/** 失败次数限流：窗口内失败达到 max 次后锁定到窗口结束。 */
export function createFailureLimiter(max: number, windowMs: number) {
	const failures = new Map<string, Entry>();
	return {
		/** 仍处于锁定期时返回剩余秒数，否则返回 0 */
		retryAfter(key: string): number {
			const entry = failures.get(key);
			if (!entry) return 0;
			if (entry.resetAt <= Date.now()) {
				failures.delete(key);
				return 0;
			}
			if (entry.count < max) return 0;
			return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
		},
		fail(key: string): void {
			const now = Date.now();
			const entry = failures.get(key);
			if (!entry || entry.resetAt <= now) {
				pruneRateLimitMap(failures);
				failures.set(key, { count: 1, resetAt: now + windowMs });
				return;
			}
			entry.count += 1;
		},
		reset(key: string): void {
			failures.delete(key);
		},
	};
}
