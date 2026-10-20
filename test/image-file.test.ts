import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadImageFile, sniffImageMime } from "../src/image-file.ts";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP_HEADER = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function tempFile(name: string, bytes: Buffer): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-terminal-plus-"));
	const path = join(dir, name);
	writeFileSync(path, bytes);
	return path;
}

test("sniffs png, jpeg, gif and webp by content", () => {
	assert.equal(sniffImageMime(PNG_HEADER), "image/png");
	assert.equal(sniffImageMime(JPEG_HEADER), "image/jpeg");
	assert.equal(sniffImageMime(WEBP_HEADER), "image/webp");
	assert.equal(sniffImageMime(Buffer.from("GIF89a....")), "image/gif");
});

test("rejects a file whose extension says png but whose bytes are text", async () => {
	const path = tempFile("fake.png", Buffer.from("hello, not an image"));
	const result = await loadImageFile(path);
	assert.equal(result.ok, false);
	if (!result.ok) assert.equal(result.kind, "not-image");
});

test("loads a real png as base64 with its mime type", async () => {
	const path = tempFile("ok.png", PNG_HEADER);
	const result = await loadImageFile(path);
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.image.mimeType, "image/png");
		assert.equal(Buffer.from(result.image.data, "base64").equals(PNG_HEADER), true);
	}
});

test("reports a missing file as missing, not as an error", async () => {
	const result = await loadImageFile("C:\\definitely\\not\\here.png");
	assert.equal(result.ok, false);
	if (!result.ok) assert.equal(result.kind, "missing");
});

test("refuses an image over the raw size limit before reading it", async () => {
	const path = tempFile("big.png", Buffer.concat([PNG_HEADER, Buffer.alloc(3_750_001)]));
	const result = await loadImageFile(path);
	assert.equal(result.ok, false);
	if (!result.ok) assert.equal(result.kind, "too-large");
});
