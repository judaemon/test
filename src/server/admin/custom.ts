import { createServerFn } from "@tanstack/solid-start";

import { type CustomBouquetSettings, PESO_BILLS } from "~/lib/custom-bouquet";
import { requireStaff } from "../admin-auth";
import {
	checkBuilderCanSell,
	getCustomSettings,
	saveCustomSettings,
} from "../custom-repo";
import { asRecord, bool, InputError, integer, price } from "../validate";

export const getCustomSettingsAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return getCustomSettings();
	},
);

type SaveInput = Omit<CustomBouquetSettings, "saved" | "flowers" | "wrappers">;

export const saveCustomSettingsFn = createServerFn({ method: "POST" })
	.validator((input: unknown): SaveInput => {
		const source = asRecord(input);
		const rawMoney = asRecord(source.money ?? {});
		const denominations = PESO_BILLS.filter(
			(bill) =>
				Array.isArray(rawMoney.denominations) &&
				rawMoney.denominations.includes(bill),
		);
		const money = {
			enabled: bool(rawMoney, "enabled"),
			feePerBill: price(rawMoney, "feePerBill", "Fee per bill"),
			denominations,
			maxBills: integer(rawMoney, "maxBills", {
				label: "Most bills per bouquet",
				min: 1,
				max: 500,
			}),
		};
		if (money.enabled && denominations.length === 0)
			throw new InputError(
				"Pick at least one bill for money bouquets, or switch them off.",
			);
		return {
			enabled: bool(source, "enabled"),
			baseFee: price(source, "baseFee", "Base fee"),
			money,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		checkBuilderCanSell({ ...getCustomSettings(), ...data });
		return saveCustomSettings(data);
	});
