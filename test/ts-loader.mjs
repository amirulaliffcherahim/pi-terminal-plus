import { register } from "node:module";

/** Maps `./x.js` imports to `./x.ts` so plain Node runs the same source files Pi loads. */
register(
	"data:text/javascript," +
		encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js")) {
		try { return await nextResolve(specifier.slice(0, -3) + ".ts", context); } catch {}
	}
	return nextResolve(specifier, context);
}`),
	import.meta.url,
);
