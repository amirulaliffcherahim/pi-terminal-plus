import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatTextBlock, loadTextFile, MAX_TEXT_BYTES } from "../src/text-file.ts";

function tempFile(name: string, content: string | Buffer): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-terminal-plus-text-"));
	const path = join(dir, name);
	writeFileSync(path, content);
	return path;
}

test("inlines a known code file with its path and fence", async () => {
	const path = tempFile("main.ts", "const a = 1;");
	const result = await loadTextFile(path);
	assert.equal(result.kind, "text");
	if (result.kind !== "text") return;
	const block = formatTextBlock(path, result.file);
	assert.match(block, /^\[file: main\.ts\] \(.*main\.ts\)\n```\nconst a = 1;\n```$/);
});

test("inlines an unknown extension when the head has no NUL byte", async () => {
	const result = await loadTextFile(tempFile("Makefile.custom", "all:\n\techo ok\n"));
	assert.equal(result.kind, "text");
});

test("skips an unknown extension whose head contains a NUL byte", async () => {
	const result = await loadTextFile(tempFile("data.unknown", Buffer.from([0x41, 0x00, 0x42])));
	assert.equal(result.kind, "skip");
});

test("skips known binary extensions even when their bytes look like text", async () => {
	assert.equal((await loadTextFile(tempFile("report.pdf", "%PDF-1.4 text"))).kind, "skip");
	assert.equal((await loadTextFile(tempFile("archive.zip", "PK text"))).kind, "skip");
});

test("rejects secret-looking files so their contents never reach the prompt", async () => {
	for (const name of [".env", ".env.local", "id_rsa", "server.pem", "api.key"]) {
		const result = await loadTextFile(tempFile(name, "TOKEN=secret"));
		assert.equal(result.kind, "reject", name);
	}
});

test("returns a result instead of throwing when the path is a directory", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-terminal-plus-dir-"));
	const sub = join(dir, "folder.txt");
	mkdirSync(sub);
	const result = await loadTextFile(sub);
	assert.notEqual(result.kind, "text");
});

test("returns skip for a missing file instead of throwing", async () => {
	const result = await loadTextFile("C:\\definitely\\not\\here.txt");
	assert.equal(result.kind, "skip");
});

test("marks truncation and reports the cap in the block", async () => {
	const path = tempFile("big.txt", "a".repeat(MAX_TEXT_BYTES + 10));
	const result = await loadTextFile(path);
	assert.equal(result.kind, "text");
	if (result.kind !== "text") return;
	assert.equal(result.file.truncated, true);
	assert.match(formatTextBlock(path, result.file), /\[truncated: first 100000 of 100010 bytes\]/);
});

test("does not end a truncated body in a split multi-byte character", async () => {
	const euro = "€"; // 3 bytes in UTF-8
	const path = tempFile("euro.txt", euro.repeat(Math.ceil(MAX_TEXT_BYTES / 3) + 5));
	const result = await loadTextFile(path);
	assert.equal(result.kind, "text");
	if (result.kind !== "text") return;
	assert.equal(result.file.body.includes("\uFFFD"), false);
});

test("widens the fence when the body contains backticks", async () => {
	const path = tempFile("ticks.md", "before\n```js\ncode\n```\nafter");
	const result = await loadTextFile(path);
	assert.equal(result.kind, "text");
	if (result.kind !== "text") return;
	assert.match(formatTextBlock(path, result.file), /^\[file: ticks\.md\].*\n````\n/);
});
