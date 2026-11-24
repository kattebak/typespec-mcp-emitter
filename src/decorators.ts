import type {
	DecoratorContext,
	EnumMember,
	Interface,
	Namespace,
	Operation,
	Program,
	Type,
} from "@typespec/compiler";
import { reportDiagnostic, StateKeys } from "./lib.js";

export const namespace = "Kattebak.Mcp";

export const TOOL_EFFECTS = ["Read", "Change", "Destroy"] as const;

export type ToolEffect = (typeof TOOL_EFFECTS)[number];

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

const OVERRIDE_KEYS = [
	StateKeys.toolName,
	StateKeys.toolDescription,
	StateKeys.toolEffect,
	StateKeys.toolIdempotent,
];

function isToolEffect(name: string): name is ToolEffect {
	return TOOL_EFFECTS.some((effect) => effect === name);
}

function isOperation(type: Type): type is Operation {
	return type.kind === "Operation";
}

export function $toolName(
	context: DecoratorContext,
	target: Operation,
	name: string,
): void {
	if (!TOOL_NAME_PATTERN.test(name)) {
		reportDiagnostic(context.program, {
			code: "invalid-tool-name",
			target: context.decoratorTarget,
			format: { name },
		});
		return;
	}

	context.program.stateMap(StateKeys.toolName).set(target, name);
}

export function getToolName(
	program: Program,
	target: Operation,
): string | undefined {
	return program.stateMap(StateKeys.toolName).get(target);
}

export function $toolDescription(
	context: DecoratorContext,
	target: Operation,
	text: string,
): void {
	context.program.stateMap(StateKeys.toolDescription).set(target, text);
}

export function getToolDescription(
	program: Program,
	target: Operation,
): string | undefined {
	return program.stateMap(StateKeys.toolDescription).get(target);
}

export function $toolEffect(
	context: DecoratorContext,
	target: Operation,
	effect: EnumMember,
): void {
	if (!isToolEffect(effect.name)) {
		throw new Error(`Unknown ToolEffect member ${effect.name}`);
	}

	context.program.stateMap(StateKeys.toolEffect).set(target, effect.name);
}

export function getToolEffect(
	program: Program,
	target: Operation,
): ToolEffect | undefined {
	return program.stateMap(StateKeys.toolEffect).get(target);
}

export function $toolIdempotent(
	context: DecoratorContext,
	target: Operation,
	idempotent: boolean,
): void {
	context.program.stateMap(StateKeys.toolIdempotent).set(target, idempotent);
}

export function getToolIdempotent(
	program: Program,
	target: Operation,
): boolean | undefined {
	return program.stateMap(StateKeys.toolIdempotent).get(target);
}

export function $notTool(
	context: DecoratorContext,
	target: Operation | Interface | Namespace,
	reason: string,
): void {
	if (reason.trim() === "") {
		reportDiagnostic(context.program, {
			code: "empty-not-tool-reason",
			target: context.decoratorTarget,
		});
		return;
	}

	context.program.stateMap(StateKeys.notTool).set(target, reason);
}

export function getNotToolReason(
	program: Program,
	target: Operation,
): string | undefined {
	const reasons = program.stateMap(StateKeys.notTool);
	const own = reasons.get(target);
	if (own !== undefined) {
		return own;
	}

	if (target.interface !== undefined) {
		const inherited = reasons.get(target.interface);
		if (inherited !== undefined) {
			return inherited;
		}
	}

	let scope = target.interface?.namespace ?? target.namespace;
	while (scope !== undefined) {
		const reason = reasons.get(scope);
		if (reason !== undefined) {
			return reason;
		}
		scope = scope.namespace;
	}

	return undefined;
}

export function validateNotToolOverrides(program: Program): void {
	for (const target of program.stateMap(StateKeys.notTool).keys()) {
		if (!isOperation(target)) {
			continue;
		}

		const overridden = OVERRIDE_KEYS.some((key) =>
			program.stateMap(key).has(target),
		);
		if (!overridden) {
			continue;
		}

		reportDiagnostic(program, {
			code: "not-tool-with-override",
			target,
			format: { operation: target.name },
		});
	}
}
