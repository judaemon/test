/** ORAIA's contact details, printed on the bottom half of dedication cards. */
export const CONTACT = {
	phone: "0976 037 6638",
	instagram: "@oraia_ph",
	messenger: "ORAIA",
	location: "Baguio City, Benguet",
	/**
	 * Where the printed QR code leads. The code itself is the static file
	 * `public/images/contact/facebook-qr.svg`, so regenerate it if this changes.
	 */
	facebookUrl: "https://www.facebook.com/SZSN.TheSeasons",
	telegramUrl: "https://t.me/judaya_lennie",
	/** Signal on the shop's number, as Oraiashop.18. */
	signalUrl:
		"https://signal.me/#eu/7ZItRenZ6nCBbabIuVMwLFIVgl8Ao2r_pDVpEJ1dDeg1loJMRGpIiayiP02aqhYO",
	facebookQr: "/images/contact/facebook-qr.svg",
	instagramUrl: "https://www.instagram.com/oraia_ph",
	/** The page the QR code on dedication cards opens: links, promos and a note. */
	helloPath: "/hello",
	/** That QR code; made by `bun scripts/make-qr.ts`, so run it if the path changes. */
	helloQr: "/images/contact/hello-qr.svg",
} as const;

export const TAGLINE = "Finding Beauty in Everything";
