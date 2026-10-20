# pi-terminal-plus

Pi extension: attach pasted or dragged image files to a prompt as native image input.

- Image paths in the input (quoted, `file://`, absolute, WSL `/mnt/x/`) are read on submit.
- Files are checked by content (PNG, JPEG, WebP, GIF), not by extension. Raw size limit 3.75 MB.
- Images attach only when the active model accepts images. Otherwise the path stays as text and a warning shows.
- Ordinary non-image paths are left untouched.

## Install

    pi install git:github.com/amirulaliffcherahim/pi-terminal-plus

## Test

    npm test

## Status

- Unit tests: path parsing, magic-byte sniffing, size limit.
- Live print-mode check: Claude Haiku, DeepSeek Flash, agy Gemini 3.8 Flash each described a generated blue PNG.
- Not yet verified: real drag-drop and Ctrl+V in an interactive terminal.
