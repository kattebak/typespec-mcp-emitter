import {
	createDiagnosticCollector,
	type Diagnostic,
	getDoc,
	getNamespaceFullName,
	getService,
	getTypeName,
	type Operation,
	type Program,
	resolveEncodedName,
	walkPropertiesInherited,
} from "@typespec/compiler";
import {
	getAllHttpServices,
	type HttpOperation,
	type HttpService,
	type HttpVerb,
} from "@typespec/http";
import { resolveOperationId } from "@typespec/openapi";
import {
	getNotToolReason,
	getToolDescription,
	getToolEffect,
	getToolIdempotent,
	getToolName,
	type ToolEffect,
} from "./decorators.js";
import { createDiagnostic } from "./lib.js";

export interface ToolAnnotations {
	readOnlyHint: boolean;
	destructiveHint: boolean;
	idempotentHint: boolean;
}

export interface ToolBinding {
	operationId: string;
	method: Uppercase<HttpVerb>;
	path: string;
	pathParameters: string[];
	queryParameters: string[];
	headerParameters: string[];
	bodyProperties: string[];
}

export interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, never>;
	annotations: ToolAnnotations;
	binding: ToolBinding;
}

export interface ExcludedOperation {
	operationId: string;
	reason: string;
}

export interface ServiceCatalogue {
	namespace: string;
	service: string;
	tools: Tool[];
	excluded: ExcludedOperation[];
}

const VERB_ANNOTATIONS: Record<HttpVerb, ToolAnnotations> = {
	get: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
	head: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
	put: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	delete: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	post: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	patch: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
};

const METHODS: Record<HttpVerb, Uppercase<HttpVerb>> = {
	get: "GET",
	head: "HEAD",
	put: "PUT",
	delete: "DELETE",
	post: "POST",
	patch: "PATCH",
};

const EFFECT_HINTS: Record<
	ToolEffect,
	Pick<ToolAnnotations, "readOnlyHint" | "destructiveHint">
> = {
	Read: { readOnlyHint: true, destructiveHint: false },
	Change: { readOnlyHint: false, destructiveHint: false },
	Destroy: { readOnlyHint: false, destructiveHint: true },
};

export function toSnakeCase(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.toLowerCase();
}

export function annotationsForVerb(verb: HttpVerb): ToolAnnotations {
	return { ...VERB_ANNOTATIONS[verb] };
}

function deriveAnnotations(
	program: Program,
	httpOperation: HttpOperation,
): ToolAnnotations {
	const annotations = annotationsForVerb(httpOperation.verb);
	const effect = getToolEffect(program, httpOperation.operation);
	const idempotent = getToolIdempotent(program, httpOperation.operation);
	return {
		...annotations,
		...(effect === undefined ? {} : EFFECT_HINTS[effect]),
		...(idempotent === undefined ? {} : { idempotentHint: idempotent }),
	};
}

function bodyProperties(
	program: Program,
	httpOperation: HttpOperation,
): string[] {
	const body = httpOperation.parameters.body;
	if (body?.bodyKind !== "single" || body.type.kind !== "Model") {
		return [];
	}

	return [...walkPropertiesInherited(body.type)].map((property) =>
		resolveEncodedName(program, property, "application/json"),
	);
}

function parameterNames(
	httpOperation: HttpOperation,
	location: "path" | "query" | "header",
): string[] {
	return httpOperation.parameters.parameters
		.filter((parameter) => parameter.type === location)
		.map((parameter) => parameter.name);
}

function deriveBinding(
	program: Program,
	httpOperation: HttpOperation,
): ToolBinding {
	return {
		operationId: resolveOperationId(program, httpOperation.operation),
		method: METHODS[httpOperation.verb],
		path: httpOperation.path,
		pathParameters: parameterNames(httpOperation, "path"),
		queryParameters: parameterNames(httpOperation, "query"),
		headerParameters: parameterNames(httpOperation, "header"),
		bodyProperties: bodyProperties(program, httpOperation),
	};
}

function deriveCatalogue(
	program: Program,
	httpService: HttpService,
	title: string,
): [ServiceCatalogue, readonly Diagnostic[]] {
	const diagnostics = createDiagnosticCollector();
	const tools: Tool[] = [];
	const excluded: ExcludedOperation[] = [];
	const operationsByName = new Map<string, Operation>();

	for (const httpOperation of httpService.operations) {
		const operation = httpOperation.operation;
		const reason = getNotToolReason(program, operation);
		if (reason !== undefined) {
			excluded.push({
				operationId: resolveOperationId(program, operation),
				reason,
			});
			continue;
		}

		const description =
			getToolDescription(program, operation) ?? getDoc(program, operation);
		if (description === undefined) {
			diagnostics.add(
				createDiagnostic({
					code: "missing-tool-description",
					target: operation,
					format: { operation: getTypeName(operation) },
				}),
			);
			continue;
		}

		const name = getToolName(program, operation) ?? toSnakeCase(operation.name);
		const clash = operationsByName.get(name);
		if (clash !== undefined) {
			diagnostics.add(
				createDiagnostic({
					code: "duplicate-tool-name",
					target: operation,
					format: {
						name,
						first: getTypeName(clash),
						second: getTypeName(operation),
					},
				}),
			);
			continue;
		}
		operationsByName.set(name, operation);

		tools.push({
			name,
			description,
			inputSchema: {},
			annotations: deriveAnnotations(program, httpOperation),
			binding: deriveBinding(program, httpOperation),
		});
	}

	return [
		{
			namespace: getNamespaceFullName(httpService.namespace),
			service: title,
			tools,
			excluded,
		},
		diagnostics.diagnostics,
	];
}

export function deriveCatalogues(
	program: Program,
): [ServiceCatalogue[], readonly Diagnostic[]] {
	const diagnostics = createDiagnosticCollector();
	const [httpServices] = getAllHttpServices(program);
	const catalogues: ServiceCatalogue[] = [];
	for (const httpService of httpServices) {
		const service = getService(program, httpService.namespace);
		if (service === undefined) {
			continue;
		}
		const title = service.title ?? httpService.namespace.name;
		catalogues.push(
			diagnostics.pipe(deriveCatalogue(program, httpService, title)),
		);
	}
	return [catalogues, diagnostics.diagnostics];
}
