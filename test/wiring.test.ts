import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import terminalPlus from "../src/index.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");

type Handler = (event: any, ctx: any) => any;

/** Loads the extension against a stub API and returns the handlers it registered. */
function load(registered = ["read", "edit", "bash", "web_search", "some_extension_tool"]) {
	const handlers = new Map<string, Handler[]>();
	const toolState = { active: [...registered] };
	const notices: string[] = [];
	const pi = {
		registerTool: () => {},
		on: (name: string, fn: Handler) => {
			handlers.set(name, [...(handlers.get(name) ?? []), fn]);
		},
		getAllTools: () => registered.map((name) => ({ name })),
		getActiveTools: () => [...toolState.active],
		setActiveTools: (names: string[]) => {
			toolState.active = [...names];
		},
	};
	terminalPlus(pi as never);
	// Every handler for an event runs in registration order, the same as Pi does.
	const runAll = (name: string, ...args: unknown[]) => {
		const list = handlers.get(name);
		assert.ok(list?.length, `registered a ${name} handler`);
		for (const fn of list) fn(...args);
	};
	const run = (name: string, ...args: unknown[]) => {
		const list = handlers.get(name);
		assert.ok(list?.length, `registered a ${name} handler`);
		return list.at(-1)!(...args);
	};
	const ctx = {
		cwd: FIXTURES,
		mode: "tui",
		ui: { notify: (message: string) => notices.push(message), getEditorComponent: () => undefined, setEditorComponent: () => {} },
	};
	return { run, runAll, notices, toolState, ctx };
}

test("the hard rules are appended as the last prompt section every turn", () => {
	const { runAll, ctx } = load();
	const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
	runAll("before_agent_start", event, ctx);
	assert.match(event.systemPromptOptions.sections.pi_hard_rules, /MANDATORY RULES/);
	assert.match(event.systemPromptOptions.sections.pi_hard_rules, /Two attempts per failing fix/);
});

test("personal rules from ~/.pi/agent/RULES_EXTRA.md, or PI_RULES_EXTRA, follow the generic ones", () => {
	const file = join(tmpdir(), "pi-rules-extra-test.md");
	writeFileSync(file, "VOICE: terse.\n");
	process.env.PI_RULES_EXTRA = file;
	try {
		const { runAll, ctx } = load();
		const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
		runAll("session_start", {}, ctx);
		runAll("before_agent_start", event, ctx);
		const rules = event.systemPromptOptions.sections.pi_hard_rules;
		assert.match(rules, /MANDATORY RULES/);
		assert.ok(rules.endsWith("VOICE: terse."), rules.slice(-60));
	} finally {
		delete process.env.PI_RULES_EXTRA;
		rmSync(file, { force: true });
	}
});

test("an edit of an unread file is blocked, and allowed after a read", () => {
	const { run, ctx } = load();
	const target = join(FIXTURES, "sample.xlsx");
	const blocked = run("tool_call", { toolName: "edit", input: { path: target } }, ctx);
	assert.equal(blocked.block, true);
	assert.match(blocked.reason, /read .* first/);
	run("tool_call", { toolName: "read", input: { path: target } }, ctx);
	assert.equal(run("tool_call", { toolName: "edit", input: { path: target } }, ctx), undefined);
});

test("a command that failed twice is refused", () => {
	const { run, ctx } = load();
	const input = { command: "npm run nope" };
	run("tool_call", { toolName: "bash", input }, ctx);
	run("tool_result", { toolName: "bash", input, isError: true }, ctx);
	run("tool_result", { toolName: "bash", input, isError: true }, ctx);
	const blocked = run("tool_call", { toolName: "bash", input }, ctx);
	assert.equal(blocked.block, true);
	assert.match(blocked.reason, /failed 2 times/);
});

test("an edit that failed twice needs a fresh read before it is retried", () => {
	const { run, ctx } = load();
	const target = join(FIXTURES, "sample.xlsx");
	run("tool_call", { toolName: "read", input: { path: target } }, ctx);
	const edit = { toolName: "edit", input: { path: target } };
	run("tool_call", edit, ctx);
	run("tool_result", { ...edit, isError: true }, ctx);
	run("tool_call", edit, ctx);
	run("tool_result", { ...edit, isError: true }, ctx);
	const blocked = run("tool_call", edit, ctx);
	assert.equal(blocked.block, true);
	assert.match(blocked.reason, /Read it again/);
	run("tool_call", { toolName: "read", input: { path: target } }, ctx);
	assert.equal(run("tool_call", edit, ctx), undefined);
});

test("the tool set is trimmed to the coding set, keeping delegation tools that are active", () => {
	const { runAll, ctx, toolState } = load(["read", "edit", "web_search", "some_extension_tool", "delegate_task"]);
	runAll("session_start", {}, ctx);
	assert.deepEqual(toolState.active, ["read", "edit", "web_search", "delegate_task"]);
});

test("the trim is skipped inside a delegated worker", () => {
	const { runAll, ctx, toolState } = load(["read", "some_extension_tool"]);
	process.env.PI_WORKER_CHILD = "1";
	try {
		runAll("session_start", {}, ctx);
		assert.deepEqual(toolState.active, ["read", "some_extension_tool"]);
	} finally {
		delete process.env.PI_WORKER_CHILD;
	}
});

test("PI_TOOLS_KEEP overrides the set and * disables trimming", () => {
	const { runAll, ctx, toolState } = load(["read", "some_extension_tool"]);
	process.env.PI_TOOLS_KEEP = "read,some_extension_tool";
	try {
		runAll("session_start", {}, ctx);
		assert.deepEqual(toolState.active, ["read", "some_extension_tool"]);
		process.env.PI_TOOLS_KEEP = "*";
		runAll("before_agent_start", { systemPromptOptions: { sections: {} } }, ctx);
		assert.deepEqual(toolState.active, ["read", "some_extension_tool"]);
	} finally {
		delete process.env.PI_TOOLS_KEEP;
	}
});

test("a turn that edited without checking warns at the end", () => {
	const { run, ctx, notices } = load();
	const target = join(FIXTURES, "sample.xlsx");
	run("tool_call", { toolName: "read", input: { path: target } }, ctx);
	run("tool_call", { toolName: "edit", input: { path: target } }, ctx);
	run("agent_end", {}, ctx);
	assert.ok(notices.some((n) => /without running a check/.test(n)));
});
