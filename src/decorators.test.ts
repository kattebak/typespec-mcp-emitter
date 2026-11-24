import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestHost, createTestWrapper } from "@typespec/compiler/testing";
import { getNotToolReason } from "./decorators.js";
import { McpEmitterTestLibrary } from "./testing/index.js";

async function createRunner() {
	const host = await createTestHost({ libraries: [McpEmitterTestLibrary] });
	return createTestWrapper(host, {
		autoImports: ["@kattebak/typespec-mcp-emitter"],
		autoUsings: ["Kattebak.Mcp"],
	});
}

async function diagnosticCodes(code: string): Promise<string[]> {
	const runner = await createRunner();
	const diagnostics = await runner.diagnose(code);
	return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("decorators", () => {
	it("reports invalid-tool-name for a name outside the MCP rule", async () => {
		const codes = await diagnosticCodes(`
      @toolName("list pets") op listPets(): void;
    `);

		assert.deepEqual(codes, [
			"@kattebak/typespec-mcp-emitter/invalid-tool-name",
		]);
	});

	it("reports empty-not-tool-reason for an empty reason", async () => {
		const codes = await diagnosticCodes(`
      @notTool("") op listPets(): void;
    `);

		assert.deepEqual(codes, [
			"@kattebak/typespec-mcp-emitter/empty-not-tool-reason",
		]);
	});

	it("reports not-tool-with-override for @notTool beside @toolEffect", async () => {
		const codes = await diagnosticCodes(`
      @notTool("internal") @toolEffect(ToolEffect.Read) op listPets(): void;
    `);

		assert.deepEqual(codes, [
			"@kattebak/typespec-mcp-emitter/not-tool-with-override",
		]);
	});

	it("covers an operation nested two namespaces down from a @notTool namespace", async () => {
		const runner = await createRunner();
		const { ping } = await runner.compile(`
      @notTool("machine to machine")
      namespace PetStore {
        namespace Internal {
          namespace Health {
            @test op ping(): void;
          }
        }
      }
    `);

		assert.ok(ping?.kind === "Operation");
		assert.equal(getNotToolReason(runner.program, ping), "machine to machine");
	});
});
