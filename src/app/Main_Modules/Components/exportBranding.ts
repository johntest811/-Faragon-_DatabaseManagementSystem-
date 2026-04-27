"use client";

import ExcelJS from "exceljs";
import jsPDF from "jspdf";

type BrandImage = {
	dataUrl: string;
	width: number;
	height: number;
};

const BRAND_SOURCES = {
	logo: "/Logo.png",
	title: "/Title.png",
	iso: "/ISO.png",
} as const;

const BRAND_LAYOUT = {
	logo: { width: 96, height: 44 },
	title: { width: 420, height: 52 },
	iso: { width: 96, height: 44 },
	workbook: { row1: 56, row2: 30, row3: 22, row4: 8, row5: 24 },
	pdfTop: 16,
	pdfMargin: 36,
} as const;

let brandImagePromise: Promise<Record<keyof typeof BRAND_SOURCES, BrandImage | null>> | null = null;

function safeText(value: unknown) {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return String(value);
}

function loadImage(src: string): Promise<BrandImage | null> {
	return new Promise((resolve) => {
		if (typeof Image === "undefined" || typeof document === "undefined") {
			resolve(null);
			return;
		}

		const image = new Image();
		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = image.naturalWidth || image.width || 1;
				canvas.height = image.naturalHeight || image.height || 1;
				const context = canvas.getContext("2d");
				if (!context) {
					resolve(null);
					return;
				}

				context.drawImage(image, 0, 0);
				resolve({
					dataUrl: canvas.toDataURL("image/png"),
					width: canvas.width,
					height: canvas.height,
				});
			} catch {
				resolve(null);
			}
		};
		image.onerror = () => resolve(null);
		image.src = src;
	});
}

function loadBrandImages() {
	if (!brandImagePromise) {
		brandImagePromise = Promise.all([
			loadImage(BRAND_SOURCES.logo),
			loadImage(BRAND_SOURCES.title),
			loadImage(BRAND_SOURCES.iso),
		]).then(([logo, title, iso]) => ({ logo, title, iso }));
	}

	return brandImagePromise;
}

function fitWithin(image: BrandImage, maxWidth: number, maxHeight: number) {
	const width = image.width || 1;
	const height = image.height || 1;
	const scale = Math.min(maxWidth / width, maxHeight / height, 1);
	return {
		width: width * scale,
		height: height * scale,
	};
}

function dataUrlToBase64(dataUrl: string) {
	const commaIndex = dataUrl.indexOf(",");
	return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function normalizeSheetName(value: string) {
	const clean = String(value ?? "")
		.replace(/[\\/*?:\[\]]/g, " ")
		.trim();
	return (clean || "Sheet1").slice(0, 31);
}

function writeCenteredRow(worksheet: ExcelJS.Worksheet, rowNumber: number, columnCount: number, value: string, options: { size: number; bold?: boolean; italic?: boolean }) {
	const endColumn = Math.max(columnCount, 1);
	worksheet.mergeCells(rowNumber, 1, rowNumber, endColumn);
	const cell = worksheet.getCell(rowNumber, 1);
	cell.value = value;
	cell.font = {
		size: options.size,
		bold: options.bold ?? false,
		italic: options.italic ?? false,
		color: { argb: "FF111827" },
	};
	cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

export type BrandedWorkbookSheet = {
	name: string;
	title: string;
	subtitle?: string;
	rows: Array<Record<string, unknown>>;
};

export async function buildBrandedWorkbookBuffer(sheets: BrandedWorkbookSheet[]) {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Faragon Database";
	workbook.lastModifiedBy = "Faragon Database";
	workbook.created = new Date();
	workbook.modified = new Date();

	const images = await loadBrandImages();
	const logoId = images.logo ? workbook.addImage({ base64: dataUrlToBase64(images.logo.dataUrl), extension: "png" }) : null;
	const titleId = images.title ? workbook.addImage({ base64: dataUrlToBase64(images.title.dataUrl), extension: "png" }) : null;
	const isoId = images.iso ? workbook.addImage({ base64: dataUrlToBase64(images.iso.dataUrl), extension: "png" }) : null;

	for (const sheetSpec of sheets) {
		const sheetName = normalizeSheetName(sheetSpec.name);
		const worksheet = workbook.addWorksheet(sheetName);
		const headers = Object.keys(sheetSpec.rows[0] ?? {});
		const normalizedHeaders = headers.length ? headers : [""];
		const columnCount = Math.max(normalizedHeaders.length, 3);

		worksheet.views = [{ state: "frozen", ySplit: 5 }];
		worksheet.getRow(1).height = BRAND_LAYOUT.workbook.row1;
		worksheet.getRow(2).height = BRAND_LAYOUT.workbook.row2;
		worksheet.getRow(3).height = sheetSpec.subtitle ? BRAND_LAYOUT.workbook.row3 : 10;
		worksheet.getRow(4).height = BRAND_LAYOUT.workbook.row4;
		worksheet.getRow(5).height = 24;

		if (logoId != null) {
			const fit = fitWithin(images.logo as BrandImage, BRAND_LAYOUT.logo.width, BRAND_LAYOUT.logo.height);
			worksheet.addImage(logoId, { tl: { col: 0, row: 0.1 }, ext: { width: fit.width, height: fit.height } });
		}
		if (titleId != null) {
			const fit = fitWithin(images.title as BrandImage, BRAND_LAYOUT.title.width, BRAND_LAYOUT.title.height);
			worksheet.addImage(titleId, {
				tl: { col: Math.max(1, Math.floor(columnCount / 2) - Math.max(1, Math.ceil(fit.width / 80))), row: 0.05 },
				ext: { width: fit.width, height: fit.height },
			});
		}
		if (isoId != null) {
			const fit = fitWithin(images.iso as BrandImage, BRAND_LAYOUT.iso.width, BRAND_LAYOUT.iso.height);
			worksheet.addImage(isoId, { tl: { col: Math.max(0, columnCount - 1), row: 0.1 }, ext: { width: fit.width, height: fit.height } });
		}

		writeCenteredRow(worksheet, 2, columnCount, sheetSpec.title, { size: 16, bold: true });
		if (sheetSpec.subtitle) {
			writeCenteredRow(worksheet, 3, columnCount, sheetSpec.subtitle, { size: 10, italic: true });
		}

		const headerRow = worksheet.getRow(5);
		normalizedHeaders.forEach((header, index) => {
			headerRow.getCell(index + 1).value = header;
		});
		headerRow.font = { bold: true, color: { argb: "FF111827" } };
		headerRow.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
		headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFDA03" } };

		const columnWidths = normalizedHeaders.map((header) => Math.min(Math.max(header.length + 2, 12), 36));

		for (const row of sheetSpec.rows) {
			const rowValues = normalizedHeaders.map((header) => safeText(row[header]));
			const addedRow = worksheet.addRow(rowValues);
			addedRow.alignment = { vertical: "top", wrapText: true };
			rowValues.forEach((value, index) => {
				columnWidths[index] = Math.min(Math.max(columnWidths[index], value.length + 2), 36);
			});
		}

		columnWidths.forEach((width, index) => {
			worksheet.getColumn(index + 1).width = width;
		});

		worksheet.autoFilter = {
			from: { row: 5, column: 1 },
			to: { row: 5, column: normalizedHeaders.length },
		};
	}

	return workbook.xlsx.writeBuffer();
}

export function buildBrandedAoa<T extends Record<string, unknown>>(rows: T[], title: string, subtitle?: string) {
	if (!rows.length) return [] as string[][];

	const headers = Object.keys(rows[0]);
	const width = Math.max(headers.length, 3);
	const center = Math.floor(width / 2);

	const bannerRow = new Array(width).fill("");
	bannerRow[0] = "Logo.png";
	bannerRow[center] = "Title.png";
	bannerRow[width - 1] = "ISO.png";

	const titleRow = new Array(width).fill("");
	titleRow[center] = title;

	const output: string[][] = [bannerRow, titleRow];

	if (subtitle) {
		const subtitleRow = new Array(width).fill("");
		subtitleRow[center] = subtitle;
		output.push(subtitleRow);
	}

	output.push(headers);
	for (const row of rows) {
		output.push(headers.map((header) => safeText(row[header])));
	}

	return output;
}

export async function addBrandedPdfHeader(doc: jsPDF, title: string, subtitle?: string) {
	const images = await loadBrandImages();
	const pageWidth = doc.internal.pageSize.getWidth();
	const margin = BRAND_LAYOUT.pdfMargin;
	const top = BRAND_LAYOUT.pdfTop;
	const fallbackHeight = 44;
	let maxHeight = fallbackHeight;

	if (images.logo) {
		const fit = fitWithin(images.logo, BRAND_LAYOUT.logo.width, BRAND_LAYOUT.logo.height);
		doc.addImage(images.logo.dataUrl, "PNG", margin, top, fit.width, fit.height);
		maxHeight = Math.max(maxHeight, fit.height);
	}

	if (images.title) {
		const fit = fitWithin(images.title, Math.min(BRAND_LAYOUT.title.width, pageWidth - margin * 2), BRAND_LAYOUT.title.height);
		const x = (pageWidth - fit.width) / 2;
		doc.addImage(images.title.dataUrl, "PNG", x, top, fit.width, fit.height);
		maxHeight = Math.max(maxHeight, fit.height);
	}

	if (images.iso) {
		const fit = fitWithin(images.iso, BRAND_LAYOUT.iso.width, BRAND_LAYOUT.iso.height);
		doc.addImage(images.iso.dataUrl, "PNG", pageWidth - margin - fit.width, top, fit.width, fit.height);
		maxHeight = Math.max(maxHeight, fit.height);
	}

	doc.setTextColor(17, 24, 39);
	doc.setFontSize(15);
	doc.text(title, pageWidth / 2, top + maxHeight + 18, { align: "center" });

	if (subtitle) {
		doc.setTextColor(75, 85, 99);
		doc.setFontSize(9);
		doc.text(subtitle, pageWidth / 2, top + maxHeight + 31, {
			align: "center",
			maxWidth: pageWidth - margin * 2,
		});
	}

	return top + maxHeight + (subtitle ? 42 : 28);
}