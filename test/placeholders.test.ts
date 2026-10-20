import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaceholderRegistry } from "../src/placeholders.ts";

test("turns a pasted image path into a numbered image marker", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\Temp\\shot.png"), "[image #1: shot.png]");
});

test("turns a non-image path into a file marker", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\docs\\report.pdf"), "[file #1: report.pdf]");
});

test("numbers markers in paste order", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\a\\one.png"), "[image #1: one.png]");
	assert.equal(registry.register("C:\\a\\two.docx"), "[file #2: two.docx]");
});

test("leaves ordinary text and relative paths alone", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("hello world"), undefined);
	assert.equal(registry.register("src/logo.png"), undefined);
});

test("leaves multi-line pastes alone", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register("C:\\a\\one.png\nC:\\a\\two.png"), undefined);
});

test("accepts a quoted path with spaces", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.register('"C:\\My Pics\\a b.png"'), "[image #1: a b.png]");
});

test("expands markers back to quoted paths in surrounding text", () => {
	const registry = new PlaceholderRegistry();
	const marker = registry.register("C:\\My Pics\\a b.png");
	assert.equal(registry.expand(`look at ${marker} please`), 'look at "C:\\My Pics\\a b.png" please');
});

test("a deleted marker leaves nothing to expand", () => {
	const registry = new PlaceholderRegistry();
	registry.register("C:\\a\\one.png");
	registry.register("C:\\a\\two.png");
	assert.equal(registry.expand("only [image #2: two.png] here"), 'only "C:\\a\\two.png" here');
});

test("keeps a marker the user typed by hand when its id is unknown", () => {
	const registry = new PlaceholderRegistry();
	assert.equal(registry.expand("[image #9: fake.png]"), "[image #9: fake.png]");
});

test("reset restarts numbering", () => {
	const registry = new PlaceholderRegistry();
	registry.register("C:\\a\\one.png");
	registry.reset();
	assert.equal(registry.register("C:\\a\\two.png"), "[image #1: two.png]");
});

import { markerSpans, mergeMarkerSegments } from "../src/placeholders.ts";

function charSegments(text: string) {
	return [...text].map((segment, index) => ({ segment, index, input: text }));
}

test("markerSpans finds only registered ids", () => {
	const text = "a [image #1: x.png] b [image #2: y.png]";
	const spans = markerSpans(text, new Set([2]));
	assert.deepEqual(spans.map((s) => text.slice(s.start, s.end)), ["[image #2: y.png]"]);
});

test("mergeMarkerSegments turns a marker into one segment and keeps the rest", () => {
	const text = "a[image #1: x.png]b";
	const merged = mergeMarkerSegments(charSegments(text), text, markerSpans(text, new Set([1])));
	assert.deepEqual(merged.map((s) => s.segment), ["a", "[image #1: x.png]", "b"]);
	assert.equal(merged[2].index, text.length - 1);
});

test("mergeMarkerSegments is a no-op without spans", () => {
	const text = "hello";
	assert.equal(mergeMarkerSegments(charSegments(text), text, []).length, 5);
});
