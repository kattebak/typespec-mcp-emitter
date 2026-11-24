import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestHost, createTestWrapper } from "@typespec/compiler/testing";
import { HttpTestLibrary } from "@typespec/http/testing";
import { OpenAPITestLibrary } from "@typespec/openapi/testing";
import { OpenAPI3TestLibrary } from "@typespec/openapi3/testing";
import { deriveCatalogues, type Tool } from "./derive.js";
import { SchemaFlattener } from "./input-schema.js";
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

function service(code: string): string {
	return `
    @service(#{ title: "Pet Store" })
    namespace PetStore;
    ${code}
  `;
}

async function compileTools(code: string): Promise<Map<string, Tool>> {
	const runner = await createRunner();
	await runner.compile(service(code));
	const [catalogues] = await deriveCatalogues(runner.program);
	return new Map(catalogues[0].tools.map((tool) => [tool.name, tool]));
}

async function diagnosticCodes(code: string): Promise<string[]> {
	const runner = await createRunner();
	const diagnostics = await runner.diagnose(service(code));
	return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("SchemaFlattener", () => {
	it("flattens $ref and single-member allOf into one schema", () => {
		const document = {
			components: {
				schemas: {
					Owner: { type: "object", properties: { name: { type: "string" } } },
					Tag: { type: "string", description: "A label." },
					Pet: {
						type: "object",
						properties: {
							owner: {
								allOf: [{ $ref: "#/components/schemas/Owner" }],
								description: "Who looks after the pet.",
							},
							tags: {
								type: "array",
								items: { $ref: "#/components/schemas/Tag" },
							},
						},
					},
				},
			},
		};
		const flattener = new SchemaFlattener(document);

		const schema = flattener.flatten({ $ref: "#/components/schemas/Pet" });

		assert.deepEqual(schema, {
			type: "object",
			properties: {
				owner: {
					type: "object",
					properties: { name: { type: "string" } },
					description: "Who looks after the pet.",
				},
				tags: {
					type: "array",
					items: { type: "string", description: "A label." },
				},
			},
		});
		assert.equal(flattener.recursive, false);
	});
});

describe("input schemas", () => {
	it("replaces the scalar's description with the parameter's own @doc", async () => {
		const tools = await compileTools(`
      @doc("Identifier of a pet.") scalar PetId extends string;

      @doc("Read a pet.") @get @route("/pets/{petId}")
      op getPet(@doc("The pet to read.") @path petId: PetId): void;
    `);

		assert.deepEqual(tools.get("get_pet")?.inputSchema.properties.petId, {
			type: "string",
			description: "The pet to read.",
		});
	});

	it("uses the body model's @doc as the top-level description", async () => {
		const tools = await compileTools(`
      @doc("A new pet.") model PetCreate { name: string; }

      @doc("Add a pet.") @post @route("/pets")
      op createPet(@body pet: PetCreate): void;
    `);

		assert.equal(
			tools.get("create_pet")?.inputSchema.description,
			"A new pet.",
		);
	});

	it("collects required from path, required query and body", async () => {
		const tools = await compileTools(`
      model Visit { reason: string; notes?: string; }

      @doc("Book a visit.") @post @route("/pets/{petId}/visits")
      op bookVisit(
        @path petId: string,
        @query clinic: string,
        @query urgent?: boolean,
        @body visit: Visit,
      ): void;
    `);

		assert.deepEqual(tools.get("book_visit")?.inputSchema.required, [
			"petId",
			"clinic",
			"reason",
		]);
	});

	it("keeps a Create-only property in the POST input and out of the PATCH input", async () => {
		const tools = await compileTools(`
      model Pet {
        name: string;
        @visibility(Lifecycle.Create) microchipCode: string;
      }

      @doc("Add a pet.") @post @route("/pets")
      op createPet(@body pet: Pet): void;

      @doc("Change a pet.") @patch @route("/pets/{petId}")
      op updatePet(@path petId: string, @body pet: Pet): void;
    `);

		assert.ok(
			"microchipCode" in
				(tools.get("create_pet")?.inputSchema.properties ?? {}),
		);
		assert.ok(
			!(
				"microchipCode" in
				(tools.get("update_pet")?.inputSchema.properties ?? {})
			),
		);
	});

	it("keeps format password on a @secret property", async () => {
		const tools = await compileTools(`
      model Credentials { @secret apiKey: string; }

      @doc("Store credentials.") @put @route("/credentials")
      op putCredentials(@body credentials: Credentials): void;
    `);

		assert.deepEqual(
			tools.get("put_credentials")?.inputSchema.properties.apiKey,
			{ type: "string", format: "password" },
		);
	});

	it("reports body-not-json for a text body", async () => {
		const codes = await diagnosticCodes(`
      @doc("Upload notes.") @post @route("/notes")
      op uploadNotes(@header contentType: "text/plain", @body notes: string): void;
    `);

		assert.deepEqual(codes, ["@kattebak/typespec-mcp-emitter/body-not-json"]);
	});

	it("reports body-not-object for an array body", async () => {
		const codes = await diagnosticCodes(`
      @doc("Tag pets.") @post @route("/tags")
      op tagPets(@body tags: string[]): void;
    `);

		assert.deepEqual(codes, ["@kattebak/typespec-mcp-emitter/body-not-object"]);
	});

	it("reports input-name-clash for a parameter and body property of one name", async () => {
		const codes = await diagnosticCodes(`
      model Pet { name: string; }

      @doc("Rename a pet.") @put @route("/pets")
      op renamePet(@query name: string, @body pet: Pet): void;
    `);

		assert.deepEqual(codes, [
			"@kattebak/typespec-mcp-emitter/input-name-clash",
		]);
	});

	it("reports recursive-input for a body that refers to itself", async () => {
		const codes = await diagnosticCodes(`
      model Category { name: string; children: Category[]; }

      @doc("Add a category.") @post @route("/categories")
      op createCategory(@body category: Category): void;
    `);

		assert.deepEqual(codes, ["@kattebak/typespec-mcp-emitter/recursive-input"]);
	});
});
