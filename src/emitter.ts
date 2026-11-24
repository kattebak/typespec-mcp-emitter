import { type EmitContext, emitFile, resolvePath } from "@typespec/compiler";
import { deriveCatalogues } from "./derive.js";
import { emitPackage } from "./emit-package.js";
import type { McpEmitterOptions } from "./lib.js";

export async function $onEmit(
	context: EmitContext<McpEmitterOptions>,
): Promise<void> {
	const [derived] = await deriveCatalogues(context.program);
	const catalogues = derived.filter(({ tools }) => tools.length > 0);

	for (const { namespace, service, tools, excluded } of catalogues) {
		await emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${namespace}.mcp-tools.json`,
			),
			content: `${JSON.stringify({ service, tools, excluded }, null, 2)}\n`,
		});
	}

	const packageName = context.options["package-name"];
	if (packageName === undefined || catalogues.length === 0) {
		return;
	}

	await emitPackage(context.program, context.emitterOutputDir, catalogues, {
		name: packageName,
		version: context.options["package-version"] ?? "0.0.1",
	});
}
