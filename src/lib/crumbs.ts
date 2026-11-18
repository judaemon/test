/**
 * Breadcrumbs for the admin. A route that sits under a sidebar page (an
 * editor, a report, an order) names itself, and any step between, through
 * `staticData.crumbs`; the top bar adds the sidebar page in front.
 */
export interface Crumb {
	label: string;
	/** Earlier steps link back; the page you're on doesn't. */
	to?: string;
}

export interface CrumbMatch {
	params: Record<string, string>;
	loaderData: unknown;
}

export type CrumbsFn = (match: CrumbMatch) => Crumb[];

declare module "@tanstack/solid-router" {
	interface StaticDataRouteOption {
		crumbs?: CrumbsFn;
	}
}

/** A plain label, for pages with a fixed name. */
export const label =
	(text: string): CrumbsFn =>
	() => [{ label: text }];

/**
 * An editor at `/thing/$id`, where the id "new" starts a new one: "New size"
 * then, once saved, the thing's own name.
 */
export const editorCrumbs =
	(
		newLabel: string,
		untitled: string,
		name: (data: unknown) => string | undefined,
	): CrumbsFn =>
	({ params, loaderData }) => [
		{
			label: Object.values(params).includes("new")
				? newLabel
				: name(loaderData)?.trim() || untitled,
		},
	];

/** Reads `key` off loader data that may be null (a new item). */
export const field =
	(key: string, inside?: string) =>
	(data: unknown): string | undefined => {
		const record = (
			inside ? (data as Record<string, unknown> | null)?.[inside] : data
		) as Record<string, unknown> | null | undefined;
		const value = record?.[key];
		return typeof value === "string" ? value : undefined;
	};
