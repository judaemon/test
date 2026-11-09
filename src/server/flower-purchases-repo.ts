import { getDb, nowIso } from "./db";

export const PURCHASE_STATUSES = ["ordered", "bought"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Whether staff have ordered or bought one flower and color, and who said so. */
export interface FlowerPurchase {
	/** The battalion filter it was marked under: "all", "1/2 Battalion", … */
	scope: string;
	/** `flowerKey()` of the flower and color. */
	flowerKey: string;
	status: PurchaseStatus;
	updatedBy: string;
	updatedAt: string;
}

interface PurchaseRow {
	scope: string;
	flower_key: string;
	status: PurchaseStatus;
	updated_by: string;
	updated_at: string;
}

export function listFlowerPurchases(): FlowerPurchase[] {
	return (
		getDb().query("SELECT * FROM flower_purchases").all() as PurchaseRow[]
	).map((row) => ({
		scope: row.scope,
		flowerKey: row.flower_key,
		status: row.status,
		updatedBy: row.updated_by,
		updatedAt: row.updated_at,
	}));
}

/** Marks a flower ordered or bought; null puts it back to not yet. */
export function setFlowerPurchase(
	scope: string,
	flowerKey: string,
	status: PurchaseStatus | null,
	updatedBy: string,
) {
	if (!status) {
		getDb()
			.query(
				"DELETE FROM flower_purchases WHERE scope = $scope AND flower_key = $flowerKey",
			)
			.run({ scope, flowerKey });
		return;
	}
	getDb()
		.query(
			`INSERT INTO flower_purchases (scope, flower_key, status, updated_by, updated_at)
			 VALUES ($scope, $flowerKey, $status, $updatedBy, $now)
			 ON CONFLICT (scope, flower_key) DO UPDATE SET
			   status = excluded.status,
			   updated_by = excluded.updated_by,
			   updated_at = excluded.updated_at`,
		)
		.run({ scope, flowerKey, status, updatedBy, now: nowIso() });
}
