import { basename, extname } from "node:path";
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
		if (!path || extname(path) === "") return undefined;
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

	/** Ids of markers that can still expand, used to keep stray hand-typed markers non-atomic. */
	ids(): ReadonlySet<number> {
		return new Set(this.paths.keys());
	}

	/**
	 * Drops entries whose marker is gone from `text`, and restarts numbering once none remain.
	 * Called after edits so deleting every marker makes the next paste #1 again.
	 */
	prune(text: string): void {
		const present = new Set<number>();
		for (const match of text.matchAll(MARKER)) present.add(Number(match[2]));
		for (const id of [...this.paths.keys()]) if (!present.has(id)) this.paths.delete(id);
		if (this.paths.size === 0) this.counter = 0;
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

export interface MarkerSpan {
	start: number;
	end: number;
}

/** Finds markers whose id is registered. Hand-typed look-alikes with unknown ids are ignored. */
export function markerSpans(text: string, validIds: ReadonlySet<number>): MarkerSpan[] {
	if (validIds.size === 0 || !text.includes("#")) return [];
	const spans: MarkerSpan[] = [];
	for (const match of text.matchAll(MARKER)) {
		if (!validIds.has(Number(match[2]))) continue;
		spans.push({ start: match.index, end: match.index + match[0].length });
	}
	return spans;
}

export interface TextSegment {
	segment: string;
	index: number;
	input: string;
}

/**
 * Merges every segment inside a marker span into one segment, so cursor moves and
 * Backspace/Delete treat the marker as a single unit, as Pi does for its paste markers.
 */
export function mergeMarkerSegments<T extends TextSegment>(
	segments: Iterable<T>,
	text: string,
	spans: readonly MarkerSpan[],
): T[] {
	if (spans.length === 0) return [...segments];
	const merged: T[] = [];
	let spanIndex = 0;
	for (const segment of segments) {
		while (spanIndex < spans.length && spans[spanIndex].end <= segment.index) spanIndex++;
		const span = spans[spanIndex];
		const insideSpan = span !== undefined && segment.index >= span.start && segment.index < span.end;
		if (!insideSpan) {
			merged.push(segment);
		} else if (segment.index === span.start) {
			merged.push({ ...segment, segment: text.slice(span.start, span.end) });
		}
	}
	return merged;
}

/** Adds a space on each side of a marker that would otherwise touch neighbouring text. */
export function padMarker(marker: string, before: string | undefined, after: string | undefined): string {
	const lead = before !== undefined && before !== "" && !/\s/.test(before) ? " " : "";
	const trail = after !== undefined && after !== "" && !/\s/.test(after) ? " " : "";
	return `${lead}${marker}${trail}`;
}
