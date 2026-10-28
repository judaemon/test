import {
	MAX_ADDRESSES,
	MAX_OCCASIONS,
	type Occasion,
	type OccasionInput,
	type SavedAddress,
	type SavedAddressInput,
} from "~/types/account";
import { getDb, nowIso } from "./db";

// Every query is scoped by user_id, so one customer can never read or change
// another's data, even with a guessed id.

export class AccountRuleError extends Error {}

interface AddressRow {
	id: string;
	label: string;
	recipient_name: string;
	address: string;
	city: string;
	postal_code: string;
	is_default: number;
}

const toAddress = (row: AddressRow): SavedAddress => ({
	id: row.id,
	label: row.label,
	recipientName: row.recipient_name,
	address: row.address,
	city: row.city,
	postalCode: row.postal_code,
	isDefault: row.is_default === 1,
});

export function listAddresses(userId: string): SavedAddress[] {
	return (
		getDb()
			.query(
				"SELECT * FROM customer_addresses WHERE user_id = $userId ORDER BY is_default DESC, created_at",
			)
			.all({ userId }) as AddressRow[]
	).map(toAddress);
}

/** Creates (no id) or updates an address. The first one becomes the default. */
export function saveAddress(
	userId: string,
	id: string | null,
	input: SavedAddressInput,
): SavedAddress[] {
	const db = getDb();
	db.transaction(() => {
		const existing = listAddresses(userId);
		const now = nowIso();
		const makeDefault = input.isDefault || existing.length === 0;
		if (makeDefault) {
			db.query(
				"UPDATE customer_addresses SET is_default = 0 WHERE user_id = $userId",
			).run({ userId });
		}
		const values = {
			userId,
			label: input.label,
			recipientName: input.recipientName,
			address: input.address,
			city: input.city,
			postalCode: input.postalCode,
			isDefault: makeDefault ? 1 : 0,
			now,
		};
		if (id === null) {
			if (existing.length >= MAX_ADDRESSES)
				throw new AccountRuleError(
					`You can save up to ${MAX_ADDRESSES} addresses.`,
				);
			db.query(
				`INSERT INTO customer_addresses (id, user_id, label, recipient_name, address, city, postal_code, is_default, created_at, updated_at)
				 VALUES ($id, $userId, $label, $recipientName, $address, $city, $postalCode, $isDefault, $now, $now)`,
			).run({ ...values, id: crypto.randomUUID() });
		} else {
			const result = db
				.query(
					`UPDATE customer_addresses SET label = $label, recipient_name = $recipientName, address = $address,
					 city = $city, postal_code = $postalCode, is_default = $isDefault, updated_at = $now
					 WHERE id = $id AND user_id = $userId`,
				)
				.run({ ...values, id });
			if (result.changes === 0)
				throw new AccountRuleError("Address not found.");
		}
	})();
	return listAddresses(userId);
}

export function deleteAddress(userId: string, id: string): SavedAddress[] {
	const db = getDb();
	db.transaction(() => {
		const removed = listAddresses(userId).find((address) => address.id === id);
		if (!removed) throw new AccountRuleError("Address not found.");
		db.query(
			"DELETE FROM customer_addresses WHERE id = $id AND user_id = $userId",
		).run({ id, userId });
		// Keep exactly one default while any address remains.
		if (removed.isDefault) {
			db.query(
				`UPDATE customer_addresses SET is_default = 1 WHERE id = (
				   SELECT id FROM customer_addresses WHERE user_id = $userId ORDER BY created_at LIMIT 1)`,
			).run({ userId });
		}
	})();
	return listAddresses(userId);
}

interface OccasionRow {
	id: string;
	title: string;
	month: number;
	day: number;
	note: string;
}

export function listOccasions(userId: string): Occasion[] {
	return getDb()
		.query(
			"SELECT id, title, month, day, note FROM customer_occasions WHERE user_id = $userId ORDER BY month, day",
		)
		.all({ userId }) as OccasionRow[];
}

export function saveOccasion(
	userId: string,
	id: string | null,
	input: OccasionInput,
): Occasion[] {
	const db = getDb();
	if (id === null) {
		if (listOccasions(userId).length >= MAX_OCCASIONS)
			throw new AccountRuleError(
				`You can save up to ${MAX_OCCASIONS} occasions.`,
			);
		db.query(
			`INSERT INTO customer_occasions (id, user_id, title, month, day, note, created_at)
			 VALUES ($id, $userId, $title, $month, $day, $note, $now)`,
		).run({ id: crypto.randomUUID(), userId, ...input, now: nowIso() });
	} else {
		const result = db
			.query(
				`UPDATE customer_occasions SET title = $title, month = $month, day = $day, note = $note
				 WHERE id = $id AND user_id = $userId`,
			)
			.run({ id, userId, ...input });
		if (result.changes === 0) throw new AccountRuleError("Occasion not found.");
	}
	return listOccasions(userId);
}

export function deleteOccasion(userId: string, id: string): Occasion[] {
	const result = getDb()
		.query(
			"DELETE FROM customer_occasions WHERE id = $id AND user_id = $userId",
		)
		.run({ id, userId });
	if (result.changes === 0) throw new AccountRuleError("Occasion not found.");
	return listOccasions(userId);
}
