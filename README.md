# typespec-mcp-emitter

A TypeSpec emitter that writes an MCP tool catalogue for each HTTP service. Every HTTP operation becomes one tool. The emitter derives the tool's name, description, input schema and hints from the operation itself, so an operation needs no decorator to become a tool. Decorators exist only to override a derived value or to keep an operation off MCP with a reason.

## Install

```sh
npm install --save-dev @kattebak/typespec-mcp-emitter @typespec/openapi3
```

`@typespec/openapi3` is a peer dependency. The emitter builds each input schema from the OpenAPI 3.1 document of the same compile, so a tool's input always matches the REST contract.

## Configure

```yaml
emit:
  - "@kattebak/typespec-mcp-emitter"
options:
  "@kattebak/typespec-mcp-emitter":
    emitter-output-dir: "{cwd}/build/mcp-tools"
    package-name: "@acme/mcp-tools"
    package-version: "1.0.0"
```

| Option               | Effect                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `emitter-output-dir` | Directory the files land in.                                                                                                    |
| `package-name`       | When set, the emitter also writes `package.json`, `index.js` and `index.d.ts`, so the output works as an npm workspace package. |
| `package-version`    | Version in that `package.json`. Defaults to `0.0.1`.                                                                            |

Import the library in the TypeSpec source that uses a decorator:

```tsp
import "@kattebak/typespec-mcp-emitter";

using Kattebak.Mcp;
```

## Derivation

| Value             | Derived from                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool name         | The operation name in snake case: `listWorkspaces` gives `list_workspaces`, `getHTTPStatus` gives `get_http_status`, and `listGitHubRepos` gives `list_git_hub_repos`. |
| Description       | `@doc` on the operation.                                                                                                                                               |
| Input schema      | Path, query and header parameters and the JSON body properties, merged into one flat object schema.                                                                    |
| `readOnlyHint`    | `true` for GET and HEAD, otherwise `false`.                                                                                                                            |
| `destructiveHint` | `true` for DELETE, otherwise `false`.                                                                                                                                  |
| `idempotentHint`  | `true` for GET, HEAD, PUT and DELETE; `false` for POST and PATCH.                                                                                                      |
| Binding           | The operationId the OpenAPI 3 emitter gives the operation, the HTTP method, the path template, and which inputs are path, query, header and body.                      |

The input schema follows these rules:

1. Every `$ref` and single-member `allOf` is inlined, so each schema stands alone.
2. A parameter's own `@doc` replaces the description of the scalar it refers to.
3. `@doc` on the body model becomes the schema's top-level `description`.
4. `required` lists the path parameters, the required query and header parameters, and the body's required properties.
5. Visibility applies as it does in the REST contract: a Create-only property appears in the POST input and not in the PATCH input. Read-only properties never appear.
6. A `@secret` property keeps `format: "password"`, so a client can mask it.

Only namespaces marked `@service` get a catalogue.

## Decorators

All decorators live in `Kattebak.Mcp`. Each one is an override; none is required.

```tsp
extern dec toolName(target: Operation, name: valueof string);
extern dec toolDescription(target: Operation, text: valueof string);
extern dec toolEffect(target: Operation, effect: ToolEffect);
extern dec toolIdempotent(target: Operation, idempotent: valueof boolean);
extern dec notTool(target: Operation | Interface | Namespace, reason: valueof string);

enum ToolEffect { Read, Change, Destroy }
```

| Decorator                      | Effect                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@toolName("name")`            | Replaces the derived name. The name must match `^[A-Za-z0-9_.-]{1,128}$`.                                                                                                                 |
| `@toolDescription("text")`     | Replaces `@doc` as the tool description. Use it for text written for a model. `@doc` stays the API documentation.                                                                         |
| `@toolEffect(ToolEffect.Read)` | Replaces the effect the verb gives. `Read` sets `readOnlyHint: true, destructiveHint: false`. `Change` sets both to `false`. `Destroy` sets `readOnlyHint: false, destructiveHint: true`. |
| `@toolIdempotent(true)`        | Replaces the derived `idempotentHint`.                                                                                                                                                    |
| `@notTool("reason")`           | Keeps an operation off MCP, or every operation in an interface or namespace, including nested namespaces. The reason is required and lands in the catalogue.                              |

```tsp
@notTool("Runs from the scheduler, not from an agent.")
interface Maintenance {
  @doc("Rebuild the search index.")
  @post
  @route("/internal/reindex")
  reindex(): void;
}

@doc("Turn off settings sync.")
@toolEffect(ToolEffect.Change)
@delete
@route("/settings/sync")
op disableSettingSync(): void;
```

## Diagnostics

Every operation is a tool unless `@notTool` covers it. Each of these fails compilation:

| Code                       | Cause                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `duplicate-tool-name`      | Two tools in one service have the same name. The message names both operations. Give one of them a `@toolName`. |
| `invalid-tool-name`        | A `@toolName` breaks the name rule.                                                                             |
| `missing-tool-description` | A tool has neither `@toolDescription` nor `@doc`.                                                               |
| `body-not-json`            | The request body is not `application/json`, for example multipart, bytes or text.                               |
| `body-not-object`          | The body is an array or a scalar, so it cannot merge into one object.                                           |
| `input-name-clash`         | A path, query or header parameter has the same name as a body property.                                         |
| `recursive-input`          | The input schema refers to itself.                                                                              |
| `empty-not-tool-reason`    | `@notTool("")`.                                                                                                 |
| `not-tool-with-override`   | An operation carries `@notTool` and a tool override at once.                                                    |

## Output

The emitter writes `<service namespace>.mcp-tools.json` for each service, for example `PetStore.mcp-tools.json`. A service whose every operation is excluded writes no file.

```json
{
	"service": "Pet Store",
	"tools": [
		{
			"name": "delete_pet",
			"description": "Remove a pet from the store.",
			"inputSchema": {
				"type": "object",
				"properties": { "petId": { "type": "string" } },
				"required": ["petId"],
				"additionalProperties": false
			},
			"annotations": {
				"readOnlyHint": false,
				"destructiveHint": true,
				"idempotentHint": true
			},
			"binding": {
				"operationId": "Pets_deletePet",
				"method": "DELETE",
				"path": "/pets/{petId}",
				"pathParameters": ["petId"],
				"queryParameters": [],
				"headerParameters": [],
				"bodyProperties": []
			}
		}
	],
	"excluded": [
		{
			"operationId": "Maintenance_reindex",
			"reason": "Runs from the scheduler, not from an agent."
		}
	]
}
```

With `package-name` set, `index.js` exports `catalogues`, an object that holds each service's catalogue under its namespace. `index.d.ts` declares the entry types and a union of tool names per service, so a lookup by name is type-checked:

```ts
import { catalogues, type ToolName } from "@acme/mcp-tools";

const name: ToolName<"PetStore"> = "delete_pet";
const tool = catalogues.PetStore.tools.find((entry) => entry.name === name);
```
