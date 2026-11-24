import { emitFile, type Program, resolvePath } from "@typespec/compiler";
import type { ServiceCatalogue } from "./derive.js";

export interface PackageIdentity {
	name: string;
	version: string;
}

const ENTRY_TYPES = `export interface ToolAnnotations {
	readonly readOnlyHint: boolean;
	readonly destructiveHint: boolean;
	readonly idempotentHint: boolean;
}

export interface ToolBinding {
	readonly operationId: string;
	readonly method: "GET" | "HEAD" | "PUT" | "DELETE" | "POST" | "PATCH";
	readonly path: string;
	readonly pathParameters: readonly string[];
	readonly queryParameters: readonly string[];
	readonly headerParameters: readonly string[];
	readonly bodyProperties: readonly string[];
}

export interface InputSchema {
	readonly type: "object";
	readonly description?: string;
	readonly properties: Readonly<Record<string, unknown>>;
	readonly required: readonly string[];
	readonly additionalProperties: false;
}

export interface Tool<Name extends string = string> {
	readonly name: Name;
	readonly description: string;
	readonly inputSchema: InputSchema;
	readonly annotations: ToolAnnotations;
	readonly binding: ToolBinding;
}

export interface ExcludedOperation {
	readonly operationId: string;
	readonly reason: string;
}

export interface Catalogue<Name extends string = string> {
	readonly service: string;
	readonly tools: readonly Tool<Name>[];
	readonly excluded: readonly ExcludedOperation[];
}
`;

function moduleSource(catalogues: ServiceCatalogue[]): string {
	const entries = Object.fromEntries(
		catalogues.map(({ namespace, service, tools, excluded }) => [
			namespace,
			{ service, tools, excluded },
		]),
	);
	return `export const catalogues = ${JSON.stringify(entries, null, 2)};\n`;
}

function declarationSource(catalogues: ServiceCatalogue[]): string {
	const toolNames = catalogues
		.map(({ namespace, tools }) => {
			const union = tools.map(({ name }) => JSON.stringify(name)).join(" | ");
			return `\treadonly ${JSON.stringify(namespace)}: ${union};`;
		})
		.join("\n");

	return `${ENTRY_TYPES}
export interface ToolNames {
${toolNames}
}

export type ToolName<Service extends keyof ToolNames> = ToolNames[Service];

export declare const catalogues: {
	readonly [Service in keyof ToolNames]: Catalogue<ToolNames[Service]>;
};
`;
}

export async function emitPackage(
	program: Program,
	outputDir: string,
	catalogues: ServiceCatalogue[],
	identity: PackageIdentity,
): Promise<void> {
	const packageJson = {
		name: identity.name,
		version: identity.version,
		type: "module",
		main: "index.js",
		types: "index.d.ts",
	};

	await emitFile(program, {
		path: resolvePath(outputDir, "package.json"),
		content: `${JSON.stringify(packageJson, null, 2)}\n`,
	});
	await emitFile(program, {
		path: resolvePath(outputDir, "index.js"),
		content: moduleSource(catalogues),
	});
	await emitFile(program, {
		path: resolvePath(outputDir, "index.d.ts"),
		content: declarationSource(catalogues),
	});
}
