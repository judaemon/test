import { normalizeWrapperCode } from "~/lib/custom-bouquet";

/** Used when a row has no photo to take a color from. */
export const FALLBACK_WRAPPER_COLOR = "#d9cfc7";

/** A row of the stock sheet that will become a wrapper. */
export interface WrapperImportRow {
	code: string;
	price: number;
	stock: number;
	image?: Blob;
}

export interface WrapperImportPlan {
	rows: WrapperImportRow[];
	/** Rows left out, by why. */
	hidden: number;
	noPrice: number;
	/** Earlier rows replaced by a later row with the same code. */
	repeats: number;
}

const SHEET = "STOCK";
const COLUMNS = {
	code: "CODE",
	stock: "STOCK ONHAND",
	price: "FINAL PRICE",
} as const;

/** What a cell shows: formulas give their last result, which is missing for 0. */
function cellValue(value: unknown): unknown {
	if (typeof value !== "object" || value === null) return value;
	if ("richText" in value)
		return (value.richText as { text: string }[]).map((r) => r.text).join("");
	if ("formula" in value || "sharedFormula" in value)
		return "result" in value ? value.result : 0;
	return undefined;
}

function toNumber(value: unknown) {
	const number = Number(cellValue(value));
	return Number.isFinite(number) ? number : 0;
}

/**
 * Reads the wrappers out of the stock workbook, in the browser: the file is
 * too big to send to the server whole. Hidden rows and rows with no price are
 * left out, and when a code repeats the last row wins.
 */
export async function readWrapperWorkbook(
	file: File,
): Promise<WrapperImportPlan> {
	const { default: ExcelJS } = await import("exceljs");
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(await file.arrayBuffer());
	const sheet = workbook.getWorksheet(SHEET);
	if (!sheet) throw new Error(`This file has no “${SHEET}” sheet.`);

	const headers = new Map<string, number>();
	sheet.getRow(1).eachCell((cell, column) => {
		headers.set(
			String(cellValue(cell.value) ?? "")
				.trim()
				.toUpperCase(),
			column,
		);
	});
	const columnOf = (name: string) => {
		const column = headers.get(name);
		if (!column) throw new Error(`The “${name}” column is missing.`);
		return column;
	};
	const code = columnOf(COLUMNS.code);
	const stock = columnOf(COLUMNS.stock);
	const price = columnOf(COLUMNS.price);

	const imageByRow = new Map<number, Blob>();
	for (const image of sheet.getImages()) {
		const { buffer, extension } = workbook.getImage(Number(image.imageId));
		if (!buffer) continue;
		// Anchors count from 0.
		imageByRow.set(
			Math.floor(image.range.tl.nativeRow) + 1,
			new Blob([buffer as unknown as BlobPart], {
				type: `image/${extension === "jpeg" ? "jpeg" : extension}`,
			}),
		);
	}

	const rows = new Map<string, WrapperImportRow>();
	let hidden = 0;
	let noPrice = 0;
	let repeats = 0;
	for (let number = 2; number <= sheet.rowCount; number++) {
		const row = sheet.getRow(number);
		const rowCode = normalizeWrapperCode(
			String(cellValue(row.getCell(code).value) ?? ""),
		);
		if (!rowCode) continue;
		if (row.hidden) {
			hidden++;
			continue;
		}
		const rowPrice = toNumber(row.getCell(price).value);
		if (rowPrice <= 0) {
			noPrice++;
			continue;
		}
		if (rows.has(rowCode)) repeats++;
		rows.set(rowCode, {
			code: rowCode,
			price: rowPrice,
			stock: Math.max(0, Math.round(toNumber(row.getCell(stock).value))),
			image: imageByRow.get(number),
		});
	}
	return { rows: [...rows.values()], hidden, noPrice, repeats };
}

/** The photo's middle: edges are often background or a folded corner. */
function averageColor(bitmap: ImageBitmap) {
	const size = 16;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) return FALLBACK_WRAPPER_COLOR;
	const { width, height } = bitmap;
	context.drawImage(
		bitmap,
		width / 3,
		height / 3,
		width / 3,
		height / 3,
		0,
		0,
		size,
		size,
	);
	const { data } = context.getImageData(0, 0, size, size);
	const total = [0, 0, 0];
	for (let i = 0; i < data.length; i += 4)
		for (const channel of [0, 1, 2])
			total[channel] = (total[channel] ?? 0) + (data[i + channel] ?? 0);
	const hex = total
		.map((sum) =>
			Math.round(sum / (size * size))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("");
	return `#${hex}`;
}

/** Shrinks a sheet photo for upload and works out the wrapper's color. */
export async function prepareWrapperPhoto(image: Blob, code: string) {
	const longest = 1000;
	const bitmap = await createImageBitmap(image);
	const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const colorHex = averageColor(bitmap);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.85),
	);
	if (!blob) throw new Error(`Couldn’t read the photo for ${code}.`);
	return {
		file: new File([blob], `${code}.jpg`, { type: "image/jpeg" }),
		colorHex,
	};
}
