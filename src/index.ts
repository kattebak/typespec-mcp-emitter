import type { EmitContext, Program } from "@typespec/compiler";
import { validateNotToolOverrides } from "./decorators.js";
import type { McpEmitterOptions } from "./lib.js";

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
export { $lib, type McpEmitterOptions } from "./lib.js";

export function $onValidate(program: Program): void {
	validateNotToolOverrides(program);
}

export function $onEmit(_context: EmitContext<McpEmitterOptions>): void {}
