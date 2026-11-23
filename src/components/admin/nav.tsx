import type { JSX } from "solid-js";

import { AdminIcons } from "~/components/admin/ui";
import { type Access, can, type Permission } from "~/lib/permissions";

export type NavItem = {
	to: string;
	label: string;
	icon: (props: { class?: string }) => JSX.Element;
	/** What opens the page; left out of the sidebar without it. */
	permission?: Permission;
};

/** The sidebar, grouped the way the work happens: orders first, team last. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
	{
		label: "Orders",
		items: [
			{
				to: "/admin/orders",
				label: "Orders",
				icon: AdminIcons.orders,
				permission: "orders.view",
			},
			{
				to: "/admin/cards",
				label: "Cards",
				icon: AdminIcons.cards,
				permission: "cards.print",
			},
			{
				to: "/admin/printer",
				label: "Order printer",
				icon: AdminIcons.printer,
				permission: "orders.view",
			},
		],
	},
	{
		label: "Catalog",
		items: [
			{
				to: "/admin/signature-bouquets",
				label: "Floral arrangements",
				icon: AdminIcons.products,
				permission: "catalog.view",
			},
			{
				to: "/admin/custom",
				label: "Custom bouquets",
				icon: AdminIcons.custom,
				permission: "catalog.view",
			},
			{
				to: "/admin/flowers",
				label: "Flowers",
				icon: AdminIcons.flowers,
				permission: "catalog.view",
			},
			{
				to: "/admin/wrappers",
				label: "Wrappers",
				icon: AdminIcons.wrappers,
				permission: "catalog.view",
			},
			{
				to: "/admin/sizes",
				label: "Sizes",
				icon: AdminIcons.sizes,
				permission: "catalog.view",
			},
			{
				to: "/admin/arrangement-types",
				label: "Arrangement types",
				icon: AdminIcons.types,
				permission: "catalog.view",
			},
			{
				to: "/admin/sales",
				label: "Sales",
				icon: AdminIcons.sale,
				permission: "sales.view",
			},
		],
	},
	{
		label: "People",
		items: [
			{
				to: "/admin/users",
				label: "Users",
				icon: AdminIcons.users,
				permission: "customers.view",
			},
			{
				to: "/admin/florists",
				label: "Florists",
				icon: AdminIcons.florists,
				permission: "florists.view",
			},
			{
				to: "/admin/suppliers",
				label: "Suppliers",
				icon: AdminIcons.suppliers,
				permission: "suppliers.view",
			},
		],
	},
	{
		label: "Shop setup",
		items: [
			{
				to: "/admin/events",
				label: "Events",
				icon: AdminIcons.events,
				permission: "events.view",
			},
			{
				to: "/admin/shop",
				label: "Shop",
				icon: AdminIcons.shop,
				permission: "shop.view",
			},
			{
				to: "/admin/landing-page",
				label: "Landing page",
				icon: AdminIcons.landing,
				permission: "shop.view",
			},
			{
				to: "/admin/interested",
				label: "Interested buyers",
				icon: AdminIcons.interested,
				permission: "interested.view",
			},
			{
				to: "/admin/delivery-dates",
				label: "Delivery dates",
				icon: AdminIcons.calendar,
				permission: "delivery_dates.view",
			},
			{
				to: "/admin/payments",
				label: "Payments",
				icon: AdminIcons.payments,
				permission: "payments.view",
			},
		],
	},
	{
		label: "Records",
		items: [
			{
				to: "/admin/reports",
				label: "Reports",
				icon: AdminIcons.reports,
				permission: "reports.view",
			},
			{
				to: "/admin/logs",
				label: "Logs",
				icon: AdminIcons.log,
				permission: "logs.view",
			},
		],
	},
	{
		label: "Team",
		items: [
			{
				to: "/admin/staff",
				label: "Staff",
				icon: AdminIcons.staff,
				permission: "staff.view",
			},
			{
				to: "/admin/roles",
				label: "Roles",
				icon: AdminIcons.roles,
				permission: "roles.view",
			},
		],
	},
];

/** The sidebar as this person sees it: only pages their roles open. */
export function visibleNav(access: Access) {
	return NAV_GROUPS.map((group) => ({
		...group,
		items: group.items.filter(
			(item) => !item.permission || can(access, item.permission),
		),
	})).filter((group) => group.items.length > 0);
}

/** Where /admin takes them: the first page they can open, if any. */
export const firstPage = (access: Access) =>
	visibleNav(access)[0]?.items[0]?.to ?? null;
