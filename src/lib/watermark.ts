/**
 * The watermark on signature bouquet photos, in two parts:
 *  - the shop's address in large, soft white type, a little below the middle,
 *    hard to crop away but clear of the blooms;
 *  - the mark in the site's rose gradient beside the shop's address in the
 *    bottom-right corner, with a soft white glow so the color pops on dark and
 *    busy wrappers alike, and white text under a soft shadow.
 * Drawn in the browser, like the crop and the card-sized copy, onto the photo
 * staff just cropped.
 *
 * Bump WATERMARK_VERSION whenever the design below changes: the bouquet list
 * then offers to re-stamp every photo from its clean original.
 */
export const WATERMARK_VERSION = 5;
// Versions: 1, a white mark in the corner; 2, a faint mark across the middle
// and the rose mark in the corner; 3, the same with a bolder rose middle mark;
// 4, a richer rose middle mark, a little smaller and lower, off the flowers;
// 5, the shop's address across the middle, in soft white, instead of the mark.

/** The address shown beside the mark. */
const ADDRESS = "oraiashop.com";
const LOGO_URL = "/images/brand/logo.svg";
/** The logo's viewBox is 2797 × 2457. */
const LOGO_ASPECT = 2797 / 2457;
const FONT_FAMILY = '"Fraunces Variable", Georgia, serif';

/** The site's rose gradient (petal-500 → 700 → 900), as on the logo. */
const ROSE_GRADIENT = `<defs><linearGradient id="rose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9718c"/><stop offset="0.5" stop-color="#9e3d58"/><stop offset="1" stop-color="#5c1f31"/></linearGradient></defs>`;

let roseLogo: Promise<HTMLImageElement> | undefined;

/** The logo mark in the rose gradient, loaded once. */
function loadRoseLogo() {
	let logo = roseLogo;
	if (!logo) {
		logo = (async () => {
			const response = await fetch(LOGO_URL);
			if (!response.ok) throw new Error("Couldn’t load the logo.");
			const svg = (await response.text())
				.replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="url(#rose)"')
				.replace(/(<svg[^>]*>)/, `$1${ROSE_GRADIENT}`);
			const url = URL.createObjectURL(
				new Blob([svg], { type: "image/svg+xml" }),
			);
			const image = new Image();
			image.decoding = "async";
			image.src = url;
			await image.decode();
			return image;
		})();
		roseLogo = logo;
		// A failed load can be tried again next time.
		logo.catch(() => {
			roseLogo = undefined;
		});
	}
	return logo;
}

/**
 * Draws the watermark onto a photo and returns it as a JPEG. Sizes follow the
 * photo's width, so it looks the same on every photo whatever its pixels.
 */
export async function watermarkPhoto(photo: Blob): Promise<Blob> {
	const [bitmap, rose] = await Promise.all([
		createImageBitmap(photo, { imageOrientation: "from-image" }),
		loadRoseLogo(),
	]);
	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Couldn’t draw the photo.");
	context.drawImage(bitmap, 0, 0);
	bitmap.close();

	const unit = canvas.width / 100;

	// The middle: the address in large, soft white type, see-through so the
	// bouquet shows behind it. A gentle shadow keeps it readable on white
	// flowers. It sits below the center, where the wrapping usually is, so the
	// blooms above stay clear.
	const bigFont = `600 ${7.5 * unit}px ${FONT_FAMILY}`;
	await document.fonts.load(bigFont);
	context.save();
	context.font = bigFont;
	if ("letterSpacing" in context) context.letterSpacing = `${0.6 * unit}px`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillStyle = "rgba(255, 250, 246, 0.7)";
	context.shadowColor = "rgba(40, 12, 22, 0.45)";
	context.shadowBlur = 1.2 * unit;
	context.shadowOffsetY = 0.2 * unit;
	context.fillText(ADDRESS, canvas.width / 2, canvas.height * 0.62);
	context.restore();

	// The corner: the rose mark and the address.
	const markHeight = 5.4 * unit;
	const markWidth = markHeight * LOGO_ASPECT;
	const fontSize = 2.8 * unit;
	const gap = 1.1 * unit;
	const margin = 3.4 * unit;

	await document.fonts.load(`600 ${fontSize}px ${FONT_FAMILY}`);
	context.font = `600 ${fontSize}px ${FONT_FAMILY}`;
	if ("letterSpacing" in context)
		context.letterSpacing = `${0.06 * fontSize}px`;
	context.textBaseline = "middle";
	const textWidth = context.measureText(ADDRESS).width;

	const right = canvas.width - margin;
	const middle = canvas.height - margin - markHeight / 2;
	const textX = right - textWidth;
	const markX = textX - gap - markWidth;
	const markY = middle - markHeight / 2;

	// A white glow behind the rose lifts it off dark and colorful wrappers.
	context.save();
	context.shadowColor = "rgba(255, 255, 255, 0.95)";
	context.shadowBlur = 1.6 * unit;
	context.drawImage(rose, markX, markY, markWidth, markHeight);
	context.shadowBlur = 0.5 * unit;
	context.drawImage(rose, markX, markY, markWidth, markHeight);
	context.restore();

	context.save();
	context.shadowColor = "rgba(40, 12, 22, 0.5)";
	context.shadowBlur = 1.4 * unit;
	context.shadowOffsetY = 0.15 * unit;
	context.fillStyle = "#ffffff";
	context.fillText(ADDRESS, textX, middle);
	context.restore();

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.9),
	);
	if (!blob) throw new Error("Couldn’t add the watermark.");
	return blob;
}
