import { open, stat } from "node:fs/promises";
import { extname } from "node:path";

/**
 * Anthropic rejects images over 5 MB. Base64 adds about a third, so the raw limit
 * is 3.75 MB. No resize library is bundled, so larger files are refused with a notice.
 */
export const MAX_IMAGE_BYTES = 3_750_000;

export type SupportedImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface ImageFileLoad {
	mimeType: SupportedImageMime;
	data: string;
	byteLength: number;
}

/**
 * missing and not-image are ordinary paths the user typed, so they pass through silently.
 * too-large and error are real images the user meant to attach, so they must be reported.
 */
export type ImageFileFailure = "missing" | "not-image" | "too-large" | "error";

export type ImageFileResult =
	| { ok: true; image: ImageFileLoad }
	| { ok: false; kind: ImageFileFailure; reason: string };

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Name-based check for routing only. Content is still verified before any image is sent. */
export function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Detects the image type from file content, never from the file name. */
export function sniffImageMime(header: Uint8Array): SupportedImageMime | undefined {
	if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
	if (startsWith(header, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (startsWith(header, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
	if (startsWith(header, [0x52, 0x49, 0x46, 0x46]) && matchesAt(header, 8, [0x57, 0x45, 0x42, 0x50])) {
		return "image/webp";
	}
	return undefined;
}

/** Reads an image file, checks its real type and size, and returns base64 data for ImageContent. */
export async function loadImageFile(path: string): Promise<ImageFileResult> {
	const info = await stat(path).catch(() => undefined);
	if (!info || !info.isFile()) return { ok: false, kind: "missing", reason: "not a file" };
	if (info.size > MAX_IMAGE_BYTES) {
		return { ok: false, kind: "too-large", reason: `${info.size} bytes exceeds the ${MAX_IMAGE_BYTES} byte limit` };
	}

	const handle = await open(path, "r");
	try {
		const header = Buffer.alloc(12);
		await handle.read(header, 0, header.length, 0);
		const mimeType = sniffImageMime(header);
		if (!mimeType) return { ok: false, kind: "not-image", reason: "not a png, jpeg, webp or gif file" };
		const bytes = await handle.readFile();
		return {
			ok: true,
			image: { mimeType, data: bytes.toString("base64"), byteLength: bytes.length },
		};
	} finally {
		await handle.close();
	}
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
	return matchesAt(bytes, 0, prefix);
}

function matchesAt(bytes: Uint8Array, offset: number, expected: number[]): boolean {
	if (bytes.length < offset + expected.length) return false;
	return expected.every((byte, index) => bytes[offset + index] === byte);
}
