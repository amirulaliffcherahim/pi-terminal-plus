import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaceholderEditor } from "../src/placeholder-editor.ts";
import { PlaceholderRegistry } from "../src/placeholders.ts";

const BACKSPACE = "\x7f";
const DELETE = "\x1b[3~";
const LEFT = "\x1b[D";

/** Builds the editor with minimal stand-ins. Only text editing is exercised. */
function makeEditor() {
	const registry = new PlaceholderRegistry();
	const tui = { requestRender: () => {}, terminal: { columns: 80, rows: 24 } };
	const theme = { borderColor: (s: string) => s, selectList: {} };
	const keybindings = { matches: () => false, getKeys: () => [] };
	return new PlaceholderEditor(tui as never, theme as never, keybindings as never, registry);
}

test("one Backspace after a marker removes the whole marker", () => {
	const editor = makeEditor();
	editor.insertTextAtCursor("C:\\Temp\\shot.png");
	editor.handleInput(BACKSPACE);
	assert.equal(editor.getText(), "");
});

test("Backspace removes only the marker next to the cursor and keeps other text", () => {
	const editor = makeEditor();
	editor.handleInput("h");
	editor.handleInput("i");
	editor.insertTextAtCursor("C:\\a\\one.png");
	editor.insertTextAtCursor("C:\\a\\two.docx");
	editor.handleInput(BACKSPACE);
	assert.equal(editor.getText(), "hi [image #1: one.png] ");
});

test("one Delete before a marker removes the whole marker", () => {
	const editor = makeEditor();
	editor.insertTextAtCursor("C:\\Temp\\shot.png");
	editor.handleInput(LEFT);
	editor.handleInput(DELETE);
	assert.equal(editor.getText(), "");
});

test("a removed marker no longer expands into a path", () => {
	const editor = makeEditor();
	editor.insertTextAtCursor("C:\\Temp\\shot.png");
	editor.handleInput(BACKSPACE);
	editor.handleInput("o");
	assert.equal(editor.getExpandedText(), "o");
});

test("a hand-typed marker with an unknown id is not atomic", () => {
	const editor = makeEditor();
	for (const char of "[image #9: x.png]") editor.handleInput(char);
	editor.handleInput(BACKSPACE);
	assert.equal(editor.getText(), "[image #9: x.png");
});
