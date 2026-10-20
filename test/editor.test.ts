import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaceholderEditor } from "../src/placeholder-editor.ts";
import { PlaceholderRegistry } from "../src/placeholders.ts";

/** Builds the editor with minimal stand-ins. Only paste and text handling are exercised. */
function makeEditor() {
	const registry = new PlaceholderRegistry();
	const tui = { requestRender: () => {}, terminal: { columns: 80, rows: 24 } };
	const theme = { borderColor: (s: string) => s, selectList: {} };
	const keybindings = { matches: () => false, getKeys: () => [] };
	const editor = new PlaceholderEditor(tui as never, theme as never, keybindings as never, registry);
	return { editor, registry };
}

test("Alt+V style insert of an image path shows a marker in the editor", () => {
	const { editor } = makeEditor();
	editor.insertTextAtCursor("C:\\Temp\\shot.png");
	assert.equal(editor.getText(), "[image #1: shot.png]");
});

test("a bracketed paste of a file path shows a marker too", () => {
	const { editor } = makeEditor();
	editor.handleInput("\x1b[200~C:\\docs\\report.pdf\x1b[201~");
	assert.equal(editor.getText(), "[file #1: report.pdf]");
});

test("ordinary pasted text is inserted unchanged", () => {
	const { editor } = makeEditor();
	editor.handleInput("\x1b[200~hello world\x1b[201~");
	assert.equal(editor.getText(), "hello world");
});

test("expanded text swaps markers back to quoted paths", () => {
	const { editor } = makeEditor();
	editor.insertTextAtCursor("C:\\Temp\\shot.png");
	assert.equal(editor.getExpandedText(), '"C:\\Temp\\shot.png"');
});

test("two pasted files are numbered in order", () => {
	const { editor } = makeEditor();
	editor.insertTextAtCursor("C:\\a\\one.png");
	editor.insertTextAtCursor("C:\\a\\two.docx");
	assert.equal(editor.getText(), "[image #1: one.png] [file #2: two.docx]");
});
