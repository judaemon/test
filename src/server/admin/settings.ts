import { createServerFn } from "@tanstack/solid-start";
import { getRequestHeaders } from "@tanstack/solid-start/server";
import { PAYMENT_METHODS, PAYMENT_NOTICE_MAX } from "~/lib/payment";
import { getStaffUser, requirePermission, requireStaff } from "../admin-auth";
import { getAuth } from "../auth";
import { getDb } from "../db";
import { listPaymentAccounts, updatePaymentAccount } from "../payments-repo";
import { publicUploadUrl, saveImage, UploadError } from "../uploads";
import { asRecord, bool, InputError, imageUrl, oneOf, text } from "../validate";

/** For the admin layout's guard; null means "show the sign-in page". */
export const getAdminSession = createServerFn({ method: "GET" }).handler(() =>
	getStaffUser(),
);

/** Lets the sign-in page explain first-time setup instead of "wrong password". */
export const getAdminSetupStatus = createServerFn({ method: "GET" }).handler(
	async () => {
		await getAuth();
		const { n } = getDb().query('SELECT COUNT(*) AS n FROM "user"').get() as {
			n: number;
		};
		return { hasAccounts: n > 0 };
	},
);

export const listPaymentSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		await requirePermission("payments.view");
		return listPaymentAccounts();
	},
);

export const savePaymentAccount = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const method = oneOf(source.method, PAYMENT_METHODS, "Payment method");
		const enabled = bool(source, "enabled");
		const label = text(source, "label", { label: "Name", max: 40 });
		// Forms send line breaks as \r\n; keep them as one.
		const notice = text(
			{
				notice:
					typeof source.notice === "string"
						? source.notice.replace(/\r\n?/g, "\n")
						: "",
			},
			"notice",
			{
				label: "Warning for customers",
				max: PAYMENT_NOTICE_MAX,
				required: false,
			},
		);
		if (method === "card" || method === "cash") {
			return {
				method,
				account: {
					enabled,
					label,
					accountName: "",
					accountNumber: "",
					bankName: "",
					qrImage: "",
					steps: [],
					notice,
				},
			};
		}
		const steps = Array.isArray(source.steps)
			? source.steps
					.map((step) => (typeof step === "string" ? step.trim() : ""))
					.filter(Boolean)
			: [];
		if (steps.length > 6) throw new InputError("Keep it to 6 steps or fewer.");
		if (steps.some((step) => step.length > 160))
			throw new InputError("Keep each step under 160 characters.");
		return {
			method,
			account: {
				enabled,
				label,
				accountName: text(source, "accountName", {
					label: "Account name",
					max: 80,
					required: enabled,
				}),
				accountNumber: text(source, "accountNumber", {
					label: "Account number",
					max: 40,
					required: enabled,
				}),
				bankName: text(source, "bankName", {
					label: "Bank",
					max: 60,
					required: enabled && method === "bank",
				}),
				// Optional: without a QR, checkout shows the account details only.
				qrImage: source.qrImage ? imageUrl(source.qrImage) : "",
				steps,
				notice,
			},
		};
	})
	.handler(async ({ data }) => {
		await requirePermission("payments.manage");
		const enabledCount = listPaymentAccounts().filter(
			(account) => account.enabled && account.method !== data.method,
		).length;
		if (!data.account.enabled && enabledCount === 0)
			throw new InputError("Keep at least one payment method switched on.");
		updatePaymentAccount(data.method, data.account);
		return listPaymentAccounts();
	});

export const uploadQrImage = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const file = input.get("file");
		if (!(file instanceof File)) throw new InputError("Choose an image.");
		return file;
	})
	.handler(async ({ data }) => {
		await requirePermission("payments.manage");
		try {
			const fileName = await saveImage("payments", data);
			return { ok: true as const, url: publicUploadUrl("payments", fileName) };
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false as const, message: error.message };
			throw error;
		}
	});

const authHeaders = () => new Headers(getRequestHeaders() as HeadersInit);

const newPasswordFrom = (source: Record<string, unknown>) => {
	const password =
		typeof source.newPassword === "string" ? source.newPassword : "";
	if (password.length < 10)
		throw new InputError("Use a password with at least 10 characters.");
	if (password.length > 128) throw new InputError("That password is too long.");
	return password;
};

/** Anyone on staff changes their own password; other devices get signed out. */
export const changeMyPassword = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const currentPassword =
			typeof source.currentPassword === "string" ? source.currentPassword : "";
		if (!currentPassword) throw new InputError("Enter your current password.");
		return { currentPassword, newPassword: newPasswordFrom(source) };
	})
	.handler(async ({ data }) => {
		await requireStaff();
		const auth = await getAuth();
		try {
			await auth.api.changePassword({
				headers: authHeaders(),
				body: { ...data, revokeOtherSessions: true },
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			throw new InputError(
				/invalid|incorrect/i.test(message)
					? "Your current password isn’t right."
					: "Couldn’t change your password. Please try again.",
			);
		}
		return { ok: true as const };
	});
