import { register } from "node:module";

/**
 * Test-only resolver. Maps `./x.js` imports to `./x.ts` so plain Node runs the same source Pi loads,
 * and resolves Pi's own packages from its install, since Pi supplies them to extensions at runtime.
 */
register(
	"data:text/javascript," +
		encodeURIComponent(`
import { pathToFileURL } from "node:url";
const PI_MODULES = process.env.PI_MODULES_DIR ?? (process.env.USERPROFILE || process.env.HOME) + "/.pi/agent/install/releases/1.3.0/node_modules/";
const PI_PARENT = pathToFileURL(PI_MODULES + "x.js").href;
const PI_PACKAGES = ["@earendil-works/", "typebox"];
export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js")) {
		try { return await nextResolve(specifier.slice(0, -3) + ".ts", context); } catch {}
	}
	if (PI_PACKAGES.some((prefix) => specifier.startsWith(prefix))) {
		try { return await nextResolve(specifier, context); } catch {}
		return nextResolve(specifier, { ...context, parentURL: PI_PARENT });
	}
	return nextResolve(specifier, context);
}`),
	import.meta.url,
);
