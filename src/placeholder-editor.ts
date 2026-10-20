import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { PlaceholderRegistry } from "./placeholders.js";

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
		super.insertTextAtCursor(this.registry.register(text) ?? text);
	}

	/** `handlePaste` is private in Pi's typings but is the single entry point for bracketed pastes. */
	handlePaste(pastedText: string): void {
		const marker = this.registry.register(pastedText);
		if (marker) {
			super.insertTextAtCursor(marker);
			return;
		}
		superHandlePaste.call(this, pastedText);
	}

	getExpandedText(): string {
		return this.registry.expand(super.getExpandedText());
	}
}

const superHandlePaste = (CustomEditor.prototype as unknown as { handlePaste: (text: string) => void }).handlePaste;
