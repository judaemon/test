import { createStore } from "@tanstack/solid-store";

export interface CartLine {
	productId: string;
	variantId: string;
	quantity: number;
}

// Only mutated from browser event handlers, so the module-level store never
// carries state between SSR requests.
export const cartStore = createStore({ lines: [] as CartLine[] });

export function addToCart(line: CartLine) {
	cartStore.setState((state) => {
		const existing = state.lines.find(
			(l) => l.productId === line.productId && l.variantId === line.variantId,
		);
		if (!existing) return { lines: [...state.lines, line] };
		return {
			lines: state.lines.map((l) =>
				l === existing ? { ...l, quantity: l.quantity + line.quantity } : l,
			),
		};
	});
}

export function getCartCount(state: { lines: CartLine[] }) {
	return state.lines.reduce((sum, line) => sum + line.quantity, 0);
}
