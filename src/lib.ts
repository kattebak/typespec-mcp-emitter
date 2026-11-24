import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export type McpEmitterOptions = Record<string, never>;

export const $lib = createTypeSpecLibrary({
	name: "@kattebak/typespec-mcp-emitter",
	diagnostics: {
		"invalid-tool-name": {
			severity: "error",
			messages: {
				default: paramMessage`Tool name "${"name"}" must match ^[A-Za-z0-9_.-]{1,128}$.`,
			},
		},
		"empty-not-tool-reason": {
			severity: "error",
			messages: {
				default: "@notTool needs a reason that is not empty.",
			},
		},
		"not-tool-with-override": {
			severity: "error",
			messages: {
				default: paramMessage`Operation "${"operation"}" carries @notTool and a tool override at once.`,
			},
		},
	},
	state: {
		toolName: { description: "Tool name override for an operation" },
		toolDescription: {
			description: "Tool description override for an operation",
		},
		toolEffect: { description: "Tool effect override for an operation" },
		toolIdempotent: {
			description: "Tool idempotent hint override for an operation",
		},
		notTool: {
			description:
				"Reason an operation, interface or namespace is kept off MCP",
		},
	},
	emitter: {
		options: {
			type: "object",
			additionalProperties: false,
			properties: {},
			required: [],
		},
	},
});

export const { reportDiagnostic, stateKeys: StateKeys } = $lib;
