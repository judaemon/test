/** Buyers who aren't cadets pick this class and skip the company. */
export const CIVILIAN = "Civilian";

export const CADET_CLASSES = ["1CL", "2CL", "3CL", "4CL"] as const;
export const CLASS_OPTIONS = [CIVILIAN, ...CADET_CLASSES] as const;

export const CLASS_LABELS: Record<(typeof CLASS_OPTIONS)[number], string> = {
	[CIVILIAN]: "Civilian (not a cadet)",
	"1CL": "1CL",
	"2CL": "2CL",
	"3CL": "3CL",
	"4CL": "4CL",
};

/** Each company's color, used everywhere a company is shown. */
export const COMPANIES = [
	{ name: "Alfa", color: "#16a34a" },
	{ name: "Bravo", color: "#ffffff" },
	{ name: "Charlie", color: "#dc2626" },
	{ name: "Delta", color: "#2563eb" },
	{ name: "Echo", color: "#f97316" },
	{ name: "Foxtrot", color: "#800000" },
	{ name: "Golf", color: "#facc15" },
	{ name: "Hawk", color: "#111111" },
] as const;

export type CompanyName = (typeof COMPANIES)[number]["name"];

/** Which companies make up each battalion, in the order they're listed. */
export const BATTALIONS = [
	{ name: "1/2 Battalion", companies: ["Alfa", "Bravo", "Charlie", "Delta"] },
	{ name: "3/4 Battalion", companies: ["Echo", "Foxtrot", "Golf", "Hawk"] },
] as const satisfies readonly {
	name: string;
	companies: readonly CompanyName[];
}[];

/** "1/2 Battalion" for Alfa; undefined for civilians or no company. */
export function battalionOf(company: string) {
	return BATTALIONS.find((battalion) =>
		(battalion.companies as readonly string[]).includes(company),
	)?.name;
}

export function isCadetClass(value: string) {
	return (CADET_CLASSES as readonly string[]).includes(value);
}

export function isClassOption(value: string) {
	return (CLASS_OPTIONS as readonly string[]).includes(value);
}

export function companyColor(name: string) {
	return COMPANIES.find((company) => company.name === name)?.color;
}

/** Civilians have no company, so they share their own gray. */
export const CIVILIAN_COLOR = "#9ca3af";

/** The color an order is marked with: its company's, or gray for civilians. */
export function orderColor(company: string, className: string) {
	return (
		companyColor(company) ??
		(className === CIVILIAN ? CIVILIAN_COLOR : undefined)
	);
}
