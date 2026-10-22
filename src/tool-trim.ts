import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Tool schemas are sent on every request, and they are the largest static cost in a session:
 * in this setup about 8,000 tokens, against roughly 4,900 for the whole system prompt.
 *
 * This keeps only the tools a coding session actually uses. Tools that are still registered stay
 * callable from codemode scripts and can be restored at any time.
 *
 * Override with PI_TOOLS_KEEP="read,bash,..." ; PI_TOOLS_KEEP="*" disables trimming.
 * Delegation tools are owned by pi-worker and are left alone here.
 */
const DEFAULT_KEEP = [
	"read",
	"powershell",
	// bash is Git Bash, kept only for git and GitHub operations.
	"bash",
	"edit",
	"write",
	"todo",
	"ask_user_question",
	"advise",
	"discuss",
	"memory_read",
	"memory_search",
	"memory_write",
	"scratchpad",
	"web_search",
	"fetch_content",
	"get_search_content",
	"convert_to_markdown",
	"worker_diff",
];

// Managed by pi-worker's lead gate: never trimmed here, never force-enabled here.
const DELEGATION = new Set(["delegate_task", "subagents_enable", "subagent_supervisor"]);

function resolveKeep(): string[] | undefined {
	const raw = process.env.PI_TOOLS_KEEP?.trim();
	if (raw === "*") return undefined;
	if (raw) return raw.split(",").map((name) => name.trim()).filter(Boolean);
	return DEFAULT_KEEP;
}

export function registerToolTrim(pi: ExtensionAPI) {
	const apply = () => {
		// Delegated workers get their own tool plan from pi-worker; do not strip it here.
		if (process.env.PI_WORKER_CHILD === "1") return;
		const keep = resolveKeep();
		if (!keep) return;
		const available = new Set(pi.getAllTools().map((tool) => tool.name));
		const active = pi.getActiveTools();
		const wanted = keep.filter((name) => available.has(name));
		const delegation = active.filter((name) => DELEGATION.has(name));
		const next = [...new Set([...wanted, ...delegation])];
		const same = next.length === active.length && next.every((name) => active.includes(name));
		if (!same) pi.setActiveTools(next);
	};

	pi.on("session_start", apply);
	// Re-assert each turn: extensions activating tools would otherwise add their schemas back.
	pi.on("before_agent_start", apply);
}
