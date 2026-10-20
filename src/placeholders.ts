import { basename } from "node:path";
import { normalizePastedPath } from "./paths.js";

export type PlaceholderKind = "image" | "file";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;
const MARKER = /\[(image|file) #(\d+): [^\]\r\n]*\]/g;

/**
 * Swaps pasted file paths for short markers like `[image #1: shot.png]` and expands them
 * back to paths on submit. Only markers still present in the text expand, so deleting a
 * marker in the editor drops the attachment.
 */
export class PlaceholderRegistry {
	private readonly paths = new Map<number, string>();
	private counter = 0;

	/** Returns a marker when `pasted` is exactly one absolute file path, otherwise undefined. */
	register(pasted: string): string | undefined {
		const path = singlePath(pasted);
		if (!path) return undefined;
		this.counter++;
		this.paths.set(this.counter, path);
		const kind: PlaceholderKind = IMAGE_EXTENSIONS.test(path) ? "image" : "file";
		return `[${kind} #${this.counter}: ${basename(path)}]`;
	}

	/** Replaces every known marker with its quoted path. Unknown markers stay as typed. */
	expand(text: string): string {
		return text.replace(MARKER, (marker, _kind: string, id: string) => {
			const path = this.paths.get(Number(id));
			return path ? `"${path}"` : marker;
		});
	}

	/** Clears the map after a submit so numbering restarts with the next prompt. */
	reset(): void {
		this.paths.clear();
		this.counter = 0;
	}
}

/** A paste counts only when it is one path, optionally quoted, with no other text. */
function singlePath(pasted: string): string | undefined {
	const trimmed = pasted.trim();
	if (trimmed.length === 0 || /[\r\n]/.test(trimmed)) return undefined;
	const unquoted = trimmed.replace(/^(["'])(.*)\1$/, "$2");
	return normalizePastedPath(unquoted);
}
