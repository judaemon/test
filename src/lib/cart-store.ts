import { createStore } from "@tanstack/solid-store";
import { createSignal } from "solid-js";

import { type CartLine, sanitizeCartLines } from "~/lib/pricing";

export type { CartLine } from "~/lib/pricing";

interface CartState {
	lines: CartLine[];
	/** False until the saved bag has been read from localStorage. */
	hydrated: boolean;
}

const STORAGE_KEY = "oraia:cart:v1";

// Only mutated from browser code, so the module-level store never carries
// state between SSR requests.
export const cartStore = createStore<CartState>({ lines: [], hydrated: false });

const [isCartOpen, setCartOpen] = createSignal(false);
export { isCartOpen, setCartOpen };

const sameLine = (a: CartLine, productId: string, variantId: string) =>
	a.productId === productId && a.variantId === variantId;

function setLines(update: (lines: CartLine[]) => CartLine[]) {
	cartStore.setState((state) => ({ ...state, lines: update(state.lines) }));
}

export function getLineQuantity(
	lines: CartLine[],
	productId: string,
	variantId: string,
) {
	return lines.find((l) => sameLine(l, productId, variantId))?.quantity ?? 0;
}

/**
 * Adds units to the bag without exceeding `limit` (the variant's max per bag).
 * Returns how many units were actually added.
 */
export function addToCart(line: CartLine, limit: number): number {
	const current = getLineQuantity(
		cartStore.state.lines,
		line.productId,
		line.variantId,
	);
	const added = Math.max(0, Math.min(line.quantity, limit - current));
	if (added === 0) return 0;
	setLines((lines) =>
		current === 0
			? [...lines, { ...line, quantity: added }]
			: lines.map((l) =>
					sameLine(l, line.productId, line.variantId)
						? { ...l, quantity: l.quantity + added }
						: l,
				),
	);
	return added;
}

/** Sets a line's quantity (clamped to `limit`); 0 or less removes it. */
export function setLineQuantity(
	productId: string,
	variantId: string,
	quantity: number,
	limit: number,
) {
	if (quantity <= 0) return removeFromCart(productId, variantId);
	const clamped = Math.min(quantity, limit);
	if (clamped <= 0) return removeFromCart(productId, variantId);
	setLines((lines) =>
		lines.map((l) =>
			sameLine(l, productId, variantId) ? { ...l, quantity: clamped } : l,
		),
	);
}

export function removeFromCart(productId: string, variantId: string) {
	setLines((lines) => lines.filter((l) => !sameLine(l, productId, variantId)));
}

export function clearCart() {
	setLines(() => []);
}

function readSavedLines(): CartLine[] {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		// Items the catalog no longer carries are dropped when the bag is priced.
		return raw ? sanitizeCartLines(JSON.parse(raw)) : [];
	} catch {
		return [];
	}
}

function writeSavedLines(lines: CartLine[]) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
	} catch {
		// Storage can be full or blocked (private mode); the bag still works for this visit.
	}
}

/**
 * Restores the saved bag and keeps localStorage (and other open tabs) in sync.
 * Call once on the client after hydration; returns a cleanup function.
 */
export function startCartPersistence() {
	cartStore.setState(() => ({ lines: readSavedLines(), hydrated: true }));

	let lastWritten = JSON.stringify(cartStore.state.lines);
	const subscription = cartStore.subscribe((state) => {
		const serialized = JSON.stringify(state.lines);
		if (serialized === lastWritten) return;
		lastWritten = serialized;
		writeSavedLines(state.lines);
	});

	const handleStorage = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEY) return;
		const lines = readSavedLines();
		lastWritten = JSON.stringify(lines);
		cartStore.setState((state) => ({ ...state, lines }));
	};
	window.addEventListener("storage", handleStorage);

	return () => {
		subscription.unsubscribe();
		window.removeEventListener("storage", handleStorage);
	};
}
