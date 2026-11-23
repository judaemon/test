import { createEffect, createMemo, createUniqueId, For, Show } from "solid-js";

import {
	dependents,
	PERMISSION_GROUPS,
	type Permission,
	type PermissionGroup,
	permissionInfo,
	withNeeds,
} from "~/lib/permissions";
import { cn } from "~/lib/utils";
import { adminCard } from "./ui";

function CheckIcon(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={props.class}
		>
			<path d="m5 12.5 4.5 4.5L19 7.5" />
		</svg>
	);
}

/**
 * Every permission by group, with a box to tick each. Ticking one ticks
 * what it needs (Change orders → See orders); unticking one unticks what
 * needs it. Only `grantable` ones can be changed: nobody hands out more than
 * they have.
 */
export function PermissionPicker(props: {
	value: Permission[];
	onChange: (next: Permission[]) => void;
	grantable: readonly Permission[];
	disabled?: boolean;
}) {
	const selected = createMemo(() => new Set(props.value));
	const grantable = createMemo(() => new Set(props.grantable));

	const toggle = (key: Permission, on: boolean) => {
		const next = new Set(props.value);
		if (on) for (const need of withNeeds([key])) next.add(need);
		else for (const off of [key, ...dependents(key)]) next.delete(off);
		props.onChange(withNeeds(next));
	};

	const toggleGroup = (group: PermissionGroup, on: boolean) => {
		const next = new Set(props.value);
		const keys = group.permissions
			.map((info) => info.key)
			.filter((key) => grantable().has(key));
		for (const key of keys) {
			if (on) for (const need of withNeeds([key])) next.add(need);
			else for (const off of [key, ...dependents(key)]) next.delete(off);
		}
		props.onChange(withNeeds(next));
	};

	return (
		<div class="grid gap-4">
			<For each={PERMISSION_GROUPS}>
				{(group) => {
					const headingId = createUniqueId();
					const count = () =>
						group.permissions.filter((info) => selected().has(info.key)).length;
					const changeable = () =>
						group.permissions.filter((info) => grantable().has(info.key));
					const allOn = () =>
						changeable().length > 0 &&
						changeable().every((info) => selected().has(info.key));
					const someOn = () => count() > 0 && !allOn();
					return (
						<section
							aria-labelledby={headingId}
							class={cn(adminCard, "overflow-hidden")}
						>
							<div class="flex flex-wrap items-center justify-between gap-3 border-b border-petal-100 bg-petal-50/60 px-5 py-3">
								<h3 id={headingId} class="font-semibold">
									{group.label}
									<span class="ml-2 text-xs font-normal tabular-nums text-petal-900/55">
										{count()} of {group.permissions.length}
									</span>
								</h3>
								<Show when={changeable().length > 0 && !props.disabled}>
									<label class="flex cursor-pointer items-center gap-2 text-sm text-petal-900/75">
										<input
											type="checkbox"
											class="size-4 accent-petal-700"
											checked={allOn()}
											// Part ticked shows as a dash.
											ref={(el) =>
												createEffect(() => {
													el.indeterminate = someOn();
												})
											}
											onChange={(e) =>
												toggleGroup(group, e.currentTarget.checked)
											}
											aria-describedby={headingId}
										/>
										All
									</label>
								</Show>
							</div>
							<ul class="divide-y divide-petal-50">
								<For each={group.permissions}>
									{(info) => {
										const id = createUniqueId();
										const locked = () =>
											props.disabled || !grantable().has(info.key);
										const needNames = () =>
											info.needs
												.map((key) => permissionInfo(key).label)
												.join(" and ");
										return (
											<li>
												<label
													for={id}
													class={cn(
														"flex gap-3 px-5 py-3",
														locked()
															? "cursor-default"
															: "cursor-pointer hover:bg-petal-50/50",
													)}
												>
													<input
														id={id}
														type="checkbox"
														class="mt-0.5 size-4 shrink-0 accent-petal-700"
														checked={selected().has(info.key)}
														disabled={locked()}
														onChange={(e) =>
															toggle(info.key, e.currentTarget.checked)
														}
														aria-labelledby={`${id}-name`}
														aria-describedby={`${id}-hint`}
													/>
													<span class="min-w-0">
														<span
															id={`${id}-name`}
															class={cn(
																"block text-sm font-medium",
																locked() &&
																	!selected().has(info.key) &&
																	"text-petal-900/55",
															)}
														>
															{info.label}
														</span>
														<span
															id={`${id}-hint`}
															class="block text-xs text-petal-900/60"
														>
															{info.description}
															<Show when={info.needs.length}>
																{" "}
																Comes with {needNames()}.
															</Show>
															<Show
																when={
																	!props.disabled && !grantable().has(info.key)
																}
															>
																{" "}
																<span class="text-petal-700">
																	You don’t have this, so you can’t give it.
																</span>
															</Show>
														</span>
													</span>
												</label>
											</li>
										);
									}}
								</For>
							</ul>
						</section>
					);
				}}
			</For>
		</div>
	);
}

/**
 * What someone can do, read only: each group with what's allowed ticked and
 * the rest faded. `everything` for owners.
 */
export function PermissionSummary(props: {
	permissions: readonly Permission[];
	everything?: boolean;
}) {
	const allowed = createMemo(() => new Set(props.permissions));
	const has = (key: Permission) => props.everything || allowed().has(key);
	return (
		<div class="grid gap-4 sm:grid-cols-2">
			<For each={PERMISSION_GROUPS}>
				{(group) => {
					const count = () =>
						group.permissions.filter((info) => has(info.key)).length;
					return (
						<section class={cn(adminCard, "p-4")}>
							<h3 class="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold">
								{group.label}
								<span class="text-xs font-normal tabular-nums text-petal-900/55">
									{count()} of {group.permissions.length}
								</span>
							</h3>
							<ul class="grid gap-1.5">
								<For each={group.permissions}>
									{(info) => (
										<li
											class={cn(
												"flex items-start gap-2 text-sm",
												has(info.key) ? "text-petal-900" : "text-petal-900/40",
											)}
										>
											<Show
												when={has(info.key)}
												fallback={
													<span
														aria-hidden="true"
														class="mt-2 h-px w-3 shrink-0 bg-current"
													/>
												}
											>
												<CheckIcon class="mt-0.5 size-4 shrink-0 text-sage-600" />
											</Show>
											<span>
												<span class="sr-only">
													{has(info.key) ? "Allowed: " : "Not allowed: "}
												</span>
												{info.label}
											</span>
										</li>
									)}
								</For>
							</ul>
						</section>
					);
				}}
			</For>
		</div>
	);
}

/** "Everything", or "12 of 42 things", for a role or a person. */
export function permissionCountText(count: number, everything?: boolean) {
	const total = PERMISSION_GROUPS.reduce(
		(sum, group) => sum + group.permissions.length,
		0,
	);
	if (everything || count >= total) return "Can do everything";
	if (count === 0) return "Can’t do anything yet";
	return `${count} of ${total} permissions`;
}
