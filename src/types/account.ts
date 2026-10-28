/** A signed-in shopper (staff can shop too; `isStaff` is informational only). */
export interface SessionUser {
	id: string;
	name: string;
	email: string;
	isStaff: boolean;
}

export interface SavedAddress {
	id: string;
	/** e.g. "Home", "Mom's place". */
	label: string;
	recipientName: string;
	address: string;
	city: string;
	postalCode: string;
	isDefault: boolean;
}

export type SavedAddressInput = Omit<SavedAddress, "id">;

/** A yearly date worth remembering, like a birthday or anniversary. */
export interface Occasion {
	id: string;
	title: string;
	month: number;
	day: number;
	note: string;
}

export type OccasionInput = Omit<Occasion, "id">;

export const MAX_ADDRESSES = 10;
export const MAX_OCCASIONS = 30;
