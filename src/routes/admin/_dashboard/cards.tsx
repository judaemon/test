import { createFileRoute, Link } from "@tanstack/solid-router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	type JSX,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	adminButton,
	adminCard,
	adminInput,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import {
	BackSheet,
	type CardFit,
	CardFront,
	EmptyFront,
	fitMessages,
	SHEET,
	Sheet,
	SMALL_PT,
} from "~/components/cards/card-sheets";
import {
	EmptyFolded,
	FOLD_SHEET,
	FoldedInside,
	FoldedOutsideSheet,
	FoldedSheet,
	fitFolded,
} from "~/components/cards/folded-sheets";
import { shortDeliveryDate } from "~/lib/delivery-dates";
import {
	CARDS_PER_SHEET,
	type CardPrintStatus,
	cardMatches,
	type PrintCard,
	toSheets,
} from "~/lib/print-cards";
import { printFileName, usePrintTitle } from "~/lib/print-title";
import { cn } from "~/lib/utils";
import {
	listPrintCardsFn,
	markCardsPrintedFn,
	unmarkCardsPrintedFn,
} from "~/server/admin/cards";

export const Route = createFileRoute("/admin/_dashboard/cards")({
	// The day to open on, e.g. from Orders' "Print cards".
	validateSearch: (search: Record<string, unknown>): { day?: string } => ({
		day:
			typeof search.day === "string" &&
			(search.day === "none" || /^\d{4}-\d{2}-\d{2}$/.test(search.day))
				? search.day
				: undefined,
	}),
	loader: () => listPrintCardsFn(),
	component: CardsPage,
});

const ALL = "all";
const NONE = "none";

type StatusFilter = "todo" | CardPrintStatus | typeof ALL;
/** "front" is the side with the message; "back" is ORAIA's side. */
type Sides = "both" | "front" | "back";
/** Folded: opens like a book. Flat: one card, message on one side. */
type CardStyle = "folded" | "flat";
/** Which edge the printer turns the sheet over for two-sided printing. */
type Flip = "short" | "long";

const STYLES: { key: CardStyle; label: string; hint: string }[] = [
	{
		key: "folded",
		label: "Folded card",
		hint: "Folds down the middle into a 74 × 105 mm card: ORAIA on the cover, contact details on the back, the message inside.",
	},
	{
		key: "flat",
		label: "Flat card",
		hint: "One 105 × 148 mm card: the message on the front, ORAIA and contact details on the back.",
	},
];

const SIDES: Record<CardStyle, { key: Sides; label: string; hint: string }[]> =
	{
		flat: [
			{
				key: "both",
				label: "Front & back",
				hint: "Turn on two-sided printing and flip on the long edge.",
			},
			{
				key: "front",
				label: "Messages only",
				hint: "For card stock that already has ORAIA on the back.",
			},
			{
				key: "back",
				label: "Branding only",
				hint: "Print the ORAIA side ahead of time, then feed the sheets back in for messages.",
			},
		],
		folded: [
			{
				key: "both",
				label: "Both sides",
				hint: "Turn on two-sided printing, flipping on the edge picked below.",
			},
			{
				key: "front",
				label: "Inside only",
				hint: "For sheets that already have the outside printed: feed them back in blank side up.",
			},
			{
				key: "back",
				label: "Outside only",
				hint: "Print the covers ahead of time, then feed the sheets back in for messages.",
			},
		],
	};

const STYLE_KEY = "oraia:card-style";

/** Millimetres to CSS pixels, for scaling the preview. */
const mmToPx = (mm: number) => (mm / 25.4) * 96;

const pill = (on: boolean) =>
	cn(
		"rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
		on
			? "border-petal-700 bg-petal-700 font-medium text-white"
			: "border-petal-200 bg-white hover:bg-petal-50",
	);

const printedOn = (at: string) =>
	new Date(at).toLocaleString("en-PH", {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/**
 * Every dedication card, printed four to an A4 sheet: the message on the
 * front, ORAIA on the back. Cards always print with their latest words (they're
 * read again just before printing), and each card remembers what was printed,
 * so one edited afterwards shows up to print again.
 */
function CardsPage() {
	const initial = Route.useLoaderData();
	const [result, setResult] = createSignal(initial());
	const cards = () => result().cards;

	const [day, setDay] = createSignal<string>(Route.useSearch()().day ?? ALL);
	const [company, setCompany] = createSignal<string>(ALL);
	const [status, setStatus] = createSignal<StatusFilter>("todo");
	const [query, setQuery] = createSignal("");
	/** Cards unticked by hand; everything else that's shown is printed. */
	const [skipped, setSkipped] = createSignal<ReadonlySet<string>>(new Set());

	const [style, setStyleSignal] = createSignal<CardStyle>("folded");
	// Remember the card style on this computer.
	onMount(() => {
		try {
			const saved = localStorage.getItem(STYLE_KEY);
			if (saved === "flat" || saved === "folded") setStyleSignal(saved);
		} catch {}
	});
	const setStyle = (next: CardStyle) => {
		setStyleSignal(next);
		try {
			localStorage.setItem(STYLE_KEY, next);
		} catch {}
	};
	const folded = () => style() === "folded";
	const [flip, setFlip] = createSignal<Flip>("short");
	const sideOptions = () => SIDES[style()];
	const sideLabel = (key: Sides) =>
		sideOptions().find((option) => option.key === key)?.label ?? "";
	const [sides, setSides] = createSignal<Sides>("both");
	const [withReference, setWithReference] = createSignal(true);
	const [guides, setGuides] = createSignal(true);
	const [backSheets, setBackSheets] = createSignal<number | undefined>();

	const [fits, setFits] = createSignal<ReadonlyMap<string, CardFit>>(new Map());
	const [busy, setBusy] = createSignal(false);
	/** What just went to the printer, waiting for staff to say it came out well. */
	const [justPrinted, setJustPrinted] = createSignal<PrintCard[]>();

	// ----- Reading the cards again -----

	let refreshing: Promise<void> | undefined;
	/** Reads every card again; says how many changed while the page was open. */
	const refresh = (quiet = false) => {
		refreshing ??= (async () => {
			try {
				const before = new Map(
					cards().map((card) => [card.key, card.to + card.message]),
				);
				const next = await listPrintCardsFn();
				const edited = next.cards.filter(
					(card) =>
						before.has(card.key) &&
						before.get(card.key) !== card.to + card.message,
				).length;
				setResult(next);
				if (edited)
					toastSuccess(
						`${plural(edited, "card was", "cards were")} edited since you opened this page; the latest words are shown.`,
					);
				else if (!quiet) toastSuccess("Cards are up to date.");
			} catch (error) {
				if (!quiet) toastError(error);
			} finally {
				refreshing = undefined;
			}
		})();
		return refreshing;
	};

	// Coming back from editing an order in another tab: show its new words.
	onMount(() => {
		const onFocus = () => {
			if (!busy()) void refresh(true);
		};
		window.addEventListener("focus", onFocus);
		onCleanup(() => window.removeEventListener("focus", onFocus));
	});

	// ----- Filters -----

	const dayOf = (card: PrintCard) => card.deliveryDate || NONE;
	const companyOf = (card: PrintCard) => card.company || NONE;
	const statusMatches = (card: PrintCard, filter: StatusFilter) =>
		filter === ALL ||
		(filter === "todo" ? card.status !== "printed" : card.status === filter);
	const searchMatches = (card: PrintCard) => cardMatches(card, query());
	const searching = () => query().trim().length > 0;

	const days = createMemo(() => {
		const list = [...new Set(cards().map(dayOf))].sort();
		// "No date" last.
		return [
			...list.filter((d) => d !== NONE),
			...list.filter((d) => d === NONE),
		];
	});
	const ofDay = createMemo(() =>
		cards().filter((card) => day() === ALL || dayOf(card) === day()),
	);
	const companies = createMemo(() =>
		[...new Set(ofDay().map(companyOf))].sort((a, b) =>
			a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b),
		),
	);
	const ofCompany = createMemo(() =>
		ofDay().filter(
			(card) => company() === ALL || companyOf(card) === company(),
		),
	);
	const shown = createMemo(() =>
		ofCompany().filter(
			(card) => statusMatches(card, status()) && searchMatches(card),
		),
	);
	const selected = createMemo(() =>
		shown().filter((card) => !skipped().has(card.key)),
	);
	const sheets = createMemo(() => toSheets(selected()));

	/** Per status tab, within the day, company and search. */
	const countFor = (filter: StatusFilter) =>
		ofCompany().filter(
			(card) => statusMatches(card, filter) && searchMatches(card),
		).length;

	const toggle = (key: string, on: boolean) =>
		setSkipped((prev) => {
			const next = new Set(prev);
			if (on) next.delete(key);
			else next.add(key);
			return next;
		});
	const setAllShown = (on: boolean) =>
		setSkipped((prev) => {
			const next = new Set(prev);
			for (const card of shown())
				on ? next.delete(card.key) : next.add(card.key);
			return next;
		});

	// ----- What prints -----

	const backCount = () =>
		Math.max(1, Math.min(200, backSheets() ?? Math.max(1, sheets().length)));
	/** Every page in print order: for two-sided, each front then its back. */
	const pages = createMemo(() => {
		if (sides() === "back")
			return Array.from({ length: backCount() }, (_, i) => ({
				side: "back" as const,
				sheet: i,
				cards: [] as PrintCard[],
			}));
		return sheets().flatMap((sheetCards, sheet) => {
			const front = { side: "front" as const, sheet, cards: sheetCards };
			const back = { side: "back" as const, sheet, cards: sheetCards };
			if (sides() === "front") return [front];
			// A folded card's outside prints first, like its cover.
			return folded() ? [back, front] : [front, back];
		});
	});
	const sheetCount = () => (sides() === "back" ? backCount() : sheets().length);
	const canPrint = () => (sides() === "back" ? true : selected().length > 0);

	const reference = (card: PrintCard) =>
		withReference()
			? [`#${card.number}`, card.label].filter(Boolean).join(" · ")
			: undefined;

	const dayLabel = (d: string) =>
		d === ALL ? "All days" : d === NONE ? "No date" : shortDeliveryDate(d);

	// The saved PDF's name: "Cards - Sat, Nov 14 - Front & back - 12 cards - Nov 12".
	usePrintTitle(() =>
		printFileName([
			"Cards",
			day() !== ALL && dayLabel(day()),
			company() !== ALL && (company() === NONE ? "No company" : company()),
			STYLES.find((option) => option.key === style())?.label,
			sideLabel(sides()),
			sides() === "back"
				? plural(backCount(), "sheet")
				: plural(selected().length, "card"),
		]),
	);

	// ----- Fitting and the preview's size -----

	let previewBox: HTMLDivElement | undefined;
	const [previewWidth, setPreviewWidth] = createSignal(0);
	onMount(() => {
		if (!previewBox) return;
		const observer = new ResizeObserver(([entry]) =>
			setPreviewWidth(entry.contentRect.width),
		);
		observer.observe(previewBox);
		onCleanup(() => observer.disconnect());
	});
	/** Two across when printing both sides and there's room, so each back sits by its front. */
	const paper = () => (folded() ? FOLD_SHEET : SHEET);
	const twoUp = () =>
		sides() === "both" && previewWidth() >= (folded() ? 760 : 520);
	const scale = () => {
		const width = previewWidth();
		if (!width) return 0.4;
		const across = twoUp() ? 2 : 1;
		return Math.min(
			0.62,
			(width - (across - 1) * 16) / across / mmToPx(paper().width),
		);
	};
	/** For printers that only flip on the long edge, the inside goes upside down. */
	const insideUpsideDown = () => folded() && flip() === "long";

	const refit = async () => {
		await document.fonts.ready;
		requestAnimationFrame(() =>
			setFits(folded() ? fitFolded(previewBox) : fitMessages(previewBox)),
		);
	};
	createEffect(on([pages, withReference, style], () => void refit()));

	const fitOf = (card: PrintCard) => fits().get(card.key);
	const tooLong = createMemo(() =>
		selected().filter((card) => fitOf(card)?.overflow),
	);

	// ----- Printing -----

	const print = async () => {
		setBusy(true);
		setJustPrinted(undefined);
		try {
			// Whatever was edited since the page opened prints with its new words.
			await refresh(true);
			await refit();
			await new Promise((done) => requestAnimationFrame(done));
			await Promise.all(
				[...(previewBox?.querySelectorAll("img") ?? [])].map((img) =>
					img.decode().catch(() => {}),
				),
			);
			const printing = sides() === "back" ? [] : selected().slice();
			window.print();
			if (printing.length) setJustPrinted(printing);
		} finally {
			setBusy(false);
		}
	};

	const markPrinted = async () => {
		const printing = justPrinted();
		if (!printing?.length) return;
		try {
			await markCardsPrintedFn({
				data: {
					cards: printing.map(({ orderId, slot, to, message }) => ({
						orderId,
						slot,
						to,
						message,
					})),
				},
			});
			setJustPrinted(undefined);
			setSkipped(new Set<string>());
			toastSuccess(`${plural(printing.length, "card")} marked as printed.`);
			await refresh(true);
		} catch (error) {
			toastError(error);
		}
	};

	const unmark = async (card: PrintCard) => {
		try {
			await unmarkCardsPrintedFn({
				data: { cards: [{ orderId: card.orderId, slot: card.slot }] },
			});
			toastSuccess(`#${card.number}’s card is back on the list to print.`);
			await refresh(true);
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<div class="pb-24 lg:pb-10 print:p-0">
			<style>{`
				@page { size: A4 ${folded() ? "landscape" : "portrait"}; margin: 0; }
				@media print {
					html, body { background: #fff !important; }
					.card-page { break-before: page; }
					.card-page:first-child { break-before: auto; }
				}
			`}</style>
			<div class="print:hidden">
				<PageHeader
					title="Dedication cards"
					description="Four cards to an A4 sheet, folded or flat, with ORAIA on the outside and the message inside. Each card is read again just before printing, so edits to an order always make it onto paper."
					actions={
						<button
							type="button"
							onClick={() => void refresh()}
							class={adminButton.secondary}
							title="Read the cards again, with any edits"
						>
							<RefreshIcon />
							Refresh
						</button>
					}
				/>
			</div>

			<div class="grid gap-6 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start print:block">
				{/* ----- Which cards ----- */}
				<section
					class="flex min-w-0 flex-col gap-4 print:hidden"
					aria-label="Cards to print"
				>
					<div class={cn(adminCard, "flex flex-col gap-4 p-4")}>
						<FilterRow label="Delivery day">
							<button
								type="button"
								aria-pressed={day() === ALL}
								class={pill(day() === ALL)}
								onClick={() => setDay(ALL)}
							>
								All days
							</button>
							<For each={days()}>
								{(d) => (
									<button
										type="button"
										aria-pressed={day() === d}
										class={pill(day() === d)}
										onClick={() => {
											setDay(d);
											setCompany(ALL);
										}}
									>
										{dayLabel(d)}
										<span class="tabular-nums opacity-75">
											{" "}
											{cards().filter((card) => dayOf(card) === d).length}
										</span>
									</button>
								)}
							</For>
						</FilterRow>

						<label class="flex flex-col gap-1.5 text-sm font-medium">
							Company
							<select
								class={adminInput}
								value={company()}
								onChange={(e) => setCompany(e.currentTarget.value)}
							>
								<option value={ALL}>All companies</option>
								<For each={companies()}>
									{(name) => (
										<option value={name}>
											{name === NONE ? "No company" : name}
										</option>
									)}
								</For>
							</select>
						</label>

						<FilterRow label="Show">
							<For
								each={
									[
										["todo", "To print"],
										["changed", "Edited since printed"],
										["printed", "Printed"],
										[ALL, "All"],
									] as [StatusFilter, string][]
								}
							>
								{([key, label]) => (
									<button
										type="button"
										aria-pressed={status() === key}
										class={cn(
											pill(status() === key),
											key === "changed" &&
												status() !== key &&
												countFor("changed") > 0 &&
												"border-warning-foreground/30 bg-warning",
										)}
										onClick={() => setStatus(key)}
									>
										{label}
										<span class="tabular-nums opacity-75">
											{" "}
											{countFor(key)}
										</span>
									</button>
								)}
							</For>
						</FilterRow>
					</div>

					<div class={cn(adminCard, "overflow-hidden")}>
						<div class="border-b border-petal-100 px-4 pt-4 pb-3">
							<label for="card-search" class="sr-only">
								Search cards
							</label>
							<div class="relative">
								<SearchIcon />
								<input
									id="card-search"
									type="search"
									enterkeyhint="search"
									autocomplete="off"
									class={cn(
										adminInput,
										"ps-10 pe-10 [&::-webkit-search-cancel-button]:hidden",
									)}
									placeholder="Order #, name, serial no., words…"
									value={query()}
									onInput={(e) => setQuery(e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === "Escape") setQuery("");
									}}
									aria-describedby="card-search-hint"
								/>
								<Show when={query()}>
									<button
										type="button"
										onClick={() => {
											setQuery("");
											document.getElementById("card-search")?.focus();
										}}
										class="absolute inset-y-0 end-1 my-auto flex size-9 items-center justify-center rounded-full text-petal-900/50 outline-none hover:bg-petal-50 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500"
										aria-label="Clear search"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											class="size-4"
										>
											<path d="M6 6l12 12M18 6 6 18" />
										</svg>
									</button>
								</Show>
							</div>
							<p id="card-search-hint" class="mt-1.5 text-xs text-petal-900/55">
								<Show
									when={searching()}
									fallback={
										<>
											Order number, buyer, receiver, words on the card, bouquet,
											company, class, serial no. or email. Separate orders with
											commas:{" "}
											<span class="font-medium text-petal-900/75">
												95, 102, 213
											</span>
										</>
									}
								>
									{plural(shown().length, "card matches", "cards match")}
									<Show when={countFor(ALL) > shown().length}>
										{" · "}
										<button
											type="button"
											class="font-medium text-petal-700 underline underline-offset-2 hover:text-petal-900"
											onClick={() => setStatus(ALL)}
										>
											{countFor(ALL) - shown().length} more in other tabs
										</button>
									</Show>
								</Show>
							</p>
						</div>
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-petal-100 px-4 py-3">
							<p class="text-sm">
								<strong class="font-semibold tabular-nums">
									{selected().length}
								</strong>
								<span class="text-petal-900/60">
									{" "}
									of {shown().length} ticked
								</span>
							</p>
							<div class="flex gap-1">
								<button
									type="button"
									class={adminButton.ghost}
									onClick={() => setAllShown(true)}
									disabled={selected().length === shown().length}
								>
									Tick all
								</button>
								<button
									type="button"
									class={adminButton.ghost}
									onClick={() => setAllShown(false)}
									disabled={selected().length === 0}
								>
									Untick all
								</button>
							</div>
						</div>
						<Show
							when={shown().length}
							fallback={
								<p class="px-4 py-10 text-center text-sm text-petal-900/60">
									{cards().length === 0
										? "No orders have a dedication card yet."
										: searching()
											? `Nothing matches “${query().trim()}”${countFor(ALL) ? " here: see the other tabs" : ""}.`
											: status() === "todo" && countFor(ALL) > 0
												? "Every card here is printed. Pick Printed or All to print one again."
												: "No cards match these filters."}
								</p>
							}
						>
							<ul class="divide-y divide-petal-100 lg:max-h-[calc(100vh-24rem)] lg:min-h-64 lg:overflow-y-auto">
								<For each={shown()}>
									{(card) => (
										<CardRow
											card={card}
											checked={!skipped().has(card.key)}
											onToggle={(on) => toggle(card.key, on)}
											fit={fitOf(card)}
											onUnmark={() => void unmark(card)}
										/>
									)}
								</For>
							</ul>
						</Show>
					</div>
				</section>

				{/* ----- How it prints, and the sheets themselves ----- */}
				<section
					class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 print:block"
					aria-label="Print"
				>
					<div class={cn(adminCard, "flex flex-col gap-4 p-4 print:hidden")}>
						<Show when={justPrinted()}>
							{(printing) => (
								<div
									aria-live="polite"
									class="flex flex-wrap items-center gap-3 rounded-xl border border-petal-200 bg-petal-50 px-4 py-3"
								>
									<p class="min-w-0 flex-1 basis-56 text-sm">
										Did all {plural(printing().length, "card")} come out well?
										Mark them as printed so they leave the list. If one is
										edited later, it comes back as <em>Edited since printed</em>
										.
									</p>
									<div class="flex gap-2">
										<button
											type="button"
											class={adminButton.primary}
											onClick={() => void markPrinted()}
										>
											Mark as printed
										</button>
										<button
											type="button"
											class={adminButton.secondary}
											onClick={() => setJustPrinted(undefined)}
										>
											Not yet
										</button>
									</div>
								</div>
							)}
						</Show>

						<div class="flex flex-col gap-2">
							<span class="text-sm font-medium" id="style-label">
								Card
							</span>
							<fieldset
								aria-labelledby="style-label"
								class="m-0 grid grid-cols-2 gap-2 border-0 p-0"
							>
								<For each={STYLES}>
									{(option) => (
										<button
											type="button"
											aria-pressed={style() === option.key}
											onClick={() => setStyle(option.key)}
											class={cn(
												"flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
												style() === option.key
													? "border-petal-700 bg-petal-50 ring-1 ring-petal-700"
													: "border-petal-200 bg-white hover:bg-petal-50",
											)}
										>
											<StyleIcon style={option.key} />
											<span class="font-medium">{option.label}</span>
										</button>
									)}
								</For>
							</fieldset>
							<p class="text-sm text-petal-900/60">
								{STYLES.find((option) => option.key === style())?.hint}
							</p>
						</div>

						<div class="flex flex-col gap-2">
							<span class="text-sm font-medium" id="sides-label">
								Print
							</span>
							<fieldset
								aria-labelledby="sides-label"
								class="m-0 grid grid-cols-3 rounded-full border border-petal-200 bg-white p-1 text-sm"
							>
								<For each={sideOptions()}>
									{(option) => (
										<button
											type="button"
											aria-pressed={sides() === option.key}
											onClick={() => setSides(option.key)}
											class={cn(
												"rounded-full px-2 py-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
												sides() === option.key
													? "bg-petal-700 font-medium text-white"
													: "hover:bg-petal-50",
											)}
										>
											{option.label}
										</button>
									)}
								</For>
							</fieldset>
							<p class="text-sm text-petal-900/60">
								{sideOptions().find((option) => option.key === sides())?.hint}{" "}
								Set margins to <strong>None</strong> and scale to{" "}
								<strong>100%</strong>. Try one sheet first.
							</p>
						</div>

						<Show when={folded() && sides() !== "back"}>
							<div class="flex flex-col gap-2">
								<span class="text-sm font-medium" id="flip-label">
									Printer flips the sheet on the
								</span>
								<fieldset
									aria-labelledby="flip-label"
									class="m-0 flex flex-wrap gap-2 border-0 p-0"
								>
									<button
										type="button"
										aria-pressed={flip() === "short"}
										class={pill(flip() === "short")}
										onClick={() => setFlip("short")}
									>
										Short edge (best)
									</button>
									<button
										type="button"
										aria-pressed={flip() === "long"}
										class={pill(flip() === "long")}
										onClick={() => setFlip("long")}
									>
										Long edge
									</button>
								</fieldset>
								<p class="text-sm text-petal-900/60">
									<Show
										when={flip() === "long"}
										fallback="Pick “Flip on short edge” in the print dialog’s two-sided setting."
									>
										For printers that only flip on the long edge: the inside is
										printed upside down on purpose so it comes out the right
										way.
									</Show>
								</p>
							</div>
						</Show>

						<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
							<Show
								when={sides() !== "back"}
								fallback={
									<label class="flex items-center gap-2 text-sm">
										Sheets
										<input
											type="number"
											min="1"
											max="200"
											inputmode="numeric"
											class={cn(adminInput, "w-24")}
											value={backCount()}
											onInput={(e) => {
												const n = Number.parseInt(e.currentTarget.value, 10);
												setBackSheets(Number.isFinite(n) ? n : undefined);
											}}
										/>
										<span class="text-petal-900/60">
											= {backCount() * CARDS_PER_SHEET} cards
										</span>
									</label>
								}
							>
								<Check checked={withReference()} onChange={setWithReference}>
									Order number on each card
								</Check>
								<Check checked={guides()} onChange={setGuides}>
									{folded() ? "Cut and fold guides" : "Cut guides"}
								</Check>
							</Show>
						</div>

						<Show when={sides() !== "back" && tooLong().length}>
							<p class="rounded-xl bg-error px-3 py-2 text-sm text-error-foreground">
								{plural(tooLong().length, "message is", "messages are")} too
								long to fit even at the smallest size, so the end would be cut
								off. Shorten {tooLong().length === 1 ? "it" : "them"} with Edit,
								or untick {tooLong().length === 1 ? "it" : "them"}.
							</p>
						</Show>

						<div class="hidden items-center justify-between gap-3 lg:flex">
							<p class="text-sm text-petal-900/70">
								<PrintSummary
									sides={sides()}
									cards={selected().length}
									sheets={sheetCount()}
								/>
							</p>
							<button
								type="button"
								class={adminButton.primary}
								disabled={!canPrint() || busy()}
								onClick={() => void print()}
							>
								<PrinterIcon />
								{busy() ? "Getting the latest…" : "Print"}
							</button>
						</div>
					</div>

					<div
						ref={previewBox}
						class={cn(
							"grid gap-4 lg:max-h-[calc(100vh-22rem)] lg:overflow-y-auto lg:rounded-2xl lg:bg-petal-50/60 lg:p-4",
							"print:block print:max-h-none print:overflow-visible print:bg-transparent print:p-0",
							twoUp() ? "grid-cols-2" : "grid-cols-1",
						)}
						style={{ "--s": String(scale()) }}
					>
						<Show
							when={pages().length}
							fallback={
								<p class="col-span-full rounded-2xl border border-dashed border-petal-200 px-4 py-12 text-center text-sm text-petal-900/60 print:hidden">
									Tick some cards to see the sheets here.
								</p>
							}
						>
							<For each={pages()}>
								{(page) => (
									<figure class="card-page m-0 flex flex-col items-center gap-1.5 print:block">
										<figcaption class="self-start text-xs font-medium text-petal-900/60 print:hidden">
											Sheet {page.sheet + 1}
											{sides() === "back" ? "" : ` of ${sheets().length}`} ·{" "}
											{folded()
												? page.side === "front"
													? `Inside${insideUpsideDown() ? " (upside down on purpose)" : ""}`
													: "Outside"
												: page.side === "front"
													? "Messages"
													: "Back"}
										</figcaption>
										<div
											style={{
												width: `calc(${paper().width}mm * var(--s))`,
												height: `calc(${paper().height}mm * var(--s))`,
											}}
											class="overflow-hidden rounded-sm shadow-[0_1px_8px_rgb(92_31_49/0.14)] print:h-auto print:w-auto print:overflow-visible print:rounded-none print:shadow-none"
										>
											<div class="origin-top-left [transform:scale(var(--s))] print:[transform:none]">
												<Show
													when={!folded()}
													fallback={
														<Show
															when={page.side === "front"}
															fallback={
																<FoldedOutsideSheet guides={guides()} />
															}
														>
															<FoldedSheet
																guides={guides()}
																upsideDown={insideUpsideDown()}
															>
																<For
																	each={Array.from({ length: CARDS_PER_SHEET })}
																>
																	{(_, spot) => (
																		<Show
																			when={page.cards[spot()]}
																			fallback={<EmptyFolded />}
																		>
																			{(card) => (
																				<FoldedInside
																					fitKey={card().key}
																					to={card().to}
																					message={card().message}
																					reference={reference(card())}
																				/>
																			)}
																		</Show>
																	)}
																</For>
															</FoldedSheet>
														</Show>
													}
												>
													<Show
														when={page.side === "front"}
														fallback={<BackSheet />}
													>
														<Sheet guides={guides()}>
															<For
																each={Array.from({ length: CARDS_PER_SHEET })}
															>
																{(_, spot) => (
																	<Show
																		when={page.cards[spot()]}
																		fallback={<EmptyFront />}
																	>
																		{(card) => (
																			<CardFront
																				fitKey={card().key}
																				to={card().to}
																				message={card().message}
																				reference={reference(card())}
																			/>
																		)}
																	</Show>
																)}
															</For>
														</Sheet>
													</Show>
												</Show>
											</div>
										</div>
									</figure>
								)}
							</For>
						</Show>
					</div>
				</section>
			</div>

			{/* On phones and tablets the print button stays in reach. */}
			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden print:hidden">
				<div class="mx-auto flex max-w-3xl items-center justify-between gap-3">
					<p class="min-w-0 text-sm text-petal-900/70">
						<PrintSummary
							sides={sides()}
							cards={selected().length}
							sheets={sheetCount()}
						/>
					</p>
					<button
						type="button"
						class={adminButton.primary}
						disabled={!canPrint() || busy()}
						onClick={() => void print()}
					>
						<PrinterIcon />
						{busy() ? "Getting the latest…" : "Print"}
					</button>
				</div>
			</div>
		</div>
	);
}

function PrintSummary(props: { sides: Sides; cards: number; sheets: number }) {
	return (
		<Show
			when={props.sides !== "back"}
			fallback={
				<>
					<strong class="font-semibold text-petal-900 tabular-nums">
						{plural(props.sheets, "sheet")}
					</strong>{" "}
					of backs
				</>
			}
		>
			<strong class="font-semibold text-petal-900 tabular-nums">
				{plural(props.cards, "card")}
			</strong>{" "}
			on {plural(props.sheets, "sheet")}
			<Show when={props.sides === "both" && props.sheets}>
				{" "}
				· {plural(props.sheets * 2, "page")}
			</Show>
		</Show>
	);
}

function FilterRow(props: { label: string; children: JSX.Element }) {
	return (
		<fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
			<legend class="mb-2 p-0 text-sm font-medium">{props.label}</legend>
			<div class="flex flex-wrap gap-2">{props.children}</div>
		</fieldset>
	);
}

function Check(props: {
	checked: boolean;
	onChange: (on: boolean) => void;
	children: JSX.Element;
}) {
	return (
		<label class="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
			<input
				type="checkbox"
				checked={props.checked}
				onChange={(e) => props.onChange(e.currentTarget.checked)}
				class="size-5 accent-petal-700"
			/>
			{props.children}
		</label>
	);
}

const STATUS_BADGE: Record<CardPrintStatus, { label: string; class: string }> =
	{
		new: { label: "Not printed", class: "bg-petal-100 text-petal-700" },
		changed: {
			label: "Edited since printed",
			class: "bg-warning text-warning-foreground",
		},
		printed: { label: "Printed", class: "bg-success text-success-foreground" },
	};

/** One card in the list: who it's for, its words, and how it'll print. */
function CardRow(props: {
	card: PrintCard;
	checked: boolean;
	onToggle: (on: boolean) => void;
	fit?: CardFit;
	onUnmark: () => void;
}) {
	const id = () => `card-${props.card.key.replace(/[^\w-]/g, "-")}`;
	return (
		<li class={cn("flex gap-3 px-4 py-3", !props.checked && "bg-petal-50/40")}>
			<input
				id={id()}
				type="checkbox"
				checked={props.checked}
				onChange={(e) => props.onToggle(e.currentTarget.checked)}
				class="mt-0.5 size-5 shrink-0 accent-petal-700"
			/>
			<div class={cn("min-w-0 flex-1", !props.checked && "opacity-55")}>
				<label for={id()} class="block cursor-pointer">
					<span class="flex flex-wrap items-baseline justify-between gap-x-2">
						<span class="font-medium">
							{props.card.to ? `To ${props.card.to}` : "No name on card"}
						</span>
						<span class="text-xs tabular-nums text-petal-900/55">
							#{props.card.number}
							{props.card.company ? ` · ${props.card.company}` : ""}
						</span>
					</span>
					<span class="mt-0.5 block text-xs text-petal-900/60">
						{props.card.buyer}
						{props.card.label ? ` · ${props.card.label}` : ""}
					</span>
					<span class="mt-1.5 line-clamp-3 whitespace-pre-line font-display text-sm italic text-petal-900/85">
						“{props.card.message}”
					</span>
				</label>

				<Show when={props.card.status === "changed" && props.card.printed}>
					{(printed) => (
						<details class="mt-1.5 text-xs">
							<summary class="cursor-pointer text-warning-foreground hover:underline">
								What was printed {printedOn(printed().at)}
							</summary>
							<p class="mt-1 whitespace-pre-line rounded-lg bg-warning/60 px-2.5 py-1.5 text-petal-900/70 line-through decoration-warning-foreground/40">
								{printed().to ? `To ${printed().to}: ` : ""}“{printed().message}
								”
							</p>
						</details>
					)}
				</Show>

				<div class="mt-2 flex flex-wrap items-center gap-1.5">
					<span
						class={cn(
							"rounded-full px-2 py-0.5 text-xs font-medium",
							STATUS_BADGE[props.card.status].class,
						)}
						title={
							props.card.printed
								? `Printed ${printedOn(props.card.printed.at)} by ${props.card.printed.by}`
								: undefined
						}
					>
						{STATUS_BADGE[props.card.status].label}
						<Show when={props.card.status === "printed" && props.card.printed}>
							{(printed) => ` ${printedOn(printed().at)}`}
						</Show>
					</span>
					<Show when={props.checked && props.fit}>
						{(fit) => (
							<Show
								when={fit().overflow || fit().spread || fit().pt < SMALL_PT}
							>
								<span
									class={cn(
										"rounded-full px-2 py-0.5 text-xs font-medium",
										fit().overflow
											? "bg-error text-error-foreground"
											: "bg-petal-50 text-petal-900/70",
									)}
								>
									{fit().overflow
										? "Too long to fit"
										: `Long · ${fit().spread ? "fills both inside pages at " : "prints at "}${fit().pt.toFixed(1).replace(/\.0$/, "")}pt`}
								</span>
							</Show>
						)}
					</Show>
					<span class="ms-auto flex items-center gap-0.5">
						<Show when={props.card.status === "printed"}>
							<button
								type="button"
								class={cn(adminButton.ghost, "text-xs")}
								onClick={props.onUnmark}
								title="Put it back on the list to print, e.g. after a misprint"
							>
								Not printed
							</button>
						</Show>
						<Link
							to="/admin/orders/$orderId/edit"
							params={{ orderId: props.card.orderId }}
							target="_blank"
							class={cn(adminButton.ghost, "text-xs")}
							title="Edit the card's words in a new tab; they show up here when you come back"
						>
							Edit
						</Link>
					</span>
				</div>
			</div>
		</li>
	);
}

/** A little drawing of each card style. */
function StyleIcon(props: { style: CardStyle }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linejoin="round"
			class="size-8 shrink-0 text-petal-700"
		>
			<Show
				when={props.style === "folded"}
				fallback={<rect x="9" y="4" width="14" height="24" rx="1" />}
			>
				<path d="M8 6 16 3v26l-8 3Z" fill="currentColor" fill-opacity="0.12" />
				<path d="M16 3h9v26h-9" />
			</Show>
		</svg>
	);
}

function SearchIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4.5 text-petal-900/45"
		>
			<circle cx="11" cy="11" r="6.5" />
			<path d="m20 20-4.2-4.2" />
		</svg>
	);
}

function PrinterIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-4"
		>
			<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
			<path d="M7 14h10v7H7z" />
		</svg>
	);
}

function RefreshIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-4"
		>
			<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
		</svg>
	);
}
