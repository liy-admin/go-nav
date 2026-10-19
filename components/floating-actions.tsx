"use client";
import { AiOutlineQrcode } from "react-icons/ai";
import { Button, toast } from "@heroui/react";
import Image from "next/image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { BiBookmarkPlus, BiSupport } from "react-icons/bi";
import { isScriptableUrl } from "@/lib/external-url";
import {
	hasIntranetSitesAtom,
	layoutAtom,
	navContactAtom,
	navQrCodeAtom,
	navQrCodeTextAtom,
	submissionDialogOpenAtom,
} from "@/lib/store/site";
import {
	getSiteLinkModeLabel,
	getStoredSiteLinkMode,
	setStoredSiteLinkMode,
	subscribeSiteLinkMode,
	type SiteLinkMode,
} from "@/lib/client/site-link";
import {
	FLOATING_ACTION_TRANSITION_CLASS,
	SHARED_SPRING_EASE_CLASS,
} from "./ui/ui.constants";

/**
 * 悬浮按钮（Jotai 订阅版）：
 * - 只订阅 qrCode / qrCodeText，避免 nav 其它字段变化牵连
 * - showTop state 由自己的 scroll 监听调度，memo 防止父级重渲染牵连
 */
export const FloatingActions = memo(function FloatingActions({
	showActions = true,
	showQrCode = true,
	showSubmission = false,
}: {
	showActions?: boolean;
	showQrCode?: boolean;
	showSubmission?: boolean;
}) {
	const qrCode = useAtomValue(navQrCodeAtom);
	const qrCodeText = useAtomValue(navQrCodeTextAtom);
	const layout = useAtomValue(layoutAtom);
	const hasIntranetSites = useAtomValue(hasIntranetSitesAtom);
	const contact = useAtomValue(navContactAtom);
	const contactItems = (contact?.items ?? []).filter(
		(item) => item.label.trim() || item.value.trim(),
	);
	const rawContactHref = contact?.href?.trim() ?? "";
	const contactHref = isScriptableUrl(rawContactHref) ? "" : rawContactHref;
	const showContact =
		contact?.enabled === true && (contactItems.length > 0 || !!contactHref);
	const setSubmissionOpen = useSetAtom(submissionDialogOpenAtom);
	const autoUseIntranet = layout.autoUseIntranet === true;
	const [showTop, setShowTop] = useState(false);
	const [showQrPanel, setShowQrPanel] = useState(false);
	const [showContactPanel, setShowContactPanel] = useState(false);
	const contactContainerRef = useRef<HTMLDivElement>(null);
	const [supportsHover, setSupportsHover] = useState(false);
	const [siteLinkMode, setSiteLinkMode] = useState<SiteLinkMode>("public");
	const rafRef = useRef(0);
	const showTopRef = useRef(false);
	const qrContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onScroll = () => {
			if (rafRef.current) return;
			rafRef.current = requestAnimationFrame(() => {
				const next = window.scrollY > 300;
				if (showTopRef.current !== next) {
					showTopRef.current = next;
					setShowTop(next);
				}
				rafRef.current = 0;
			});
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();

		return () => {
			window.removeEventListener("scroll", onScroll);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	useEffect(() => {
		const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
		const apply = (matches: boolean) => {
			setSupportsHover(matches);
			if (matches) {
				setShowQrPanel(false);
				setShowContactPanel(false);
			}
		};

		apply(mq.matches);
		const handleChange = (event: MediaQueryListEvent) => apply(event.matches);
		mq.addEventListener("change", handleChange);
		return () => mq.removeEventListener("change", handleChange);
	}, []);

	useEffect(() => {
		const applyMode = () => setSiteLinkMode(getStoredSiteLinkMode());
		applyMode();
		return subscribeSiteLinkMode((mode) => setSiteLinkMode(mode));
	}, []);

	useEffect(() => {
		if (!showQrPanel) return;

		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (
				qrContainerRef.current &&
				!qrContainerRef.current.contains(event.target as Node)
			) {
				setShowQrPanel(false);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("touchstart", handlePointerDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("touchstart", handlePointerDown);
		};
	}, [showQrPanel]);

	useEffect(() => {
		if (!showContactPanel) return;

		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (
				contactContainerRef.current &&
				!contactContainerRef.current.contains(event.target as Node)
			) {
				setShowContactPanel(false);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("touchstart", handlePointerDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("touchstart", handlePointerDown);
		};
	}, [showContactPanel]);

	const scrollToTop = useCallback(() => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const toggleQrPanel = useCallback(() => {
		if (supportsHover) return;
		setShowQrPanel((prev) => !prev);
	}, [supportsHover]);

	const handleContactPress = useCallback(() => {
		if (contactHref) {
			window.open(contactHref, "_blank", "noopener,noreferrer");
			return;
		}
		if (supportsHover) return;
		setShowContactPanel((prev) => !prev);
	}, [contactHref, supportsHover]);

	const toggleSiteLinkMode = useCallback(() => {
		const nextMode = siteLinkMode === "intranet" ? "public" : "intranet";
		setStoredSiteLinkMode(nextMode);
		if (nextMode === "public") {
			toast.info("已切换到公网模式");
		} else {
			toast("已切换到内网模式");
		}
	}, [siteLinkMode]);

	const qrPanelOpenClass = showQrPanel
		? "pointer-events-auto translate-x-0 scale-100 opacity-100"
		: "pointer-events-none";
	const qrPanelHoverClass = supportsHover
		? "[@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:translate-x-0 [@media(hover:hover)]:group-hover:scale-100 -mr-2 [@media(hover:hover)]:group-hover:opacity-100"
		: "";
	const contactPanelOpenClass = showContactPanel
		? "pointer-events-auto translate-x-0 scale-100 opacity-100"
		: "pointer-events-none";
	const qrPanelPositionClass =
		`absolute bottom-0 right-[calc(100%+1.5rem)] z-10 origin-bottom-right translate-x-3 scale-[0.96] opacity-0 ${FLOATING_ACTION_TRANSITION_CLASS} ${SHARED_SPRING_EASE_CLASS} duration-260 will-change-[translate,scale,opacity] motion-reduce:translate-x-0 motion-reduce:scale-100 motion-reduce:transition-none`;

	return (
		<div className="fixed bottom-8 right-6 z-50 flex flex-col items-center gap-3">
			{showActions && <Button
				size="lg"
				isIconOnly
				aria-label="回到顶部"
				variant="tertiary"
				className={`shadow bg-(--primary-foreground) rounded-full ${FLOATING_ACTION_TRANSITION_CLASS} duration-300 [@media(hover:hover)]:hover:-translate-y-0.5 ${
					showTop
						? "pointer-events-auto opacity-100"
						: "pointer-events-none translate-y-2 opacity-0"
				}`}
				onPress={scrollToTop}
			>
				<svg
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M5 15l7-7 7 7"
					/>
				</svg>
			</Button>}

			{showActions && showQrCode && qrCode && (
				<div ref={qrContainerRef} className="group relative flex items-center">
					<div
						id="floating-actions-qr-panel"
						className={`${qrPanelPositionClass} ${qrPanelOpenClass} ${qrPanelHoverClass}`}
					>
						<div className="relative w-44 rounded-2xl bg-(--primary-foreground) p-4 text-center shadow-lg">
							<div className="mx-auto flex h-28 w-28 items-center justify-center rounded-xl bg-default p-2 dark:bg-zinc-700">
								<Image
									src={qrCode}
									alt="公众号二维码"
									width={112}
									height={112}
									loading="eager"
									className="h-full w-full rounded-lg object-cover"
								/>
							</div>

							<p className="mt-3 text-sm font-medium">关注公众号</p>

							<p className="mt-1 text-xs leading-relaxed text-muted">
								{qrCodeText ?? "扫码关注，获取更多内容"}
							</p>

							<div className="absolute -right-1.5 bottom-5 h-3 w-3 rotate-45 bg-(--primary-foreground)" />
						</div>
					</div>

					<Button
						size="lg"
						isIconOnly
						aria-label="关注公众号"
						aria-controls="floating-actions-qr-panel"
						aria-expanded={showQrPanel}
						variant="tertiary"
						className={`shadow bg-(--primary-foreground) rounded-full ${FLOATING_ACTION_TRANSITION_CLASS} duration-300 [@media(hover:hover)]:hover:-translate-y-0.5`}
						onPress={toggleQrPanel}
					>
						<AiOutlineQrcode />
					</Button>
				</div>
			)}

			{showActions && !autoUseIntranet && hasIntranetSites && (
				<Button
					size="lg"
					aria-label={`当前${getSiteLinkModeLabel(siteLinkMode)}模式，点击切换`}
					isIconOnly
					variant="tertiary"
					className={`shadow bg-(--primary-foreground) rounded-full ${FLOATING_ACTION_TRANSITION_CLASS} duration-300 [@media(hover:hover)]:hover:-translate-y-0.5`}
					onPress={toggleSiteLinkMode}
				>
					{siteLinkMode === "intranet" ? (
						<svg
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
							className="size-5"
						>
							<circle cx="6" cy="18" r="2.2" fill="currentColor" />
							<circle cx="12" cy="6" r="2.2" fill="currentColor" />
							<circle cx="18" cy="18" r="2.2" fill="currentColor" />
							<path
								d="M7.8 16.6 10.4 8.5M13.6 8.5l2.6 8.1M8.2 17.5h7.6"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
							/>
						</svg>
					) : (
						<svg
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
							className="size-5"
						>
							<circle
								cx="12"
								cy="12"
								r="8.5"
								stroke="currentColor"
								strokeWidth="1.8"
							/>
							<path
								d="M3.8 12h16.4M12 3.8c2.3 2.2 3.6 5.1 3.6 8.2s-1.3 6-3.6 8.2c-2.3-2.2-3.6-5.1-3.6-8.2s1.3-6 3.6-8.2Z"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					)}
				</Button>
			)}

			{showActions && showContact && (
				<div ref={contactContainerRef} className="group relative flex items-center">
					{contactItems.length > 0 && (
					<div
						id="floating-actions-contact-panel"
						className={`${qrPanelPositionClass} ${contactPanelOpenClass} ${qrPanelHoverClass}`}
					>
						<div className="relative w-60 rounded-2xl bg-(--primary-foreground) p-4 shadow-lg">
							<p className="text-sm font-medium">
								{contact?.title?.trim() || "联系我们"}
							</p>
							<ul className="mt-3 flex flex-col gap-2.5">
								{contactItems.map((item, idx) => (
									<li key={idx} className="flex items-baseline gap-2 text-xs">
										<span className="shrink-0 text-muted">{item.label}</span>
										{item.href?.trim() ? (
											<a
												href={item.href.trim()}
												target="_blank"
												rel="noopener noreferrer"
												className="min-w-0 flex-1 break-all text-right text-primary hover:underline"
											>
												{item.value || item.href}
											</a>
										) : (
											<span className="min-w-0 flex-1 select-all break-all text-right">
												{item.value}
											</span>
										)}
									</li>
								))}
							</ul>
							<div className="absolute -right-1.5 bottom-5 h-3 w-3 rotate-45 bg-(--primary-foreground)" />
						</div>
					</div>
					)}

					<Button
						size="lg"
						isIconOnly
						aria-label={contact?.title?.trim() || "联系我们"}
						aria-controls={contactItems.length > 0 ? "floating-actions-contact-panel" : undefined}
						aria-expanded={showContactPanel}
						variant="tertiary"
						className={`shadow bg-(--primary-foreground) rounded-full ${FLOATING_ACTION_TRANSITION_CLASS} duration-300 [@media(hover:hover)]:hover:-translate-y-0.5`}
						onPress={handleContactPress}
					>
						<BiSupport />
					</Button>
				</div>
			)}

			{showSubmission && (
				<Button
					size="lg"
					isIconOnly
					aria-label="我要投稿"
					variant="primary"
					className={`rounded-full shadow-lg ${FLOATING_ACTION_TRANSITION_CLASS} duration-300 [@media(hover:hover)]:hover:-translate-y-0.5`}
					onPress={() => setSubmissionOpen(true)}
				>
					<BiBookmarkPlus className="size-5" />
				</Button>
			)}
		</div>
	);
});
