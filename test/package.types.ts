import {
	type Catalogue,
	catalogues,
	type ToolName,
} from "../build/petstore-package/index.js";

const name: ToolName<"PetStore"> = "list_pets";
const catalogue: Catalogue<ToolName<"PetStore">> = catalogues.PetStore;
const tool = catalogue.tools.find((entry) => entry.name === name);

export { tool };
