# pi-terminal-plus

Pi extension: attach pasted or dropped files to a prompt. Images go to the model natively. Documents and text become Markdown in the prompt.

## What it does

| You paste or drop | The model gets |
|---|---|
| PNG, JPEG, WebP, GIF | the image itself (if the active model accepts images) |
| PDF, DOCX, XLSX | the content as Markdown text |
| Text and code files | the content in a labeled code block |
| `.env`, `*.pem`, `*.key`, `id_rsa*` | the path only, never the contents |
| Video, archives, other binaries | the path only, with a notice |

The path always stays in the prompt. No Pi core package is changed.

## Placeholders

A pasted file path with an extension becomes a marker: `[image #1: shot.png]` or `[file #2: report.pdf]`.
One Backspace or Delete removes a whole marker, like Pi's big-paste marker. A path with no extension stays as a path.
Markers expand back to the real path on submit.

Paste with Alt+V (Pi's `app.clipboard.pasteImage`), or drag a file into Windows Terminal.

## Agent tool

`convert_to_markdown(path)` converts a PDF, DOCX or XLSX so the agent can read it on demand. There are no slash commands.

## Install

    pi install git:github.com/amirulaliffcherahim/pi-terminal-plus

`pi install` and `pi update` run `npm install`. If you only `git pull` the managed clone, run `npm install --omit=dev --legacy-peer-deps` in it yourself.

## Limits

- Scanned PDFs have no text layer. They return "no text found". There is no OCR.
- Images over 3.75 MB are refused. There is no resize step.
- Text files are cut at 100 KB each and 200 KB per prompt. Converted documents are cut at 100,000 characters.
- Explorer "copy file" then Alt+V does not work on Windows: Pi's native clipboard reader has no file-list support there. Use Shift+right-click, "Copy as path", then paste.
- Drag and drop works in Windows Terminal. VS Code's integrated terminal inserts nothing on drop.
- The extension replaces Pi's editor to draw markers. It does nothing if another editor is already set.

## Debug

Set `PI_TERMINAL_PLUS_DEBUG=1` to show the raw submitted text as a notice.

## Test

    npm test

## Dependencies

All pure JavaScript: `unpdf` (PDF), `mammoth` and `turndown` (DOCX), SheetJS `xlsx` 0.20.3 from its CDN (XLSX). They load only when a document is converted.
