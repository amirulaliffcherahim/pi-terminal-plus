import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { markerSpans, mergeMarkerSegments, padMarker, PlaceholderRegistry, type TextSegment } from "./placeholders.js";

/**
 * Editor that shows pasted file paths as short markers like `[image #1: shot.png]`.
 * Alt+V reaches `insertTextAtCursor`; terminal drops arrive through `handlePaste`.
 * The registry is shared with the `input` hook, which expands markers on submit.
 */
export class PlaceholderEditor extends CustomEditor {
	private readonly registry: PlaceholderRegistry;

	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: ConstructorParameters<typeof CustomEditor>[2],
		registry: PlaceholderRegistry,
	) {
		super(tui, theme, keybindings);
		this.registry = registry;
	}

	insertTextAtCursor(text: string): void {
		const marker = this.registry.register(text);
		super.insertTextAtCursor(marker ? this.padded(marker) : text);
	}

	/** Pi calls this for every keystroke path, so stale markers are pruned after each edit. */
	handleInput(data: string): void {
		super.handleInput(data);
		this.registry.prune(this.getText());
	}

	/** `handlePaste` is private in Pi's typings but is the single entry point for bracketed pastes. */
	handlePaste(pastedText: string): void {
		const marker = this.registry.register(pastedText);
		if (marker) {
			super.insertTextAtCursor(this.padded(marker));
			return;
		}
		superHandlePaste.call(this, pastedText);
	}

	/**
	 * Pi routes cursor moves, Backspace and Delete through `segment`, so merging our markers
	 * into single segments makes one Backspace remove a whole marker, like Pi's paste markers.
	 * `segment` is private in Pi's typings but is the one method the editor consults.
	 */
	segment(text: string, mode: "grapheme" | "word"): Iterable<TextSegment> {
		const base = superSegment.call(this, text, mode);
		return mergeMarkerSegments(base, text, markerSpans(text, this.registry.ids()));
	}

	private padded(marker: string): string {
		const { line, col } = this.cursorContext();
		return padMarker(marker, line[col - 1], line[col]);
	}

	private cursorContext(): { line: string; col: number } {
		const { line, col } = this.getCursor();
		return { line: this.getLines()[line] ?? "", col };
	}

	getExpandedText(): string {
		return this.registry.expand(super.getExpandedText());
	}
}

const superSegment = (CustomEditor.prototype as unknown as {
	segment: (text: string, mode: "grapheme" | "word") => Iterable<TextSegment>;
}).segment;

const superHandlePaste = (CustomEditor.prototype as unknown as { handlePaste: (text: string) => void }).handlePaste;
