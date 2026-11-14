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
import { CentringSheet } from "~/components/cards/centring-sheet";
import {
	EmptyFolded,
	FOLD_SHEET,
	FoldedInside,
	FoldedOutsideSheet,
	FoldedSheet,
	fitFolded,
} from "~/components/cards/folded-sheets";
import { HelloNoteEditor } from "~/components/cards/hello-note-editor";
import { TestSheet } from "~/components/cards/test-sheets";
import { shortDeliveryDate } from "~/lib/delivery-dates";
import {
	bouquetPath,
	CARDS_PER_SHEET,
	type CardPrintStatus,
	cardMatches,
	compareByNumber,
	mirrorSheet,
	type PrintCard,
	pickKey,
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
	validateSearch: (
		search: Record<string, unknown>,
	): { day?: string; pick?: string } => ({
		day:
			typeof search.day === "string" &&
			(search.day === "none" || /^\d{4}-\d{2}-\d{2}$/.test(search.day))
				? search.day
				: undefined,
		// Cards picked on Reports → Cards: "95/0:0,102/order" (see `pickKey`).
		pick:
			typeof search.pick === "string" && search.pick ? search.pick : undefined,
	}),
	loader: () => listPrintCardsFn(),
	component: CardsPage,
});

const ALL = "all";
const NONE = "none";

type StatusFilter = "todo" | CardPrintStatus | typeof ALL;
/** Folded: opens like a book. Flat: one card, message on one side. */
type CardStyle = "folded" | "flat";
/** Which edge the printer turns the sheet over for two-sided printing. */
type Flip = "short" | "long";
/**
 * How the sheets are printed: messages first and then the ORAIA side on the
 * same sheets, fed back in by hand; both at once on a two-sided printer;
 * ORAIA sides alone, without bouquet codes, to keep in stock; or (folded
 * cards, whose outsides are all alike) messages alone, onto that stock.
 */
type Mode = "manual" | "duplex" | "plain" | "stock";
/** One side of a sheet. */
type Side = "message" | "oraia";

/** Which way round the A4 sheet prints: folded cards across, flat cards upright. */
type Orientation = "landscape" | "portrait";

/** A4, in mm. */
const A4 = { long: 297, short: 210 } as const;

/** This computer's printer. */
interface PrinterSetup {
	/** The ORAIA side comes out upside down unless turned around. */
	turnBacks: boolean;
	/** The stack comes back last sheet first. */
	reverseBacks: boolean;
	/**
	 * How far to move every page, in mm, so it sits dead centre on the paper:
	 * right and down are positive. Cards are cut with a guillotine against the
	 * paper's edges, so a printer that puts the page a little off would cut
	 * fronts and backs that don't match. Read off the centring test.
	 */
	offsets: Record<Orientation, { x: number; y: number }>;
}

/** The furthest a page can be moved, in mm. */
const MAX_SHIFT = 15;

/** What's being printed: real cards, or the numbered test. */
type Batch = { kind: "cards"; cards: PrintCard[] } | { kind: "test" };

/** A page to print: one side of one sheet. */
interface PrintPage {
	side: Side;
	sheet: number;
	sheets: number;
	cards: PrintCard[];
	/** Test pages: each spot's card number. */
	numbers?: (number | undefined)[];
	/** The centring test for the cutter. */
	centring?: boolean;
}

const STYLES: { key: CardStyle; label: string; hint: string }[] = [
	{
		key: "folded",
		label: "Folded card",
		hint: "Folds down the middle into a 74 × 105 mm card: ORAIA on the cover, contact details on the back, the message and its bouquet’s QR code inside. Every outside is the same, so they can be printed ahead.",
	},
	{
		key: "flat",
		label: "Flat card",
		hint: "One 105 × 148 mm card: the message on the front, ORAIA and contact details on the back.",
	},
];

const MODES: {
	key: Mode;
	label: string;
	hint: string;
	/** Only for folded cards, whose outsides are all the same. */
	foldedOnly?: boolean;
}[] = [
	{
		key: "stock",
		label: "Messages only",
		hint: "Print a stack of ORAIA outsides first with Plain backs, then put it back in the tray the way backs go in and print just the messages. Every outside is the same, so any sheet goes with any message.",
		foldedOnly: true,
	},
	{
		key: "manual",
		label: "Fronts, then backs",
		hint: "Print every message first, then put the same sheets back in for the ORAIA side. The cards stay locked in between, so each back lands on its own card.",
	},
	{
		key: "duplex",
		label: "Two-sided printer",
		hint: "The printer prints both sides itself, in one go.",
	},
	{
		key: "plain",
		label: "Plain backs",
		hint: "ORAIA sides without bouquet codes, to keep in stock.",
	},
];

const STYLE_KEY = "oraia:card-style";
const ORDER_KEY = "oraia:card-order";

/**
 * How the card list and sheets are ordered: as they're handed over (day,
 * company, class, buyer), or by order number, where new orders only ever
 * join at the end.
 */
type CardOrder = "handover" | "number";
/** The numbered test: two sheets, cards 1 to 8. */
const TEST_SHEETS = 2;

/** This computer's printer: how it takes back a printed stack. */
const PRINTER_KEY = "oraia:card-printer";

/** Reads a saved setting; storage can be missing or blocked. */
function loadSetting<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
	} catch {
		return fallback;
	}
}
function saveSetting(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {}
}

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

	const search = Route.useSearch()();
	/** Cards picked on Reports → Cards: only these are listed, all ticked. */
	const [picked, setPicked] = createSignal<ReadonlySet<string> | undefined>(
		search.pick ? new Set(search.pick.split(",")) : undefined,
	);
	const pool = createMemo(() => {
		const keys = picked();
		return keys
			? cards().filter((card) => keys.has(pickKey(card.number, card.slot)))
			: cards();
	});
	/** Delivery days picked; none picked means every day. */
	const [dayPicks, setDayPicks] = createSignal<ReadonlySet<string>>(
		new Set(picked() || !search.day ? [] : [search.day]),
	);
	const toggleDay = (d: string) =>
		setDayPicks((prev) => {
			const next = new Set(prev);
			if (next.has(d)) next.delete(d);
			else next.add(d);
			return next;
		});
	/** Companies picked; none picked means every company. */
	const [picks, setPicks] = createSignal<ReadonlySet<string>>(new Set());
	const togglePick = (name: string) =>
		setPicks((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	// Picked cards print whether or not they were printed before.
	const [status, setStatus] = createSignal<StatusFilter>(
		picked() ? ALL : "todo",
	);
	const [query, setQuery] = createSignal("");
	/** Cards unticked by hand; everything else that's shown is printed. */
	const [skipped, setSkipped] = createSignal<ReadonlySet<string>>(new Set());

	const [style, setStyleSignal] = createSignal<CardStyle>("folded");
	const [mode, setMode] = createSignal<Mode>("manual");
	// Remember the card style on this computer.
	onMount(() => {
		try {
			const saved = localStorage.getItem(STYLE_KEY);
			if (saved === "flat" || saved === "folded") setStyleSignal(saved);
		} catch {}
	});
	const setStyle = (next: CardStyle) => {
		setStyleSignal(next);
		if (next === "flat" && mode() === "stock") setMode("manual");
		try {
			localStorage.setItem(STYLE_KEY, next);
		} catch {}
	};
	const folded = () => style() === "folded";
	/** Two-sided printers: which edge they flip on; each card style has a best one. */
	const [flip, setFlip] = createSignal<Flip | undefined>();
	const bestFlip = (): Flip => (folded() ? "short" : "long");
	const shownFlip = () => flip() ?? bestFlip();
	/** Printing by hand: how this printer takes back the printed stack. */
	const [printer, setPrinterSignal] = createSignal<PrinterSetup>({
		turnBacks: false,
		reverseBacks: false,
		offsets: { landscape: { x: 0, y: 0 }, portrait: { x: 0, y: 0 } },
	});
	onMount(() => setPrinterSignal(loadSetting(PRINTER_KEY, printer())));
	const setPrinter = (change: Partial<ReturnType<typeof printer>>) => {
		const next = { ...printer(), ...change };
		setPrinterSignal(next);
		saveSetting(PRINTER_KEY, next);
	};
	/** The ORAIA side is printed turned around, to land the right way up. */
	const turnOraia = () =>
		mode() === "duplex" ? shownFlip() !== bestFlip() : printer().turnBacks;
	const orientation = (): Orientation => (folded() ? "landscape" : "portrait");
	const offset = () => printer().offsets[orientation()];
	const setOffset = (change: Partial<{ x: number; y: number }>) =>
		setPrinter({
			offsets: {
				...printer().offsets,
				[orientation()]: { ...offset(), ...change },
			},
		});
	/** Printing the centring test instead of cards. */
	const [centring, setCentring] = createSignal(false);
	/**
	 * Where a page goes on the paper, in mm. Each sheet is drawn 1 mm short so
	 * it never spills onto a blank page; it's set in by half of that so its
	 * middle is the paper's middle, whichever way round it prints. Then this
	 * printer's correction, except on the centring test that measures it.
	 */
	const placeOf = (page: PrintPage) => {
		const full = folded() ? A4.short : A4.long;
		const inset = (full - paper().height) / 2;
		const shift = page.centring ? { x: 0, y: 0 } : offset();
		return { x: shift.x, y: shift.y + inset };
	};

	const [withReference, setWithReference] = createSignal(true);
	const [guides, setGuides] = createSignal(true);
	const [withBouquetQr, setWithBouquetQr] = createSignal(true);
	/**
	 * Flat cards: each back's bouquet link, swapped left and right to sit
	 * behind its front. Folded cards carry theirs inside, with the message.
	 */
	const backLinks = (cards: PrintCard[]) =>
		withBouquetQr() && !folded() && cards.length
			? mirrorSheet(cards.map((card) => card.link || undefined))
			: undefined;
	const [plainSheets, setPlainSheets] = createSignal<number | undefined>();

	/** Printing by hand: the cards locked in while their two sides print. */
	const [batch, setBatch] = createSignal<Batch>();
	/** Which sides of the batch have gone to the printer. */
	const [done, setDone] = createSignal<Record<Side, boolean>>({
		message: false,
		oraia: false,
	});
	/** While printing, only these pages are on the page. */
	const [printing, setPrinting] = createSignal<Side | "both">();
	const startOver = () => {
		setBatch(undefined);
		setDone({ message: false, oraia: false });
	};

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
		const list = [...new Set(pool().map(dayOf))].sort();
		// "No date" last.
		return [
			...list.filter((d) => d !== NONE),
			...list.filter((d) => d === NONE),
		];
	});
	const ofDay = createMemo(() =>
		pool().filter(
			(card) => dayPicks().size === 0 || dayPicks().has(dayOf(card)),
		),
	);
	const companies = createMemo(() =>
		[...new Set(ofDay().map(companyOf))].sort((a, b) =>
			a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b),
		),
	);
	/** Picked companies that have cards on the chosen days. */
	const companyPicks = createMemo(
		() => new Set(companies().filter((name) => picks().has(name))),
	);
	const ofCompany = createMemo(() =>
		ofDay().filter(
			(card) =>
				companyPicks().size === 0 || companyPicks().has(companyOf(card)),
		),
	);
	// Order number unless this browser last picked handover.
	const [cardOrder, setCardOrderSignal] = createSignal<CardOrder>("number");
	onMount(() => {
		try {
			if (localStorage.getItem(ORDER_KEY) === "handover")
				setCardOrderSignal("handover");
		} catch {}
	});
	const setCardOrder = (next: CardOrder) => {
		setCardOrderSignal(next);
		try {
			localStorage.setItem(ORDER_KEY, next);
		} catch {}
	};
	const shown = createMemo(() => {
		const list = ofCompany().filter(
			(card) => statusMatches(card, status()) && searchMatches(card),
		);
		// The server sends them in handover order.
		return cardOrder() === "number" ? list.sort(compareByNumber) : list;
	});
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

	/** The cards being printed: the locked batch, else what's ticked. */
	const printCards = () => {
		const locked = batch();
		if (locked?.kind === "cards") return locked.cards;
		if (locked?.kind === "test") return [];
		return selected();
	};
	const plainCount = () =>
		Math.max(1, Math.min(200, plainSheets() ?? Math.max(1, sheets().length)));
	const sheetCount = () =>
		batch()?.kind === "test"
			? TEST_SHEETS
			: mode() === "plain"
				? plainCount()
				: toSheets(printCards()).length;
	/**
	 * Every page, each sheet's message side then its ORAIA side. While
	 * printing one side by hand, only that side, in the order it goes in.
	 */
	const pages = createMemo((): PrintPage[] => {
		if (centring())
			return [
				{ side: "message", sheet: 0, sheets: 1, cards: [], centring: true },
			];
		const locked = batch();
		if (mode() === "plain" && !locked)
			return Array.from({ length: plainCount() }, (_, sheet) => ({
				side: "oraia" as const,
				sheet,
				sheets: plainCount(),
				cards: [],
			}));
		const list: PrintPage[] =
			locked?.kind === "test"
				? Array.from({ length: TEST_SHEETS }, (_, sheet) => {
						const numbers = Array.from(
							{ length: CARDS_PER_SHEET },
							(_, spot) => sheet * CARDS_PER_SHEET + spot + 1,
						);
						return [
							{
								side: "message" as const,
								sheet,
								sheets: TEST_SHEETS,
								cards: [],
								numbers,
							},
							{
								side: "oraia" as const,
								sheet,
								sheets: TEST_SHEETS,
								cards: [],
								numbers: mirrorSheet(numbers),
							},
						];
					}).flat()
				: toSheets(printCards()).flatMap((sheetCards, sheet, all) => [
						{
							side: "message" as const,
							sheet,
							sheets: all.length,
							cards: sheetCards,
						},
						{
							side: "oraia" as const,
							sheet,
							sheets: all.length,
							cards: sheetCards,
						},
					]);
		if (mode() === "stock" && locked?.kind !== "test")
			return list.filter((page) => page.side === "message");
		const side = printing();
		if (!side || side === "both") return list;
		const one = list.filter((page) => page.side === side);
		return side === "oraia" && printer().reverseBacks ? one.reverse() : one;
	});
	const canPrint = () =>
		mode() === "plain" || !!batch() || selected().length > 0;

	const reference = (card: PrintCard) =>
		withReference()
			? [
					`#${card.number}`,
					card.company,
					card.deliveryDate && shortDeliveryDate(card.deliveryDate),
					card.label,
				]
					.filter(Boolean)
					.join(" · ")
			: undefined;

	const dayLabel = (d: string) =>
		d === ALL ? "All days" : d === NONE ? "No date" : shortDeliveryDate(d);

	// The saved PDF's name: "Cards - Sat, Nov 14 - Front & back - 12 cards - Nov 12".
	usePrintTitle(() =>
		printFileName([
			"Cards",
			dayPicks().size > 0 &&
				days()
					.filter((d) => dayPicks().has(d))
					.map(dayLabel)
					.join(", "),
			companyPicks().size > 0 &&
				[...companyPicks()]
					.map((name) => (name === NONE ? "No company" : name))
					.join(", "),
			STYLES.find((option) => option.key === style())?.label,
			batch()?.kind === "test"
				? "Test"
				: printing() === "message"
					? "Messages"
					: printing() === "oraia"
						? "ORAIA side"
						: undefined,
			mode() === "plain"
				? plural(plainCount(), "sheet")
				: plural(printCards().length, "card"),
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
		mode() !== "plain" &&
		mode() !== "stock" &&
		!printing() &&
		previewWidth() >= (folded() ? 760 : 520);
	const scale = () => {
		const width = previewWidth();
		if (!width) return 0.4;
		const across = twoUp() ? 2 : 1;
		return Math.min(
			0.62,
			(width - (across - 1) * 16) / across / mmToPx(paper().width),
		);
	};
	const refit = async () => {
		await document.fonts.ready;
		requestAnimationFrame(() =>
			setFits(folded() ? fitFolded(previewBox) : fitMessages(previewBox)),
		);
	};
	createEffect(on([pages, withReference, style], () => void refit()));

	const fitOf = (card: PrintCard) => fits().get(card.key);
	const tooLong = createMemo(() =>
		printCards().filter((card) => fitOf(card)?.overflow),
	);

	// ----- Printing -----

	/** Puts just `side` on the page, waits for it to be laid out, and prints. */
	const printSide = async (side: Side | "both") => {
		setPrinting(side);
		try {
			await refit();
			await new Promise((ready) => requestAnimationFrame(ready));
			await Promise.all(
				[...(previewBox?.querySelectorAll("img") ?? [])].map((img) =>
					img.decode().catch(() => {}),
				),
			);
			window.print();
		} finally {
			setPrinting(undefined);
		}
	};

	/** Step 1 by hand: reads the latest words, locks the cards in, prints messages. */
	const printMessages = async () => {
		setBusy(true);
		setJustPrinted(undefined);
		try {
			if (!batch()) {
				await refresh(true);
				if (!selected().length) return;
				setBatch({ kind: "cards", cards: selected().slice() });
			}
			await printSide("message");
			setDone((prev) => ({ ...prev, message: true }));
		} finally {
			setBusy(false);
		}
	};

	/** Step 2 by hand: the ORAIA side of the same sheets. */
	const printOraia = async () => {
		setBusy(true);
		try {
			await printSide("oraia");
			setDone((prev) => ({ ...prev, oraia: true }));
			const locked = batch();
			if (locked?.kind === "cards") setJustPrinted(locked.cards);
		} finally {
			setBusy(false);
		}
	};

	/** Two-sided printers, and plain backs: everything in one go. */
	const printAll = async () => {
		setBusy(true);
		setJustPrinted(undefined);
		try {
			if (mode() === "plain") {
				await printSide("oraia");
				return;
			}
			// Whatever was edited since the page opened prints with its new words.
			await refresh(true);
			const cards = selected().slice();
			if (!cards.length) return;
			await printSide(mode() === "stock" ? "message" : "both");
			setJustPrinted(cards);
		} finally {
			setBusy(false);
		}
	};

	/** The centring test: one page, printed as is, to measure this printer. */
	const printCentring = async () => {
		setBusy(true);
		setCentring(true);
		try {
			await printSide("message");
		} finally {
			setCentring(false);
			setBusy(false);
		}
	};

	const startTest = () => {
		setJustPrinted(undefined);
		setDone({ message: false, oraia: false });
		setBatch({ kind: "test" });
	};

	const markPrinted = async () => {
		const cardsDone = justPrinted();
		if (!cardsDone?.length) return;
		try {
			await markCardsPrintedFn({
				data: {
					cards: cardsDone.map(({ orderId, slot, to, message }) => ({
						orderId,
						slot,
						to,
						message,
					})),
				},
			});
			setJustPrinted(undefined);
			setSkipped(new Set<string>());
			startOver();
			toastSuccess(`${plural(cardsDone.length, "card")} marked as printed.`);
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
					<HelloNoteEditor />
					<div class={cn(adminCard, "flex flex-col gap-4 p-4")}>
						<FilterRow label="Delivery day">
							<button
								type="button"
								aria-pressed={dayPicks().size === 0}
								class={pill(dayPicks().size === 0)}
								onClick={() => setDayPicks(new Set<string>())}
							>
								All days
							</button>
							<For each={days()}>
								{(d) => (
									<button
										type="button"
										aria-pressed={dayPicks().has(d)}
										class={pill(dayPicks().has(d))}
										onClick={() => toggleDay(d)}
									>
										{dayLabel(d)}
										<span class="tabular-nums opacity-75">
											{" "}
											{pool().filter((card) => dayOf(card) === d).length}
										</span>
									</button>
								)}
							</For>
						</FilterRow>

						<FilterRow label="Company">
							<button
								type="button"
								aria-pressed={companyPicks().size === 0}
								class={pill(companyPicks().size === 0)}
								onClick={() => setPicks(new Set<string>())}
							>
								All companies
							</button>
							<For each={companies()}>
								{(name) => (
									<button
										type="button"
										aria-pressed={companyPicks().has(name)}
										class={pill(companyPicks().has(name))}
										onClick={() => togglePick(name)}
									>
										{name === NONE ? "No company" : name}
										<span class="tabular-nums opacity-75">
											{" "}
											{
												ofDay().filter((card) => companyOf(card) === name)
													.length
											}
										</span>
									</button>
								)}
							</For>
						</FilterRow>

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

						<FilterRow label="Order by">
							<For
								each={
									[
										["number", "Order number"],
										["handover", "Handover (day, company, class)"],
									] as [CardOrder, string][]
								}
							>
								{([key, label]) => (
									<button
										type="button"
										aria-pressed={cardOrder() === key}
										class={pill(cardOrder() === key)}
										onClick={() => setCardOrder(key)}
									>
										{label}
									</button>
								)}
							</For>
						</FilterRow>
						<Show when={cardOrder() === "number"}>
							<p class="-mt-2 text-xs text-petal-900/55">
								Oldest order first. New orders only join at the end, so the list
								keeps its place when the page refreshes.
							</p>
						</Show>
					</div>

					<Show when={batch()?.kind === "cards"}>
						<p class="flex items-start gap-2 rounded-xl border border-petal-200 bg-petal-50 px-3 py-2.5 text-sm">
							<LockIcon />
							<span>
								{plural(printCards().length, "card is", "cards are")} locked in
								while their two sides print. Ticking or unticking here is for
								the next batch.
							</span>
						</p>
					</Show>
					<Show when={picked()}>
						{(keys) => (
							<div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-petal-200 bg-petal-50 px-4 py-3 text-sm">
								<p>
									Showing the{" "}
									<strong class="font-semibold tabular-nums">
										{pool().length}
									</strong>{" "}
									{pool().length === 1 ? "card" : "cards"} picked on{" "}
									<Link
										to="/admin/reports/cards"
										class="font-medium text-petal-700 underline-offset-2 hover:underline"
									>
										Reports → Cards
									</Link>
									, ticked and ready to print.
									<Show when={keys().size > pool().length}>
										{" "}
										{keys().size - pool().length} picked{" "}
										{keys().size - pool().length === 1
											? "card is"
											: "cards are"}{" "}
										no longer on an active order.
									</Show>
								</p>
								<button
									type="button"
									class={adminButton.ghost}
									onClick={() => {
										setPicked(undefined);
										setStatus("todo");
									}}
								>
									Show all cards
								</button>
							</div>
						)}
					</Show>
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
							<span class="text-sm font-medium" id="mode-label">
								How you print
							</span>
							<fieldset
								aria-labelledby="mode-label"
								class={cn(
									"m-0 grid rounded-3xl border border-petal-200 bg-white p-1 text-sm",
									folded() ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
								)}
							>
								<For
									each={MODES.filter(
										(option) => folded() || !option.foldedOnly,
									)}
								>
									{(option) => (
										<button
											type="button"
											aria-pressed={mode() === option.key}
											disabled={!!batch()}
											onClick={() => setMode(option.key)}
											class={cn(
												"rounded-full px-2 py-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500 disabled:cursor-not-allowed",
												mode() === option.key
													? "bg-petal-700 font-medium text-white"
													: "hover:bg-petal-50 disabled:opacity-50",
											)}
										>
											{option.label}
										</button>
									)}
								</For>
							</fieldset>
							<p class="text-sm text-petal-900/60">
								{MODES.find((option) => option.key === mode())?.hint} Set
								margins to <strong>None</strong> and scale to{" "}
								<strong>100%</strong>.
							</p>
						</div>

						<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
							<Show
								when={mode() !== "plain"}
								fallback={
									<label class="flex items-center gap-2 text-sm">
										Sheets
										<input
											type="number"
											min="1"
											max="200"
											inputmode="numeric"
											class={cn(adminInput, "w-24")}
											value={plainCount()}
											onInput={(e) => {
												const n = Number.parseInt(e.currentTarget.value, 10);
												setPlainSheets(Number.isFinite(n) ? n : undefined);
											}}
										/>
										<span class="text-petal-900/60">
											= {plainCount() * CARDS_PER_SHEET} cards
										</span>
									</label>
								}
							>
								<Check checked={withReference()} onChange={setWithReference}>
									Order number on each card
								</Check>
								<Check checked={withBouquetQr()} onChange={setWithBouquetQr}>
									QR code to each bouquet’s page
								</Check>
							</Show>
							<Check checked={guides()} onChange={setGuides}>
								{folded()
									? "Cut and fold guides"
									: "Cut guides, with sheet numbers"}
							</Check>
						</div>

						<CutterFields
							offset={offset()}
							onOffset={setOffset}
							onTest={() => void printCentring()}
							busy={busy()}
						/>

						<Show when={mode() !== "plain" && !batch() && tooLong().length}>
							<p class="rounded-xl bg-error px-3 py-2 text-sm text-error-foreground">
								{plural(tooLong().length, "message is", "messages are")} too
								long to fit even at the smallest size, so the end would be cut
								off. Shorten {tooLong().length === 1 ? "it" : "them"} with Edit,
								or untick {tooLong().length === 1 ? "it" : "them"}.
							</p>
						</Show>

						<Show
							when={mode() === "manual"}
							fallback={
								<>
									<Show when={mode() === "duplex"}>
										<FlipChoice
											best={bestFlip()}
											value={shownFlip()}
											onChange={setFlip}
										/>
									</Show>
									<div class="hidden items-center justify-between gap-3 lg:flex">
										<p class="text-sm text-petal-900/70">
											<PrintSummary
												mode={mode()}
												cards={printCards().length}
												sheets={sheetCount()}
											/>
										</p>
										<button
											type="button"
											class={adminButton.primary}
											disabled={!canPrint() || busy()}
											onClick={() => void printAll()}
										>
											<PrinterIcon />
											{busy() ? "Getting the latest…" : "Print"}
										</button>
									</div>
								</>
							}
						>
							<ManualSteps
								batch={batch()}
								cards={printCards().length}
								sheets={sheetCount()}
								done={done()}
								busy={busy()}
								canStart={selected().length > 0}
								printer={printer()}
								onPrinter={setPrinter}
								onMessages={() => void printMessages()}
								onOraia={() => void printOraia()}
								onTest={startTest}
								onStartOver={startOver}
							/>
						</Show>
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
											Sheet {page.sheet + 1} of {page.sheets} ·{" "}
											{page.side === "message" ? "Messages" : "ORAIA side"}
											{page.side === "oraia" && turnOraia()
												? " (turned around on purpose)"
												: ""}
										</figcaption>
										<div
											style={{
												width: `calc(${paper().width}mm * var(--s))`,
												height: `calc(${paper().height}mm * var(--s))`,
											}}
											class="overflow-hidden rounded-sm shadow-[0_1px_8px_rgb(92_31_49/0.14)] print:h-auto print:w-auto print:overflow-visible print:rounded-none print:shadow-none"
										>
											<div class="origin-top-left [transform:scale(var(--s))] print:[transform:none]">
												<div
													class="overflow-hidden"
													style={{
														width: `${paper().width}mm`,
														height: `${paper().height}mm`,
													}}
												>
													<div
														style={{
															transform: `translate(${placeOf(page).x}mm, ${placeOf(page).y}mm)`,
														}}
													>
														<Show
															when={!page.centring}
															fallback={<CentringSheet landscape={folded()} />}
														>
															<SheetPage
																page={page}
																folded={folded()}
																guides={guides()}
																turnOraia={turnOraia()}
																withQr={withBouquetQr()}
																links={
																	mode() === "plain"
																		? undefined
																		: backLinks(page.cards)
																}
																reference={reference}
															/>
														</Show>
													</div>
												</div>
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
							mode={mode()}
							cards={printCards().length}
							sheets={sheetCount()}
						/>
					</p>
					<Show
						when={mode() === "manual"}
						fallback={
							<button
								type="button"
								class={adminButton.primary}
								disabled={!canPrint() || busy()}
								onClick={() => void printAll()}
							>
								<PrinterIcon />
								{busy() ? "Getting the latest…" : "Print"}
							</button>
						}
					>
						<button
							type="button"
							class={adminButton.primary}
							disabled={busy() || (!batch() && !selected().length)}
							onClick={() =>
								void (done().message ? printOraia() : printMessages())
							}
						>
							<PrinterIcon />
							{done().message ? "2. ORAIA side" : "1. Messages"}
						</button>
					</Show>
				</div>
			</div>
		</div>
	);
}

function PrintSummary(props: { mode: Mode; cards: number; sheets: number }) {
	return (
		<Show
			when={props.mode !== "plain"}
			fallback={
				<>
					<strong class="font-semibold text-petal-900 tabular-nums">
						{plural(props.sheets, "sheet")}
					</strong>{" "}
					of plain backs
				</>
			}
		>
			<strong class="font-semibold text-petal-900 tabular-nums">
				{plural(props.cards, "card")}
			</strong>{" "}
			on {plural(props.sheets, "sheet")}
		</Show>
	);
}

/** One page: a sheet's message side or ORAIA side, real cards or the test. */
function SheetPage(props: {
	page: PrintPage;
	folded: boolean;
	guides: boolean;
	turnOraia: boolean;
	/** Folded cards: each card's bouquet QR code goes inside. */
	withQr: boolean;
	links?: (string | undefined)[];
	reference: (card: PrintCard) => string | undefined;
}) {
	// Folded outsides are all alike, so their sheets needn't be matched up.
	const label = () =>
		props.folded
			? undefined
			: `Sheet ${props.page.sheet + 1} of ${props.page.sheets} · ${
					props.page.side === "message" ? "messages" : "ORAIA side"
				}`;
	const upsideDown = () => props.page.side === "oraia" && props.turnOraia;
	const spots = Array.from({ length: CARDS_PER_SHEET });
	return (
		<Show
			when={!props.page.numbers}
			fallback={
				<TestSheet
					folded={props.folded}
					side={props.page.side}
					numbers={props.page.numbers ?? []}
					guides={props.guides}
					label={label()}
					upsideDown={upsideDown()}
				/>
			}
		>
			<Show
				when={props.page.side === "message"}
				fallback={
					<Show
						when={props.folded}
						fallback={
							<BackSheet
								links={props.links}
								guides={props.guides}
								label={label()}
								upsideDown={upsideDown()}
							/>
						}
					>
						<FoldedOutsideSheet
							guides={props.guides}
							label={label()}
							upsideDown={upsideDown()}
						/>
					</Show>
				}
			>
				<Show
					when={props.folded}
					fallback={
						<Sheet guides={props.guides} label={label()}>
							<For each={spots}>
								{(_, spot) => (
									<Show
										when={props.page.cards[spot()]}
										fallback={<EmptyFront />}
									>
										{(card) => (
											<CardFront
												fitKey={card().key}
												link={card().link}
												to={card().to}
												message={card().message}
												reference={props.reference(card())}
											/>
										)}
									</Show>
								)}
							</For>
						</Sheet>
					}
				>
					<FoldedSheet guides={props.guides} label={label()}>
						<For each={spots}>
							{(_, spot) => (
								<Show
									when={props.page.cards[spot()]}
									fallback={<EmptyFolded />}
								>
									{(card) => (
										<FoldedInside
											fitKey={card().key}
											link={card().link}
											qr={props.withQr ? card().link || undefined : undefined}
											to={card().to}
											message={card().message}
											reference={props.reference(card())}
										/>
									)}
								</Show>
							)}
						</For>
					</FoldedSheet>
				</Show>
			</Show>
		</Show>
	);
}

/** Two-sided printers: the edge they flip on. */
function FlipChoice(props: {
	best: Flip;
	value: Flip;
	onChange: (flip: Flip) => void;
}) {
	const option = (flip: Flip, label: string) => (
		<button
			type="button"
			aria-pressed={props.value === flip}
			class={pill(props.value === flip)}
			onClick={() => props.onChange(flip)}
		>
			{label}
			{props.best === flip ? " (best)" : ""}
		</button>
	);
	return (
		<div class="flex flex-col gap-2">
			<span class="text-sm font-medium" id="flip-label">
				Printer flips the sheet on the
			</span>
			<fieldset
				aria-labelledby="flip-label"
				class="m-0 flex flex-wrap gap-2 border-0 p-0"
			>
				{option("long", "Long edge")}
				{option("short", "Short edge")}
			</fieldset>
			<p class="text-sm text-petal-900/60">
				<Show
					when={props.value !== props.best}
					fallback={`Pick “Flip on ${props.best} edge” in the print dialog’s two-sided setting.`}
				>
					The ORAIA side is printed turned around on purpose, so it comes out
					the right way up.
				</Show>
			</p>
		</div>
	);
}

/**
 * Printing by hand, in two steps: every message, then the ORAIA side on the
 * same sheets. The cards are locked in between, so each back is its card's.
 */
function ManualSteps(props: {
	batch?: Batch;
	cards: number;
	sheets: number;
	done: Record<Side, boolean>;
	busy: boolean;
	canStart: boolean;
	printer: PrinterSetup;
	onPrinter: (change: Partial<PrinterSetup>) => void;
	onMessages: () => void;
	onOraia: () => void;
	onTest: () => void;
	onStartOver: () => void;
}) {
	const test = () => props.batch?.kind === "test";
	const what = () =>
		test()
			? `Test: cards 1 to ${props.sheets * CARDS_PER_SHEET} on ${plural(props.sheets, "sheet")}`
			: `${plural(props.cards, "card")} on ${plural(props.sheets, "sheet")}`;
	return (
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-sm">
					<Show
						when={props.batch}
						fallback={
							<span class="text-petal-900/70">
								<strong class="font-semibold text-petal-900">{what()}</strong>
							</span>
						}
					>
						<span class="inline-flex items-center gap-1.5 font-medium">
							<LockIcon />
							{what()}, locked in
						</span>
					</Show>
				</p>
				<Show when={props.batch}>
					<button
						type="button"
						class={adminButton.ghost}
						onClick={props.onStartOver}
						disabled={props.busy}
					>
						{test() ? "End the test" : "Start over"}
					</button>
				</Show>
			</div>

			<ol class="flex flex-col gap-2">
				<Step
					n={1}
					title="Print the messages"
					done={props.done.message}
					detail={
						props.batch
							? "Printed on fresh sheets. Keep them in the order they came out."
							: "Reads the latest words, then locks these cards in until both sides are printed."
					}
					action={props.done.message ? "Print again" : "Print messages"}
					primary={!props.done.message}
					disabled={props.busy || (!props.batch && !props.canStart)}
					onClick={props.onMessages}
				/>
				<Step
					n={2}
					title="Print the ORAIA side"
					done={props.done.oraia}
					detail="Put the printed stack back in the tray, blank side to be printed, in the same order. Then print."
					action={props.done.oraia ? "Print again" : "Print ORAIA side"}
					primary={props.done.message && !props.done.oraia}
					disabled={props.busy || !props.done.message}
					onClick={props.onOraia}
				/>
			</ol>

			<Show when={test() && props.done.oraia}>
				<div class="rounded-xl border border-petal-200 bg-petal-50 px-4 py-3 text-sm">
					<p class="font-medium">
						Hold each sheet up to the light: is the back of card 1 behind card
						1, the right way up?
					</p>
					<ul class="mt-1.5 list-disc pl-5 text-petal-900/75">
						<li>
							Yes, every one: you’re set. End the test and print for real.
						</li>
						<li>
							Upside down: tick <em>Turn the ORAIA side around</em> below.
						</li>
						<li>
							Behind the wrong sheet (5–8 behind 1–4): tick{" "}
							<em>Print it in reverse order</em>.
						</li>
					</ul>
					<p class="mt-1.5 text-petal-900/75">
						Then print the test again to check.
					</p>
				</div>
			</Show>

			<details
				class="rounded-xl border border-petal-100 px-3 py-2 text-sm"
				open={test() || props.printer.turnBacks || props.printer.reverseBacks}
			>
				<summary class="cursor-pointer py-1 font-medium">
					If the backs don’t line up
				</summary>
				<div class="flex flex-col gap-1 pb-1">
					<Check
						checked={props.printer.turnBacks}
						onChange={(on) => props.onPrinter({ turnBacks: on })}
					>
						Turn the ORAIA side around (it came out upside down)
					</Check>
					<Check
						checked={props.printer.reverseBacks}
						onChange={(on) => props.onPrinter({ reverseBacks: on })}
					>
						Print it in reverse order (backs landed on the wrong sheets)
					</Check>
					<p class="text-xs text-petal-900/55">
						Saved for this computer’s printer.
					</p>
				</div>
			</details>

			<Show when={!props.batch}>
				<button
					type="button"
					class={cn(adminButton.ghost, "self-start")}
					onClick={props.onTest}
				>
					New printer or paper? Print a 2-sheet test first
				</button>
			</Show>
		</div>
	);
}

/**
 * Lining the print up with the paper's edges, for cutting with a guillotine:
 * this printer's correction, read off the centring test.
 */
function CutterFields(props: {
	offset: { x: number; y: number };
	onOffset: (change: Partial<{ x: number; y: number }>) => void;
	onTest: () => void;
	busy: boolean;
}) {
	const field = (key: "x" | "y", label: string, hint: string) => (
		<label class="flex flex-col gap-1 text-sm">
			<span class="font-medium">{label}</span>
			<span class="flex items-center gap-1.5">
				<input
					type="number"
					step="0.5"
					min={-MAX_SHIFT}
					max={MAX_SHIFT}
					inputmode="decimal"
					class={cn(adminInput, "w-24 tabular-nums")}
					value={props.offset[key]}
					onChange={(e) => {
						const n = Number.parseFloat(e.currentTarget.value);
						const mm = Number.isFinite(n)
							? Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, Math.round(n * 2) / 2))
							: 0;
						e.currentTarget.value = String(mm);
						props.onOffset({ [key]: mm });
					}}
				/>
				<span class="text-petal-900/60">mm</span>
			</span>
			<span class="text-xs text-petal-900/55">{hint}</span>
		</label>
	);
	return (
		<details
			class="rounded-xl border border-petal-100 px-3 py-2 text-sm"
			open={!!props.offset.x || !!props.offset.y}
		>
			<summary class="cursor-pointer py-1 font-medium">
				Line up with the cutter
			</summary>
			<div class="flex flex-col gap-3 pt-1 pb-1">
				<p class="text-petal-900/70">
					Cutting a stack against the paper’s edges? Then every page has to sit
					dead centre on the paper, front and back. Print the centring test,
					fold it in half both ways, and enter the numbers where the creases
					cross its scales. Every page moves by that much.
				</p>
				<div class="flex flex-wrap items-end gap-x-5 gap-y-2">
					{field("x", "Move right", "Left: a minus number")}
					{field("y", "Move down", "Up: a minus number")}
				</div>
				<button
					type="button"
					class={cn(adminButton.secondary, "self-start")}
					disabled={props.busy}
					onClick={props.onTest}
				>
					<PrinterIcon />
					Print the centring test
				</button>
				<p class="text-xs text-petal-900/55">
					Saved for this computer’s printer, for this card style’s paper
					direction.
				</p>
			</div>
		</details>
	);
}

function Step(props: {
	n: number;
	title: string;
	detail: string;
	done: boolean;
	action: string;
	primary: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<li
			class={cn(
				"flex items-start gap-3 rounded-xl border px-3 py-3",
				props.primary ? "border-petal-300 bg-white" : "border-petal-100",
			)}
		>
			<span
				class={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
					props.done
						? "bg-success text-success-foreground"
						: props.primary
							? "bg-petal-700 text-white"
							: "bg-petal-100 text-petal-700",
				)}
				aria-hidden="true"
			>
				{props.done ? "✓" : props.n}
			</span>
			<div class="min-w-0 flex-1">
				<p class="font-medium">
					{props.title}
					<Show when={props.done}>
						<span class="sr-only"> (done)</span>
					</Show>
				</p>
				<p class="text-sm text-petal-900/60">{props.detail}</p>
			</div>
			<button
				type="button"
				class={props.primary ? adminButton.primary : adminButton.secondary}
				disabled={props.disabled}
				onClick={props.onClick}
			>
				{props.action}
			</button>
		</li>
	);
}

function LockIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			class="size-4 text-petal-700"
		>
			<rect x="5" y="11" width="14" height="10" rx="2" />
			<path d="M8 11V8a4 4 0 0 1 8 0v3" />
		</svg>
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
						<Show when={props.card.link}>
							{(link) => (
								<a
									href={bouquetPath(link())}
									target="_blank"
									rel="noreferrer"
									class={cn(adminButton.ghost, "text-xs")}
									title="What the QR code on this card's back opens: the bouquet and its message"
								>
									Bouquet page
								</a>
							)}
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
