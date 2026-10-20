import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { convertToMarkdown, documentKindOf } from "./convert.js";
import { isImagePath } from "./image-file.js";

const ConvertParams = Type.Object({
	path: Type.String({ description: "Absolute path to a PDF, DOCX or XLSX file" }),
});

/**
 * Lets the agent read a document it was pointed to. Images are not converted: the model
 * needs them as image input, so the tool says so instead of returning empty text.
 */
export const convertToMarkdownTool = defineTool({
	name: "convert_to_markdown",
	label: "Convert to Markdown",
	description:
		"Convert a PDF, DOCX or XLSX file to Markdown text so its content can be read. " +
		"Images are not converted; attach them to the prompt instead.",
	promptSnippet: "Read PDF, DOCX and XLSX files as Markdown text",
	parameters: ConvertParams,
	async execute(_toolCallId, params) {
		const path = params.path;
		if (isImagePath(path)) {
			return textResult(`${path} is an image. Attach it to the prompt so the model can see it.`, {
				path,
				converted: false,
			});
		}
		if (!documentKindOf(path)) {
			return textResult(`${path} is not a supported document type (PDF, DOCX or XLSX).`, {
				path,
				converted: false,
			});
		}

		const result = await convertToMarkdown(path);
		if (!result.ok) return textResult(`Could not convert ${path}: ${result.reason}`, { path, converted: false });

		const note = result.truncated ? "\n\n[truncated: output limit reached]" : "";
		return textResult(`${result.markdown}${note}`, { path, converted: true, kind: result.kind, truncated: result.truncated });
	},
});

function textResult(text: string, details: Record<string, unknown>) {
	return { content: [{ type: "text" as const, text }], details };
}
