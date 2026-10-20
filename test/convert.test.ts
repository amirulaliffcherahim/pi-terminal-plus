import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertToMarkdown, documentKindOf } from "../src/convert.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");

test("detects document kind by extension", () => {
	assert.equal(documentKindOf("a.PDF"), "pdf");
	assert.equal(documentKindOf("a.docx"), "docx");
	assert.equal(documentKindOf("a.xlsx"), "xlsx");
	assert.equal(documentKindOf("a.png"), undefined);
});

test("converts a real PDF to non-empty text", async () => {
	const result = await convertToMarkdown(join(FIXTURES, "keyboard-shortcuts-windows.pdf"));
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.kind, "pdf");
		assert.match(result.markdown, /Ctrl\+P/);
	}
});

test("converts a DOCX heading and bold run to Markdown", async () => {
	const result = await convertToMarkdown(join(FIXTURES, "sample.docx"));
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.match(result.markdown, /^# Quarterly Report/m);
		assert.match(result.markdown, /\*\*twelve percent\*\*/);
	}
});

test("converts an XLSX sheet to a Markdown table and escapes pipes", async () => {
	const result = await convertToMarkdown(join(FIXTURES, "sample.xlsx"));
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.match(result.markdown, /^## Stock/m);
		assert.match(result.markdown, /\| Item \| Qty\\\|Unit \|/);
		assert.match(result.markdown, /\| Apple \| 3 \|/);
	}
});

test("refuses an unsupported type without reading it", async () => {
	const result = await convertToMarkdown(join(FIXTURES, "red.png"));
	assert.equal(result.ok, false);
});

test("returns a failure for a corrupt document instead of throwing", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-terminal-plus-corrupt-"));
	const path = join(dir, "broken.docx");
	writeFileSync(path, "this is not a zip file");
	const result = await convertToMarkdown(path);
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.reason, /docx conversion failed/);
});

test("returns a failure for a missing file instead of throwing", async () => {
	const result = await convertToMarkdown(join(FIXTURES, "does-not-exist.pdf"));
	assert.equal(result.ok, false);
});
