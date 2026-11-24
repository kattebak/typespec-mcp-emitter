import { type EmitContext, emitFile, resolvePath } from "@typespec/compiler";
import { deriveCatalogues } from "./derive.js";
import type { McpEmitterOptions } from "./lib.js";

export async function $onEmit(
	context: EmitContext<McpEmitterOptions>,
): Promise<void> {
	const [catalogues] = await deriveCatalogues(context.program);

	for (const { namespace, service, tools, excluded } of catalogues) {
		if (tools.length === 0) {
			continue;
		}

		await emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${namespace}.mcp-tools.json`,
			),
			content: `${JSON.stringify({ service, tools, excluded }, null, 2)}\n`,
		});
	}
}
