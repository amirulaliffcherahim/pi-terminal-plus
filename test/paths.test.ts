import { test } from "node:test";
import assert from "node:assert/strict";
import { findPastedPaths, normalizePastedPath } from "../src/paths.ts";

test("keeps a quoted Windows path with spaces", () => {
	const paths = findPastedPaths('"C:\\My Pics\\logo.png"');
	assert.deepEqual(paths.map((p) => p.path), ["C:\\My Pics\\logo.png"]);
});

test("accepts single-quoted paths", () => {
	const paths = findPastedPaths("'C:\\My Pics\\logo.png'");
	assert.deepEqual(paths.map((p) => p.path), ["C:\\My Pics\\logo.png"]);
});

test("strips the PowerShell call operator", () => {
	const paths = findPastedPaths("& 'C:\\My Pics\\logo.png'");
	assert.deepEqual(paths.map((p) => p.path), ["C:\\My Pics\\logo.png"]);
});

test("converts file URIs with percent-encoding", () => {
	assert.equal(normalizePastedPath("file:///C:/My%20Pics/logo.png"), "C:\\My Pics\\logo.png");
});

test("converts WSL mount paths to Windows drive paths", () => {
	assert.equal(normalizePastedPath("/mnt/c/Users/amiru/a.png"), "C:/Users/amiru/a.png");
});

test("accepts forward-slash Windows paths", () => {
	assert.equal(normalizePastedPath("C:/Users/amiru/a.png"), "C:/Users/amiru/a.png");
});

test("ignores relative paths so prose like 'resize src/logo.png' is not attached", () => {
	assert.deepEqual(findPastedPaths("resize src/logo.png please"), []);
});

test("finds several unquoted absolute paths in one paste", () => {
	const paths = findPastedPaths("C:\\a\\one.png /home/me/two.jpg");
	assert.deepEqual(paths.map((p) => p.path), ["C:\\a\\one.png", "/home/me/two.jpg"]);
});

test("removes duplicate paths", () => {
	const paths = findPastedPaths("C:\\a\\one.png C:\\a\\one.png");
	assert.equal(paths.length, 1);
});

test("does not treat a protocol-relative URL as a POSIX path", () => {
	assert.equal(normalizePastedPath("//server/share/a.png"), undefined);
});
