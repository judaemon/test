import { CONTACT, TAGLINE } from "./contact";

/** The public address. The sitemap uses SITE_URL instead, so it can differ per environment. */
export const SITE_URL = "https://oraiashop.com";

export const SITE_NAME = "ORAIA";

/** What the home page says in search results: the brand first, then where. */
export const HOME_TITLE =
	"ORAIA | Flower Shop in Baguio City · Order Bouquets Online";
// Names Battalion Hop while the shop is for that event; drop it when it goes general.
export const HOME_DESCRIPTION =
	"ORAIA (oraiashop) is a Baguio City flower shop. Order signature bouquets for Battalion Hop 2027 or build your own online: pick the flowers, colors and wrapper.";

export const absoluteUrl = (path: string) =>
	/^https?:\/\//.test(path) ? path : `${SITE_URL}${path}`;

const LOGO = absoluteUrl("/images/brand/logo.png");

/**
 * Structured data for Google, as a head `scripts` entry. `<` is escaped so a
 * product description can't close the tag early.
 */
export const jsonLdScript = (data: object) => ({
	type: "application/ld+json",
	children: JSON.stringify(data).replace(/</g, "\\u003c"),
});

/** Title, description, canonical link and share previews for one page. */
export function pageHead({
	title,
	description,
	path,
	image = LOGO,
}: {
	title: string;
	description: string;
	path: string;
	image?: string;
}) {
	const url = absoluteUrl(path);
	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: url },
			{ property: "og:image", content: absoluteUrl(image) },
		],
		links: [{ rel: "canonical", href: url }],
	};
}

/**
 * Tells Google that ORAIA, oraiashop and this site are one Baguio florist,
 * for brand searches and the business panel. Home page only.
 */
export const BUSINESS_JSON_LD = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			"@id": `${SITE_URL}/#website`,
			url: `${SITE_URL}/`,
			name: SITE_NAME,
			alternateName: ["oraiashop", "ORAIA Flowers"],
		},
		{
			"@type": "Florist",
			"@id": `${SITE_URL}/#business`,
			name: SITE_NAME,
			alternateName: ["oraiashop", "ORAIA Flowers", "ORAIA Flower Shop"],
			slogan: TAGLINE,
			description: HOME_DESCRIPTION,
			url: `${SITE_URL}/`,
			logo: LOGO,
			image: LOGO,
			telephone: `+63 ${CONTACT.phone.replace(/^0/, "")}`,
			address: {
				"@type": "PostalAddress",
				addressLocality: "Baguio City",
				addressRegion: "Benguet",
				addressCountry: "PH",
			},
			areaServed: { "@type": "City", name: "Baguio City" },
			currenciesAccepted: "PHP",
			sameAs: [`https://www.instagram.com/${CONTACT.instagram.slice(1)}`],
		},
	],
};
