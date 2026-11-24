import { fileURLToPath } from "node:url";
import { resolvePath } from "@typespec/compiler";
import {
	createTestLibrary,
	type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const McpEmitterTestLibrary: TypeSpecTestLibrary = createTestLibrary({
	name: "@kattebak/typespec-mcp-emitter",
	packageRoot: resolvePath(fileURLToPath(import.meta.url), "../../../"),
	typespecFileFolder: "tsp",
	jsFileFolder: "dist",
});
