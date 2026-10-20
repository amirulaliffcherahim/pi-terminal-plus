import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaceholderRegistry } from "../src/placeholders.ts";

test("a path with no extension stays as a path", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\Users\\amiru\\Downloads"), undefined);
	assert.equal(registry.register("C:\\tools\\Makefile"), undefined);
	assert.equal(registry.register("/home/me/project"), undefined);
});

test("a dotfile with no extension stays as a path", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\Users\\amiru\\.env"), undefined);
});

test("a path with an extension becomes a marker, images and files alike", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\a\\shot.png"), "[image #1: shot.png]");
	assert.equal(registry.register("C:\\a\\notes.txt"), "[file #2: notes.txt]");
});

test("a skipped extensionless path does not use up a marker number", () => {
	const registry = new PlaceholderRegistry();
	registry.register("C:\\a\\folder");
	assert.equal(registry.register("C:\\a\\shot.png"), "[image #1: shot.png]");
});

test("a quoted Copy as path result with an extension becomes a marker", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register('"C:\\My Docs\\report.pdf"'), "[file #1: report.pdf]");
});
