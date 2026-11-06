/**
 * Fills the local database with demo data for trying out the shop and admin.
 *
 *   bun run db:seed            add demo accounts, bouquets and orders (skips what exists)
 *   bun run db:seed --reset    wipe bouquets, orders, payment settings and accounts first
 *   bun run db:seed:orders     add orders for the bouquets already in the shop; nothing else
 *   bun run db:seed:orders 80  the same, with this many orders (40 if left out)
 *   bun run db:seed:sizes      give sizes builder prices and switch the builder on; nothing else
 *   bun run db:seed:stock      reset the demo stock and pre-order cases (adds their bouquets if missing)
 *
 * Safe to run while the dev server is running. Refuses to run in production.
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { CADET_CLASSES, CIVILIAN, COMPANIES } from "~/lib/cadets";
import { priceCart } from "~/lib/pricing";
import { addDays, shopNow } from "~/lib/time";
import { getAuth } from "~/server/auth";
import { moveRecipesToBouquets } from "~/server/bouquet-tables";
import {
	getAdminProduct,
	listPublicProducts,
	type ProductInput,
	saveProduct,
} from "~/server/catalog-repo";
import { getCustomSettings, saveCustomSettings } from "~/server/custom-repo";
import { getDb, seedStarterData } from "~/server/db";
import {
	cancelOrder,
	createOrder,
	type NewOrder,
	reviewPayment,
	setOrderStage,
	setDeliveryPhoto,
	setRider,
} from "~/server/orders-repo";
import { wrapperIdByName } from "~/server/wrappers-repo";
import {
	listAddresses,
	listOccasions,
	saveAddress,
	saveOccasion,
} from "~/server/account-repo";
import { BOARD_STAGES, type OrderStage } from "~/types/order";

if (process.env.NODE_ENV === "production") {
	console.error("Refusing to seed demo data in production.");
	process.exit(1);
}

const RESET = process.argv.includes("--reset");
const ORDERS_ONLY = process.argv.includes("--orders");
const SIZES_ONLY = process.argv.includes("--sizes");
const STOCK_ONLY = process.argv.includes("--stock");
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? ".data/uploads";
const REVIEWER = "Olivia Owner";

const DEMO_ACCOUNTS = [
	{
		name: "Olivia Owner",
		email: "owner@oraia.test",
		password: "oraia-owner-2026",
		role: "admin" as const,
	},
	{
		name: "Sam Staff",
		email: "staff@oraia.test",
		password: "oraia-staff-2026",
		role: "user" as const,
	},
	{
		name: "Carmen Cruz",
		email: "customer@oraia.test",
		password: "oraia-customer-2026",
		role: "customer" as const,
	},
];
const DEMO_CUSTOMER = "customer@oraia.test";
const SAMPLE_DELIVERY = join(import.meta.dir, "fixtures", "sample-delivery.png");
const RIDERS = [
	{ name: "Jun Dela Cruz", phone: "0917 555 0101" },
	{ name: "Ramon Santos", phone: "0918 555 0202" },
];

const gallery = (variantId: string) =>
	["front", "top", "detail", "vase"].map(
		(view) => `/images/bouquets/${variantId}-${view}.svg`,
	);

/** Demo bouquets; built when used, since naming wrappers may add them. */
const demoBouquets = (): Array<{
	id: string;
	input: Omit<ProductInput, "recipe">;
}> => [
	{
		id: "bella",
		input: {
			title: "Bella",
			description:
				"Six hand-picked roses in a little posy, just right for a desk, a bedside table or a ‘just because’.",
			size: "petite",
			isVisible: true,
			variants: [
				{
					colorName: "Blush Pink",
					colorHex: "#f2a6b8",
					price: 1499,
					isAvailable: true,
					images: gallery("pastel-pink"),
					recipe: [
						{ flower: "Roses", count: 6, color: "Pink" },
						{ flower: "Gypsophila", count: 1 },
					],
					wrapperId: wrapperIdByName("White"),
				},
				{
					colorName: "Ruby",
					colorHex: "#a51c34",
					price: 1599,
					isAvailable: true,
					images: gallery("red-velvet"),
					recipe: [
						{ flower: "Roses", count: 6, color: "Red" },
						{ flower: "Gypsophila", count: 1 },
					],
					wrapperId: wrapperIdByName("Kraft brown"),
				},
			],
		},
	},
	{
		// Two styles: ready-made then pre-order, and pre-order only.
		id: "odette",
		input: {
			title: "Odette",
			description: "Cluster of 10 delicate tulips, perfect for any occasions.",
			size: "",
			isVisible: true,
			variants: [
				{
					colorName: "Cream",
					colorHex: "#f3e7d3",
					price: 2500,
					isAvailable: true,
					images: gallery("cream-white"),
					recipe: [],
					wrapperId: "",
				},
				{
					colorName: "Pink",
					colorHex: "#f4c6cf",
					price: 2500,
					isAvailable: true,
					images: gallery("pastel-pink"),
					recipe: [],
					wrapperId: "",
				},
			],
		},
	},
	{
		// Ready-made stock: some left, sold out, and pre-orders full.
		id: "celeste",
		input: {
			title: "Celeste",
			description:
				"A soft dome of roses and gypsophila, made ahead so it can go out the same day.",
			size: "classic",
			isVisible: true,
			variants: [
				{
					colorName: "Lilac",
					colorHex: "#c9b6e4",
					price: 1899,
					isAvailable: true,
					images: gallery("pastel-pink"),
					recipe: [
						{ flower: "Roses", count: 10, color: "Pink" },
						{ flower: "Gypsophila", count: 1, filler: true },
					],
					wrapperId: wrapperIdByName("White"),
				},
				{
					colorName: "Peach",
					colorHex: "#f6c1a1",
					price: 1899,
					isAvailable: true,
					images: gallery("sunset-coral"),
					recipe: [
						{ flower: "Roses", count: 10, color: "Peach" },
						{ flower: "Gypsophila", count: 1, filler: true },
					],
					wrapperId: wrapperIdByName("Kraft brown"),
				},
				{
					colorName: "Snow",
					colorHex: "#f7f4ee",
					price: 1899,
					isAvailable: true,
					images: gallery("cream-white"),
					recipe: [
						{ flower: "Roses", count: 10, color: "White" },
						{ flower: "Gypsophila", count: 1, filler: true },
					],
					wrapperId: wrapperIdByName("White"),
				},
			],
		},
	},
	{
		// Pre-orders only: on a set date, and with no date or limit.
		id: "mirabel",
		input: {
			title: "Mirabel",
			description:
				"Imported blooms ordered in batches. Pre-order yours and we make it when the flowers land.",
			size: "impressive",
			isVisible: true,
			variants: [
				{
					colorName: "Sunset",
					colorHex: "#f08a5d",
					price: 3299,
					isAvailable: true,
					images: gallery("sunset-coral"),
					recipe: [
						{ flower: "Roses", count: 18, color: "Peach" },
						{ flower: "Misty", count: 2, color: "White", filler: true },
					],
					wrapperId: wrapperIdByName("Kraft brown"),
				},
				{
					colorName: "Scarlet",
					colorHex: "#a51c34",
					price: 3299,
					isAvailable: true,
					images: gallery("red-velvet"),
					recipe: [
						{ flower: "Roses", count: 18, color: "Red" },
						{ flower: "Misty", count: 2, color: "White", filler: true },
					],
					wrapperId: wrapperIdByName("Black"),
				},
			],
		},
	},
	{
		// Hidden: shows how a draft bouquet looks in the admin.
		id: "ivy",
		input: {
			title: "Ivy",
			description:
				"Thirty-six cream roses arranged in a keepsake box. Coming soon for weddings and big days.",
			size: "grand",
			isVisible: false,
			variants: [
				{
					colorName: "Ivory",
					colorHex: "#f4ecd9",
					price: 4999,
					isAvailable: true,
					images: gallery("cream-white"),
					recipe: [
						{ flower: "Stargazer", count: 5 },
						{ flower: "Roses", count: 12, color: "White" },
					],
					wrapperId: wrapperIdByName("Gold box"),
				},
			],
		},
	},
];

type Method = "card" | "gcash" | "maya" | "bank";

interface DemoOrder {
	/** The buyer's full name. */
	recipient: string;
	items: Array<[productId: string, variantId: string, quantity: number]>;
	method: Method;
	/** QR payments only; card orders are always paid. */
	review?: "verified" | "rejected";
	stage: OrderStage;
	gift?: string;
	placedHoursAgo: number;
	/** Placed by the demo customer, so it shows in their account. */
	customer?: true;
}

// A spread that fills every board column, payment state and filter.
const DEMO_ORDERS: DemoOrder[] = [
	{ recipient: "Miguel Tan", items: [["rosie", "pastel-pink", 2]], method: "card", stage: "done", placedHoursAgo: 60, customer: true },
	{ recipient: "Lea Ramos", items: [["bella", "blush-pink", 1]], method: "maya", review: "verified", stage: "done", placedHoursAgo: 40 },
	{ recipient: "Rosa Villanueva", items: [["scarlett", "red-velvet", 1]], method: "gcash", review: "verified", stage: "making", gift: "Sorry I missed your recital. So proud of you!", placedHoursAgo: 30 },
	{ recipient: "Gina Flores", items: [["scarlett", "red-velvet", 1]], method: "card", stage: "done", placedHoursAgo: 20 },
	{ recipient: "Ana Reyes", items: [["scarlett", "red-velvet", 2]], method: "card", stage: "making", gift: "Happy anniversary, mahal! Ten years and counting.", placedHoursAgo: 18, customer: true },
	{ recipient: "Bea Santos", items: [["rosie", "pastel-pink", 1]], method: "gcash", review: "verified", stage: "making", gift: "Get well soon, Lola. We love you!", placedHoursAgo: 16, customer: true },
	{ recipient: "Carlo Mendoza", items: [["bianca", "cream-white", 1]], method: "bank", review: "verified", stage: "making", placedHoursAgo: 14 },
	{ recipient: "Dani Cruz", items: [["bella", "ruby", 1]], method: "gcash", stage: "new", placedHoursAgo: 5 },
	{ recipient: "Mark Uy", items: [["rosie", "pastel-pink", 1]], method: "card", stage: "cancelled", placedHoursAgo: 12 },
	{ recipient: "Ella Garcia", items: [["scarlett", "red-velvet", 1], ["bella", "blush-pink", 1]], method: "card", stage: "new", gift: "Congratulations on the new job!", placedHoursAgo: 4 },
	{ recipient: "Felix Lim", items: [["rosie", "pastel-pink", 1]], method: "maya", review: "rejected", stage: "new", placedHoursAgo: 6 },
	{ recipient: "Hana Aquino", items: [["rosie", "pastel-pink", 1]], method: "gcash", stage: "new", placedHoursAgo: 3, customer: true },
	{ recipient: "Ivan Bautista", items: [["scarlett", "red-velvet", 3]], method: "card", stage: "new", gift: "Happy birthday, Ma! Love, Ivan and Pia", placedHoursAgo: 2 },
	{ recipient: "Joy Navarro", items: [["bella", "blush-pink", 2]], method: "bank", stage: "new", placedHoursAgo: 1 },
	{ recipient: "Karl Dizon", items: [["scarlett", "red-velvet", 1]], method: "card", stage: "new", placedHoursAgo: 1 },
	{ recipient: "Lia Morales", items: [["bianca", "cream-white", 1]], method: "maya", review: "verified", stage: "new", placedHoursAgo: 0.5 },
];

const DEDICATED_TO = ["Rosa", "Mahal", "Lola", "Ella", "Ma"];

function userIdFor(email: string) {
	const row = getDb()
		.query('SELECT id FROM "user" WHERE lower(email) = $email')
		.get({ email: email.toLowerCase() }) as { id: string } | null;
	return row?.id;
}

/**
 * Moves an order's timeline into the past: placed `hoursAgo`, then each later
 * stage spaced out evenly up to now, so the tracker shows realistic times.
 */
function backdate(id: string, hoursAgo: number) {
	const db = getDb();
	const start = Date.now() - hoursAgo * 60 * 60 * 1000;
	const events = db
		.query("SELECT rowid FROM order_events WHERE order_id = $id ORDER BY rowid")
		.all({ id }) as { rowid: number }[];
	const step = (Date.now() - start) / Math.max(events.length, 1);
	const at = (i: number) => new Date(start + i * step).toISOString();
	events.forEach((event, i) => {
		db.query("UPDATE order_events SET at = $at WHERE rowid = $rowid").run({
			rowid: event.rowid,
			at: at(i),
		});
	});
	const last = at(Math.max(events.length - 1, 0));
	db.query(
		`UPDATE orders SET created_at = $placed, stage_updated_at = $last,
		   delivered_at = CASE WHEN delivered_at IS NULL THEN NULL ELSE $last END
		 WHERE id = $id`,
	).run({ id, placed: at(0), last });
}

/** Places one order and walks it to its stage. False if an item can't be bought. */
async function placeDemoOrder(
	demo: DemoOrder,
	index: number,
	customerId: string | undefined,
) {
	const catalog = listPublicProducts();
	const cart = priceCart(
		demo.items.map(([productId, variantId, quantity]) => ({
			productId,
			variantId,
			quantity,
		})),
		catalog,
	);
	const problem = cart.lines.find((line) => line.problem);
	if (cart.lines.length !== demo.items.length || problem) {
		console.warn(`  ! skipped order for ${demo.recipient}: item missing or out of stock`);
		return false;
	}

	const id = crypto.randomUUID();
	let payment: NewOrder["payment"];
	if (demo.method === "card") {
		payment = {
			method: "card",
			status: "paid",
			cardBrand: index % 2 === 0 ? "visa" : "mastercard",
			cardLast4: String(4242 + index * 37).slice(-4),
		};
	} else {
		payment = {
			method: demo.method,
			status: "pending",
			referenceNumber: String(1_000_000_000_000 + index * 7_654_321_987),
		};
	}

	createOrder({
		id,
		cart,
		payment,
		customerId: demo.customer ? customerId : undefined,
		details: {
			firstName: demo.recipient.split(" ")[0] as string,
			lastName: demo.recipient.split(" ").slice(1).join(" "),
			fullName: demo.recipient,
			// Every fifth buyer is a civilian, who has no company.
			className: index % 5 === 4 ? CIVILIAN : (CADET_CLASSES[index % CADET_CLASSES.length] as string),
			company: index % 5 === 4 ? "" : COMPANIES[index % COMPANIES.length]?.name ?? "",
			serialNumber: index % 5 === 4 ? "" : String(10000 + index),
			email: `${demo.recipient.split(" ")[0]?.toLowerCase()}@example.com`,
			notes: index % 4 === 1 ? "Please wrap it in kraft paper." : "",
			addDedication: !!demo.gift,
			dedicationFor: demo.gift
				? (DEDICATED_TO[index % DEDICATED_TO.length] as string)
				: "",
			dedicationMessage: demo.gift ?? "",
		},
	});
	if (demo.review) reviewPayment(id, demo.review, REVIEWER);
	// Walk through each stage like staff would, so the timeline is complete.
	if (demo.stage === "cancelled") {
		cancelOrder(id, {
			reason: "The customer asked to cancel before payment.",
			cancelledBy: REVIEWER,
		});
	} else {
		const path = BOARD_STAGES.slice(1, BOARD_STAGES.indexOf(demo.stage) + 1);
		for (const stage of path) setOrderStage(id, stage);
	}
	if (demo.stage === "done") {
		setRider(id, RIDERS[index % RIDERS.length] as (typeof RIDERS)[number]);
	}
	if (demo.stage === "done") {
		const photo = `${crypto.randomUUID()}.png`;
		await copyFile(SAMPLE_DELIVERY, join(UPLOAD_DIR, "delivery", photo));
		setDeliveryPhoto(id, photo);
	}
	backdate(id, demo.placedHoursAgo);
	return true;
}

const FIRST_NAMES = ["Andres", "Bianca", "Camille", "Diego", "Erika", "Francis", "Gabby", "Hazel", "Isko", "Jasmine", "Kiko", "Liza", "Marco", "Nina", "Oscar", "Pia", "Quino", "Rina", "Sam", "Tessa"];
const LAST_NAMES = ["Abad", "Bautista", "Castro", "Domingo", "Evangelista", "Fernandez", "Gonzales", "Hernandez", "Ignacio", "Javier", "Lopez", "Manalo", "Ocampo", "Pascual", "Quiambao", "Reyes", "Salazar", "Torres", "Valdez", "Yap"];
const GIFTS = ["See you at the Hop!", "For the best date in the Corps.", "Congratulations, my cadet!", "Thank you for everything, Ma.", "Happy birthday! Love you always."];
const METHODS: Method[] = ["card", "gcash", "maya", "bank"];
/** How far back the orders go: 30 days. */
const ORDERS_SPAN_HOURS = 30 * 24;

/**
 * A month of orders for the bouquets in the shop. Old orders are mostly
 * delivered and recent ones still moving, with some of every payment state,
 * and every style that can be ordered gets its turn.
 */
function catalogOrders(count: number): DemoOrder[] {
	const styles = listPublicProducts().flatMap((product) =>
		product.variants
			.filter((variant) => variant.inStock)
			.map((variant) => [product.id, variant.id] as const),
	);
	if (styles.length === 0) return [];
	const pick = (index: number, quantity: number) =>
		[...(styles[index % styles.length] as readonly [string, string]), quantity] as [string, string, number];
	return Array.from({ length: count }, (_, index) => {
		const placedHoursAgo = ORDERS_SPAN_HOURS * (1 - index / count);
		const method = METHODS[index % METHODS.length] as Method;
		const stage: OrderStage =
			index % 11 === 10
				? "cancelled"
				: placedHoursAgo > 7 * 24
					? "done"
					: placedHoursAgo > 2 * 24
						? "making"
						: "new";
		// A QR payment has to be verified before the order can move on.
		const waiting = stage === "new" || stage === "cancelled";
		const review =
			method === "card" || (waiting && index % 3 === 0)
				? undefined
				: waiting && index % 3 === 1
					? "rejected"
					: "verified";
		return {
			recipient: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index * 7 + Math.floor(index / FIRST_NAMES.length)) % LAST_NAMES.length]}`,
			items:
				index % 7 === 6
					? [pick(index, 1), pick(index + 1, 1)]
					: [pick(index, index % 6 === 5 ? 2 : 1)],
			method,
			review,
			stage,
			gift: index % 3 === 0 ? GIFTS[index % GIFTS.length] : undefined,
			placedHoursAgo,
			customer: index % 6 === 0 ? true : undefined,
		};
	});
}

/** Adds orders to whatever's in the database, leaving everything else alone. */
async function seedCatalogOrders() {
	// Runs the auth migrations, for the tables the orders may link to.
	await getAuth();
	const count = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 40);
	const orders = catalogOrders(count);
	if (orders.length === 0) {
		console.log("  · no bouquets can be ordered yet, so there's nothing to seed");
		return;
	}
	await mkdir(join(UPLOAD_DIR, "delivery"), { recursive: true });
	const customerId = userIdFor(DEMO_CUSTOMER);
	let created = 0;
	for (const [index, demo] of orders.entries())
		if (await placeDemoOrder(demo, index, customerId)) created++;
	console.log(`  + ${created} orders across the last 30 days`);
}

async function seedCustomerExtras() {
	const userId = userIdFor(DEMO_CUSTOMER);
	if (!userId) return;
	if (listAddresses(userId).length === 0) {
		saveAddress(userId, null, {
			label: "Home",
			recipientName: "Carmen Cruz",
			address: "12 Sampaguita St",
			city: "Quezon City",
			postalCode: "1100",
			isDefault: true,
		});
		saveAddress(userId, null, {
			label: "Mom’s place",
			recipientName: "Teresa Cruz",
			address: "88 Ilang-Ilang Ave",
			city: "Makati",
			postalCode: "1200",
			isDefault: false,
		});
		console.log("  + 2 saved addresses for the demo customer");
	}
	if (listOccasions(userId).length === 0) {
		const today = shopNow().date;
		const monthDay = (daysAhead: number) => {
			const date = addDays(today, daysAhead);
			return { month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
		};
		saveOccasion(userId, null, { title: "Mom’s birthday", ...monthDay(5), note: "Loves pastel pink roses" });
		saveOccasion(userId, null, { title: "Our anniversary", ...monthDay(40), note: "" });
		saveOccasion(userId, null, { title: "Lola’s birthday", ...monthDay(120), note: "Something cream and simple" });
		console.log("  + 3 occasions for the demo customer");
	}
}

/** Builder prices for the starter sizes, in pesos: the smallest is free. */
const SIZE_PRICES: Record<string, number> = {
	petite: 0,
	classic: 200,
	impressive: 450,
	grand: 800,
};

/**
 * Prices the starter sizes for the bouquet builder and switches the builder
 * on, so its size step shows. Sizes staff already priced keep their price.
 */
function seedSizePrices() {
	const db = getDb();
	const update = db.query(
		"UPDATE sizes SET price_cents = $cents, updated_at = $now WHERE id = $id AND price_cents IS NULL",
	);
	let priced = 0;
	for (const [id, price] of Object.entries(SIZE_PRICES))
		priced += update.run({ id, cents: price * 100, now: new Date().toISOString() }).changes;
	console.log(
		priced
			? `  + builder prices for ${priced} ${priced === 1 ? "size" : "sizes"}`
			: "  · sizes already have builder prices",
	);
	const settings = getCustomSettings();
	if (settings.enabled) {
		console.log("  · the bouquet builder is already on");
		return;
	}
	const { saved: _saved, flowers: _flowers, wrappers: _wrappers, sizes: _sizes, ...fees } = settings;
	saveCustomSettings({ ...fees, enabled: true });
	console.log("  + switched the bouquet builder on (Admin → Custom bouquets)");
}

/**
 * The stock and pre-order cases to try in the shop, one per style. Applied
 * after the bouquets are added, and again by `db:seed:stock` to start over
 * once test orders have used them up.
 */
const STOCK_CASES: Array<{
	bouquet: string;
	style: string;
	/** What the shop should say, for the summary. */
	shows: string;
	ready: number | null;
	preorders?: { slots: number | null; days?: number; inDays?: number };
}> = [
	{ bouquet: "odette", style: "cream", shows: "2 left, then pre-order (3 days, 5 slots)", ready: 2, preorders: { slots: 5, days: 3 } },
	{ bouquet: "odette", style: "pink", shows: "Pre-order · 5 slots left, ready in 3 days", ready: 0, preorders: { slots: 5, days: 3 } },
	{ bouquet: "celeste", style: "lilac", shows: "Available · 3 left", ready: 3 },
	{ bouquet: "celeste", style: "peach", shows: "Sold out", ready: 0 },
	{ bouquet: "celeste", style: "snow", shows: "Pre-order closed", ready: 0, preorders: { slots: 0, days: 2 } },
	{ bouquet: "mirabel", style: "sunset", shows: "Pre-order · 8 slots left, ready on a set date (in 10 days)", ready: 0, preorders: { slots: 8, inDays: 10 } },
	{ bouquet: "mirabel", style: "scarlet", shows: "Pre-order, no date or limit", ready: 0, preorders: { slots: null } },
	{ bouquet: "bella", style: "ruby", shows: "Available · 1 left (the last one)", ready: 1 },
];

async function seedStockCases() {
	for (const product of demoBouquets())
		if (!getAdminProduct(product.id))
			saveProduct(null, { recipe: [], ...product.input });
	moveRecipesToBouquets(getDb());
	const update = getDb().query(
		`UPDATE bouquet_styles SET is_available = 1, stock_quantity = $ready,
		   takes_preorders = $takes, preorder_slots = $slots,
		   preorder_days = $days, preorder_date = $date
		 WHERE bouquet_id = $bouquet AND slug = $style`,
	);
	const today = shopNow().date;
	console.log("Stock and pre-order cases:");
	for (const c of STOCK_CASES) {
		const { changes } = update.run({
			bouquet: c.bouquet,
			style: c.style,
			ready: c.ready,
			takes: c.preorders ? 1 : 0,
			slots: c.preorders?.slots ?? null,
			days: c.preorders?.days ?? null,
			date: c.preorders?.inDays ? addDays(today, c.preorders.inDays) : null,
		});
		const where = `/products/${c.bouquet}?theme=${c.style}`;
		console.log(
			changes
				? `  + ${where.padEnd(34)} ${c.shows}`
				: `  ! ${where.padEnd(34)} style not found; skipped`,
		);
	}
}

async function main() {
	const db = getDb();
	// Runs the auth migrations (and seeds the .env.local owner on a fresh DB).
	const auth = await getAuth();

	if (RESET) {
		console.log("Resetting demo data…");
		db.transaction(() => {
			for (const table of [
				"order_events",
				"orders",
				"customer_addresses",
				"customer_occasions",
				// Styles, recipes and redirects go with their bouquets.
				"signature_bouquets",
				"payment_accounts",
				"session",
				"account",
				"verification",
				"user",
			]) {
				db.run(`DELETE FROM "${table}"`);
			}
		})();
		for (const kind of ["proofs", "delivery", "cancellations"]) {
			await rm(join(UPLOAD_DIR, kind), { recursive: true, force: true });
		}
		seedStarterData(db);
	}

	// ── Accounts ──────────────────────────────────────────────────────────
	const accounts = [...DEMO_ACCOUNTS];
	const envEmail = process.env.ADMIN_EMAIL;
	const envPassword = process.env.ADMIN_PASSWORD;
	if (envEmail && envPassword && envPassword.length >= 10) {
		accounts.push({ name: "Owner", email: envEmail.toLowerCase(), password: envPassword, role: "admin" });
	}
	for (const account of accounts) {
		const existing = db
			.query('SELECT id FROM "user" WHERE lower(email) = $email')
			.get({ email: account.email.toLowerCase() });
		if (existing) {
			console.log(`  · account ${account.email} already exists`);
			continue;
		}
		const { role, ...profile } = account;
		// Customers get better-auth's default role ("customer").
		await auth.api.createUser({
			body: role === "customer" ? profile : { ...profile, role },
		});
		console.log(`  + account ${account.email}`);
	}

	// ── Products ──────────────────────────────────────────────────────────
	for (const product of demoBouquets()) {
		if (getAdminProduct(product.id)) {
			console.log(`  · product ${product.input.title} already exists`);
			continue;
		}
		const id = saveProduct(null, { recipe: [], ...product.input });
		console.log(`  + product ${product.input.title} (${id})`);
	}

	// Demo styles list their flowers; what they share becomes the bouquet's.
	moveRecipesToBouquets(db);

	// ── Sizes ─────────────────────────────────────────────────────────────
	seedSizePrices();

	// ── Orders ────────────────────────────────────────────────────────────
	const { n: orderCount } = db.query("SELECT COUNT(*) AS n FROM orders").get() as {
		n: number;
	};
	const customerId = userIdFor(DEMO_CUSTOMER);
	const { n: customerOrders } = db
		.query("SELECT COUNT(*) AS n FROM orders WHERE customer_id = $id")
		.get({ id: customerId ?? "" }) as { n: number };
	// A fresh shop gets every demo order. An existing one keeps its orders and
	// only gains the demo customer's, so their account has something to track.
	const toCreate =
		orderCount === 0
			? DEMO_ORDERS
			: customerOrders === 0
				? DEMO_ORDERS.filter((demo) => demo.customer)
				: [];
	if (toCreate.length === 0) {
		console.log(
			`  · ${orderCount} orders already exist; skipping demo orders (use --reset to start over)`,
		);
	} else {
		await mkdir(join(UPLOAD_DIR, "delivery"), { recursive: true });
		let created = 0;
		for (const [index, demo] of toCreate.entries())
			if (await placeDemoOrder(demo, index, customerId)) created++;
		console.log(
			`  + ${created} demo orders${toCreate === DEMO_ORDERS ? "" : " for the demo customer"}`,
		);
	}

	await seedCustomerExtras();

	// ── Stock and pre-orders ──────────────────────────────────────────────
	// After the demo orders, so they don't use up the cases.
	await seedStockCases();

	console.log(`
Done. Staff sign in at http://localhost:3000/admin, customers at /sign-in:
${accounts.map((a) => `  ${(a.role === "admin" ? "Owner" : a.role === "user" ? "Staff" : "Customer").padEnd(8)} ${a.email.padEnd(22)} ${a.password === envPassword ? "(your .env.local password)" : a.password}`).join("\n")}
`);
}

await (ORDERS_ONLY
	? seedCatalogOrders()
	: SIZES_ONLY
		? seedSizePrices()
		: STOCK_ONLY
			? seedStockCases()
			: main());
