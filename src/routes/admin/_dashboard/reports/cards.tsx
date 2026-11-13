import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";

import { FilterTabs, useReport } from "~/components/admin/reports";
import { adminButton, adminCard, adminInput } from "~/components/admin/ui";
import { CLASS_OPTIONS, COMPANIES } from "~/lib/cadets";
import { formatDeliveryDate, formatSerialNumber } from "~/lib/checkout";
import { shortDeliveryDate, upcomingDeliveryDates } from "~/lib/delivery-dates";
import { photoSrc } from "~/lib/photos";
import { type CardPrintStatus, pickKey } from "~/lib/print-cards";
import { printFileName, usePrintTitle } from "~/lib/print-title";
import { cn } from "~/lib/utils";
import type {
	ReportCard,
	ReportLine,
	ReportOrder,
} from "~/server/admin/reports";

export const Route = createFileRoute("/admin/_dashboard/reports/cards")({
	validateSearch: (search: Record<string, unknown>): { day?: string } => ({
		day:
			typeof search.day === "string" &&
			(search.day === "none" ||
				search.day === "all" ||
				/^\d{4}-\d{2}-\d{2}$/.test(search.day))
				? search.day
				: undefined,
	}),
	component: Cards,
});

/** Stands in for orders with no delivery day, no class or no company. */
const NONE = "none";
const ALL = "all";

const classRank = (name: string) => {
	const index = (CLASS_OPTIONS as readonly string[]).indexOf(name);
	return index === -1 ? CLASS_OPTIONS.length : index;
};
const companyRank = (name: string) => {
	const index = COMPANIES.findIndex((company) => company.name === name);
	return index === -1 ? COMPANIES.length : index;
};

/** Which orders' cards are listed: to deliver (not cancelled), cancelled, or all. */
type Status = "deliver" | "cancelled" | typeof ALL;
type Printed = CardPrintStatus | typeof ALL;

const PRINT_LABELS: Record<CardPrintStatus, string> = {
	printed: "Printed",
	changed: "Changed since printed",
	new: "Not printed yet",
};

type SortKey = "order" | "bouquet" | "class" | "name" | "to";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
	{ key: "order", label: "Order no." },
	{ key: "bouquet", label: "Bouquet" },
	{ key: "class", label: "Class" },
	{ key: "name", label: "Name" },
	{ key: "to", label: "Card to" },
];

/**
 * One dedication card. An order with several gets a row for each, the customer
 * repeated, with `part` of `parts` tying them together.
 */
interface Row {
	order: ReportOrder;
	card: ReportCard;
	/** The bouquet it goes with; unset for an order-wide card. */
	line?: ReportLine;
	/** "(2 of 3)" when the line has several bouquets. */
	unitLabel: string;
	part: number;
	parts: number;
}

/**
 * Every dedication card, with the same filters as Deliveries: a list to tick
 * off against the printed stack at the event. Each card says whether it was
 * printed with the words it has now, and the tally squares with Admin → Cards.
 */
function Cards() {
	const report = useReport();
	const isCancelled = (order: ReportOrder) => order.status === "cancelled";

	const allRows = createMemo(() =>
		report().orders.flatMap((order) =>
			order.cards.map((card, i): Row => {
				const line =
					card.lineIndex === undefined
						? undefined
						: order.lines[card.lineIndex];
				return {
					order,
					card,
					line,
					unitLabel:
						line && line.quantity > 1
							? `(${(card.unit ?? 0) + 1} of ${line.quantity})`
							: "",
					part: i + 1,
					parts: order.cards.length,
				};
			}),
		),
	);

	const [status, setStatus] = createSignal<Status>("deliver");
	const inStatus = (s: Status, row: Row) =>
		s === ALL || (s === "cancelled") === isCancelled(row.order);
	const [printed, setPrinted] = createSignal<Printed>(ALL);
	const inPrinted = (p: Printed, row: Row) =>
		p === ALL || row.card.printStatus === p;
	const active = createMemo(() =>
		allRows().filter(
			(row) => inStatus(status(), row) && inPrinted(printed(), row),
		),
	);

	/** Squares with Admin → Cards (cards on orders not cancelled), split up. */
	const tally = createMemo(() => {
		const toDeliver = allRows().filter((row) => !isCancelled(row.order));
		const count = (s: CardPrintStatus) =>
			toDeliver.filter((row) => row.card.printStatus === s).length;
		const bouquets = report()
			.orders.filter((order) => !isCancelled(order))
			.reduce(
				(sum, order) =>
					sum + order.lines.reduce((n, line) => n + line.quantity, 0),
				0,
			);
		// An order-wide card covers all its bouquets; otherwise each has its own.
		const open = report().orders.filter((order) => !isCancelled(order));
		const isOrderWide = (order: ReportOrder) =>
			order.cards.some((card) => card.lineIndex === undefined);
		const orderWide = open.filter(isOrderWide);
		const withoutCard = open
			.filter((order) => !isOrderWide(order))
			.reduce(
				(sum, order) =>
					sum +
					order.lines.reduce((n, line) => n + line.quantity, 0) -
					order.cards.length,
				0,
			);
		return {
			cards: toDeliver.length,
			printed: count("printed"),
			changed: count("changed"),
			new: count("new"),
			cancelled: allRows().length - toDeliver.length,
			bouquets,
			orderWide: orderWide.length,
			withoutCard,
		};
	});

	const dateOf = (order: ReportOrder) => order.deliveryDate || NONE;
	const onDay = (date: string, row: Row) =>
		date === ALL || dateOf(row.order) === date;
	/** Dates in order, "no date yet" last. */
	const dateRank = (a: string, b: string) =>
		a === b ? 0 : a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b);
	const days = createMemo(() => {
		const dates = new Set(report().deliveryDates);
		for (const row of active())
			if (row.order.deliveryDate) dates.add(row.order.deliveryDate);
		const list: string[] = [...dates].sort();
		if (active().some((row) => !row.order.deliveryDate)) list.push(NONE);
		return list.length > 1 ? [ALL, ...list] : list;
	});
	const firstDay = () =>
		upcomingDeliveryDates(report().deliveryDates)[0] ?? days()[0] ?? NONE;
	const [day, setDay] = createSignal<string | undefined>(
		Route.useSearch()().day,
	);
	const shownDay = () => day() ?? firstDay();
	const [klass, setKlass] = createSignal<string>(ALL);
	const [company, setCompany] = createSignal<string>(ALL);
	const [pagePerCompany, setPagePerCompany] = createSignal(false);
	const [sortBy, setSortBy] = createSignal<SortKey[]>(["order", "bouquet"]);
	const toggleSort = (key: SortKey) =>
		setSortBy((keys) =>
			keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
		);

	const ofDay = createMemo(() =>
		active().filter((row) => onDay(shownDay(), row)),
	);
	const classOf = (row: Row) => row.order.className || NONE;
	const companyOf = (row: Row) => row.order.company || NONE;
	const classes = createMemo(() =>
		[...new Set(ofDay().map(classOf))].sort(
			(a, b) => classRank(a) - classRank(b) || a.localeCompare(b),
		),
	);
	const companies = createMemo(() =>
		[...new Set(ofDay().map(companyOf))].sort(
			(a, b) => companyRank(a) - companyRank(b) || a.localeCompare(b),
		),
	);

	// Florists are given bouquets: a card goes with its bouquet's florist, and
	// an order-wide card with every florist on the order. "" is not assigned.
	const [florist, setFlorist] = createSignal<string>(ALL);
	const floristsOf = (row: Row) =>
		row.line
			? [row.line.florists[row.card.unit ?? 0] ?? ""]
			: row.order.lines.flatMap((line) => line.florists);
	const hasFlorist = (key: string, row: Row) =>
		key === ALL || floristsOf(row).includes(key);
	const ofClassAndCompany = createMemo(() =>
		ofDay().filter(
			(row) =>
				(klass() === ALL || classOf(row) === klass()) &&
				(company() === ALL || companyOf(row) === company()),
		),
	);
	const ofFlorist = createMemo(() =>
		ofClassAndCompany().filter((row) => hasFlorist(florist(), row)),
	);

	// Search: order number, bouquet, receiver or words on the card. Commas
	// separate alternatives ("95, 102" finds both orders); within one, every
	// word must be found. A number is an order number, matched exactly.
	const [query, setQuery] = createSignal("");
	const fold = (value: string) =>
		value
			.normalize("NFD")
			.replace(/\p{Diacritic}/gu, "")
			.toLowerCase();
	const rowMatches = (row: Row, alternatives: string[][]) => {
		const text = fold(
			[
				row.card.message,
				row.card.to,
				row.order.name,
				...(row.line
					? [row.line.title, row.line.colorName]
					: row.order.lines.map((line) => line.title)),
			].join("\n"),
		);
		return alternatives.some((words) =>
			words.every((word) => {
				const digits = word.replace(/^(#|no\.?)/, "");
				return /^\d+$/.test(digits)
					? row.order.number === digits
					: text.includes(word);
			}),
		);
	};
	const shown = createMemo(() => {
		const alternatives = query()
			.split(",")
			.map((part) => fold(part).split(/\s+/).filter(Boolean))
			.filter((words) => words.length);
		return alternatives.length
			? ofFlorist().filter((row) => rowMatches(row, alternatives))
			: ofFlorist();
	});

	// Cards picked to print; Admin → Cards opens with just these ticked.
	// Cancelled orders' cards aren't printed, so they can't be picked.
	const keyOf = (row: Row) => pickKey(row.order.number, row.card.slot);
	const [picked, setPicked] = createSignal<ReadonlySet<string>>(new Set());
	const canPick = (row: Row) => !isCancelled(row.order);
	const isPicked = (row: Row) => picked().has(keyOf(row));
	const pick = (rows: Row[], on: boolean) =>
		setPicked((prev) => {
			const next = new Set(prev);
			for (const row of rows.filter(canPick))
				on ? next.add(keyOf(row)) : next.delete(keyOf(row));
			return next;
		});
	const allPicked = (rows: Row[]) => {
		const pickable = rows.filter(canPick);
		return pickable.length > 0 && pickable.every(isPicked);
	};
	const floristTabs = createMemo(() => {
		const known = report().florists;
		const keys = [
			...known
				.filter((f) => f.active || ofDay().some((r) => hasFlorist(f.id, r)))
				.map((f) => f.id),
			...(ofDay().some((r) => hasFlorist("", r)) ? [""] : []),
		];
		return keys.map((key) => ({
			key,
			label: key
				? (known.find((f) => f.id === key)?.name ?? key)
				: "Not assigned",
		}));
	});
	const floristLabel = (key: string) =>
		floristTabs().find((tab) => tab.key === key)?.label ?? "";

	const bouquetName = (row: Row) =>
		row.line ? `${row.line.title}\u0000${row.line.colorName}` : "￿";
	const compare: Record<SortKey, (a: Row, b: Row) => number> = {
		order: (a, b) =>
			a.order.number.localeCompare(b.order.number, undefined, {
				numeric: true,
			}),
		bouquet: (a, b) => bouquetName(a).localeCompare(bouquetName(b)),
		class: (a, b) =>
			classRank(a.order.className) - classRank(b.order.className),
		name: (a, b) => a.order.name.localeCompare(b.order.name),
		to: (a, b) => a.card.to.localeCompare(b.card.to),
	};

	/** By delivery day (earliest first, no date last), then company. */
	const groups = createMemo(() => {
		const keys = [...sortBy(), "order", "bouquet"] as SortKey[];
		const rows = [...shown()].sort((a, b) => {
			for (const key of keys) {
				const diff = compare[key](a, b);
				if (diff) return diff;
			}
			return a.part - b.part;
		});
		const byGroup = new Map<
			string,
			{ company: string; date: string; rows: Row[] }
		>();
		for (const row of rows) {
			const company = companyOf(row);
			const date = shownDay() === ALL ? dateOf(row.order) : shownDay();
			const key = `${company}\u0000${date}`;
			const group = byGroup.get(key) ?? { company, date, rows: [] };
			group.rows.push(row);
			byGroup.set(key, group);
		}
		return [...byGroup.values()].sort(
			(a, b) =>
				dateRank(a.date, b.date) ||
				companyRank(a.company) - companyRank(b.company) ||
				a.company.localeCompare(b.company),
		);
	});

	/** Where each group starts in one running count across every group shown. */
	const groupStarts = createMemo(() => {
		let n = 0;
		return groups().map((group) => {
			const start = n;
			n += group.rows.length;
			return start;
		});
	});
	const orderCount = (rows: Row[]) =>
		new Set(rows.map((row) => row.order.id)).size;
	const dayLabel = (date: string) =>
		date === ALL
			? "All dates"
			: date === NONE
				? "No date yet"
				: shortDeliveryDate(date);
	const classLabel = (name: string) => (name === NONE ? "No class" : name);
	const companyLabel = (name: string) => (name === NONE ? "No company" : name);
	const printedOn = (at: string) =>
		new Date(at).toLocaleString("en-PH", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});

	usePrintTitle(() =>
		printFileName([
			"Cards",
			dayLabel(shownDay()),
			status() === "cancelled" && "Cancelled",
			status() === ALL && "Incl. cancelled",
			printed() !== ALL && PRINT_LABELS[printed() as CardPrintStatus],
			klass() !== ALL && classLabel(klass()),
			company() !== ALL && companyLabel(company()),
			florist() !== ALL && floristLabel(florist()),
		]),
	);

	const resetNarrowing = () => {
		if (!days().includes(shownDay())) setDay(days()[0]);
		setKlass(ALL);
		setCompany(ALL);
	};
	const pickStatus = (next: Status) => {
		setStatus(next);
		resetNarrowing();
	};
	const pickPrinted = (next: Printed) => {
		setPrinted(next);
		resetNarrowing();
	};
	const pickDay = (date: string) => {
		setDay(date);
		setKlass(ALL);
		setCompany(ALL);
	};

	const filterRow = (label: string, tabs: JSX.Element) => (
		<div class="mb-3 flex flex-wrap items-center gap-x-2">
			<span class="mr-1 text-sm font-medium">{label}</span>
			{tabs}
		</div>
	);

	return (
		<section class={cn(adminCard, "p-5 print:border-0 print:p-0")}>
			<style>{"@page { size: A4 portrait; margin: 10mm; }"}</style>
			<div class="print:hidden">
				<h2 class="mb-1 font-semibold">Cards</h2>
				<p class="mb-4 text-sm text-petal-900/60">
					Every dedication card, to check off against the printed stack: who
					it’s from, which bouquet it goes with, who it’s to and what it says.
					Each card has its own row, so an order with two cards is listed twice
					under the same order number. “Changed since printed” means the words
					were edited after printing, so that card needs printing again from{" "}
					<Link
						to="/admin/cards"
						class="font-medium text-petal-700 underline-offset-2 hover:underline"
					>
						Cards
					</Link>
					.
				</p>
				{/* Squares with Admin → Cards, which lists cards on orders not cancelled. */}
				<div class="mb-4 rounded-xl border border-petal-100 bg-petal-50/60 px-3.5 py-2.5 text-sm text-petal-900/75">
					<p>
						<strong class="font-semibold tabular-nums text-petal-900">
							{tally().cards} cards
						</strong>{" "}
						on orders to deliver, the same as{" "}
						<Link
							to="/admin/cards"
							class="font-medium text-petal-700 underline-offset-2 hover:underline"
						>
							Cards
						</Link>
						:
					</p>
					<p class="tabular-nums">
						{tally().printed} printed + {tally().changed} changed since printed
						+ {tally().new} not printed yet
					</p>
					<p class="tabular-nums">
						{tally().bouquets} bouquets to deliver: {tally().withoutCard} with
						no card
						<Show when={tally().orderWide}>
							{" "}
							· {tally().orderWide}{" "}
							{tally().orderWide === 1 ? "order has" : "orders have"} one card
							for the whole order
						</Show>
						<Show when={tally().cancelled}>
							{" "}
							· {tally().cancelled} more{" "}
							{tally().cancelled === 1 ? "card" : "cards"} on cancelled orders
						</Show>
					</p>
				</div>
				{filterRow(
					"Status",
					<FilterTabs
						label="Status"
						tabs={(
							[
								["deliver", "To deliver"],
								["cancelled", "Cancelled"],
								[ALL, "All"],
							] as const
						).map(([key, label]) => ({
							key: key as Status,
							label,
							count: () =>
								allRows().filter(
									(row) => inStatus(key, row) && inPrinted(printed(), row),
								).length,
						}))}
						value={status()}
						onChange={pickStatus}
						class="mb-0"
					/>,
				)}
				{filterRow(
					"Printed",
					<FilterTabs
						label="Printed"
						tabs={(
							[
								[ALL, "All"],
								["printed", PRINT_LABELS.printed],
								["changed", PRINT_LABELS.changed],
								["new", PRINT_LABELS.new],
							] as const
						).map(([key, label]) => ({
							key: key as Printed,
							label,
							count: () =>
								allRows().filter(
									(row) => inStatus(status(), row) && inPrinted(key, row),
								).length,
						}))}
						value={printed()}
						onChange={pickPrinted}
						class="mb-0"
					/>,
				)}
				<FilterTabs
					label="Delivery day"
					tabs={days().map((date) => ({
						key: date,
						label: dayLabel(date),
						count: () => active().filter((row) => onDay(date, row)).length,
					}))}
					value={shownDay()}
					onChange={pickDay}
					class="mb-3"
				/>
				<Show when={ofDay().length}>
					{filterRow(
						"Class",
						<FilterTabs
							label="Class"
							tabs={[ALL, ...classes()].map((key) => ({
								key,
								label: key === ALL ? "All" : classLabel(key),
								count: () =>
									ofDay().filter((row) => key === ALL || classOf(row) === key)
										.length,
							}))}
							value={klass()}
							onChange={setKlass}
							class="mb-0"
						/>,
					)}
					{filterRow(
						"Company",
						<FilterTabs
							label="Company"
							tabs={[ALL, ...companies()].map((key) => ({
								key,
								label: key === ALL ? "All" : companyLabel(key),
								count: () =>
									ofDay().filter(
										(row) =>
											(key === ALL || companyOf(row) === key) &&
											(klass() === ALL || classOf(row) === klass()),
									).length,
							}))}
							value={company()}
							onChange={setCompany}
							class="mb-0"
						/>,
					)}
					<Show when={floristTabs().length}>
						{filterRow(
							"Florist",
							<FilterTabs
								label="Florist"
								tabs={[{ key: ALL, label: "Everyone" }, ...floristTabs()].map(
									(tab) => ({
										...tab,
										count: () =>
											ofClassAndCompany().filter((row) =>
												hasFlorist(tab.key, row),
											).length,
									}),
								)}
								value={florist()}
								onChange={setFlorist}
								class="mb-0"
							/>,
						)}
					</Show>
					<label class="mb-4 flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={pagePerCompany()}
							onChange={(e) => setPagePerCompany(e.currentTarget.checked)}
							class="size-5 accent-petal-700"
						/>
						Print each company on its own page
					</label>
					<div class="mb-4 flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">Sort by</span>
						<For each={SORT_OPTIONS}>
							{(option) => {
								const rank = () => sortBy().indexOf(option.key) + 1;
								return (
									<button
										type="button"
										aria-pressed={rank() > 0}
										onClick={() => toggleSort(option.key)}
										class={cn(
											"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
											rank()
												? "border-petal-700 bg-petal-700 font-medium text-white"
												: "border-petal-200 bg-white hover:bg-petal-50",
										)}
									>
										<Show when={rank() && sortBy().length > 1}>
											<span class="flex size-5 items-center justify-center rounded-full bg-white text-xs font-semibold tabular-nums text-petal-700">
												{rank()}
											</span>
										</Show>
										{option.label}
									</button>
								);
							}}
						</For>
						<span class="text-xs text-petal-900/55">
							Pick one or more; the first one picked sorts first.
						</span>
					</div>
				</Show>
			</div>

			<div class="mb-5 print:hidden">
				<label for="card-report-search" class="sr-only">
					Search cards
				</label>
				<input
					id="card-report-search"
					type="search"
					autocomplete="off"
					class={adminInput}
					placeholder="Order #, bouquet, receiver or words on the card…"
					value={query()}
					onInput={(e) => setQuery(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setQuery("");
					}}
				/>
				<p class="mt-1.5 text-xs text-petal-900/55">
					<Show
						when={query().trim()}
						fallback={
							<>
								Separate orders with commas:{" "}
								<span class="font-medium text-petal-900/75">95, 102, 213</span>
							</>
						}
					>
						{shown().length}{" "}
						{shown().length === 1 ? "card matches" : "cards match"} of{" "}
						{ofFlorist().length} with these filters
					</Show>
				</p>
			</div>

			<Show
				when={shown().length}
				fallback={
					<p class="text-sm text-petal-900/60">
						{ofDay().length
							? "No cards match these filters."
							: "No cards for this day."}
					</p>
				}
			>
				<For each={groups()}>
					{(group, index) => (
						<div
							class={cn(
								"mb-6 print:mb-4",
								pagePerCompany() &&
									index() < groups().length - 1 &&
									"print:break-after-page",
							)}
						>
							<header class="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b-2 border-petal-900 pb-1.5 print:border-black">
								<div>
									<p class="text-xs uppercase tracking-widest text-petal-900/60 print:text-[8pt] print:text-black/70">
										Cards ·{" "}
										{group.date === NONE
											? "No date yet"
											: formatDeliveryDate(group.date)}
										<Show when={klass() !== ALL}> · {classLabel(klass())}</Show>
										<Show when={florist() !== ALL}>
											{" · Florist: "}
											{floristLabel(florist())}
										</Show>
										<Show when={status() !== "deliver"}>
											{status() === "cancelled"
												? " · Cancelled only"
												: " · Incl. cancelled"}
										</Show>
									</p>
									<h3 class="font-display text-xl font-semibold leading-tight print:text-[16pt]">
										{companyLabel(group.company)}
										<Show when={shownDay() === ALL}>
											<span class="font-normal text-petal-900/60 print:text-black/60">
												{" · "}
												{dayLabel(group.date)}
											</span>
										</Show>
									</h3>
								</div>
								<p class="text-sm tabular-nums text-petal-900/70 print:text-[9pt] print:text-black">
									{group.rows.length}{" "}
									{group.rows.length === 1 ? "card" : "cards"} ·{" "}
									{orderCount(group.rows)}{" "}
									{orderCount(group.rows) === 1 ? "order" : "orders"}
								</p>
							</header>
							<div class="overflow-x-auto print:overflow-visible">
								<table class="w-full min-w-[860px] text-left text-sm print:min-w-0 print:text-[9pt]">
									<thead class="text-xs uppercase tracking-wide text-petal-900/55 print:text-[7.5pt] print:text-black/70">
										<tr>
											<th class="w-8 pb-1.5 pr-2 font-medium">
												<input
													type="checkbox"
													aria-label="Pick every card in this group to print"
													checked={allPicked(group.rows)}
													disabled={!group.rows.some(canPick)}
													onChange={(e) =>
														pick(group.rows, e.currentTarget.checked)
													}
													class="size-4 accent-petal-700 print:hidden"
												/>
												<span class="hidden print:inline">✓</span>
											</th>
											<th class="pb-1.5 pr-3 text-right font-medium">
												<span class="sr-only">Count</span>#
											</th>
											<th class="pb-1.5 pr-3 font-medium">Order</th>
											<th class="pb-1.5 pr-3 font-medium">Delivery</th>
											<th class="pb-1.5 pr-3 font-medium">From</th>
											<th class="pb-1.5 pr-3 font-medium">Class</th>
											<th class="pb-1.5 pr-3 font-medium">Bouquet</th>
											<th class="pb-1.5 pr-3 font-medium">To</th>
											<th class="w-[30%] pb-1.5 pr-3 font-medium">Message</th>
											<th class="pb-1.5 font-medium">Printed</th>
										</tr>
									</thead>
									<tbody>
										<For each={group.rows}>
											{(row, i) => (
												<tr
													class={cn(
														"border-t border-petal-100 align-top print:break-inside-avoid print:border-black/25",
														row.parts > 1 &&
															"bg-petal-50/60 print:bg-transparent",
														isCancelled(row.order) && "text-petal-900/50",
													)}
												>
													<td class="py-2 pr-2 print:py-1">
														<input
															type="checkbox"
															aria-label={`Pick the card for #${row.order.number} to print`}
															checked={isPicked(row)}
															disabled={!canPick(row)}
															onChange={(e) =>
																pick([row], e.currentTarget.checked)
															}
															class="size-4 accent-petal-700 print:hidden"
														/>
														{/* An empty box to tick on paper. */}
														<span class="hidden size-4 rounded-sm border-2 border-black print:inline-block" />
													</td>
													<td class="py-2 pr-3 text-right text-xs tabular-nums text-petal-900/55 print:py-1 print:text-[8pt] print:text-black/70">
														{groupStarts()[index()] + i() + 1}
													</td>
													<td class="py-2 pr-3 font-semibold tabular-nums print:py-1">
														<Link
															to="/admin/orders/$orderId"
															params={{ orderId: row.order.id }}
															class="underline-offset-2 hover:underline print:no-underline"
														>
															#{row.order.number}
														</Link>
														<Show when={row.parts > 1}>
															<span class="block whitespace-nowrap text-xs font-normal text-petal-900/60 print:text-[7.5pt] print:text-black/70">
																card {row.part} of {row.parts}
															</span>
														</Show>
														<Show when={isCancelled(row.order)}>
															<span class="mt-1 inline-block whitespace-nowrap rounded-full bg-petal-100 px-2 py-0.5 text-xs font-medium text-petal-900/70 print:border print:border-black print:bg-transparent print:text-[8pt] print:text-black">
																Cancelled
															</span>
														</Show>
													</td>
													<td class="whitespace-nowrap py-2 pr-3 print:py-1">
														{dayLabel(dateOf(row.order))}
													</td>
													<td class="py-2 pr-3 print:py-1">
														<span class="font-medium">{row.order.name}</span>
														<Show when={row.order.serialNumber}>
															<span class="block whitespace-nowrap text-xs tabular-nums text-petal-900/60 print:text-[7.5pt] print:text-black/70">
																{formatSerialNumber(row.order.serialNumber)}
															</span>
														</Show>
													</td>
													<td class="py-2 pr-3 print:py-1">
														{row.order.className || "—"}
													</td>
													<td class="py-2 pr-3 print:py-1">
														<Show
															when={row.line}
															keyed
															fallback={
																<span class="text-petal-900/70">
																	Whole order:{" "}
																	{row.order.lines
																		.map(
																			(line) =>
																				`${line.quantity > 1 ? `${line.quantity} × ` : ""}${line.title}`,
																		)
																		.join(", ")}
																</span>
															}
														>
															{(line) => (
																<span class="flex items-center gap-2 leading-snug">
																	<span class="flex size-12 shrink-0 items-center justify-center print:size-[12mm]">
																		<Show when={line.image}>
																			{(src) => (
																				<img
																					src={photoSrc(src(), "thumb")}
																					alt=""
																					class="max-h-full max-w-full rounded object-contain"
																				/>
																			)}
																		</Show>
																	</span>
																	<span>
																		{line.title}
																		<span class="text-petal-900/60 print:text-black/60">
																			{" "}
																			· {line.colorName}
																			<Show when={row.unitLabel}>
																				{" "}
																				{row.unitLabel}
																			</Show>
																		</span>
																	</span>
																</span>
															)}
														</Show>
													</td>
													<td class="py-2 pr-3 font-medium print:py-1">
														{row.card.to || "—"}
													</td>
													<td class="whitespace-pre-line break-words py-2 pr-3 text-[13px] leading-snug print:py-1 print:text-[8pt]">
														{row.card.message}
													</td>
													<td class="py-2 print:py-1">
														<span
															class={cn(
																"whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium print:border print:border-black print:bg-transparent print:text-[8pt] print:text-black",
																row.card.printStatus === "printed" &&
																	"bg-success text-success-foreground",
																row.card.printStatus === "changed" &&
																	"bg-error text-error-foreground",
																row.card.printStatus === "new" &&
																	"bg-petal-100 text-petal-900/75",
															)}
														>
															{PRINT_LABELS[row.card.printStatus]}
														</span>
														<Show when={row.card.printedAt}>
															{(at) => (
																<span class="mt-1 block whitespace-nowrap text-xs text-petal-900/55 print:text-[7.5pt] print:text-black/60">
																	{printedOn(at())}
																	<Show when={row.card.printedBy}>
																		{" "}
																		· {row.card.printedBy}
																	</Show>
																</span>
															)}
														</Show>
													</td>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
						</div>
					)}
				</For>
			</Show>

			<Show when={picked().size}>
				<div class="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-petal-200 bg-white px-4 py-3 shadow-lg print:hidden">
					<p class="text-sm">
						<strong class="font-semibold tabular-nums">{picked().size}</strong>{" "}
						{picked().size === 1 ? "card" : "cards"} picked
						<Show when={shown().some(canPick) && !allPicked(shown())}>
							{" · "}
							<button
								type="button"
								class="font-medium text-petal-700 underline underline-offset-2 hover:text-petal-900"
								onClick={() => pick(shown(), true)}
							>
								Pick all {shown().filter(canPick).length} shown
							</button>
						</Show>
					</p>
					<div class="flex gap-2">
						<button
							type="button"
							class={adminButton.ghost}
							onClick={() => setPicked(new Set<string>())}
						>
							Clear
						</button>
						<Link
							to="/admin/cards"
							search={{ pick: [...picked()].join(",") }}
							class={adminButton.primary}
						>
							Print {picked().size === 1 ? "this card" : "these cards"}
						</Link>
					</div>
				</div>
			</Show>
		</section>
	);
}
