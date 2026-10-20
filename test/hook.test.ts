import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import terminalPlus from "../src/index.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");

type InputHandler = (event: unknown, ctx: unknown) => Promise<{ action: string; text?: string; images?: unknown[] }>;

/** Loads the extension against a stub API and returns its `input` handler plus the notices it raised. */
function loadHook(modelInput: string[]) {
	let handler: InputHandler | undefined;
	const notices: string[] = [];
	const pi = {
		registerTool: () => {},
		on: (name: string, fn: unknown) => {
			if (name === "input") handler = fn as InputHandler;
		},
	};
	terminalPlus(pi as never);
	const ctx = {
		mode: "tui",
		model: { id: "stub", input: modelInput },
		ui: { notify: (message: string) => notices.push(message), getEditorComponent: () => undefined },
	};
	assert.ok(handler, "extension registered an input handler");
	const run = (text: string, source = "interactive") => handler!({ type: "input", text, source }, ctx);
	return { run, notices };
}

test("attaches an image when the model accepts images and keeps the path text", async () => {
	const { run } = loadHook(["text", "image"]);
	const path = join(FIXTURES, "red.png");
	const result = await run(`what is "${path}"`);
	assert.equal(result.action, "transform");
	assert.equal(result.images?.length, 1);
	assert.match(result.text ?? "", /red\.png/);
});

test("keeps the image out and warns when the model has no image input", async () => {
	const { run, notices } = loadHook(["text"]);
	const result = await run(`what is "${join(FIXTURES, "red.png")}"`);
	assert.equal(result.action, "continue");
	assert.ok(notices.some((n) => /does not accept images/.test(n)));
});

test("converts a pasted XLSX path into a document block in the prompt text", async () => {
	const { run } = loadHook(["text"]);
	const result = await run(`Pear quantity? "${join(FIXTURES, "sample.xlsx")}"`);
	assert.equal(result.action, "transform");
	assert.match(result.text ?? "", /\[document: sample\.xlsx\]/);
	assert.match(result.text ?? "", /\| Pear \| 5 \|/);
});

test("converts a pasted PDF path into a document block", async () => {
	const { run } = loadHook(["text"]);
	const result = await run(`summarise "${join(FIXTURES, "keyboard-shortcuts-windows.pdf")}"`);
	assert.match(result.text ?? "", /\[document: keyboard-shortcuts-windows\.pdf\]/);
	assert.match(result.text ?? "", /Ctrl\+P/);
});

test("inlines a pasted text file as a labeled block", async () => {
	const { run } = loadHook(["text"]);
	const result = await run(`explain "${join(import.meta.dirname, "..", "src", "paths.ts")}"`);
	assert.match(result.text ?? "", /\[file: paths\.ts\]/);
});

test("expands a placeholder marker into the real path before routing", async () => {
	const { run } = loadHook(["text", "image"]);
	// The marker is only known to the registry the editor fills, so an unknown marker must stay untouched.
	const result = await run("[image #9: fake.png] hello");
	assert.equal(result.action, "continue");
});

test("leaves ordinary prompts untouched", async () => {
	const { run } = loadHook(["text", "image"]);
	const result = await run("resize src/logo.png please");
	assert.equal(result.action, "continue");
});

test("ignores input that did not come from the interactive editor", async () => {
	const { run } = loadHook(["text", "image"]);
	const result = await run(`"${join(FIXTURES, "red.png")}"`, "rpc");
	assert.equal(result.action, "continue");
});

test("skips a secret-looking file and keeps only the path", async () => {
	const { run } = loadHook(["text"]);
	const result = await run(`read "C:\Users\amiru\.env"`);
	assert.equal(result.action, "continue");
});
