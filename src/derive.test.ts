import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestHost, createTestWrapper } from "@typespec/compiler/testing";
import { HttpTestLibrary } from "@typespec/http/testing";
import { OpenAPITestLibrary } from "@typespec/openapi/testing";
import { getOpenAPI3 } from "@typespec/openapi3";
import { OpenAPI3TestLibrary } from "@typespec/openapi3/testing";
import { annotationsForVerb, deriveCatalogues, toSnakeCase } from "./derive.js";
import { McpEmitterTestLibrary } from "./testing/index.js";

async function createRunner() {
	const host = await createTestHost({
		libraries: [
			HttpTestLibrary,
			OpenAPITestLibrary,
			OpenAPI3TestLibrary,
			McpEmitterTestLibrary,
		],
	});
	return createTestWrapper(host, {
		autoImports: ["@typespec/http", "@kattebak/typespec-mcp-emitter"],
		autoUsings: ["TypeSpec.Http", "Kattebak.Mcp"],
	});
}

async function compileCatalogues(code: string) {
	const runner = await createRunner();
	await runner.compile(code);
	const [catalogues] = deriveCatalogues(runner.program);
	return { runner, catalogues };
}

async function diagnosticCodes(code: string): Promise<string[]> {
	const runner = await createRunner();
	const diagnostics = await runner.diagnose(code);
	return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("toSnakeCase", () => {
	it("splits words and acronyms", () => {
		assert.equal(toSnakeCase("listWorkspaces"), "list_workspaces");
		assert.equal(toSnakeCase("batchDispatch"), "batch_dispatch");
		assert.equal(toSnakeCase("getHTTPStatus"), "get_http_status");
		assert.equal(toSnakeCase("listGitHubRepos"), "list_git_hub_repos");
	});
});

describe("annotationsForVerb", () => {
	it("derives the hints for every verb", () => {
		assert.deepEqual(annotationsForVerb("get"), {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
		});
		assert.deepEqual(annotationsForVerb("head"), {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
		});
		assert.deepEqual(annotationsForVerb("put"), {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
		});
		assert.deepEqual(annotationsForVerb("delete"), {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
		});
		assert.deepEqual(annotationsForVerb("post"), {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
		});
		assert.deepEqual(annotationsForVerb("patch"), {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
		});
	});
});

describe("deriveCatalogues", () => {
	it("lets @toolEffect and @toolIdempotent win over the verb", async () => {
		const { catalogues } = await compileCatalogues(`
      @service(#{ title: "Pet Store" })
      namespace PetStore;

      @doc("Search pets.") @toolEffect(ToolEffect.Read)
      @post @route("/pets/search") op searchPets(): void;

      @doc("Stop syncing.") @toolEffect(ToolEffect.Change)
      @delete @route("/sync") op disableSync(): void;

      @doc("Purge pets.") @toolEffect(ToolEffect.Destroy)
      @get @route("/purge") op purgePets(): void;

      @doc("Feed a pet.") @toolIdempotent(true)
      @post @route("/feed") op feedPet(): void;

      @doc("Replace a pet.") @toolIdempotent(false)
      @put @route("/pets") op replacePet(): void;
    `);

		const annotations = Object.fromEntries(
			catalogues[0].tools.map((tool) => [tool.name, tool.annotations]),
		);
		assert.deepEqual(annotations, {
			search_pets: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
			},
			disable_sync: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
			},
			purge_pets: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
			},
			feed_pet: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
			},
			replace_pet: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
			},
		});
	});

	it("reports duplicate-tool-name across two interfaces in one service", async () => {
		const codes = await diagnosticCodes(`
      @service(#{ title: "Pet Store" })
      namespace PetStore;

      @route("/pets") interface Pets {
        @doc("List pets.") @get list(): void;
      }

      @route("/owners") interface Owners {
        @doc("List owners.") @get list(): void;
      }
    `);

		assert.deepEqual(codes, [
			"@kattebak/typespec-mcp-emitter/duplicate-tool-name",
		]);
	});

	it("allows the same tool name in two services", async () => {
		const codes = await diagnosticCodes(`
      @service(#{ title: "Pet Store" })
      namespace PetStore {
        @doc("List pets.") @get @route("/pets") op list(): void;
      }

      @service(#{ title: "Owner Registry" })
      namespace OwnerRegistry {
        @doc("List owners.") @get @route("/owners") op list(): void;
      }
    `);

		assert.deepEqual(codes, []);
	});

	it("reports missing-tool-description", async () => {
		const codes = await diagnosticCodes(`
      @service(#{ title: "Pet Store" })
      namespace PetStore;

      @get @route("/pets") op listPets(): void;
    `);

		assert.deepEqual(codes, [
			"@kattebak/typespec-mcp-emitter/missing-tool-description",
		]);
	});

	it("binds the operationId the openapi3 emitter writes", async () => {
		const { runner, catalogues } = await compileCatalogues(`
      @service(#{ title: "Pet Store" })
      namespace PetStore;

      @doc("List pets.") @get @route("/pets") op listPets(): void;

      @route("/owners") interface Owners {
        @doc("List owners.") @get listOwners(): void;
      }

      namespace Clinic {
        namespace Visits {
          @doc("List visits.") @get @route("/visits") op listVisits(): void;
        }
      }
    `);

		const [record] = await getOpenAPI3(runner.program);
		assert.ok(record !== undefined && !record.versioned);
		const openApiIds = Object.entries(record.document.paths).map(
			([path, item]) => [path, item.get?.operationId],
		);
		const toolIds = catalogues[0].tools.map((tool) => [
			tool.binding.path,
			tool.binding.operationId,
		]);

		assert.deepEqual(toolIds, openApiIds);
		assert.deepEqual(toolIds, [
			["/pets", "listPets"],
			["/visits", "Visits_listVisits"],
			["/owners", "Owners_listOwners"],
		]);
	});
});
