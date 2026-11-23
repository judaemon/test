/**
 * Everything someone can be allowed to do in the admin. The list lives in
 * code because each permission guards real code; which roles get which
 * permissions is data, set in Admin → Roles.
 *
 * `needs`: permissions that come with this one, so a role never ends up able
 * to change something it can't see (ticking "Change orders" ticks "See orders").
 */
const GROUPS = [
	{
		id: "orders",
		label: "Orders",
		permissions: {
			"orders.view": {
				label: "See orders",
				description:
					"The orders table, each order with its history and notes, and the order printer.",
			},
			"orders.create": {
				label: "Take orders",
				description: "Add orders that come in by chat or in person.",
				needs: ["orders.view"],
			},
			"orders.edit": {
				label: "Change orders",
				description:
					"What’s ordered, the customer’s details, the delivery day and wrappers.",
				needs: ["orders.view"],
			},
			"orders.move": {
				label: "Move orders along",
				description: "Change an order’s stage and add delivery photos.",
				needs: ["orders.view"],
			},
			"orders.assign": {
				label: "Assign florists and riders",
				description: "Choose who makes each bouquet and who delivers it.",
				needs: ["orders.view"],
			},
			"orders.payments": {
				label: "Check payments",
				description:
					"Approve or reject payments, and change the payment method or reference number.",
				needs: ["orders.view"],
			},
			"orders.cancel": {
				label: "Cancel orders",
				description: "Cancel a whole order or one bouquet in it.",
				needs: ["orders.view"],
			},
			"orders.notes": {
				label: "Write notes",
				description: "Add notes to orders, and change or delete their own.",
				needs: ["orders.view"],
			},
			"orders.notes_all": {
				label: "Delete anyone’s notes",
				description: "Remove notes other people wrote.",
				needs: ["orders.notes"],
			},
			"cards.print": {
				label: "Print cards",
				description:
					"Print dedication cards, mark them printed, and change the note on the card’s QR page.",
			},
		},
	},
	{
		id: "catalog",
		label: "Catalog",
		permissions: {
			"catalog.view": {
				label: "See the catalog",
				description:
					"Floral arrangements, flowers, wrappers, sizes, arrangement types and custom bouquets.",
			},
			"catalog.arrangements": {
				label: "Change floral arrangements",
				description:
					"Add, edit, hide, reorder and delete arrangements and their photos.",
				needs: ["catalog.view"],
			},
			"catalog.parts": {
				label: "Change flowers, wrappers and sizes",
				description:
					"Also arrangement types, and importing wrappers from Excel.",
				needs: ["catalog.view"],
			},
			"catalog.custom": {
				label: "Change custom bouquets",
				description:
					"The custom bouquet builder’s flowers, wrappers and prices.",
				needs: ["catalog.view"],
			},
			"catalog.originals": {
				label: "Download original photos",
				description: "Every bouquet photo without the watermark, as a zip.",
				needs: ["catalog.view"],
			},
			"sales.view": {
				label: "See sales and promos",
				description: "Timed sales and order promos.",
			},
			"sales.manage": {
				label: "Run sales and promos",
				description: "Start, change and end sales and promos.",
				needs: ["sales.view"],
			},
		},
	},
	{
		id: "people",
		label: "People",
		permissions: {
			"customers.view": {
				label: "See customers",
				description: "Everyone with a shop account, and their orders.",
			},
			"florists.view": {
				label: "See florists",
				description: "Florists and the bouquets they’re making.",
			},
			"florists.manage": {
				label: "Manage florists",
				description:
					"Add, edit and delete florists, and turn their private links on or off.",
				needs: ["florists.view"],
			},
			"suppliers.view": {
				label: "See suppliers",
				description: "Who the shop buys wrappers from.",
			},
			"suppliers.manage": {
				label: "Manage suppliers",
				description: "Add, edit and delete suppliers.",
				needs: ["suppliers.view"],
			},
		},
	},
	{
		id: "team",
		label: "Team",
		permissions: {
			"staff.view": {
				label: "See staff",
				description: "Everyone who can sign in to the admin, and their roles.",
			},
			"staff.manage": {
				label: "Manage staff",
				description:
					"Add and remove people, reset passwords and choose their roles.",
				needs: ["staff.view", "roles.view"],
			},
			"roles.view": {
				label: "See roles",
				description: "The roles and what each one can do.",
			},
			"roles.manage": {
				label: "Manage roles",
				description: "Create, change and delete roles.",
				needs: ["roles.view"],
			},
		},
	},
	{
		id: "setup",
		label: "Shop setup",
		permissions: {
			"events.view": {
				label: "See events",
				description: "Events, their ordering window and delivery days.",
			},
			"events.manage": {
				label: "Manage events",
				description:
					"Add, change and delete events, and choose the current one.",
				needs: ["events.view"],
			},
			"shop.view": {
				label: "See shop settings",
				description: "How the shop runs now, and the landing page.",
			},
			"shop.manage": {
				label: "Change the landing page",
				description: "The fully booked message shoppers see.",
				needs: ["shop.view"],
			},
			"interested.view": {
				label: "See interested buyers",
				description: "Names left while the shop was fully booked.",
			},
			"interested.manage": {
				label: "Remove interested buyers",
				description: "Delete names from the list.",
				needs: ["interested.view"],
			},
			"delivery_dates.view": {
				label: "See delivery dates",
				description: "The days bouquets can be delivered.",
			},
			"delivery_dates.manage": {
				label: "Change delivery dates",
				description: "Add and remove delivery days.",
				needs: ["delivery_dates.view"],
			},
			"payments.view": {
				label: "See payment settings",
				description:
					"The GCash, Maya, bank, card and cash details at checkout.",
			},
			"payments.manage": {
				label: "Change payment settings",
				description:
					"Turn payment methods on or off and change their details and QR codes.",
				needs: ["payments.view"],
			},
		},
	},
	{
		id: "records",
		label: "Records",
		permissions: {
			"reports.view": {
				label: "See reports",
				description: "Money, orders, bouquets, flowers, cards and deliveries.",
			},
			"reports.purchases": {
				label: "Record flower purchases",
				description: "Enter what was bought on the Flowers report.",
				needs: ["reports.view"],
			},
			"logs.view": {
				label: "See change history",
				description: "Who changed what, and when, across the admin.",
			},
			"data.export": {
				label: "Download the shop’s data",
				description:
					"A full copy of the shop, customers included. Keep it private.",
			},
			"data.import": {
				label: "Replace the shop’s data",
				description:
					"Load a downloaded copy over everything. Only works on your own computer.",
				needs: ["data.export"],
			},
		},
	},
] as const satisfies readonly {
	id: string;
	label: string;
	permissions: Record<
		string,
		{ label: string; description: string; needs?: readonly string[] }
	>;
}[];

type PermissionsOf<G> = G extends { permissions: infer P }
	? keyof P & string
	: never;
export type Permission = PermissionsOf<(typeof GROUPS)[number]>;

export interface PermissionInfo {
	key: Permission;
	label: string;
	description: string;
	needs: Permission[];
}

export interface PermissionGroup {
	id: string;
	label: string;
	permissions: PermissionInfo[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = GROUPS.map((group) => ({
	id: group.id,
	label: group.label,
	permissions: Object.entries(group.permissions).map(([key, info]) => ({
		key: key as Permission,
		label: info.label,
		description: info.description,
		needs: [
			...((info as { needs?: readonly string[] }).needs ?? []),
		] as Permission[],
	})),
}));

const BY_KEY = new Map(
	PERMISSION_GROUPS.flatMap((group) =>
		group.permissions.map((info) => [info.key, info] as const),
	),
);

/** Every permission, in the order the role editor lists them. */
export const ALL_PERMISSIONS: Permission[] = [...BY_KEY.keys()];

export const isPermission = (value: unknown): value is Permission =>
	typeof value === "string" && BY_KEY.has(value as Permission);

export const permissionInfo = (key: Permission) =>
	BY_KEY.get(key) as PermissionInfo;

/** The permissions plus everything they need, in catalog order. */
export function withNeeds(keys: Iterable<Permission>): Permission[] {
	const out = new Set<Permission>();
	const add = (key: Permission) => {
		if (out.has(key)) return;
		out.add(key);
		for (const need of permissionInfo(key).needs) add(need);
	};
	for (const key of keys) if (isPermission(key)) add(key);
	return ALL_PERMISSIONS.filter((key) => out.has(key));
}

/** The permissions that need this one, directly or not: unticking it unticks them. */
export function dependents(key: Permission): Permission[] {
	return ALL_PERMISSIONS.filter(
		(other) => other !== key && withNeeds([other]).includes(key),
	);
}

/** What the built-in Staff role could do before roles could be changed. */
export const STARTER_STAFF_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
	(key) =>
		![
			"orders.notes_all",
			"catalog.originals",
			"sales.view",
			"sales.manage",
			"staff.view",
			"staff.manage",
			"roles.view",
			"roles.manage",
			"shop.manage",
			"payments.view",
			"payments.manage",
			"data.export",
			"data.import",
		].includes(key),
);

/** A role as the signed-in person carries it. */
export interface RoleRef {
	id: string;
	name: string;
	isOwner: boolean;
}

/** Just enough of the signed-in person to decide what they can do. */
export interface Access {
	isOwner: boolean;
	permissions: readonly Permission[];
}

/** Owners can do everything; everyone else, what their roles allow together. */
export function can(access: Access | null | undefined, key: Permission) {
	if (!access) return false;
	return access.isOwner || access.permissions.includes(key);
}

export const canAny = (
	access: Access | null | undefined,
	keys: readonly Permission[],
) => keys.some((key) => can(access, key));
