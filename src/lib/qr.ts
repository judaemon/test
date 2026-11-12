import QRCode from "qrcode";

/**
 * A QR code as one SVG path, one unit per module, drawn as it renders (no
 * waiting), so each card's code is laid out with the card. High error
 * correction leaves room for a small mark over the middle.
 */
export function qrPath(text: string) {
	const { modules } = QRCode.create(text, { errorCorrectionLevel: "H" });
	const { size } = modules;
	let path = "";
	for (let row = 0; row < size; row++) {
		let col = 0;
		while (col < size) {
			if (!modules.get(row, col)) {
				col++;
				continue;
			}
			// One rectangle per run of dark modules along the row.
			const start = col;
			while (col < size && modules.get(row, col)) col++;
			path += `M${start} ${row}h${col - start}v1h${start - col}z`;
		}
	}
	return { size, path };
}
