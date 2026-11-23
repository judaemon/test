import {
	ALL_PERMISSIONS,
	isPermission,
	type Permission,
	type RoleRef,
	withNeeds,
} from "~/lib/permissions";
import { getDb, nowIso } from "./db";
import { OWNER_ROLE_ID } from "./migrations/roles";

export { OWNER_ROLE_ID };

export interface Role {
	id: string;
	name: string;
	description: string;
	/** The built-in Owner role: every permission, now and later. Can't change. */
	isOwner: boolean;
	/** What it allows; for Owner, every permission. */
	permissions: Permission[];
	createdAt: string;
	updatedAt: string;
}

export interface RoleWithMembers extends Role {
	members: { id: string; name: string; email: string }[];
}

interface RoleRow {
	id: string;
	name: string;
	description: string;
	is_owner: number;
	permissions: string;
	created_at: string;
	updated_at: string;
}

function parsePermissions(json: string): Permission[] {
	try {
		const list = JSON.parse(json);
		return Array.isArray(list) ? withNeeds(list.filter(isPermission)) : [];
	} catch {
		return [];
	}
}

const toRole = (row: RoleRow): Role => ({
	id: row.id,
	name: row.name,
	description: row.description,
	isOwner: row.is_owner === 1,
	permissions:
		row.is_owner === 1 ? ALL_PERMISSIONS : parsePermissions(row.permissions),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

/** Staff accounts only: customers never hold a role, even if a row says so. */
const STAFF_USER = `u.role IN ('user', 'admin') AND coalesce(u.banned, 0) = 0`;

function membersByRole() {
	const rows = getDb()
		.query(
			`SELECT ur.role_id AS roleId, u.id, u.name, u.email
			   FROM user_roles ur JOIN "user" u ON u.id = ur.user_id
			  WHERE ${STAFF_USER}
			  ORDER BY lower(u.name)`,
		)
		.all() as { roleId: string; id: string; name: string; email: string }[];
	const map = new Map<string, RoleWithMembers["members"]>();
	for (const row of rows) {
		const list = map.get(row.roleId) ?? [];
		list.push({ id: row.id, name: row.name, email: row.email });
		map.set(row.roleId, list);
	}
	return map;
}

/** Owner first, then the rest by name. */
export function listRoles(): RoleWithMembers[] {
	const members = membersByRole();
	return (
		getDb()
			.query("SELECT * FROM roles ORDER BY is_owner DESC, lower(name)")
			.all() as RoleRow[]
	).map((row) => ({ ...toRole(row), members: members.get(row.id) ?? [] }));
}

export function getRole(id: string): RoleWithMembers | null {
	const row = getDb()
		.query("SELECT * FROM roles WHERE id = $id")
		.get({ id }) as RoleRow | null;
	if (!row) return null;
	return { ...toRole(row), members: membersByRole().get(id) ?? [] };
}

export function roleNameTaken(name: string, exceptId: string | null) {
	return Boolean(
		getDb()
			.query(
				"SELECT 1 FROM roles WHERE lower(name) = lower($name) AND id IS NOT $id",
			)
			.get({ name, id: exceptId }),
	);
}

export interface RoleInput {
	name: string;
	description: string;
	permissions: Permission[];
}

/** Adds a role (id null) or changes one; never the Owner role. */
export function saveRole(id: string | null, input: RoleInput): Role | null {
	const db = getDb();
	const now = nowIso();
	const permissions = JSON.stringify(withNeeds(input.permissions));
	if (!id) {
		const newId = crypto.randomUUID();
		db.query(
			`INSERT INTO roles (id, name, description, is_owner, permissions, created_at, updated_at)
			 VALUES ($id, $name, $description, 0, $permissions, $now, $now)`,
		).run({
			id: newId,
			name: input.name,
			description: input.description,
			permissions,
			now,
		});
		return getRole(newId);
	}
	const changed = db
		.query(
			`UPDATE roles SET name = $name, description = $description,
			   permissions = $permissions, updated_at = $now
			 WHERE id = $id AND is_owner = 0`,
		)
		.run({
			id,
			name: input.name,
			description: input.description,
			permissions,
			now,
		});
	return changed.changes ? getRole(id) : null;
}

/** Takes the role from everyone who had it. Never the Owner role. */
export function deleteRole(id: string) {
	return (
		getDb()
			.query("DELETE FROM roles WHERE id = $id AND is_owner = 0")
			.run({ id }).changes > 0
	);
}

/** A person's roles, Owner first. */
export function rolesOfUser(userId: string): Role[] {
	return (
		getDb()
			.query(
				`SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id = r.id
				  WHERE ur.user_id = $userId
				  ORDER BY r.is_owner DESC, lower(r.name)`,
			)
			.all({ userId }) as RoleRow[]
	).map(toRole);
}

/** Every staff member's roles, for the Staff list. */
export function rolesByUser(): Map<string, Role[]> {
	const rows = getDb()
		.query(
			`SELECT ur.user_id AS userId, r.* FROM roles r
			   JOIN user_roles ur ON ur.role_id = r.id
			  ORDER BY r.is_owner DESC, lower(r.name)`,
		)
		.all() as (RoleRow & { userId: string })[];
	const map = new Map<string, Role[]>();
	for (const row of rows) {
		const list = map.get(row.userId) ?? [];
		list.push(toRole(row));
		map.set(row.userId, list);
	}
	return map;
}

/** Replaces a person's roles; unknown ids are skipped. */
export function setUserRoles(userId: string, roleIds: string[]) {
	const db = getDb();
	db.transaction(() => {
		db.query("DELETE FROM user_roles WHERE user_id = $userId").run({ userId });
		const insert = db.query(
			`INSERT OR IGNORE INTO user_roles (user_id, role_id)
			 SELECT $userId, id FROM roles WHERE id = $roleId`,
		);
		for (const roleId of new Set(roleIds)) insert.run({ userId, roleId });
	})();
}

export function clearUserRoles(userId: string) {
	getDb()
		.query("DELETE FROM user_roles WHERE user_id = $userId")
		.run({ userId });
}

/** Staff accounts that hold the Owner role. */
export function ownerIds(): string[] {
	return (
		getDb()
			.query(
				`SELECT u.id FROM "user" u JOIN user_roles ur ON ur.user_id = u.id
				  WHERE ur.role_id = $owner AND ${STAFF_USER}`,
			)
			.all({ owner: OWNER_ROLE_ID }) as { id: string }[]
	).map((row) => row.id);
}

export interface UserAccess {
	roles: RoleRef[];
	isOwner: boolean;
	/** Everything their roles allow together. */
	permissions: Permission[];
}

/** What someone's roles add up to. */
export function accessOf(roles: Role[]): UserAccess {
	const isOwner = roles.some((role) => role.isOwner);
	return {
		roles: roles.map((role) => ({
			id: role.id,
			name: role.name,
			isOwner: role.isOwner,
		})),
		isOwner,
		permissions: isOwner
			? ALL_PERMISSIONS
			: withNeeds(roles.flatMap((role) => role.permissions)),
	};
}

export const accessOfUser = (userId: string) => accessOf(rolesOfUser(userId));
