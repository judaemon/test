/**
 * Makes the QR code printed on dedication cards: it opens the /hello page
 * (ORAIA's links, promos and a note). Run again if the address changes:
 *
 *   bun scripts/make-qr.ts
 *
 * High error correction, so the flower drawn over its middle on the cards
 * doesn't stop it scanning.
 */
import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

import { CONTACT } from "../src/lib/contact";
import { absoluteUrl } from "../src/lib/site";

const url = absoluteUrl(CONTACT.helloPath);
const svg = await QRCode.toString(url, {
	type: "svg",
	errorCorrectionLevel: "H",
	margin: 0,
	// Pure black on paper: the crispest print, and the easiest scan.
	color: { dark: "#000000", light: "#ffffff00" },
});
writeFileSync(`public${CONTACT.helloQr}`, svg);
console.log(`QR code for ${url} saved to public${CONTACT.helloQr}`);
