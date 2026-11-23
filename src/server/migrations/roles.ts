import type { Database } from "bun:sqlite";

import { STARTER_STAFF_PERMISSIONS } from "~/lib/permissions";

export const OWNER_ROLE_ID = "owner";
export const STAFF_ROLE_ID = "staff";

/**
 * Roles become something the shop manages (Admin → Roles), and a person can
 * hold more than one. Two roles to start: Owner (everything, built in) and
 * Staff (what staff could do before). Accounts move across by the role
 * better-auth kept: "admin" were owners, "user" were staff.
 *
 * The auth tables are made after ours on a new database, so there may be no
 * one to move yet: the first owner gets the Owner role when it's created.
 */
export function rolesTables(db: Database) {
	db.exec(`
		CREATE TABLE roles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			is_owner INTEGER NOT NULL DEFAULT 0,
			permissions TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE UNIQUE INDEX roles_by_name ON roles (lower(name));
		CREATE TABLE user_roles (
			user_id TEXT NOT NULL,
			role_id TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
			PRIMARY KEY (user_id, role_id)
		);
		CREATE INDEX user_roles_by_role ON user_roles (role_id);
	`);
	const now = new Date().toISOString();
	const insert = db.query(
		`INSERT INTO roles (id, name, description, is_owner, permissions, created_at, updated_at)
		 VALUES ($id, $name, $description, $isOwner, $permissions, $now, $now)`,
	);
	insert.run({
		id: OWNER_ROLE_ID,
		name: "Owner",
		description: "Can do everything, including managing staff and roles.",
		isOwner: 1,
		permissions: "[]",
		now,
	});
	insert.run({
		id: STAFF_ROLE_ID,
		name: "Staff",
		description: "Runs orders, stock and the catalog day to day.",
		isOwner: 0,
		permissions: JSON.stringify(STARTER_STAFF_PERMISSIONS),
		now,
	});
	adoptAuthRoles(db);
}

const hasAuthTables = (db: Database) =>
	Boolean(
		db
			.query(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'",
			)
			.get(),
	);

/**
 * Gives accounts from before roles theirs: better-auth "admin" → Owner,
 * "user" → Staff. Runs once, with the tables.
 */
function adoptAuthRoles(db: Database) {
	if (!hasAuthTables(db)) return;
	db.exec(`
		INSERT OR IGNORE INTO user_roles (user_id, role_id)
		  SELECT id, '${STAFF_ROLE_ID}' FROM "user" WHERE role = 'user';
	`);
	adoptAdminAccounts(db);
}

/**
 * Any better-auth "admin" account (from before roles, or made by a script)
 * becomes an Owner and a plain "user" to better-auth: that closes
 * better-auth's own admin endpoints, so Admin → Roles alone decides.
 * Safe to run any time.
 */
export function adoptAdminAccounts(db: Database) {
	if (!hasAuthTables(db)) return;
	db.exec(`
		INSERT OR IGNORE INTO user_roles (user_id, role_id)
		  SELECT id, '${OWNER_ROLE_ID}' FROM "user" WHERE role = 'admin';
		UPDATE "user" SET role = 'user' WHERE role = 'admin';
	`);
}
