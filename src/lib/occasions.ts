const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidMonthDay(month: number, day: number) {
	return (
		Number.isInteger(month) &&
		Number.isInteger(day) &&
		month >= 1 &&
		month <= 12 &&
		day >= 1 &&
		day <= (DAYS_IN_MONTH[month - 1] ?? 0)
	);
}

const isLeap = (year: number) =>
	(year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The next time a yearly date comes round, counting today. Feb 29 falls on
 * Feb 28 in non-leap years.
 */
export function nextOccurrence(month: number, day: number, today: string) {
	const year = Number(today.slice(0, 4));
	const dateIn = (y: number) => {
		const d = month === 2 && day === 29 && !isLeap(y) ? 28 : day;
		return `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
	};
	const date = dateIn(year) >= today ? dateIn(year) : dateIn(year + 1);
	const daysAway = Math.round(
		(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
			86_400_000,
	);
	return { date, daysAway };
}

/** Occasions soonest-first, each with its next date. */
export function sortByNext<T extends { month: number; day: number }>(
	occasions: T[],
	today: string,
) {
	return occasions
		.map((occasion) => ({
			...occasion,
			...nextOccurrence(occasion.month, occasion.day, today),
		}))
		.sort((a, b) => a.daysAway - b.daysAway);
}
