import { type BetterAuthOptions, betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start/solid";

import { getDb } from "./db";

/**
 * One account system, three roles:
 *  - "customer": anyone who signs up on the shop (the default role).
 *  - "user":     staff, created by an owner from Admin → Staff.
 *  - "admin":    owner, full access. The first is seeded from ADMIN_EMAIL /
 *                ADMIN_PASSWORD.
 * Only "user" and "admin" can reach the admin (see admin-auth.ts). Sign-ups
 * can't choose their role: the admin plugin marks `role` as input: false.
 */
const options = {
	database: getDb(),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 10,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
	// Must stay last so it can set cookies for every other plugin's responses.
	plugins: [admin({ defaultRole: "customer" }), tanstackStartCookies()],
} satisfies BetterAuthOptions;

const createAuth = () => betterAuth(options);
export type Auth = ReturnType<typeof createAuth>;

let authPromise: Promise<Auth> | undefined;

/**
 * Migrates the auth tables *before* constructing better-auth (it checks the
 * schema on start-up), then seeds the owner account on first run.
 */
export function getAuth() {
	authPromise ??= (async () => {
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
		const auth = createAuth();
		await seedOwner(auth);
		return auth;
	})();
	return authPromise;
}

async function seedOwner(auth: Auth) {
	const { n } = getDb().query('SELECT COUNT(*) AS n FROM "user"').get() as {
		n: number;
	};
	if (n > 0) return;
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;
	if (!email || !password) {
		console.warn(
			"[oraia] No admin accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the owner account.",
		);
		return;
	}
	if (password.length < options.emailAndPassword.minPasswordLength) {
		console.error(
			`[oraia] ADMIN_PASSWORD must be at least ${options.emailAndPassword.minPasswordLength} characters. Owner account not created.`,
		);
		return;
	}
	try {
		// Called without request headers, so the admin plugin allows it.
		await auth.api.createUser({
			body: { email, password, name: "Owner", role: "admin" },
		});
		console.info(`[oraia] Created owner account ${email}.`);
	} catch (error) {
		// Never let a bad seed value take sign-in down for everyone.
		console.error("[oraia] Couldn’t create the owner account:", error);
	}
}
