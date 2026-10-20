import { open, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

/** Per-file cap. Longer files are cut and the block says so. */
export const MAX_TEXT_BYTES = 100_000;
/** Cap across all files in one submit, so several dropped logs cannot flood the context. */
export const MAX_TOTAL_TEXT_BYTES = 200_000;

const NUL_SCAN_BYTES = 8_192;

/** Read as text without sniffing. Unknown extensions must pass the NUL check. */
const TEXT_EXTENSIONS = new Set([
	".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini",
	".xml", ".html", ".htm", ".css", ".scss", ".log", ".sql", ".sh", ".bash", ".ps1", ".bat",
	".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".kt",
	".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".swift", ".vue", ".svelte", ".r", ".lua", ".dart",
]);

/** Binary types handled by other routes or not supported, never read as text. */
const NON_TEXT_EXTENSIONS = new Set([
	".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".docx", ".xlsx", ".pptx", ".zip", ".rar",
	".7z", ".gz", ".tar", ".exe", ".dll", ".bin", ".mp4", ".mkv", ".mov", ".avi", ".mp3", ".wav",
]);

/** Secrets never enter the prompt. The caller still keeps the path text. */
const SECRET_NAME = /^(\.env(\..+)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.+\.(pem|key|p12|pfx))$/i;

export interface TextFile {
	name: string;
	body: string;
	truncated: boolean;
	limit: number;
	byteLength: number;
}

export type TextFileResult =
	| { kind: "text"; file: TextFile }
	| { kind: "skip"; reason: string }
	| { kind: "reject"; reason: string };

/** Reads one file as UTF-8 within `limit` bytes. Never throws; failures come back as results. */
export async function loadTextFile(path: string, limit = MAX_TEXT_BYTES): Promise<TextFileResult> {
	const name = basename(path);
	if (SECRET_NAME.test(name)) return { kind: "reject", reason: "secret-looking file, path kept only" };
	const extension = extname(name).toLowerCase();
	if (NON_TEXT_EXTENSIONS.has(extension)) return { kind: "skip", reason: "binary type, not inlined" };
	try {
		return await readText(path, name, extension, limit);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return { kind: "skip", reason: "not found" };
		return { kind: "reject", reason: error instanceof Error ? error.message : String(error) };
	}
}

/** Builds the labeled prompt block. The fence grows past any backtick run in the body. */
export function formatTextBlock(path: string, file: TextFile): string {
	const fence = fenceFor(file.body);
	const note = file.truncated ? `\n[truncated: first ${file.limit} of ${file.byteLength} bytes]` : "";
	return `[file: ${file.name}] (${path})\n${fence}\n${file.body}${note}\n${fence}`;
}

async function readText(path: string, name: string, extension: string, limit: number): Promise<TextFileResult> {
	const info = await stat(path);
	if (!info.isFile()) return { kind: "skip", reason: "not a file" };

	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(Math.min(info.size, limit));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const bytes = buffer.subarray(0, bytesRead);
		const knownText = TEXT_EXTENSIONS.has(extension);
		if (!knownText && bytes.subarray(0, NUL_SCAN_BYTES).includes(0)) {
			return { kind: "skip", reason: "binary content" };
		}
		const truncated = info.size > limit;
		return {
			kind: "text",
			file: { name, body: decodeUtf8(bytes, truncated), truncated, limit, byteLength: info.size },
		};
	} finally {
		await handle.close();
	}
}

/** Drops a multi-byte character cut by the limit, so the body never ends in a replacement character. */
function decodeUtf8(bytes: Buffer, truncated: boolean): string {
	if (!truncated) return bytes.toString("utf8");
	let end = bytes.length;
	let continuation = 0;
	while (continuation < 3 && end > 0 && (bytes[end - 1] & 0xc0) === 0x80) {
		end--;
		continuation++;
	}
	if (end === 0) return "";
	const lead = bytes[end - 1];
	const needed = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
	const complete = continuation + 1 >= needed;
	return (complete ? bytes : bytes.subarray(0, end - 1)).toString("utf8");
}

function fenceFor(body: string): string {
	let longest = 2;
	for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
	return "`".repeat(longest + 1);
}

function errorCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException | undefined)?.code;
}
