import "@typespec/http";
import "@kattebak/typespec-mcp-emitter";

using TypeSpec.Http;
using Kattebak.Mcp;

@service(#{ title: "Pet Store" })
namespace PetStore;

@doc("Identifier of a pet.")
scalar PetId extends string;

enum PetStatus {
  Available,
  Adopted,
}

@doc("The person who looks after a pet.")
model Owner {
  name: string;
  phone?: string;
}

@doc("A pet in the store.")
model Pet {
  @visibility(Lifecycle.Read)
  petId: PetId;

  name: string;
  status: PetStatus;

  @doc("Who looks after the pet.")
  owner: Owner;

  @secret
  @visibility(Lifecycle.Create)
  microchipCode: string;
}

@route("/pets")
interface Pets {
  @doc("List the pets in the store.")
  @get
  listPets(@query status?: PetStatus): Pet[];

  @doc("Add a pet to the store.")
  @post
  createPet(@body pet: Pet): Pet;

  @doc("Change a pet.")
  @patch
  @route("/{petId}")
  updatePet(@doc("The pet to change.") @path petId: PetId, @body pet: Pet): Pet;

  @doc("Remove a pet from the store.")
  @delete
  @route("/{petId}")
  deletePet(@path petId: PetId): void;
}

@route("/internal/reindex")
interface Maintenance {
  @doc("Rebuild the search index.")
  @notTool("Runs from the scheduler, not from an agent.")
  @post
  reindex(): void;
}
