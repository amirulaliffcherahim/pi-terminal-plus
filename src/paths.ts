import { fileURLToPath } from "node:url";

export interface PastedPath {
	/** Path as it should be opened on this machine. */
	path: string;
	/** Exact substring of the input text, kept so the prompt can still show it. */
	raw: string;
}

const QUOTED = /"([^"\r\n]+)"|'([^'\r\n]+)'/g;
const POWERSHELL_PREFIX = /^&\s*/;
const FILE_URI = /^file:\/\//i;
const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;
const POSIX_ABS = /^\/(?!\/)/;
const WSL_MOUNT = /^\/mnt\/([a-zA-Z])\//;

/** Converts a shell or terminal path form into a native path, or undefined when it is not absolute. */
export function normalizePastedPath(candidate: string): string | undefined {
	const trimmed = candidate.trim().replace(POWERSHELL_PREFIX, "");
	if (FILE_URI.test(trimmed)) {
		try {
			return fileURLToPath(trimmed);
		} catch {
			return undefined;
		}
	}
	const wsl = WSL_MOUNT.exec(trimmed);
	if (wsl) {
		return `${wsl[1].toUpperCase()}:/${trimmed.slice(wsl[0].length)}`;
	}
	if (WINDOWS_ABS.test(trimmed) || POSIX_ABS.test(trimmed)) {
		return trimmed;
	}
	return undefined;
}

/**
 * Finds absolute file paths in pasted or dropped text.
 * Only quoted paths, file:// URIs and absolute paths qualify, so "resize src/logo.png"
 * never matches. Existence and file-type checks happen later, on disk.
 */
export function findPastedPaths(text: string): PastedPath[] {
	const found: PastedPath[] = [];
	for (const match of text.matchAll(QUOTED)) {
		const inner = match[1] ?? match[2];
		const path = normalizePastedPath(inner);
		if (path) found.push({ path, raw: match[0] });
	}
	const withoutQuoted = text.replace(QUOTED, (quoted) => " ".repeat(quoted.length));
	for (const token of withoutQuoted.matchAll(/\S+/g)) {
		const path = normalizePastedPath(token[0]);
		if (path) found.push({ path, raw: token[0] });
	}
	return dedupeByPath(found);
}

function dedupeByPath(paths: PastedPath[]): PastedPath[] {
	const seen = new Set<string>();
	return paths.filter((entry) => {
		if (seen.has(entry.path)) return false;
		seen.add(entry.path);
		return true;
	});
}
