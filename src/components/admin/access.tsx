import { Link, redirect } from "@tanstack/solid-router";
import { Show } from "solid-js";

import {
	type Access,
	canAny,
	type Permission,
	permissionInfo,
} from "~/lib/permissions";
import { cn } from "~/lib/utils";

/**
 * A page's `beforeLoad`: without one of these permissions, back to /admin,
 * which opens the first page they can. The server checks again on every call.
 */
export const needs =
	(...keys: [Permission, ...Permission[]]) =>
	({ context }: { context: { user: Access } }) => {
		if (!canAny(context.user, keys)) throw redirect({ to: "/admin" });
	};

/**
 * Says the page is view only, and which permission would let them change it.
 * Shows nothing when they can.
 */
export function ViewOnlyNote(props: {
	access: Access;
	permission: Permission;
	class?: string;
}) {
	return (
		<Show when={!canAny(props.access, [props.permission])}>
			<p
				role="note"
				class={cn(
					"mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-petal-100 bg-petal-50/70 px-4 py-3 text-sm text-petal-900/75",
					props.class,
				)}
			>
				<span class="font-medium text-petal-900">View only.</span>
				<span>
					Changing this needs “{permissionInfo(props.permission).label}”.{" "}
					<Link
						to="/admin/account/profile"
						class="underline underline-offset-2 hover:text-petal-900"
					>
						See what you can do
					</Link>
				</span>
			</p>
		</Show>
	);
}

/**
 * An editor at `/thing/$id`: seeing one needs `view`; starting a new one
 * (id "new") needs `manage`.
 */
export const needsFor =
	(view: Permission, manage: Permission) =>
	({
		context,
		params,
	}: {
		context: { user: Access };
		params: Record<string, string>;
	}) => {
		const adding = Object.values(params).includes("new");
		if (!canAny(context.user, [adding ? manage : view]))
			throw redirect({ to: "/admin" });
	};
