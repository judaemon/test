import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

import {
	adminButton,
	adminInput,
	PageHeader,
	toastError,
} from "~/components/admin/ui";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { DELIVERY_SLOTS, formatSlot, getSlot } from "~/lib/checkout";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import {
	addDays,
	formatClock,
	formatDate,
	shopNow,
	toMinutes,
} from "~/lib/time";
import { cn } from "~/lib/utils";
import { listAdminOrders, moveOrder } from "~/server/admin/orders";
import {
	BOARD_STAGES,
	type BoardStage,
	isPaymentSettled,
	type Order,
	STAGE_LABELS,
} from "~/types/order";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** "Leaving before" options: every slot start after the first. */
const LEAVE_BEFORE = DELIVERY_SLOTS.slice(1)
	.map((slot) => slot.start)
	.concat("18:00");
const REFRESH_MS = 30_000;
const DUE_SOON_MINUTES = 60;

interface BoardSearch {
	/** "today" | "tomorrow" | "upcoming" | YYYY-MM-DD */
	day?: string;
	/** Only orders whose courier leaves before this time, HH:MM. */
	before?: string;
}

export const Route = createFileRoute("/admin/_dashboard/")({
	validateSearch: (search: Record<string, unknown>): BoardSearch => ({
		day:
			typeof search.day === "string" &&
			(["today", "tomorrow", "upcoming"].includes(search.day) ||
				DATE.test(search.day))
				? search.day
				: undefined,
		before:
			typeof search.before === "string" && LEAVE_BEFORE.includes(search.before)
				? search.before
				: undefined,
	}),
	loaderDeps: ({ search }) => ({ day: search.day ?? "today" }),
	loader: async ({ deps }) => {
		const today = shopNow().date;
		const day = deps.day;
		const filter =
			day === "today"
				? // Include anything left over from earlier days so nothing is forgotten.
					{ fromDate: addDays(today, -14) }
				: day === "tomorrow"
					? { date: addDays(today, 1) }
					: day === "upcoming"
						? { fromDate: today }
						: { date: day };
		const orders = await listAdminOrders({
			data: { ...filter, stages: [...BOARD_STAGES] },
		});
		return { orders, today };
	},
	component: BoardPage,
});

function BoardPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const router = useRouter();

	const [orders, setOrders] = createSignal<Order[]>(data().orders);
	createEffect(
		on(
			() => data().orders,
			(fresh) => setOrders(fresh),
			{ defer: true },
		),
	);

	const [clock, setClock] = createSignal(shopNow());
	const [draggingId, setDraggingId] = createSignal<string | null>(null);
	const [overStage, setOverStage] = createSignal<BoardStage | null>(null);
	const [pending, setPending] = createSignal(new Set<string>());
	const [announcement, setAnnouncement] = createSignal("");

	onMount(() => {
		const timer = setInterval(() => {
			setClock(shopNow());
			// Pick up orders and moves from other staff, but never mid-drag.
			if (
				document.visibilityState === "visible" &&
				!draggingId() &&
				pending().size === 0
			) {
				router.invalidate();
			}
		}, REFRESH_MS);
		onCleanup(() => clearInterval(timer));
	});

	const day = () => search().day ?? "today";
	const visible = createMemo(() => {
		const today = clock().date;
		return orders().filter((order) => {
			const date = order.details.deliveryDate;
			if (day() === "today" && date !== today) {
				// Leftovers from earlier days stay until they're delivered.
				if (!(date < today && order.stage !== "done")) return false;
			}
			const before = search().before;
			if (before) {
				const slot = getSlot(order.details.deliverySlot);
				if (!slot || toMinutes(slot.start) >= toMinutes(before)) return false;
			}
			return true;
		});
	});
	const columns = createMemo(() =>
		BOARD_STAGES.map((stage) => ({
			stage,
			orders: visible().filter((order) => order.stage === stage),
		})),
	);
	const needsCheck = () =>
		visible().filter((order) => order.payment.status === "pending").length;

	const move = async (
		order: Order,
		stage: BoardStage,
		{ refocus = false } = {},
	) => {
		if (order.stage === stage || pending().has(order.id)) return;
		if (stage !== "new" && !isPaymentSettled(order.payment.status)) {
			toastError(
				new Error(
					order.payment.status === "rejected"
						? `#${order.number}: the payment was rejected. Sort it out with the customer first.`
						: `#${order.number}: verify the ${PAYMENT_METHOD_LABELS[order.payment.method]} payment before starting it.`,
				),
			);
			return;
		}
		const original = order;
		const replace = (next: Order) =>
			setOrders((list) => list.map((o) => (o.id === next.id ? next : o)));
		replace({ ...order, stage });
		setPending((set) => new Set(set).add(order.id));
		try {
			const result = await moveOrder({ data: { id: order.id, stage } });
			if (result.ok) {
				replace(result.order);
				setAnnouncement(
					`Order ${order.number} moved to ${STAGE_LABELS[stage]}.`,
				);
				// The card re-renders in its new column; keep keyboard users on it.
				if (refocus) {
					requestAnimationFrame(() =>
						document
							.querySelector<HTMLElement>(`[data-order="${order.number}"] a`)
							?.focus(),
					);
				}
			} else {
				replace(original);
				toastError(new Error(result.message));
			}
		} catch (error) {
			replace(original);
			toastError(error);
		} finally {
			setPending((set) => {
				const next = new Set(set);
				next.delete(order.id);
				return next;
			});
		}
	};

	const handleDrop = (event: DragEvent, stage: BoardStage) => {
		event.preventDefault();
		setOverStage(null);
		const id = event.dataTransfer?.getData("text/plain");
		const order = orders().find((o) => o.id === id);
		if (order) void move(order, stage);
	};

	const setSearch = (patch: Partial<BoardSearch>) =>
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

	return (
		<div>
			<PageHeader
				title="To-do board"
				description={
					<>
						Drag orders across as you work, or use the arrows on each card.{" "}
						<Show when={needsCheck() > 0}>
							<Link
								to="/admin/orders"
								search={{ payment: "pending" }}
								class="font-medium text-petal-700 underline underline-offset-2"
							>
								{needsCheck()}{" "}
								{needsCheck() === 1 ? "payment needs" : "payments need"}{" "}
								checking
							</Link>
						</Show>
					</>
				}
			/>

			<div class="mb-5 flex flex-wrap items-end gap-3">
				<fieldset class="flex rounded-full border border-petal-200 bg-white p-1">
					<legend class="sr-only">Delivery day</legend>
					<For
						each={
							[
								["today", "Today"],
								["tomorrow", "Tomorrow"],
								["upcoming", "Upcoming"],
							] as const
						}
					>
						{([value, label]) => (
							<button
								type="button"
								aria-pressed={day() === value}
								onClick={() =>
									setSearch({ day: value === "today" ? undefined : value })
								}
								class={cn(
									"rounded-full px-3.5 py-1.5 text-sm transition-colors",
									day() === value
										? "bg-petal-700 font-medium text-white"
										: "text-petal-900/70 hover:bg-petal-50",
								)}
							>
								{label}
							</button>
						)}
					</For>
				</fieldset>
				<label class="flex flex-col gap-1 text-xs text-petal-900/60">
					Pick a date
					<input
						type="date"
						value={DATE.test(day()) ? day() : ""}
						onChange={(e) =>
							setSearch({ day: e.currentTarget.value || undefined })
						}
						class={cn(adminInput, "h-9 w-40")}
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-petal-900/60">
					Leaving
					<select
						value={search().before ?? ""}
						onChange={(e) =>
							setSearch({ before: e.currentTarget.value || undefined })
						}
						class={cn(adminInput, "h-9 w-48")}
					>
						<option value="">Any time</option>
						<For each={LEAVE_BEFORE}>
							{(time) => (
								<option value={time}>Before {formatClock(time)}</option>
							)}
						</For>
					</select>
				</label>
				<Show when={search().day || search().before}>
					<button
						type="button"
						class={adminButton.ghost}
						onClick={() => setSearch({ day: undefined, before: undefined })}
					>
						Clear filters
					</button>
				</Show>
			</div>

			<p class="sr-only" aria-live="polite">
				{announcement()}
			</p>

			<div class="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 xl:grid xl:grid-cols-4 xl:overflow-visible">
				<For each={columns()}>
					{(column) => (
						<section
							aria-labelledby={`col-${column.stage}`}
							onDragOver={(event) => {
								event.preventDefault();
								if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
								setOverStage(column.stage);
							}}
							onDragLeave={(event) => {
								const next = event.relatedTarget as Node | null;
								if (!next || !(event.currentTarget as Node).contains(next))
									setOverStage(null);
							}}
							onDrop={(event) => handleDrop(event, column.stage)}
							data-stage={column.stage}
							class={cn(
								"flex w-[82vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border bg-petal-50/60 p-3 transition-colors sm:w-80 xl:w-auto xl:max-w-none",
								overStage() === column.stage
									? "border-petal-500 bg-petal-100/70"
									: "border-petal-100",
							)}
						>
							<header class="mb-3 flex items-center justify-between px-1">
								<h2 id={`col-${column.stage}`} class="text-sm font-semibold">
									{STAGE_LABELS[column.stage]}
								</h2>
								<span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-petal-900/70">
									{column.orders.length}
								</span>
							</header>
							<ul class="flex min-h-24 flex-col gap-2.5">
								<For
									each={column.orders}
									fallback={
										<li class="rounded-xl border border-dashed border-petal-200 px-3 py-6 text-center text-xs text-petal-900/45">
											Nothing here
										</li>
									}
								>
									{(order) => (
										<OrderCard
											order={order}
											stage={column.stage}
											clock={clock()}
											busy={pending().has(order.id)}
											dragging={draggingId() === order.id}
											onDragStart={(event) => {
												event.dataTransfer?.setData("text/plain", order.id);
												if (event.dataTransfer)
													event.dataTransfer.effectAllowed = "move";
												setDraggingId(order.id);
											}}
											onDragEnd={() => {
												setDraggingId(null);
												setOverStage(null);
											}}
											onMove={(stage) => move(order, stage, { refocus: true })}
										/>
									)}
								</For>
							</ul>
						</section>
					)}
				</For>
			</div>
		</div>
	);
}

function OrderCard(props: {
	order: Order;
	stage: BoardStage;
	clock: { date: string; minutes: number };
	busy: boolean;
	dragging: boolean;
	onDragStart: (event: DragEvent) => void;
	onDragEnd: () => void;
	onMove: (stage: BoardStage) => void;
}) {
	const index = () => BOARD_STAGES.indexOf(props.stage);
	const previous = () => BOARD_STAGES[index() - 1];
	const next = () => BOARD_STAGES[index() + 1];
	const slot = () => getSlot(props.order.details.deliverySlot);
	const date = () => props.order.details.deliveryDate;
	// Kept short so the badge stays on one line in narrow columns.
	const badgeText = () => {
		const when =
			date() === props.clock.date
				? leaveTime()
				: `${formatDate(date(), { month: "short", day: "numeric" })}, ${leaveTime()}`;
		if (timing() === "late") return `Late · ${when}`;
		if (timing() === "soon") return `Due soon · ${when}`;
		return date() === props.clock.date ? `Leave by ${when}` : when;
	};
	const leaveTime = () => {
		const s = slot();
		return s ? formatClock(s.start) : "—";
	};

	const timing = () => {
		const s = slot();
		if (!s || props.stage === "delivering" || props.stage === "done")
			return "normal";
		if (date() < props.clock.date) return "late";
		if (date() > props.clock.date) return "normal";
		const minutesLeft = toMinutes(s.start) - props.clock.minutes;
		if (minutesLeft < 0) return "late";
		if (minutesLeft <= DUE_SOON_MINUTES) return "soon";
		return "normal";
	};

	return (
		<li>
			<article
				draggable={!props.busy}
				onDragStart={props.onDragStart}
				onDragEnd={props.onDragEnd}
				data-order={props.order.number}
				aria-busy={props.busy}
				class={cn(
					"group relative cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition-[opacity,box-shadow,border-color] hover:border-petal-300 hover:shadow-md active:cursor-grabbing",
					props.dragging && "opacity-40",
					props.busy && "opacity-70",
					timing() === "late"
						? "border-error-foreground/40"
						: "border-petal-100",
				)}
			>
				<div class="flex items-start justify-between gap-2">
					{/* Stretched over the whole card so a click anywhere opens the order.
					    Not draggable itself, so dragging still moves the card. */}
					<Link
						to="/admin/orders/$orderId"
						params={{ orderId: props.order.id }}
						draggable={false}
						aria-label={`Open order ${props.order.number} for ${props.order.details.recipientName}`}
						class="font-mono text-xs font-semibold text-petal-700 underline-offset-2 outline-none group-hover:underline after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-petal-500"
					>
						#{props.order.number}
					</Link>
					<span
						class={cn(
							"whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
							timing() === "late" && "bg-error text-error-foreground",
							timing() === "soon" && "bg-warning text-warning-foreground",
							timing() === "normal" && "bg-petal-50 text-petal-900/70",
						)}
					>
						{badgeText()}
					</span>
				</div>
				<p class="mt-2 font-medium leading-snug">
					{props.order.details.recipientName}
				</p>
				<p class="text-xs text-petal-900/60">
					{props.order.details.city}
					<Show when={slot()}>{(s) => <> · {formatSlot(s())}</>}</Show>
				</p>
				<ul class="mt-2 flex flex-col gap-0.5 text-xs">
					<For each={props.order.lines}>
						{(line) => (
							<li class="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									class="size-2.5 rounded-full border border-black/10"
									style={{ "background-color": line.colorHex }}
								/>
								{line.quantity} × {line.colorName}
							</li>
						)}
					</For>
				</ul>
				<div class="mt-3 flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5">
						<PaymentStatusPill status={props.order.payment.status} />
						<Show when={props.order.details.giftMessage}>
							<span title="Has a card message" class="text-xs text-petal-500">
								<span aria-hidden="true">✉</span>
								<span class="sr-only">Has a card message</span>
							</span>
						</Show>
					</div>
					{/* Above the stretched link so the arrows still move the card. */}
					<div class="relative z-10 flex items-center">
						<Show when={previous()}>
							{(stage) => (
								<button
									type="button"
									class={adminButton.ghost}
									disabled={props.busy}
									onClick={() => props.onMove(stage())}
									aria-label={`Move order ${props.order.number} back to ${STAGE_LABELS[stage()]}`}
									title={`Back to ${STAGE_LABELS[stage()]}`}
								>
									←
								</button>
							)}
						</Show>
						<Show when={next()}>
							{(stage) => (
								<button
									type="button"
									class={cn(adminButton.ghost, "font-medium text-petal-700")}
									disabled={props.busy}
									onClick={() => props.onMove(stage())}
									aria-label={`Move order ${props.order.number} to ${STAGE_LABELS[stage()]}`}
									title={`Move to ${STAGE_LABELS[stage()]}`}
								>
									→
								</button>
							)}
						</Show>
					</div>
				</div>
			</article>
		</li>
	);
}
