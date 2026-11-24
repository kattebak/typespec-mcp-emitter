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
		"duplicate-tool-name": {
			severity: "error",
			messages: {
				default: paramMessage`Tool name "${"name"}" is used by both ${"first"} and ${"second"}. Give one of them a @toolName.`,
			},
		},
		"missing-tool-description": {
			severity: "error",
			messages: {
				default: paramMessage`Operation ${"operation"} has neither @toolDescription nor @doc.`,
			},
		},
		"body-not-json": {
			severity: "error",
			messages: {
				default: paramMessage`Operation ${"operation"} takes a ${"contentTypes"} body; a tool input needs application/json.`,
			},
		},
		"body-not-object": {
			severity: "error",
			messages: {
				default: paramMessage`Operation ${"operation"} takes a body that is not an object, so it cannot merge into one tool input.`,
			},
		},
		"input-name-clash": {
			severity: "error",
			messages: {
				default: paramMessage`Operation ${"operation"} has a parameter and a body property both named "${"name"}".`,
			},
		},
		"recursive-input": {
			severity: "error",
			messages: {
				default: paramMessage`Operation ${"operation"} takes an input that refers to itself, which one flat tool input cannot carry.`,
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

export const {
	reportDiagnostic,
	createDiagnostic,
	stateKeys: StateKeys,
} = $lib;
