import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaceholderEditor } from "../src/placeholder-editor.ts";
import { PlaceholderRegistry } from "../src/placeholders.ts";

const ENTER = "\r";

/** Mimics Pi: onSubmit hands the text to an async handler, as the input hook runs later. */
function makeEditor() {
	const registry = new PlaceholderRegistry();
	const tui = { requestRender: () => {}, terminal: { columns: 80, rows: 24 } };
	const theme = { borderColor: (s: string) => s, selectList: {} };
	const keybindings = { matches: () => false, getKeys: () => [] };
	const editor = new PlaceholderEditor(tui as never, theme as never, keybindings as never, registry);
	const submitted: string[] = [];
	editor.onSubmit = (text: string) => {
		// Matches the real input hook: expand first, then reset for the next prompt.
		void Promise.resolve().then(() => {
			submitted.push(registry.expand(text));
			registry.reset();
		});
	};
	return { editor, registry, submitted };
}

test("markers still expand after Enter clears the editor", async () => {
	const { editor, submitted } = makeEditor();
	editor.insertTextAtCursor("C:\\a\\shot.png");
	editor.insertTextAtCursor("C:\\a\\report.pdf");
	editor.handleInput(ENTER);
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(submitted.length, 1);
	assert.match(submitted[0], /"C:\\a\\shot\.png"/);
	assert.match(submitted[0], /"C:\\a\\report\.pdf"/);
});

test("the editor is empty after submit and numbering restarts for the next prompt", async () => {
	const { editor, submitted } = makeEditor();
	editor.insertTextAtCursor("C:\\a\\one.png");
	editor.handleInput(ENTER);
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(editor.getText(), "");
	assert.equal(submitted.length, 1);
	editor.insertTextAtCursor("C:\\a\\two.png");
	assert.equal(editor.getText(), "[image #1: two.png]");
});
