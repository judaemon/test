/** What the /hello page (opened by the QR code on cards) says at the top. */
export interface HelloNote {
	heading: string;
	message: string;
}

export const HELLO_HEADING_MAX = 80;
export const HELLO_MESSAGE_MAX = 600;

export const DEFAULT_HELLO_NOTE: HelloNote = {
	heading: "Arranged with love, just for you",
	message:
		"Every ORAIA bouquet is arranged by hand in Baguio City, for moments like this one. Thank you for letting us be part of your day.\n\nWe’d love to stay in touch: follow us for new bouquets and promos, or message us anytime.",
};
