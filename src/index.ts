import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai";
import { findPastedPaths } from "./paths.js";
import { loadImageFile } from "./image-file.js";
import { formatTextBlock, loadTextFile, MAX_TOTAL_TEXT_BYTES } from "./text-file.js";

/**
 * Turns pasted or dropped file paths into prompt content on submit.
 * Images attach natively; text and code are inlined as labeled blocks; the path always stays in the prompt.
 * Decided at submit time so the active model is the one that will actually receive the request.
 */
export default function terminalPlus(pi: ExtensionAPI) {
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" };
		if (process.env.PI_TERMINAL_PLUS_DEBUG === "1") {
			ctx.ui.notify(`terminal-plus raw: ${JSON.stringify(event.text).slice(0, 200)}`, "info");
		}

		const candidates = findPastedPaths(event.text);
		if (candidates.length === 0) return { action: "continue" };

		const attachments: ImageContent[] = [];
		const textBlocks: string[] = [];
		const notices: string[] = [];
		let textBytes = 0;
		for (const candidate of candidates) {
			const outcome = await routeFile(candidate.path, MAX_TOTAL_TEXT_BYTES - textBytes);
			if (outcome.kind === "image") attachments.push(outcome.image);
			else if (outcome.kind === "text") {
				textBlocks.push(outcome.block);
				textBytes += outcome.bytes;
			} else notices.push(`${candidate.path}: ${outcome.reason}`);
		}

		if (notices.length > 0) ctx.ui.notify(`terminal-plus: ${notices.join("; ")}`, "warning");
		if (attachments.length === 0 && textBlocks.length === 0) return { action: "continue" };

		const imagesAllowed = modelAcceptsImages(ctx);
		if (attachments.length > 0 && !imagesAllowed) {
			ctx.ui.notify(`Model ${ctx.model?.id ?? "(none)"} does not accept images. Sent as path text only.`, "warning");
		}
		const images = imagesAllowed ? attachments : [];
		if (images.length === 0 && textBlocks.length === 0) return { action: "continue" };

		return {
			action: "transform",
			text: [event.text, ...textBlocks].join("\n\n"),
			images: [...(event.images ?? []), ...images],
		};
	});
}

type Routed =
	| { kind: "image"; image: ImageContent }
	| { kind: "text"; block: string; bytes: number }
	| { kind: "skip" | "reject"; reason: string };

/** One route per file: image, then text, otherwise the path stays as typed. */
async function routeFile(path: string, remainingTextBytes: number): Promise<Routed> {
	const image = await loadImageFile(path);
	if (image.ok) {
		return { kind: "image", image: { type: "image", data: image.image.data, mimeType: image.image.mimeType } };
	}
	if (image.kind === "too-large" || image.kind === "error") return { kind: "reject", reason: image.reason };
	if (image.kind === "missing") return { kind: "skip", reason: "not found" };
	if (remainingTextBytes <= 0) return { kind: "skip", reason: "text budget used up in this prompt" };

	const text = await loadTextFile(path, Math.min(remainingTextBytes, 100_000));
	if (text.kind === "text") {
		return { kind: "text", block: formatTextBlock(path, text.file), bytes: text.file.body.length };
	}
	return text;
}

function modelAcceptsImages(ctx: ExtensionContext): boolean {
	return ctx.model?.input.includes("image") ?? false;
}
