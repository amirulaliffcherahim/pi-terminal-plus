import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

/** Source files above this size are refused before parsing. */
export const MAX_SOURCE_BYTES = 25_000_000;
/** Markdown returned to the model is cut at this size. */
export const MAX_OUTPUT_CHARS = 100_000;
/** A conversion that runs longer than this is abandoned. */
export const CONVERT_TIMEOUT_MS = 30_000;

export type ConvertResult =
	| { ok: true; markdown: string; truncated: boolean; kind: DocumentKind }
	| { ok: false; reason: string };

export type DocumentKind = "pdf" | "docx" | "xlsx";

const KIND_BY_EXTENSION: Record<string, DocumentKind> = {
	".pdf": "pdf",
	".docx": "docx",
	".xlsx": "xlsx",
};

export function documentKindOf(path: string): DocumentKind | undefined {
	return KIND_BY_EXTENSION[extname(path).toLowerCase()];
}

/** Converts a supported document to Markdown. Never throws; failures come back as `{ ok: false }`. */
export async function convertToMarkdown(path: string): Promise<ConvertResult> {
	const kind = documentKindOf(path);
	if (!kind) return { ok: false, reason: "unsupported document type" };

	const info = await stat(path).catch(() => undefined);
	if (!info || !info.isFile()) return { ok: false, reason: "not a file" };
	if (info.size > MAX_SOURCE_BYTES) {
		return { ok: false, reason: `file is ${info.size} bytes, limit is ${MAX_SOURCE_BYTES}` };
	}

	try {
		const bytes = await withTimeout(readFile(path), CONVERT_TIMEOUT_MS, "read");
		const markdown = await withTimeout(runConverter(kind, bytes), CONVERT_TIMEOUT_MS, kind);
		const cleaned = markdown.trim();
		if (cleaned.length === 0) return { ok: false, reason: `no text found in ${kind} (scanned or empty?)` };
		const truncated = cleaned.length > MAX_OUTPUT_CHARS;
		return { ok: true, markdown: truncated ? cleaned.slice(0, MAX_OUTPUT_CHARS) : cleaned, truncated, kind };
	} catch (error) {
		return { ok: false, reason: `${kind} conversion failed: ${errorMessage(error)}` };
	}
}

async function runConverter(kind: DocumentKind, bytes: Buffer): Promise<string> {
	if (kind === "pdf") return pdfToText(bytes);
	if (kind === "docx") return docxToMarkdown(bytes);
	return xlsxToMarkdown(bytes);
}

/** Converters load on first use so Pi's startup and normal prompts never pay for them. */
async function pdfToText(bytes: Buffer): Promise<string> {
	const { getDocumentProxy, extractText } = await import("unpdf");
	const pdf = await getDocumentProxy(new Uint8Array(bytes));
	const { text } = await extractText(pdf, { mergePages: true });
	return text;
}

async function docxToMarkdown(bytes: Buffer): Promise<string> {
	const [{ default: mammoth }, { default: TurndownService }] = await Promise.all([
		import("mammoth"),
		import("turndown"),
	]);
	const { value: html } = await mammoth.convertToHtml(
		{ buffer: bytes },
		{ convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })) },
	);
	return new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }).turndown(html);
}

/** One Markdown table per sheet, so the model sees rows and columns. */
async function xlsxToMarkdown(bytes: Buffer): Promise<string> {
	const XLSX = await import("xlsx");
	const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
	return workbook.SheetNames.map((name) => {
		const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
		return `## ${name}\n\n${toMarkdownTable(rows)}`;
	}).join("\n\n");
}

function toMarkdownTable(rows: unknown[][]): string {
	if (rows.length === 0) return "(empty sheet)";
	const width = Math.max(...rows.map((row) => row.length));
	const cell = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
	const line = (row: unknown[]) => `| ${Array.from({ length: width }, (_, i) => cell(row[i])).join(" | ")} |`;
	const [header, ...body] = rows;
	return [line(header), `| ${Array(width).fill("---").join(" | ")} |`, ...body.map(line)].join("\n");
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
