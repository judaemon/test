/**
 * Fills the local database with demo data for trying out the shop and admin.
 *
 *   bun run db:seed            add demo accounts, products and orders (skips what exists)
 *   bun run db:seed --reset    wipe products, orders, payment settings and accounts first
 *
 * Safe to run while the dev server is running. Refuses to run in production.
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { priceCart } from "~/lib/pricing";
import { addDays, shopNow } from "~/lib/time";
import { getAuth } from "~/server/auth";
import {
	getAdminProduct,
	listPublicProducts,
	type ProductInput,
	saveProduct,
} from "~/server/catalog-repo";
import { getDb, seedStarterData } from "~/server/db";
import {
	createOrder,
	type NewOrder,
	reviewPayment,
	setOrderStage,
	setDeliveryPhoto,
	setRider,
} from "~/server/orders-repo";
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
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? ".data/uploads";
const RECEIPT = join(import.meta.dir, "fixtures", "sample-receipt.png");
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

const DEMO_PRODUCTS: Array<{ id: string; input: ProductInput }> = [
	{
		id: "petite-rose-posy",
		input: {
			title: "Petite Rose Posy",
			description:
				"Six hand-picked roses in a little posy, just right for a desk, a bedside table or a ‘just because’.",
			basePrice: 1499,
			isVisible: true,
			variants: [
				{
					colorName: "Blush Pink",
					sku: "ORA-POSY-BLUSH",
					colorHex: "#f2a6b8",
					price: null,
					stockQuantity: 15,
					isAvailable: true,
					images: gallery("pastel-pink"),
				},
				{
					colorName: "Ruby",
					sku: "ORA-POSY-RUBY",
					colorHex: "#a51c34",
					price: 1599,
					stockQuantity: 8,
					isAvailable: true,
					images: gallery("red-velvet"),
				},
			],
		},
	},
	{
		// Hidden: shows how a draft product looks in the admin.
		id: "grand-cream-rose-box",
		input: {
			title: "Grand Cream Rose Box",
			description:
				"Thirty-six cream roses arranged in a keepsake box. Coming soon for weddings and big days.",
			basePrice: 4999,
			isVisible: false,
			variants: [
				{
					colorName: "Ivory",
					sku: "ORA-BOX-IVORY",
					colorHex: "#f4ecd9",
					price: null,
					stockQuantity: 4,
					isAvailable: true,
					images: gallery("cream-white"),
				},
			],
		},
	},
];

type Slot = "morning" | "afternoon" | "evening";
type Method = "card" | "gcash" | "maya" | "bank";

interface DemoOrder {
	/** Delivery day relative to today (shop time). */
	day: number;
	slot: Slot;
	recipient: string;
	city: string;
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

const ROSES = "signature-rose-bouquet";
const POSY = "petite-rose-posy";

// A spread that fills every board column, payment state and filter.
const DEMO_ORDERS: DemoOrder[] = [
	{ day: -2, slot: "afternoon", recipient: "Miguel Tan", city: "Makati", items: [[ROSES, "pastel-pink", 2]], method: "card", stage: "done", placedHoursAgo: 60, customer: true },
	{ day: -1, slot: "morning", recipient: "Lea Ramos", city: "Taguig", items: [[POSY, "blush-pink", 1]], method: "maya", review: "verified", stage: "done", placedHoursAgo: 40 },
	{ day: -1, slot: "evening", recipient: "Rosa Villanueva", city: "Pasig", items: [[ROSES, "red-velvet", 1]], method: "gcash", review: "verified", stage: "making", gift: "Sorry I missed your recital. So proud of you!", placedHoursAgo: 30 },
	{ day: 0, slot: "morning", recipient: "Gina Flores", city: "Manila", items: [[ROSES, "red-velvet", 1]], method: "card", stage: "done", placedHoursAgo: 20 },
	{ day: 0, slot: "morning", recipient: "Ana Reyes", city: "Quezon City", items: [[ROSES, "red-velvet", 2]], method: "card", stage: "delivering", gift: "Happy anniversary, mahal! Ten years and counting.", placedHoursAgo: 18, customer: true },
	{ day: 0, slot: "morning", recipient: "Bea Santos", city: "Makati", items: [[ROSES, "pastel-pink", 1]], method: "gcash", review: "verified", stage: "making", gift: "Get well soon, Lola. We love you!", placedHoursAgo: 16, customer: true },
	{ day: 0, slot: "afternoon", recipient: "Carlo Mendoza", city: "Mandaluyong", items: [[ROSES, "cream-white", 1]], method: "bank", review: "verified", stage: "making", placedHoursAgo: 14 },
	{ day: 0, slot: "afternoon", recipient: "Dani Cruz", city: "Pasig", items: [[POSY, "ruby", 1]], method: "gcash", stage: "new", placedHoursAgo: 5 },
	{ day: 0, slot: "afternoon", recipient: "Mark Uy", city: "Quezon City", items: [[ROSES, "pastel-pink", 1]], method: "card", stage: "cancelled", placedHoursAgo: 12 },
	{ day: 0, slot: "evening", recipient: "Ella Garcia", city: "San Juan", items: [[ROSES, "red-velvet", 1], [POSY, "blush-pink", 1]], method: "card", stage: "new", gift: "Congratulations on the new job!", placedHoursAgo: 4 },
	{ day: 0, slot: "evening", recipient: "Felix Lim", city: "Taguig", items: [[ROSES, "pastel-pink", 1]], method: "maya", review: "rejected", stage: "new", placedHoursAgo: 6 },
	{ day: 1, slot: "morning", recipient: "Hana Aquino", city: "Quezon City", items: [[ROSES, "pastel-pink", 1]], method: "gcash", stage: "new", placedHoursAgo: 3, customer: true },
	{ day: 1, slot: "afternoon", recipient: "Ivan Bautista", city: "Makati", items: [[ROSES, "red-velvet", 3]], method: "card", stage: "new", gift: "Happy birthday, Ma! Love, Ivan and Pia", placedHoursAgo: 2 },
	{ day: 1, slot: "evening", recipient: "Joy Navarro", city: "Parañaque", items: [[POSY, "blush-pink", 2]], method: "bank", stage: "new", placedHoursAgo: 1 },
	{ day: 2, slot: "morning", recipient: "Karl Dizon", city: "Pasig", items: [[ROSES, "red-velvet", 1]], method: "card", stage: "new", placedHoursAgo: 1 },
	{ day: 3, slot: "afternoon", recipient: "Lia Morales", city: "Makati", items: [[ROSES, "cream-white", 1]], method: "maya", review: "verified", stage: "new", placedHoursAgo: 0.5 },
];

const POSTAL_CODES: Record<string, string> = {
	Makati: "1200",
	Taguig: "1630",
	Pasig: "1600",
	Manila: "1000",
	"Quezon City": "1100",
	Mandaluyong: "1550",
	"San Juan": "1500",
	Parañaque: "1700",
};

const STREETS = [
	"12 Sampaguita St",
	"88 Ilang-Ilang Ave",
	"5 Dama de Noche St",
	"21 Camia Lane",
	"7 Rosal St, Unit 3B",
	"140 Gumamela Rd",
];

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
				"variants",
				"products",
				"payment_accounts",
				"session",
				"account",
				"verification",
				"user",
			]) {
				db.run(`DELETE FROM "${table}"`);
			}
		})();
		for (const kind of ["proofs", "delivery"]) {
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
	for (const product of DEMO_PRODUCTS) {
		if (getAdminProduct(product.id)) {
			console.log(`  · product ${product.input.title} already exists`);
			continue;
		}
		const id = saveProduct(null, product.input);
		console.log(`  + product ${product.input.title} (${id})`);
	}

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
		const today = shopNow().date;
		await mkdir(join(UPLOAD_DIR, "proofs"), { recursive: true });
		await mkdir(join(UPLOAD_DIR, "delivery"), { recursive: true });
		let created = 0;
		for (const [index, demo] of toCreate.entries()) {
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
				continue;
			}

			const id = crypto.randomUUID();
			const first = demo.recipient.split(" ")[0]?.toLowerCase() ?? "guest";
			let payment: NewOrder["payment"];
			if (demo.method === "card") {
				payment = {
					method: "card",
					status: "paid",
					cardBrand: index % 2 === 0 ? "visa" : "mastercard",
					cardLast4: String(4242 + index * 37).slice(-4),
				};
			} else {
				const proofFile = `${id}.png`;
				await copyFile(RECEIPT, join(UPLOAD_DIR, "proofs", proofFile));
				payment = {
					method: demo.method,
					status: "pending",
					referenceNumber: String(1_000_000_000_000 + index * 7_654_321_987),
					proofFile,
				};
			}

			createOrder({
				id,
				cart,
				payment,
				customerId: demo.customer ? customerId : undefined,
				details: {
					email: demo.customer ? DEMO_CUSTOMER : `${first}@example.com`,
					phone: `0917 ${String(100 + index * 37).padStart(3, "0")} ${String(4000 + index * 211).slice(-4)}`,
					recipientName: demo.recipient,
					address: STREETS[index % STREETS.length] as string,
					city: demo.city,
					postalCode: POSTAL_CODES[demo.city] ?? "1000",
					deliveryDate: addDays(today, demo.day),
					deliverySlot: demo.slot,
					giftMessage: demo.gift ?? "",
				},
			});
			if (demo.review) reviewPayment(id, demo.review, REVIEWER);
			// Walk through each stage like staff would, so the timeline is complete.
			const path =
				demo.stage === "cancelled"
					? (["cancelled"] as const)
					: BOARD_STAGES.slice(1, BOARD_STAGES.indexOf(demo.stage) + 1);
			for (const stage of path) setOrderStage(id, stage);
			if (demo.stage === "delivering" || demo.stage === "done") {
				setRider(id, RIDERS[index % RIDERS.length] as (typeof RIDERS)[number]);
			}
			if (demo.stage === "done") {
				const photo = `${crypto.randomUUID()}.png`;
				await copyFile(SAMPLE_DELIVERY, join(UPLOAD_DIR, "delivery", photo));
				setDeliveryPhoto(id, photo);
			}
			backdate(id, demo.placedHoursAgo);
			created++;
		}
		console.log(
			`  + ${created} demo orders${toCreate === DEMO_ORDERS ? "" : " for the demo customer"}`,
		);
	}

	await seedCustomerExtras();

	console.log(`
Done. Staff sign in at http://localhost:3000/admin, customers at /sign-in:
${accounts.map((a) => `  ${(a.role === "admin" ? "Owner" : a.role === "user" ? "Staff" : "Customer").padEnd(8)} ${a.email.padEnd(22)} ${a.password === envPassword ? "(your .env.local password)" : a.password}`).join("\n")}
`);
}

await main();
