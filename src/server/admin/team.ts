import { createServerFn } from "@tanstack/solid-start";

import type { ActivityChange } from "~/lib/activity-log";
import {
	ALL_PERMISSIONS,
	can,
	isPermission,
	type Permission,
	permissionInfo,
	withNeeds,
} from "~/lib/permissions";
import { writeActivity } from "../activity-log-repo";
import {
	isStaffAuthRole,
	requirePermission,
	type StaffUser,
} from "../admin-auth";
import { getAuth } from "../auth";
import { getDb } from "../db";
import { staffActor } from "../order-actor";
import {
	accessOf,
	accessOfUser,
	clearUserRoles,
	deleteRole,
	getRole,
	listRoles,
	ownerIds,
	type Role,
	type RoleWithMembers,
	roleNameTaken,
	rolesByUser,
	rolesOfUser,
	saveRole,
	setUserRoles,
} from "../roles-repo";
import { asRecord, InputError, text } from "../validate";

// ── Who can hand out what ────────────────────────────────────────────────
// Nobody can give more than they have: a role's permissions, or a person's,
// must all be ones the one changing them holds. Owners hold everything, and
// only an owner can give or take the Owner role.

const missingFrom = (actor: StaffUser, permissions: Permission[]) =>
	actor.isOwner ? [] : permissions.filter((key) => !can(actor, key));

function cantGiveMessage(missing: Permission[], what: string) {
	const names = missing
		.slice(0, 3)
		.map((key) => `“${permissionInfo(key).label}”`)
		.join(", ");
	const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
	return `${what} can do things you can’t (${names}${more}). Ask an owner.`;
}

/** Whether `actor` may hand this role out or take it away. */
const canHandOut = (actor: StaffUser, role: Role) =>
	role.isOwner
		? actor.isOwner
		: missingFrom(actor, role.permissions).length === 0;

/** Whether `actor` may change this person: they can't do more than the actor. */
function canManagePerson(actor: StaffUser, targetId: string) {
	if (actor.isOwner) return true;
	const target = accessOfUser(targetId);
	return !target.isOwner && missingFrom(actor, target.permissions).length === 0;
}

// ── Staff ────────────────────────────────────────────────────────────────

export interface StaffRoleChip {
	id: string;
	name: string;
	isOwner: boolean;
}

export interface StaffMember {
	id: string;
	name: string;
	email: string;
	createdAt: string;
	roles: StaffRoleChip[];
	isOwner: boolean;
	/** How many permissions their roles add up to. */
	permissionCount: number;
	/** Whether the person asking may change them. */
	canManage: boolean;
}

interface StaffRow {
	id: string;
	name: string;
	email: string;
	createdAt: string | number;
	role: string | null;
}

const isoDate = (value: string | number) => {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

function staffRows(): StaffRow[] {
	return getDb()
		.query(
			`SELECT id, name, email, createdAt, role FROM "user"
			  WHERE role IN ('user', 'admin') AND coalesce(banned, 0) = 0
			  ORDER BY createdAt`,
		)
		.all() as StaffRow[];
}

function staffRow(userId: string): StaffRow | null {
	const row = getDb()
		.query(
			`SELECT id, name, email, createdAt, role FROM "user"
			  WHERE id = $id AND coalesce(banned, 0) = 0`,
		)
		.get({ id: userId }) as StaffRow | null;
	return row && isStaffAuthRole(row.role) ? row : null;
}

function toMember(actor: StaffUser, row: StaffRow, roles: Role[]): StaffMember {
	const access = accessOf(roles);
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		createdAt: isoDate(row.createdAt),
		roles: access.roles,
		isOwner: access.isOwner,
		permissionCount: access.permissions.length,
		canManage:
			actor.isOwner ||
			(!access.isOwner && missingFrom(actor, access.permissions).length === 0),
	};
}

export const listStaff = createServerFn({ method: "GET" }).handler(
	async (): Promise<StaffMember[]> => {
		const actor = await requirePermission("staff.view");
		const roles = rolesByUser();
		return staffRows().map((row) =>
			toMember(actor, row, roles.get(row.id) ?? []),
		);
	},
);

export interface RoleOption {
	id: string;
	name: string;
	description: string;
	isOwner: boolean;
	permissions: Permission[];
	/** Whether the person asking may give or take this role. */
	canHandOut: boolean;
}

const toOption = (actor: StaffUser, role: Role): RoleOption => ({
	id: role.id,
	name: role.name,
	description: role.description,
	isOwner: role.isOwner,
	permissions: role.permissions,
	canHandOut: canHandOut(actor, role),
});

/** The roles to pick from when adding someone. */
export const listRoleOptions = createServerFn({ method: "GET" }).handler(
	async (): Promise<RoleOption[]> => {
		const actor = await requirePermission("staff.manage");
		return listRoles().map((role) => toOption(actor, role));
	},
);

export interface StaffDetail {
	member: StaffMember;
	/** Every role, to tick theirs. */
	roles: RoleOption[];
	/** Whether they're the only owner left. */
	lastOwner: boolean;
}

export const getStaffMember = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }): Promise<StaffDetail | null> => {
		const actor = await requirePermission("staff.view");
		const row = staffRow(data);
		if (!row) return null;
		const member = toMember(actor, row, rolesOfUser(data));
		const owners = ownerIds();
		return {
			member,
			roles: listRoles().map((role) => toOption(actor, role)),
			lastOwner: member.isOwner && owners.length === 1 && owners[0] === data,
		};
	});

const emailFrom = (source: Record<string, unknown>) => {
	const email = text(source, "email", {
		label: "Email",
		max: 254,
	}).toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		throw new InputError("That email doesn’t look right.");
	return email;
};

const newPasswordFrom = (source: Record<string, unknown>, key: string) => {
	const password =
		typeof source[key] === "string" ? (source[key] as string) : "";
	if (password.length < 10)
		throw new InputError("Use a password with at least 10 characters.");
	if (password.length > 128) throw new InputError("That password is too long.");
	return password;
};

const roleIdsFrom = (value: unknown) =>
	Array.isArray(value)
		? [
				...new Set(value.filter((id): id is string => typeof id === "string")),
			].slice(0, 50)
		: [];

/** Checks the actor may hand out every role being added or taken away. */
function checkRoleChange(
	actor: StaffUser,
	before: string[],
	after: string[],
): Role[] {
	const roles = new Map(listRoles().map((role) => [role.id, role]));
	const unknown = after.find((id) => !roles.has(id));
	if (unknown)
		throw new InputError(
			"One of those roles was deleted. Refresh and try again.",
		);
	const changed = [
		...after.filter((id) => !before.includes(id)),
		...before.filter((id) => !after.includes(id)),
	];
	for (const id of changed) {
		const role = roles.get(id);
		if (!role) continue;
		if (role.isOwner && !actor.isOwner)
			throw new InputError("Only an owner can give or take the Owner role.");
		const missing = missingFrom(actor, role.permissions);
		if (missing.length)
			throw new InputError(cantGiveMessage(missing, `The ${role.name} role`));
	}
	return after.map((id) => roles.get(id) as Role);
}

const roleNames = (roles: Role[]) =>
	roles.map((role) => role.name).join(", ") || "None";

export const createStaff = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			name: text(source, "name", { label: "Name", max: 80 }),
			email: emailFrom(source),
			password: newPasswordFrom(source, "password"),
			roleIds: roleIdsFrom(source.roleIds),
		};
	})
	.handler(async ({ data }) => {
		const actor = await requirePermission("staff.manage");
		const roles = checkRoleChange(actor, [], data.roleIds);
		const auth = await getAuth();
		let userId: string;
		try {
			// Without request headers, better-auth lets the server add anyone.
			const created = await auth.api.createUser({
				body: {
					name: data.name,
					email: data.email,
					password: data.password,
					role: "user",
				},
			});
			userId = created.user.id;
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			throw new InputError(
				/exist/i.test(message)
					? "Someone already uses that email."
					: "Couldn’t add that person. Please try again.",
			);
		}
		setUserRoles(userId, data.roleIds);
		writeActivity(
			"staff",
			{ id: userId, name: data.name },
			staffActor(actor),
			"added",
			[
				{ field: "Email", from: "", to: data.email },
				{ field: "Roles", from: "", to: roleNames(roles) },
			],
		);
		return { ok: true as const, id: userId };
	});

export const updateStaff = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			userId: text(source, "userId", { max: 64 }),
			name: text(source, "name", { label: "Name", max: 80 }),
			email: emailFrom(source),
			roleIds: roleIdsFrom(source.roleIds),
		};
	})
	.handler(async ({ data }) => {
		const actor = await requirePermission("staff.manage");
		const row = staffRow(data.userId);
		if (!row) throw new InputError("That account isn’t a staff member.");
		if (!canManagePerson(actor, data.userId))
			throw new InputError(
				`${row.name} can do things you can’t, so only an owner can change them.`,
			);
		const before = rolesOfUser(data.userId);
		const beforeIds = before.map((role) => role.id);
		const after = checkRoleChange(actor, beforeIds, data.roleIds);
		const owners = ownerIds();
		if (
			before.some((role) => role.isOwner) &&
			!after.some((role) => role.isOwner) &&
			owners.length === 1
		)
			throw new InputError(
				"The shop needs at least one owner. Make someone else an owner first.",
			);

		const auth = await getAuth();
		const context = await auth.$context;
		if (data.email !== row.email.toLowerCase()) {
			const taken = await context.internalAdapter.findUserByEmail(data.email);
			if (taken && taken.user.id !== data.userId)
				throw new InputError("Someone already uses that email.");
		}
		if (data.name !== row.name || data.email !== row.email)
			await context.internalAdapter.updateUser(data.userId, {
				name: data.name,
				email: data.email,
			});
		setUserRoles(data.userId, data.roleIds);

		const changes: ActivityChange[] = [];
		if (data.name !== row.name)
			changes.push({ field: "Name", from: row.name, to: data.name });
		if (data.email !== row.email)
			changes.push({ field: "Email", from: row.email, to: data.email });
		const sameRoles =
			beforeIds.length === data.roleIds.length &&
			beforeIds.every((id) => data.roleIds.includes(id));
		if (!sameRoles)
			changes.push({
				field: "Roles",
				from: roleNames(before),
				to: roleNames(after),
			});
		if (changes.length)
			writeActivity(
				"staff",
				{ id: data.userId, name: data.name },
				staffActor(actor),
				"edited",
				changes,
			);
		return { ok: true as const };
	});

/** For someone who forgot their password: set a temporary one, and sign them out. */
export const resetStaffPassword = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			userId: text(source, "userId", { max: 64 }),
			newPassword: newPasswordFrom(source, "newPassword"),
		};
	})
	.handler(async ({ data }) => {
		const actor = await requirePermission("staff.manage");
		if (data.userId === actor.id)
			throw new InputError(
				"Change your own password under Account › Security.",
			);
		const row = staffRow(data.userId);
		if (!row) throw new InputError("That account isn’t a staff member.");
		if (!canManagePerson(actor, data.userId))
			throw new InputError(
				`${row.name} can do things you can’t, so only an owner can reset their password.`,
			);
		const auth = await getAuth();
		const context = await auth.$context;
		const hashed = await context.password.hash(data.newPassword);
		if (await context.internalAdapter.findCredentialAccount(data.userId))
			await context.internalAdapter.updatePassword(data.userId, hashed);
		else
			await context.internalAdapter.createAccount({
				userId: data.userId,
				providerId: "credential",
				accountId: data.userId,
				password: hashed,
			});
		await context.internalAdapter.deleteUserSessions(data.userId);
		writeActivity(
			"staff",
			{ id: data.userId, name: row.name },
			staffActor(actor),
			"password_reset",
		);
		return { ok: true as const };
	});

export const removeStaff = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		userId: text(asRecord(input), "userId", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const actor = await requirePermission("staff.manage");
		if (data.userId === actor.id)
			throw new InputError("You can’t remove your own account.");
		const row = staffRow(data.userId);
		if (!row) throw new InputError("That account isn’t a staff member.");
		if (!canManagePerson(actor, data.userId))
			throw new InputError(
				`${row.name} can do things you can’t, so only an owner can remove them.`,
			);
		const owners = ownerIds();
		if (owners.length === 1 && owners[0] === data.userId)
			throw new InputError("The shop needs at least one owner.");
		const before = rolesOfUser(data.userId);
		const auth = await getAuth();
		const context = await auth.$context;
		await context.internalAdapter.deleteUserSessions(data.userId);
		await context.internalAdapter.deleteUser(data.userId);
		clearUserRoles(data.userId);
		writeActivity(
			"staff",
			{ id: data.userId, name: row.name },
			staffActor(actor),
			"removed",
			[{ field: "Roles", from: roleNames(before), to: "" }],
		);
		return { ok: true as const };
	});

// ── Roles ────────────────────────────────────────────────────────────────

export interface RoleSummary extends RoleWithMembers {
	/** Whether the person asking may change or delete it. */
	canEdit: boolean;
}

const toSummary = (actor: StaffUser, role: RoleWithMembers): RoleSummary => ({
	...role,
	canEdit:
		can(actor, "roles.manage") &&
		!role.isOwner &&
		missingFrom(actor, role.permissions).length === 0,
});

export const listRolesAdmin = createServerFn({ method: "GET" }).handler(
	async (): Promise<RoleSummary[]> => {
		const actor = await requirePermission("roles.view");
		return listRoles().map((role) => toSummary(actor, role));
	},
);

export interface RoleDetail {
	role: RoleSummary;
	/** The permissions the person asking holds: only these can be ticked. */
	grantable: Permission[];
}

export const getRoleAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }): Promise<RoleDetail | null> => {
		const actor = await requirePermission("roles.view");
		const role = getRole(data);
		if (!role) return null;
		return { role: toSummary(actor, role), grantable: grantable(actor) };
	});

const grantable = (actor: StaffUser) =>
	actor.isOwner ? ALL_PERMISSIONS : actor.permissions;

/** What a new role can be given, for the empty form. */
export const getNewRoleAdmin = createServerFn({ method: "GET" })
	.validator((from: unknown) =>
		typeof from === "string" && from
			? text({ from }, "from", { max: 64 })
			: null,
	)
	.handler(async ({ data }) => {
		const actor = await requirePermission("roles.manage");
		const copy = data ? getRole(data) : null;
		return {
			grantable: grantable(actor),
			copyOf: copy
				? {
						name: copy.name,
						description: copy.description,
						permissions: copy.permissions.filter((key) => can(actor, key)),
					}
				: null,
		};
	});

const oneSpace = (value: string) => value.replace(/\s+/g, " ").trim();

export const saveRoleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const id = text(source, "id", { max: 64, required: false });
		const permissions = Array.isArray(source.permissions)
			? withNeeds(source.permissions.filter(isPermission))
			: [];
		return {
			id: id || null,
			name: oneSpace(text(source, "name", { label: "Name", max: 40 })),
			description: oneSpace(
				text(source, "description", {
					label: "Description",
					max: 160,
					required: false,
				}),
			),
			permissions,
		};
	})
	.handler(async ({ data }) => {
		const actor = await requirePermission("roles.manage");
		const before = data.id ? getRole(data.id) : null;
		if (data.id && !before) throw new InputError("That role was deleted.");
		if (before?.isOwner)
			throw new InputError(
				"The Owner role can always do everything; it can’t be changed.",
			);
		if (before) {
			const missing = missingFrom(actor, before.permissions);
			if (missing.length)
				throw new InputError(cantGiveMessage(missing, "This role"));
		}
		const missing = missingFrom(actor, data.permissions);
		if (missing.length)
			throw new InputError(
				`You can only give permissions you have yourself. You don’t have “${permissionInfo(missing[0]).label}”.`,
			);
		if (data.permissions.length === 0)
			throw new InputError("Tick at least one thing this role can do.");
		if (roleNameTaken(data.name, data.id))
			throw new InputError("Another role already has that name.");
		const saved = saveRole(data.id, data);
		if (!saved)
			throw new InputError("Couldn’t save the role. Please try again.");

		const changes: ActivityChange[] = [];
		if (!before || before.name !== saved.name)
			changes.push({ field: "Name", from: before?.name ?? "", to: saved.name });
		if ((before?.description ?? "") !== saved.description)
			changes.push({
				field: "Description",
				from: before?.description ?? "",
				to: saved.description,
			});
		const was = new Set(before?.permissions ?? []);
		const now = new Set(saved.permissions);
		for (const key of ALL_PERMISSIONS) {
			if (was.has(key) === now.has(key)) continue;
			changes.push({
				field: permissionInfo(key).label,
				from: was.has(key) ? "Allowed" : "",
				to: now.has(key) ? "Allowed" : "",
			});
		}
		if (changes.length)
			writeActivity(
				"roles",
				{ id: saved.id, name: saved.name },
				staffActor(actor),
				before ? "edited" : "added",
				changes,
			);
		return saved;
	});

export const deleteRoleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const actor = await requirePermission("roles.manage");
		const role = getRole(data.id);
		if (!role) return { ok: true as const };
		if (role.isOwner) throw new InputError("The Owner role can’t be deleted.");
		const missing = missingFrom(actor, role.permissions);
		if (missing.length)
			throw new InputError(cantGiveMessage(missing, "This role"));
		deleteRole(data.id);
		writeActivity(
			"roles",
			{ id: role.id, name: role.name },
			staffActor(actor),
			"deleted",
			role.members.length
				? [
						{
							field: "People",
							from: role.members.map((member) => member.name).join(", "),
							to: "",
						},
					]
				: [],
		);
		return { ok: true as const };
	});
