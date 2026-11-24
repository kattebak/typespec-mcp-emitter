import {
	createDiagnosticCollector,
	type Diagnostic,
	getTypeName,
	type Namespace,
	type Program,
} from "@typespec/compiler";
import type { HttpOperation } from "@typespec/http";
import { getOpenAPI3 } from "@typespec/openapi3";
import { createDiagnostic } from "./lib.js";

export type JsonObject = { [key: string]: unknown };

export type InputSchema = JsonObject & {
	type: "object";
	properties: Record<string, JsonObject>;
	required: string[];
	additionalProperties: false;
};

const PARAMETER_LOCATIONS = new Set(["path", "query", "header"]);

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isReadOnly(value: unknown): boolean {
	return isJsonObject(value) && value.readOnly === true;
}

function child(value: unknown, key: string): JsonObject {
	const next = isJsonObject(value) ? value[key] : undefined;
	if (!isJsonObject(next)) {
		throw new Error(`OpenAPI document has no object at "${key}"`);
	}
	return next;
}

export async function getOpenApiDocuments(
	program: Program,
): Promise<Map<Namespace, JsonObject>> {
	const records = await getOpenAPI3(program, {
		"openapi-versions": ["3.1.0"],
	});
	const documents = new Map<Namespace, JsonObject>();
	for (const record of records) {
		const document = record.versioned
			? record.versions.at(-1)?.document
			: record.document;
		if (isJsonObject(document)) {
			documents.set(record.service.type, document);
		}
	}
	return documents;
}

export class SchemaFlattener {
	recursive = false;

	constructor(private readonly document: JsonObject) {}

	resolve(ref: string): JsonObject {
		return ref
			.replace(/^#\//, "")
			.split("/")
			.map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
			.reduce<JsonObject>(
				(node, segment) => child(node, segment),
				this.document,
			);
	}

	flatten(schema: JsonObject, refs: readonly string[] = []): JsonObject {
		const { $ref, ...siblings } = Object.fromEntries(Object.entries(schema));
		if (isString($ref)) {
			if (refs.includes($ref)) {
				this.recursive = true;
				return {};
			}
			return {
				...this.flatten(this.resolve($ref), [...refs, $ref]),
				...this.flattenMembers(siblings, refs),
			};
		}

		const { allOf, ...rest } = siblings;
		if (Array.isArray(allOf) && allOf.length === 1 && isJsonObject(allOf[0])) {
			return {
				...this.flatten(allOf[0], refs),
				...this.flattenMembers(rest, refs),
			};
		}

		return this.flattenMembers(siblings, refs);
	}

	private flattenValue(value: unknown, refs: readonly string[]): unknown {
		if (Array.isArray(value)) {
			return value.map((item) => this.flattenValue(item, refs));
		}
		if (isJsonObject(value)) {
			return this.flatten(value, refs);
		}
		return value;
	}

	private flattenMembers(
		schema: JsonObject,
		refs: readonly string[],
	): JsonObject {
		const result: JsonObject = { ...schema };
		for (const key of ["items", "additionalProperties", "not"]) {
			if (isJsonObject(schema[key])) {
				result[key] = this.flatten(schema[key], refs);
			}
		}
		for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
			if (Array.isArray(schema[key])) {
				result[key] = this.flattenValue(schema[key], refs);
			}
		}
		if (isJsonObject(schema.properties)) {
			const writable = Object.entries(schema.properties)
				.map(([name, property]): [string, unknown] => [
					name,
					this.flattenValue(property, refs),
				])
				.filter(([, property]) => !isReadOnly(property));
			result.properties = Object.fromEntries(writable);
			if (Array.isArray(schema.required)) {
				const names = new Set(writable.map(([name]) => name));
				result.required = schema.required.filter(
					(name) => isString(name) && names.has(name),
				);
			}
		}
		return result;
	}
}

function findOperation(
	document: JsonObject,
	httpOperation: HttpOperation,
): JsonObject {
	return child(child(document.paths, httpOperation.path), httpOperation.verb);
}

function isObjectSchema(schema: JsonObject): boolean {
	return schema.type === "object" || isJsonObject(schema.properties);
}

export function deriveInputSchema(
	document: JsonObject,
	httpOperation: HttpOperation,
): [InputSchema, readonly Diagnostic[]] {
	const diagnostics = createDiagnosticCollector();
	const operation = httpOperation.operation;
	const flattener = new SchemaFlattener(document);
	const openApiOperation = findOperation(document, httpOperation);
	const inputSchema: InputSchema = {
		type: "object",
		properties: {},
		required: [],
		additionalProperties: false,
	};

	const parameters = Array.isArray(openApiOperation.parameters)
		? openApiOperation.parameters.filter(isJsonObject)
		: [];
	for (const reference of parameters) {
		const parameter = isString(reference.$ref)
			? flattener.resolve(reference.$ref)
			: reference;
		if (
			!isString(parameter.name) ||
			!isString(parameter.in) ||
			!PARAMETER_LOCATIONS.has(parameter.in)
		) {
			continue;
		}
		const schema = flattener.flatten(child(parameter, "schema"));
		inputSchema.properties[parameter.name] = isString(parameter.description)
			? { ...schema, description: parameter.description }
			: schema;
		if (parameter.in === "path" || parameter.required === true) {
			inputSchema.required.push(parameter.name);
		}
	}

	const body = httpOperation.parameters.body;
	if (body !== undefined) {
		const isJson =
			body.bodyKind === "single" &&
			body.contentTypes.every(
				(contentType) => contentType === "application/json",
			);
		if (!isJson) {
			diagnostics.add(
				createDiagnostic({
					code: "body-not-json",
					target: operation,
					format: {
						operation: getTypeName(operation),
						contentTypes: body.contentTypes.join(", "),
					},
				}),
			);
			return [inputSchema, diagnostics.diagnostics];
		}

		const requestBody = child(openApiOperation, "requestBody");
		const content = child(
			isString(requestBody.$ref)
				? flattener.resolve(requestBody.$ref)
				: requestBody,
			"content",
		);
		const bodySchema = flattener.flatten(
			child(child(content, "application/json"), "schema"),
		);
		if (!isObjectSchema(bodySchema)) {
			diagnostics.add(
				createDiagnostic({
					code: "body-not-object",
					target: operation,
					format: { operation: getTypeName(operation) },
				}),
			);
			return [inputSchema, diagnostics.diagnostics];
		}

		if (isString(bodySchema.description)) {
			inputSchema.description = bodySchema.description;
		}
		const bodyProperties = isJsonObject(bodySchema.properties)
			? bodySchema.properties
			: {};
		for (const [name, property] of Object.entries(bodyProperties)) {
			if (name in inputSchema.properties) {
				diagnostics.add(
					createDiagnostic({
						code: "input-name-clash",
						target: operation,
						format: { operation: getTypeName(operation), name },
					}),
				);
				continue;
			}
			if (isJsonObject(property)) {
				inputSchema.properties[name] = property;
			}
		}
		if (Array.isArray(bodySchema.required)) {
			inputSchema.required.push(...bodySchema.required.filter(isString));
		}
	}

	if (flattener.recursive) {
		diagnostics.add(
			createDiagnostic({
				code: "recursive-input",
				target: operation,
				format: { operation: getTypeName(operation) },
			}),
		);
	}

	return [inputSchema, diagnostics.diagnostics];
}
