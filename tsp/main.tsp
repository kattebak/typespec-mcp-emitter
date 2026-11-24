import "../dist/index.js";

using TypeSpec.Reflection;

namespace Kattebak.Mcp;

enum ToolEffect {
  Read,
  Change,
  Destroy,
}

extern dec toolName(target: Operation, name: valueof string);
extern dec toolDescription(target: Operation, text: valueof string);
extern dec toolEffect(target: Operation, effect: ToolEffect);
extern dec toolIdempotent(target: Operation, idempotent: valueof boolean);
extern dec notTool(target: Operation | Interface | Namespace, reason: valueof string);
