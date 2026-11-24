import type { Program } from "@typespec/compiler";
import { validateNotToolOverrides } from "./decorators.js";
import { deriveCatalogues } from "./derive.js";

export {
	$notTool,
	$toolDescription,
	$toolEffect,
	$toolIdempotent,
	$toolName,
	getNotToolReason,
	getToolDescription,
	getToolEffect,
	getToolIdempotent,
	getToolName,
	namespace,
	TOOL_EFFECTS,
	type ToolEffect,
} from "./decorators.js";
export {
	annotationsForVerb,
	deriveCatalogues,
	type ExcludedOperation,
	type ServiceCatalogue,
	type Tool,
	type ToolAnnotations,
	type ToolBinding,
	toSnakeCase,
} from "./derive.js";
export { $onEmit } from "./emitter.js";
export { $lib, type McpEmitterOptions } from "./lib.js";

export function $onValidate(program: Program): void {
	validateNotToolOverrides(program);
	const [, diagnostics] = deriveCatalogues(program);
	program.reportDiagnostics(diagnostics);
}
