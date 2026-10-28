import type { PaymentMethod } from "~/lib/payment";
import type { PaymentAccount } from "~/types/payment";
import { getDb, nowIso } from "./db";

interface AccountRow {
	method: PaymentMethod;
	enabled: number;
	label: string;
	account_name: string;
	account_number: string;
	bank_name: string;
	qr_image: string;
	steps: string;
}

const toAccount = (row: AccountRow): PaymentAccount => ({
	method: row.method,
	enabled: row.enabled === 1,
	label: row.label,
	accountName: row.account_name,
	accountNumber: row.account_number,
	bankName: row.bank_name,
	qrImage: row.qr_image,
	steps: JSON.parse(row.steps) as string[],
});

export function listPaymentAccounts(): PaymentAccount[] {
	return (
		getDb()
			.query("SELECT * FROM payment_accounts ORDER BY sort")
			.all() as AccountRow[]
	).map(toAccount);
}

export function getPaymentAccount(method: PaymentMethod) {
	return listPaymentAccounts().find((account) => account.method === method);
}

export type PaymentAccountInput = Omit<PaymentAccount, "method">;

export function updatePaymentAccount(
	method: PaymentMethod,
	input: PaymentAccountInput,
) {
	const result = getDb()
		.query(
			`UPDATE payment_accounts SET enabled = $enabled, label = $label, account_name = $accountName,
			 account_number = $accountNumber, bank_name = $bankName, qr_image = $qrImage,
			 steps = $steps, updated_at = $now WHERE method = $method`,
		)
		.run({
			method,
			enabled: input.enabled ? 1 : 0,
			label: input.label,
			accountName: input.accountName,
			accountNumber: input.accountNumber,
			bankName: input.bankName,
			qrImage: input.qrImage,
			steps: JSON.stringify(input.steps),
			now: nowIso(),
		});
	if (result.changes === 0) throw new Error("Payment method not found");
}
