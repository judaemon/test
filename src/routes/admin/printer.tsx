import { createFileRoute, Link, redirect } from "@tanstack/solid-router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { OrderReceipt } from "~/components/admin/order-receipt";
import { shortDeliveryDate } from "~/lib/delivery-dates";
import { can } from "~/lib/permissions";
import { formatPrice } from "~/lib/product";
import { cn } from "~/lib/utils";
import { listOrdersToPrint } from "~/server/admin/orders";
import { getAdminSession } from "~/server/admin/settings";
import type { Order } from "~/types/order";

/** How often it looks for new orders while switched on. */
const CHECK_EVERY_MS = 15_000;

/** Receipt paper roll widths, in millimetres. */
const WIDTHS = [58, 80] as const;
type Width = (typeof WIDTHS)[number];

const STORAGE_KEY = "oraia:order-printer";

/**
 * Kept on this computer only: whether it prints, the paper, and the last
 * order number it printed, so a reload carries on where it left off.
 */
interface PrinterSettings {
	on: boolean;
	width: Width;
	last?: number;
}

function loadSettings(): PrinterSettings {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		return {
			on: saved.on === true,
			width: WIDTHS.includes(saved.width) ? saved.width : 58,
			last: Number.isInteger(saved.last) ? saved.last : undefined,
		};
	} catch {
		return { on: false, width: 58 };
	}
}

function saveSettings(settings: PrinterSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Private window or storage off: it still prints, just forgets on reload.
	}
}

/** "3:42 PM", Manila time. */
const clock = (date: Date) =>
	date.toLocaleTimeString("en-US", {
		timeZone: "Asia/Manila",
		hour: "numeric",
		minute: "2-digit",
	});

/**
 * Prints a slip for every new order on a small receipt printer. Left open on
 * the computer the printer is plugged into.
 */
export const Route = createFileRoute("/admin/printer")({
	beforeLoad: async ({ location }) => {
		const user = await getAdminSession();
		if (!user)
			throw redirect({
				to: "/admin/login",
				search: { redirect: location.href },
			});
		if (!can(user, "orders.view")) throw redirect({ to: "/admin" });
	},
	head: () => ({
		meta: [
			{ title: "Order printer · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: OrderPrinter,
});

function OrderPrinter() {
	const [settings, setSettings] = createSignal<PrinterSettings>({
		on: false,
		width: 58,
	});
	const update = (change: Partial<PrinterSettings>) => {
		const next = { ...settings(), ...change };
		setSettings(next);
		saveSettings(next);
	};

	/** The receipts on the page when it prints. */
	const [sheet, setSheet] = createSignal<Order[]>([]);
	const [recent, setRecent] = createSignal<Order[]>([]);
	const [printed, setPrinted] = createSignal<{ number: string; at: Date }[]>(
		[],
	);
	const [checkedAt, setCheckedAt] = createSignal<Date>();
	const [problem, setProblem] = createSignal("");

	/** Lays the receipts out, prints them, and clears the sheet after. */
	const print = async (orders: Order[]) => {
		setSheet(orders);
		// Let the receipts render before the print dialog takes a snapshot.
		await new Promise((done) => requestAnimationFrame(() => done(null)));
		window.print();
		setSheet([]);
	};

	let busy = false;
	const check = async () => {
		if (busy) return;
		busy = true;
		try {
			const on = settings().on;
			const result = await listOrdersToPrint({
				data: { after: on ? settings().last : undefined },
			});
			setProblem("");
			setCheckedAt(new Date());
			setRecent(result.recent);
			if (!on) return;
			// Just switched on: start from here, not the whole backlog.
			if (settings().last === undefined) {
				update({ last: result.latest });
				return;
			}
			const fresh = result.newOrders;
			if (fresh.length === 0) return;
			await print(fresh);
			const now = new Date();
			update({
				last: Math.max(...fresh.map((order) => Number(order.number))),
			});
			setPrinted((list) =>
				[
					...fresh.map((order) => ({ number: order.number, at: now })),
					...list,
				].slice(0, 30),
			);
		} catch {
			setProblem(
				"Couldn’t reach the shop. It keeps trying; check the internet connection.",
			);
		} finally {
			busy = false;
		}
	};

	// Keeps the screen (and so the computer) awake while it's switched on.
	let wakeLock: { release: () => Promise<void> } | undefined;
	const holdAwake = async () => {
		if (!settings().on || document.hidden || wakeLock) return;
		try {
			wakeLock = await (
				navigator as Navigator & {
					wakeLock?: { request: (type: "screen") => Promise<typeof wakeLock> };
				}
			).wakeLock?.request("screen");
			(wakeLock as unknown as EventTarget | undefined)?.addEventListener?.(
				"release",
				() => {
					wakeLock = undefined;
				},
			);
		} catch {
			wakeLock = undefined;
		}
	};

	onMount(() => {
		setSettings(loadSettings());
		void check();
		void holdAwake();
		const timer = setInterval(() => void check(), CHECK_EVERY_MS);
		const onVisible = () => {
			if (document.hidden) return;
			void check();
			void holdAwake();
		};
		document.addEventListener("visibilitychange", onVisible);
		onCleanup(() => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
			void wakeLock?.release();
		});
	});

	const switchOn = (on: boolean) => {
		// Switching on starts from the latest order again.
		update({ on, last: undefined });
		if (on) {
			void check();
			void holdAwake();
		} else {
			void wakeLock?.release();
			wakeLock = undefined;
		}
	};

	return (
		<>
			<style>{`
				@page { margin: 0; }
				.receipt-sheet { display: none; }
				@media print {
					html, body { background: #fff !important; margin: 0; }
					.no-print { display: none !important; }
					.receipt-sheet { display: block; }
					/* Each order on its own slip, so the cutter cuts between them. */
					.receipt + .receipt { break-before: page; }
				}
			`}</style>
			<main class="no-print mx-auto flex min-h-dvh max-w-xl flex-col gap-5 bg-cream px-4 py-6 text-petal-900">
				<div class="flex items-center justify-between gap-3">
					<h1 class="font-display text-2xl">Order printer</h1>
					<Link
						to="/admin/orders"
						class="text-sm text-petal-700 underline underline-offset-2"
					>
						Back to admin
					</Link>
				</div>

				<section class="flex flex-col gap-4 rounded-2xl border border-petal-100 bg-white p-4">
					<label class="flex cursor-pointer items-center justify-between gap-4">
						<span>
							<span class="block font-medium">
								Print new orders on this computer
							</span>
							<span class="block text-sm text-petal-900/60">
								{settings().on
									? "On. Keep this page open; each new order prints a slip."
									: "Off. Nothing prints."}
							</span>
						</span>
						<input
							type="checkbox"
							role="switch"
							aria-checked={settings().on}
							checked={settings().on}
							onChange={(event) => switchOn(event.currentTarget.checked)}
							class="size-6 shrink-0 accent-petal-700"
						/>
					</label>

					<fieldset class="flex flex-wrap items-center gap-3 text-sm">
						<legend class="sr-only">Paper width</legend>
						<span class="text-petal-900/70">Paper roll</span>
						<div class="flex rounded-full border border-petal-200 p-1">
							<For each={WIDTHS}>
								{(width) => (
									<button
										type="button"
										aria-pressed={settings().width === width}
										onClick={() => update({ width })}
										class={cn(
											"rounded-full px-3 py-1",
											settings().width === width
												? "bg-petal-700 font-medium text-white"
												: "hover:bg-petal-50",
										)}
									>
										{width} mm
									</button>
								)}
							</For>
						</div>
					</fieldset>

					<Show when={settings().on}>
						<p class="text-sm text-petal-900/60" aria-live="polite">
							<Show
								when={!problem()}
								fallback={<span class="text-red-700">{problem()}</span>}
							>
								<Show when={checkedAt()} fallback="Checking for orders…">
									{(at) => (
										<>
											Last checked {clock(at())}
											<Show when={settings().last !== undefined}>
												{" "}
												· next to print: #{(settings().last ?? 0) + 1}
											</Show>
										</>
									)}
								</Show>
							</Show>
						</p>
					</Show>
				</section>

				<Show when={printed().length > 0}>
					<section class="flex flex-col gap-2">
						<h2 class="font-medium">Printed since this page opened</h2>
						<p class="text-sm text-petal-900/70">
							<For each={printed()}>
								{(item, index) => (
									<>
										{index() > 0 && ", "}#{item.number} at {clock(item.at)}
									</>
								)}
							</For>
						</p>
					</section>
				</Show>

				<section class="flex flex-col gap-2">
					<h2 class="font-medium">Latest orders</h2>
					<Show
						when={recent().length > 0}
						fallback={
							<p class="text-sm text-petal-900/60">
								{checkedAt() ? "No orders yet." : "Loading…"}
							</p>
						}
					>
						<ul class="flex flex-col divide-y divide-petal-100 rounded-2xl border border-petal-100 bg-white">
							<For each={recent()}>
								{(order) => (
									<li class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
										<span class="min-w-0">
											<span class="font-medium">#{order.number}</span>{" "}
											<span class="text-petal-900/70">
												{order.details.fullName}
											</span>
											<span class="block truncate text-xs text-petal-900/55">
												{formatPrice(order.total, order.currency)}
												{order.details.deliveryDate &&
													` · ${shortDeliveryDate(order.details.deliveryDate)}`}
												{order.stage === "cancelled" && " · Cancelled"}
											</span>
										</span>
										<button
											type="button"
											onClick={() => void print([order])}
											class="shrink-0 rounded-full border border-petal-200 px-3 py-1 hover:bg-petal-50"
										>
											Print again
										</button>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</section>

				<details class="rounded-2xl border border-petal-100 bg-white p-4 text-sm text-petal-900/80">
					<summary class="cursor-pointer font-medium text-petal-900">
						Setting up the printer
					</summary>
					<ol class="mt-3 flex list-decimal flex-col gap-2 pl-5">
						<li>
							Plug the receipt printer into this computer (USB or Bluetooth) and
							install its driver, so it shows up as a printer.
						</li>
						<li>
							Click <b>Print again</b> on any order, pick the receipt printer
							and its roll size ({settings().width} mm), with margins set to{" "}
							<b>None</b>. Chrome remembers this for next time.
						</li>
						<li>
							To print without the print window popping up each time, open
							Chrome with <code>--kiosk-printing</code> (add it to the end of
							the Chrome shortcut's target), and make the receipt printer the
							default printer.
						</li>
						<li>
							Keep this page open on one computer only; two open pages print
							every order twice.
						</li>
					</ol>
				</details>
			</main>

			<div class="receipt-sheet">
				<For each={sheet()}>
					{(order) => <OrderReceipt order={order} width={settings().width} />}
				</For>
			</div>
		</>
	);
}
