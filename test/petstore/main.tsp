import "@typespec/http";
import "@kattebak/typespec-mcp-emitter";

using TypeSpec.Http;
using Kattebak.Mcp;

@service(#{ title: "Pet Store" })
namespace PetStore;

model Pet {
  petId: string;
  name: string;
}

model PetCreate {
  name: string;
}

@route("/pets")
interface Pets {
  @doc("List the pets in the store.")
  @get
  listPets(@query status?: string): Pet[];

  @doc("Add a pet to the store.")
  @post
  createPet(@body pet: PetCreate): Pet;

  @doc("Remove a pet from the store.")
  @delete
  @route("/{petId}")
  deletePet(@path petId: string): void;
}

@route("/internal/reindex")
interface Maintenance {
  @doc("Rebuild the search index.")
  @notTool("Runs from the scheduler, not from an agent.")
  @post
  reindex(): void;
}
