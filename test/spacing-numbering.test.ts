import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaceholderEditor } from "../src/placeholder-editor.ts";
import { padMarker, PlaceholderRegistry } from "../src/placeholders.ts";

const BACKSPACE = "\x7f";

function makeEditor() {
	const registry = new PlaceholderRegistry();
	const tui = { requestRender: () => {}, terminal: { columns: 80, rows: 24 } };
	const theme = { borderColor: (s: string) => s, selectList: {} };
	const keybindings = { matches: () => false, getKeys: () => [] };
	return new PlaceholderEditor(tui as never, theme as never, keybindings as never, registry);
}

test("padMarker adds a space only where the marker touches text", () => {
	assert.equal(padMarker("[m]", "a", "b"), " [m] ");
	assert.equal(padMarker("[m]", " ", " "), "[m]");
	assert.equal(padMarker("[m]", undefined, undefined), "[m]");
	assert.equal(padMarker("[m]", "", ""), "[m]");
});

test("a marker pasted into an empty editor gets no extra spaces", () => {
	const editor = makeEditor();
	editor.insertTextAtCursor("C:\\a\\one.png");
	assert.equal(editor.getText(), "[image #1: one.png]");
});

test("a marker pasted next to typed text is separated from it", () => {
	const editor = makeEditor();
	for (const char of "look") editor.handleInput(char);
	editor.insertTextAtCursor("C:\\a\\one.png");
	assert.equal(editor.getText(), "look [image #1: one.png]");
});

test("deleting every marker restarts numbering at #1", () => {
	const editor = makeEditor();
	editor.insertTextAtCursor("C:\\a\\one.png");
	editor.handleInput(BACKSPACE);
	editor.insertTextAtCursor("C:\\a\\two.png");
	assert.equal(editor.getText(), "[image #1: two.png]");
});

test("deleting one of two markers keeps its number retired while another remains", () => {
	const editor = makeEditor();
	editor.insertTextAtCursor("C:\\a\\one.png");
	editor.insertTextAtCursor("C:\\a\\two.png");
	editor.handleInput(BACKSPACE);
	editor.insertTextAtCursor("C:\\a\\three.png");
	assert.equal(editor.getText(), "[image #1: one.png] [image #3: three.png]");
});

test("prune drops a deleted marker so it cannot expand", () => {
	const registry = new PlaceholderRegistry();
	registry.register("C:\\a\\one.png");
	registry.register("C:\\a\\two.png");
	registry.prune("only [image #2: two.png]");
	assert.equal(registry.expand("[image #1: one.png]"), "[image #1: one.png]");
	assert.equal(registry.expand("[image #2: two.png]"), '"C:\\a\\two.png"');
});
