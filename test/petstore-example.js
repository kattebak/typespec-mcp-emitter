import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
		["list_pets", "create_pet", "delete_pet"],
	);
});
