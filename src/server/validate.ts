/** Thrown for malformed admin input; the message is safe to show staff. */
export class InputError extends Error {}

export function asRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new InputError("Invalid request.");
	return value as Record<string, unknown>;
}

export function text(
	source: Record<string, unknown>,
	key: string,
	{ label = key, max = 200, required = true } = {},
) {
	const value = source[key];
	const trimmed = typeof value === "string" ? value.trim() : "";
	if (required && !trimmed) throw new InputError(`${label} is required.`);
	if (trimmed.length > max)
		throw new InputError(`${label} must be ${max} characters or fewer.`);
	return trimmed;
}

export function integer(
	source: Record<string, unknown>,
	key: string,
	{ label = key, min = 0, max = 1_000_000 } = {},
) {
	const value = source[key];
	if (typeof value !== "number" || !Number.isInteger(value))
		throw new InputError(`${label} must be a whole number.`);
	if (value < min || value > max)
		throw new InputError(`${label} must be between ${min} and ${max}.`);
	return value;
}

export function money(
	source: Record<string, unknown>,
	key: string,
	{ label = key } = {},
) {
	const value = source[key];
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
		throw new InputError(`${label} must be more than zero.`);
	if (value > 1_000_000) throw new InputError(`${label} is too large.`);
	return Math.round(value * 100) / 100;
}

export function bool(source: Record<string, unknown>, key: string) {
	return source[key] === true;
}

export function oneOf<T extends string>(
	value: unknown,
	options: readonly T[],
	label = "Value",
): T {
	if (typeof value !== "string" || !options.includes(value as T))
		throw new InputError(`${label} is not valid.`);
	return value as T;
}

/** Only images this app serves itself: bundled assets or admin uploads. */
export function imageUrl(value: unknown) {
	if (
		typeof value !== "string" ||
		!/^\/(images\/[A-Za-z0-9/_.-]+\.(svg|png|jpg|webp)|uploads\/(products|payments)\/[a-z0-9-]+)$/.test(
			value,
		) ||
		value.includes("..")
	)
		throw new InputError("Image is not valid.");
	return value;
}
