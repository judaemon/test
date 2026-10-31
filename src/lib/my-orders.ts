const KEY = "oraia-my-orders";

/** Order number → private order id, for orders placed on this device. */
function read(): Record<string, string> {
	try {
		const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		return stored && typeof stored === "object" ? stored : {};
	} catch {
		return {};
	}
}

/** Lets a guest come back to this order from Active orders without an account. */
export function rememberOrder(number: string, id: string) {
	try {
		localStorage.setItem(KEY, JSON.stringify({ ...read(), [number]: id }));
	} catch {
		// Storage can be blocked; the shopper can still sign in to pay.
	}
}

export function rememberedOrderId(number: string): string | undefined {
	return read()[number];
}
