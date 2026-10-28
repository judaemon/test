import { createServerFn } from "@tanstack/solid-start";
import { getRequestHeaders } from "@tanstack/solid-start/server";
import { PAYMENT_METHODS } from "~/lib/payment";
import { getStaffUser, requireOwner } from "../admin-auth";
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
		await requireOwner();
		return listPaymentAccounts();
	},
);

export const savePaymentAccount = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const method = oneOf(source.method, PAYMENT_METHODS, "Payment method");
		const enabled = bool(source, "enabled");
		const label = text(source, "label", { label: "Name", max: 40 });
		if (method === "card") {
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
				qrImage: enabled || source.qrImage ? imageUrl(source.qrImage) : "",
				steps,
			},
		};
	})
	.handler(async ({ data }) => {
		await requireOwner();
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
		await requireOwner();
		try {
			const fileName = await saveImage("payments", data);
			return { ok: true as const, url: publicUploadUrl("payments", fileName) };
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false as const, message: error.message };
			throw error;
		}
	});

export interface StaffMember {
	id: string;
	name: string;
	email: string;
	role: "owner" | "staff";
	createdAt: string;
}

const authHeaders = () => new Headers(getRequestHeaders() as HeadersInit);

export const listStaff = createServerFn({ method: "GET" }).handler(
	async (): Promise<StaffMember[]> => {
		await requireOwner();
		const auth = await getAuth();
		const result = await auth.api.listUsers({
			headers: authHeaders(),
			query: {
				limit: 200,
				sortBy: "createdAt",
				sortDirection: "asc",
				// Customers share the user table; leave them out.
				filterField: "role",
				filterOperator: "ne",
				filterValue: "customer",
			},
		});
		return result.users
			.filter((user) => user.role === "admin" || user.role === "user")
			.map((user) => ({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role === "admin" ? "owner" : "staff",
				createdAt: new Date(user.createdAt).toISOString(),
			}));
	},
);

export const createStaff = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const email = text(source, "email", {
			label: "Email",
			max: 254,
		}).toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
			throw new InputError("That email doesn’t look right.");
		const password = typeof source.password === "string" ? source.password : "";
		if (password.length < 10)
			throw new InputError("Use a password with at least 10 characters.");
		if (password.length > 128)
			throw new InputError("That password is too long.");
		return {
			name: text(source, "name", { label: "Name", max: 80 }),
			email,
			password,
			role: oneOf(source.role, ["owner", "staff"] as const, "Role"),
		};
	})
	.handler(async ({ data }) => {
		await requireOwner();
		const auth = await getAuth();
		try {
			await auth.api.createUser({
				headers: authHeaders(),
				body: {
					name: data.name,
					email: data.email,
					password: data.password,
					role: data.role === "owner" ? "admin" : "user",
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			throw new InputError(
				/exist/i.test(message)
					? "Someone already uses that email."
					: "Couldn’t add that person. Please try again.",
			);
		}
		return { ok: true as const };
	});

export const removeStaff = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		userId: text(asRecord(input), "userId", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const owner = await requireOwner();
		if (data.userId === owner.id)
			throw new InputError("You can’t remove your own account.");
		const target = getDb()
			.query('SELECT role FROM "user" WHERE id = $id')
			.get({ id: data.userId }) as { role: string | null } | null;
		if (target?.role !== "admin" && target?.role !== "user")
			throw new InputError("That account isn’t a staff member.");
		const auth = await getAuth();
		await auth.api.removeUser({
			headers: authHeaders(),
			body: { userId: data.userId },
		});
		return { ok: true as const };
	});
