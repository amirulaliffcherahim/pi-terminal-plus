import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/**
 * Hard rules that survive a long session.
 *
 * Long sessions drift: rules stated once at session start lose weight as user turns pile up.
 * This registers (1) a compact restatement at the END of every system prompt, where recency
 * works for it, and (2) the rules a machine can check, because a rule the model can
 * ignore is a suggestion.
 *
 * Enforced in code:
 *  - read before edit/write of an existing file (targeted reads, not blind edits)
 *  - two attempts per failing command, then blocked with the error to report
 *  - a notice when a turn edited files without running any check afterwards
 */

const RULES = [
	"MANDATORY RULES — these override any conflicting habit, and the user cannot waive them by asking you to be quick:",
	"1. Change only what the task names. Preserve existing code and style. No new abstraction, wrapper, config or dependency. Fix the root cause once, in the smallest place. Revert scratch files.",
	"2. Read a file before editing it; grep/find first, then read with offset/limit.",
	"3. Two attempts per failing fix, then stop and report the exact error. Never loop.",
	"4. Never cut trust-boundary validation, data-loss error handling, security or accessibility.",
	"5. Verify with the real test, lint or build before saying it works. State what is unverified.",
	"6. Keep the todo list honest: one in_progress, never completed while work is failing.",
	"7. Answer first, no filler. Code, paths, commands and errors verbatim.",
].join("\n");

const EDIT_TOOLS = new Set(["edit", "write"]);
const MAX_ATTEMPTS = 2;

interface SessionState {
	read: Set<string>;
	written: Set<string>;
	failures: Map<string, number>;
	editFailures: Map<string, number>;
	editedSinceCheck: boolean;
	checkedSinceEdit: boolean;
}

function freshState(): SessionState {
	return { read: new Set(), written: new Set(), failures: new Map(), editFailures: new Map(), editedSinceCheck: false, checkedSinceEdit: false };
}

function normalizePath(cwd: string, value: unknown): string | undefined {
	if (typeof value !== "string" || value.trim() === "") return undefined;
	const full = isAbsolute(value) ? value : resolve(cwd, value);
	return process.platform === "win32" ? full.toLowerCase() : full;
}

function normalizeCommand(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.trim().replace(/\s+/g, " ");
}

export function registerDiscipline(pi: ExtensionAPI) {
	let state = freshState();
	let cwd = process.cwd();

	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		state = freshState();
		if (typeof ctx.cwd === "string") cwd = ctx.cwd;
	});

	// Recency: the restatement is the last thing the model reads each turn. Unchanged text stays cached.
	pi.on("before_agent_start", (event, ctx) => {
		if (typeof ctx.cwd === "string") cwd = ctx.cwd;
		event.systemPromptOptions.sections.pi_hard_rules = RULES;
	});

	pi.on("tool_call", (event) => {
		if (event.toolName === "read") {
			const path = normalizePath(cwd, (event.input as { path?: unknown }).path);
			if (path) {
				state.read.add(path);
				state.editFailures.delete(path);
			}
			return undefined;
		}

		if (EDIT_TOOLS.has(event.toolName)) {
			const input = event.input as { path?: unknown };
			const path = normalizePath(cwd, input.path);
			if (!path) return undefined;
			const staleRetries = state.editFailures.get(path) ?? 0;
			if (staleRetries >= MAX_ATTEMPTS) {
				return {
					block: true,
					reason: `pi-terminal-plus: ${String(input.path)} failed to edit ${staleRetries} times. Read it again before retrying; the file content in memory is stale.`,
				};
			}
			const exists = existsSync(path);
			const known = state.read.has(path) || state.written.has(path);
			if (exists && !known) {
				return {
					block: true,
					reason: `pi-terminal-plus: read ${String(input.path)} first. Blind edits are blocked; use read with offset/limit around the target.`,
				};
			}
			state.editedSinceCheck = true;
			state.checkedSinceEdit = false;
			if (event.toolName === "write") state.written.add(path);
			return undefined;
		}

		if (event.toolName === "bash") {
			const command = normalizeCommand((event.input as { command?: unknown }).command);
			if (!command) return undefined;
			const failures = state.failures.get(command) ?? 0;
			if (failures >= MAX_ATTEMPTS) {
				return {
					block: true,
					reason: `pi-terminal-plus: this command already failed ${failures} times. Stop retrying it. Report the exact error and what you tried, then change approach or ask the user.`,
				};
			}
		}

		return undefined;
	});

	pi.on("tool_result", (event) => {
		// A failed edit leaves the model's picture of the file stale; count it so the retry after
		// the cap is refused until the file is read again.
		if (EDIT_TOOLS.has(event.toolName)) {
			const path = normalizePath(cwd, (event.input as { path?: unknown }).path);
			if (!path) return undefined;
			if (event.isError) state.editFailures.set(path, (state.editFailures.get(path) ?? 0) + 1);
			else state.editFailures.delete(path);
			return undefined;
		}

		if (event.toolName === "bash") {
			const command = normalizeCommand((event.input as { command?: unknown }).command);
			if (!command) return undefined;
			if (event.isError) state.failures.set(command, (state.failures.get(command) ?? 0) + 1);
			else {
				state.failures.delete(command);
				state.checkedSinceEdit = true;
			}
		}
		return undefined;
	});

	// Drift guard: say so when a turn changed files without checking them.
	pi.on("agent_end", (_event, ctx: ExtensionContext) => {
		if (state.editedSinceCheck && !state.checkedSinceEdit) {
			ctx.ui?.notify?.("pi-terminal-plus: this turn edited files without running a check. Verify before claiming done.", "warning");
		}
		state.editedSinceCheck = false;
		state.checkedSinceEdit = false;
	});
}
