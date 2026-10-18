import { NextResponse } from "next/server";
import {
	SITE_ACCESS_COOKIE,
	SITE_ACCESS_TTL_MS,
	createSiteAccessSession,
} from "@/lib/server/auth";
import { readNav } from "@/lib/server/store";
import { verifySiteAccessPassword } from "@/lib/server/site-access";
import { createFailureLimiter, getClientKey } from "@/lib/server/rate-limit";

const unlockLimiter = createFailureLimiter(10, 10 * 60 * 1000);

export async function POST(req: Request) {
	const key = getClientKey(req);
	const retryAfter = unlockLimiter.retryAfter(key);
	if (retryAfter > 0) {
		return NextResponse.json(
			{ error: "尝试次数过多，请稍后再试" },
			{
				status: 429,
				headers: { "Retry-After": String(retryAfter) },
			},
		);
	}

	let password = "";
	try {
		const body = (await req.json()) as { password?: string };
		password = typeof body.password === "string" ? body.password : "";
	} catch {
		return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
	}

	const accessProtection = readNav().accessProtection;
	if (accessProtection?.enabled !== true) {
		unlockLimiter.reset(key);
		const response = NextResponse.json({ ok: true });
		clearAccessCookie(response);
		return response;
	}

	const passwordHash = accessProtection.passwordHash;
	if (!passwordHash) {
		return NextResponse.json(
			{ error: "站点访问保护尚未配置完成，请联系管理员" },
			{ status: 503 },
		);
	}

	if (
		password.length === 0 ||
		password.length > 128 ||
		!verifySiteAccessPassword(password, passwordHash)
	) {
		unlockLimiter.fail(key);
		return NextResponse.json({ error: "访问密码错误" }, { status: 401 });
	}

	unlockLimiter.reset(key);
	const response = NextResponse.json({ ok: true });
	response.cookies.set(
		SITE_ACCESS_COOKIE,
		createSiteAccessSession(passwordHash),
		{
			httpOnly: true,
			sameSite: "lax",
			secure: isSecureRequest(req),
			path: "/",
			maxAge: Math.floor(SITE_ACCESS_TTL_MS / 1000),
		},
	);
	return response;
}

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

function clearAccessCookie(response: NextResponse) {
	response.cookies.set(SITE_ACCESS_COOKIE, "", {
		path: "/",
		maxAge: 0,
	});
}
