import type { jsPDF } from "jspdf";

import { orderColor } from "~/lib/cadets";
import { formatPrice } from "~/lib/product";
import { shopNow } from "~/lib/time";
import type { ReportOrder } from "~/server/admin/reports";
import { ORDER_STATUS_LABELS, type PaymentStatus } from "~/types/order";

/** A block of orders ready to show. */
export interface OrderBlock {
	heading?: string;
	color?: string;
	orders: ReportOrder[];
}

/** The list as staff see it, handed to whichever format they picked. */
export interface OrderExport {
	title: string;
	/** "12 orders · sorted by surname", the line under the title. */
	subtitle: string;
	blocks: OrderBlock[];
	/** Each group starts its own PDF page, or its own Excel sheet. */
	newPages: boolean;
	currency: string;
	paymentStatusLabel: (status: PaymentStatus) => string;
}

/** Rows use their company's color at this strength, like the printed list. */
const TINT = 0.18;

/** `#2563eb` → [37, 99, 235] */
function toRgb(hex: string) {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

/** The color at `TINT` strength over white, since neither format has alpha. */
function tinted(hex: string) {
	const [r, g, b] = toRgb(hex).map((c) => Math.round(255 - (255 - c) * TINT));
	return [r, g, b] as [number, number, number];
}

const toArgb = (rgb: readonly number[]) =>
	`FF${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const bouquetList = (order: ReportOrder) =>
	order.bouquets
		.map((b) => (b.quantity > 1 ? `${b.code} × ${b.quantity}` : b.code))
		.join(", ");

/** The day it was ordered on the shop's clock, `YYYY-MM-DD`. */
const orderDate = (order: ReportOrder) =>
	shopNow(new Date(order.createdAt)).date;

/** PDF's built-in fonts have no ₱, so amounts carry the currency code. */
function pdfMoney(amount: number, currency: string) {
	const digits = Number.isInteger(amount) ? 0 : 2;
	const number = amount.toLocaleString("en-PH", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
	return `${currency} ${number}`;
}

function fileName(title: string, extension: string) {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `oraia-${slug}-${shopNow().date}.${extension}`;
}

function download(data: Blob, name: string) {
	const url = URL.createObjectURL(data);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	URL.revokeObjectURL(url);
}

/** Excel allows 31 characters, a few banned ones, and no two alike. */
function sheetName(wanted: string, taken: Set<string>) {
	const clean =
		wanted
			.replace(/[\\/?*[\]:]/g, " ")
			.replace(/^'+|'+$/g, "")
			.trim() || "Orders";
	let name = clean.slice(0, 31).trim();
	for (let n = 2; taken.has(name.toLowerCase()); n++) {
		const suffix = ` (${n})`;
		name = `${clean.slice(0, 31 - suffix.length).trim()}${suffix}`;
	}
	taken.add(name.toLowerCase());
	return name;
}

/** Saves the list as an Excel workbook, with real dates and amounts. */
export async function exportOrdersExcel(list: OrderExport) {
	// Loaded on click: the two libraries are far bigger than the page itself.
	const { default: ExcelJS } = await import("exceljs");
	const workbook = new ExcelJS.Workbook();
	workbook.title = list.title;
	workbook.creator = "ORAIA";
	const symbol = formatPrice(0, list.currency).replace(/[\d.,\s]/g, "");
	const moneyFormat = `"${symbol}"#,##0.00`;
	const taken = new Set<string>();
	const sheets = list.newPages
		? list.blocks.map((block) => ({
				name: block.heading ?? list.title,
				blocks: [block],
			}))
		: [{ name: list.title, blocks: list.blocks }];

	for (const { name, blocks } of sheets) {
		const sheet = workbook.addWorksheet(sheetName(name, taken), {
			views: [{ state: "frozen", ySplit: 1 }],
			pageSetup: {
				orientation: "landscape",
				fitToPage: true,
				fitToWidth: 1,
				fitToHeight: 0,
				printTitlesRow: "1:1",
			},
		});
		const hasGroups = blocks.length > 1;
		sheet.columns = [
			...(hasGroups ? [{ header: "Group", key: "group", width: 26 }] : []),
			{ header: "Order", key: "number", width: 14 },
			{
				header: "Date",
				key: "date",
				width: 12,
				style: { numFmt: "yyyy-mm-dd" },
			},
			{ header: "Name", key: "name", width: 30 },
			{ header: "Company", key: "company", width: 12 },
			{ header: "Class", key: "className", width: 10 },
			{ header: "Bouquets", key: "bouquets", width: 24 },
			{ header: "Payment method", key: "method", width: 26 },
			{ header: "Payment status", key: "payment", width: 22 },
			{ header: "Reference no.", key: "reference", width: 20 },
			{
				header: "Total",
				key: "total",
				width: 14,
				style: { numFmt: moneyFormat },
			},
			{ header: "Order status", key: "status", width: 20 },
			{ header: "Cancel reason", key: "cancelReason", width: 32 },
		];
		const header = sheet.getRow(1);
		header.font = { bold: true };
		header.fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: "FFF3F4F6" },
		};

		for (const block of blocks) {
			for (const order of block.orders) {
				const row = sheet.addRow({
					group: block.heading,
					number: `#${order.number}`,
					date: new Date(`${orderDate(order)}T00:00:00Z`),
					name: order.name,
					company: order.company,
					className: order.className,
					bouquets: bouquetList(order),
					method: order.paymentLabel,
					payment: list.paymentStatusLabel(order.paymentStatus),
					// Text, so a leading zero survives.
					reference: order.referenceNumber ?? "",
					total: order.total,
					status: ORDER_STATUS_LABELS[order.status],
					cancelReason: order.cancelReason ?? "",
				});
				const color = orderColor(order.company, order.className);
				if (color)
					row.fill = {
						type: "pattern",
						pattern: "solid",
						fgColor: { argb: toArgb(tinted(color)) },
					};
			}
		}

		const last = sheet.rowCount;
		const columns = sheet.columnCount;
		sheet.autoFilter = {
			from: { row: 1, column: 1 },
			to: { row: last, column: columns },
		};
		// An order with two bouquets sits in two groups: adding those up would
		// count it twice.
		const orders = blocks.flatMap((block) => block.orders);
		if (new Set(orders.map((o) => o.id)).size === orders.length) {
			const total = sheet.getColumn("total");
			const column = total.letter;
			const footer = sheet.addRow({ name: "Total" });
			footer.font = { bold: true };
			// SUBTOTAL so the figure follows whatever the filters leave showing.
			footer.getCell("total").value = {
				formula: `SUBTOTAL(109,${column}2:${column}${last})`,
				result: orders.reduce((sum, o) => sum + o.total, 0),
			};
		}
	}

	const bytes = await workbook.xlsx.writeBuffer();
	download(
		new Blob([bytes], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		}),
		fileName(list.title, "xlsx"),
	);
}

/** Saves the list as a PDF on landscape short bond paper. */
export async function exportOrdersPdf(list: OrderExport) {
	const [{ jsPDF: PDF }, { default: autoTable }] = await Promise.all([
		import("jspdf"),
		import("jspdf-autotable"),
	]);
	const doc = new PDF({
		orientation: "landscape",
		unit: "mm",
		format: "letter",
		compress: true,
	}) as jsPDF & { lastAutoTable: { finalY: number } };
	doc.setProperties({ title: list.title, creator: "ORAIA" });
	const margin = 12;
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const ink: [number, number, number] = [55, 35, 45];
	const muted: [number, number, number] = [120, 110, 115];
	const columns = [
		"Order",
		"Date",
		"Name",
		"Company · Class",
		"Bouquets",
		"Payment",
		"Total",
		"Status",
	];
	const totalColumn = columns.indexOf("Total");

	doc.setFontSize(9);
	doc.setTextColor(...muted);
	doc.text(`ORAIA report · ${shopNow().date}`, margin, margin + 3);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(15);
	doc.setTextColor(...ink);
	doc.text(list.title, margin, margin + 10);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(9);
	doc.setTextColor(...muted);
	doc.text(list.subtitle, margin, margin + 15);

	let startY = margin + 19;
	list.blocks.forEach((block, index) => {
		if (index > 0) {
			if (list.newPages) {
				doc.addPage();
				startY = margin;
			} else {
				startY = doc.lastAutoTable.finalY + 6;
			}
		}
		const sum = block.orders.reduce((total, o) => total + o.total, 0);
		const count = block.orders.length;
		const heading =
			block.heading &&
			`${block.heading} · ${count} ${count === 1 ? "order" : "orders"} · ${pdfMoney(sum, list.currency)}`;
		autoTable(doc, {
			startY,
			margin: { top: margin, right: margin, bottom: margin + 4, left: margin },
			// In the head, so the group's name repeats on every page it runs onto.
			head: [
				...(heading
					? [
							[
								{
									content: heading,
									colSpan: columns.length,
									styles: {
										halign: "left" as const,
										fontSize: 10,
										fillColor: [253, 242, 246] as [number, number, number],
										textColor: ink,
									},
								},
							],
						]
					: []),
				columns,
			],
			body: block.orders.map((order) => [
				`#${order.number}`,
				orderDate(order),
				order.name,
				[order.company, order.className].filter(Boolean).join(" · "),
				bouquetList(order),
				[
					list.paymentStatusLabel(order.paymentStatus),
					order.paymentLabel,
					`Ref: ${order.referenceNumber || "-"}`,
				].join("\n"),
				pdfMoney(order.total, list.currency),
				[ORDER_STATUS_LABELS[order.status], order.cancelReason]
					.filter(Boolean)
					.join("\n"),
			]),
			theme: "plain",
			rowPageBreak: "avoid",
			styles: {
				fontSize: 8.5,
				cellPadding: 1.8,
				textColor: ink,
				lineColor: [230, 225, 228],
				lineWidth: { bottom: 0.1 },
			},
			headStyles: { fontStyle: "bold", textColor: muted },
			columnStyles: {
				0: { cellWidth: 26, fontStyle: "bold" },
				1: { cellWidth: 20 },
				[totalColumn]: { cellWidth: 25, halign: "right" },
			},
			didParseCell: ({ section, column, row, cell }) => {
				if (section === "head" && column.index === totalColumn && row.index > 0)
					cell.styles.halign = "right";
				if (section !== "body") return;
				const order = block.orders[row.index];
				const color = order && orderColor(order.company, order.className);
				if (color) cell.styles.fillColor = tinted(color);
			},
			// The company stripe; the outline keeps Bravo's white visible.
			didDrawCell: ({ section, column, row, cell }) => {
				if (section !== "body" || column.index !== 0) return;
				const order = block.orders[row.index];
				const color = order && orderColor(order.company, order.className);
				if (!color) return;
				doc.setFillColor(...toRgb(color));
				doc.setDrawColor(180, 180, 180);
				doc.setLineWidth(0.1);
				doc.rect(cell.x, cell.y, 1.2, cell.height, "FD");
			},
		});
	});

	const pages = doc.getNumberOfPages();
	doc.setFontSize(8);
	doc.setTextColor(...muted);
	for (let page = 1; page <= pages; page++) {
		doc.setPage(page);
		doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 8, {
			align: "right",
		});
	}

	doc.save(fileName(list.title, "pdf"));
}
