import { createServerFn } from "@tanstack/solid-start";

import { floristWork } from "./florist-work";
import { getFloristByToken } from "./florists-repo";
import { asRecord, text } from "./validate";

/**
 * A florist's own page, from their private link: no sign-in, so it shows only
 * what they need to make their bouquets (no payments, emails or test orders).
 * A link that was turned off or replaced finds nothing.
 */
export const getFloristWorkByToken = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			token: text(source, "token", { max: 64 }),
			includeDone: source.includeDone === true,
		};
	})
	.handler(async ({ data }) => {
		const florist = getFloristByToken(data.token);
		if (!florist) return null;
		return floristWork(florist, {
			includeDone: data.includeDone,
			forStaff: false,
		});
	});
