const FRAME_ID = "oraia-card-print";

/**
 * Prints an order's dedication card (A5: message on top, ORAIA's contact
 * details below) without leaving the page. The card loads in a hidden frame,
 * which opens the print dialog itself.
 */
export function printDedicationCard(orderId: string) {
	document.getElementById(FRAME_ID)?.remove();
	const frame = document.createElement("iframe");
	frame.id = FRAME_ID;
	frame.title = "Dedication card";
	// Off-screen but laid out at A5 size, so the text fits as it will print.
	Object.assign(frame.style, {
		position: "fixed",
		left: "-10000px",
		top: "0",
		width: "148mm",
		height: "210mm",
		border: "0",
	});
	frame.src = `/admin/card/${encodeURIComponent(orderId)}?autoprint=1`;

	const cleanUp = (event: MessageEvent) => {
		if (event.source !== frame.contentWindow) return;
		if (event.data?.type !== "oraia:card-printed") return;
		window.removeEventListener("message", cleanUp);
		frame.remove();
	};
	window.addEventListener("message", cleanUp);
	document.body.append(frame);
}
