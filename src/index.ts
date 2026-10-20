import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai";
import { findPastedPaths } from "./paths.js";
import { loadImageFile } from "./image-file.js";

/**
 * Turns pasted or dropped image paths into native image attachments on submit.
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
		const rejected: string[] = [];
		for (const candidate of candidates) {
			const result = await loadImageFile(candidate.path);
			if (result.ok) {
				attachments.push({ type: "image", data: result.image.data, mimeType: result.image.mimeType });
			} else if (result.kind === "too-large" || result.kind === "error") {
				rejected.push(`${candidate.path}: ${result.reason}`);
			} else {
				ctx.ui.notify(`terminal-plus: skipped ${candidate.path} (${result.reason})`, "info");
			}
		}

		if (rejected.length > 0) ctx.ui.notify(`Image not attached: ${rejected.join("; ")}`, "warning");
		if (attachments.length === 0) return { action: "continue" };
		if (!modelAcceptsImages(ctx)) {
			ctx.ui.notify(`Model ${ctx.model?.id ?? "(none)"} does not accept images. Sent as path text only.`, "warning");
			return { action: "continue" };
		}

		return {
			action: "transform",
			text: event.text,
			images: [...(event.images ?? []), ...attachments],
		};
	});
}

function modelAcceptsImages(ctx: ExtensionContext): boolean {
	return ctx.model?.input.includes("image") ?? false;
}
