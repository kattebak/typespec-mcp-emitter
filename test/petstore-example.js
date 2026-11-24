import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const CATALOGUE = "build/petstore-emit/PetStore.mcp-tools.json";

test("an excluded operation is listed with its reason and not as a tool", async () => {
	const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));

	assert.deepEqual(catalogue.excluded, [
		{
			operationId: "Maintenance_reindex",
			reason: "Runs from the scheduler, not from an agent.",
		},
	]);
	assert.deepEqual(
		catalogue.tools.map((tool) => tool.name),
		["list_pets", "create_pet", "update_pet", "delete_pet"],
	);
});

test("every input schema is valid JSON Schema draft 2020-12", async () => {
	const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
	const ajv = new Ajv2020();

	for (const tool of catalogue.tools) {
		assert.equal(
			ajv.validateSchema(tool.inputSchema),
			true,
			`${tool.name}: ${ajv.errorsText()}`,
		);
	}
});
