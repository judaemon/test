/** A florist as the pickers list them. */
export interface FloristOption {
	id: string;
	name: string;
	/** Inactive florists keep their bouquets but can't be given new ones. */
	active: boolean;
}

/** Who makes one bouquet of a line: a florist id, or "" for no one yet. */
export const floristOf = (
	line: { florists?: string[] },
	unit: number,
): string => line.florists?.[unit] ?? "";

/**
 * A line's florists with one bouquet's changed; missing when no bouquet of it
 * has a florist, so lines nobody's assigned stay as they were.
 */
export function withFlorist(
	line: { quantity: number; florists?: string[] },
	unit: number,
	floristId: string,
): string[] | undefined {
	const list = Array.from(
		{ length: line.quantity },
		(_, i) => line.florists?.[i] ?? "",
	);
	list[unit] = floristId;
	return list.some(Boolean) ? list : undefined;
}

/** The florists kept when a line's quantity changes; missing if none are left. */
export function keepFlorists(
	florists: string[] | undefined,
	quantity: number,
): string[] | undefined {
	const kept = florists?.slice(0, quantity);
	return kept?.some(Boolean) ? kept : undefined;
}

/** A florist's name, or a stand-in for one since deleted. */
export const floristName = (
	florists: readonly { id: string; name: string }[],
	id: string,
) =>
	id
		? (florists.find((florist) => florist.id === id)?.name ?? "Removed florist")
		: "Not assigned";
