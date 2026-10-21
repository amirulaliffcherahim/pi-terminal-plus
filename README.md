# pi-terminal-plus

Pi extension: attach pasted or dropped files to a prompt, and keep the session's rules and tool set lean. Images go to the model natively. Documents and text become Markdown in the prompt.

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

## Session rules

The same package keeps a long session honest, because rules stated once at session start lose weight as turns pile up:

- **Hard rules, restated last.** A compact rule block is set as `pi_hard_rules`, the last system-prompt section, every turn. Unchanged text stays cached.
- **Read before edit.** An `edit` or `write` of an existing file you have not read this session is blocked, with the reason. Re-read with `offset`/`limit` around the target.
- **Two attempts.** A `bash` command that fails twice is refused; so is an `edit` that fails twice, until the file is read again. Report the exact error instead of looping.
- **Drift notice.** If a turn edited files and ran no command afterwards, a warning says so.

## Lean tool set

Tool schemas are the largest static cost per request (about 8,000 tokens in one measured setup, against roughly 4,900 for the whole system prompt). Each request keeps only the coding set: read, powershell, bash, edit, write, todo, ask_user_question, ask_advisor, memory_*, scratchpad, web_search, fetch_content, get_search_content, convert_to_markdown, worker_diff. Delegation tools are left to pi-worker.

- `PI_TOOLS_KEEP="read,bash,..."` replaces the set.
- `PI_TOOLS_KEEP="*"` disables trimming.
- A delegated worker (`PI_WORKER_CHILD=1`) is never trimmed.

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
