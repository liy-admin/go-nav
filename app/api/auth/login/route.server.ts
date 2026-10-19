import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, checkCredentials, createSession } from "@/lib/server/auth";
import { createFailureLimiter, getClientKey } from "@/lib/server/rate-limit";

/** 同一来源 15 分钟内最多失败 5 次 */
const loginLimiter = createFailureLimiter(5, 15 * 60 * 1000);

function isSecureRequest(req: Request): boolean {
	const forwardedProto = req.headers
		.get("x-forwarded-proto")
		?.split(",")[0]
		?.trim()
		.toLowerCase();
	if (forwardedProto) return forwardedProto === "https";

	const forwarded = req.headers.get("forwarded")?.toLowerCase();
	if (forwarded?.includes("proto=https")) return true;

	try {
		return new URL(req.url).protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * 登录接口：POST { username, password } → 设置 httpOnly cookie
 */
export async function POST(req: Request) {
	const key = getClientKey(req);
	const retryAfter = loginLimiter.retryAfter(key);
	if (retryAfter > 0) {
		return NextResponse.json(
			{ error: "尝试次数过多，请稍后再试" },
			{ status: 429, headers: { "Retry-After": String(retryAfter) } },
		);
	}

	let username = "";
	let password = "";
	try {
		const body = (await req.json()) as { username?: string; password?: string };
		username = body.username ?? "";
		password = body.password ?? "";
	} catch {
		return NextResponse.json({ error: "invalid body" }, { status: 400 });
	}

	if (!checkCredentials(username, password)) {
		loginLimiter.fail(key);
		return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
	}
	loginLimiter.reset(key);

	const token = createSession(username);
	const res = NextResponse.json({ ok: true });
	res.cookies.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: isSecureRequest(req),
		path: "/",
		maxAge: Math.floor(SESSION_TTL_MS / 1000),
	});
	return res;
}
