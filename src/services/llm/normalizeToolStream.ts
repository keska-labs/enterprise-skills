/**
 * Normalize Cursor / OpenAI-shaped tool blocks so the webview can show commands, paths, etc.
 */

export interface NormalizedToolCall {
  name: string;
  input: unknown;
  id?: string;
}

/**
 * Coalesce `input`, string `arguments`, object `arguments`, and nested `function` payloads.
 */
export function normalizeToolBlockForStream(block: Record<string, unknown>): NormalizedToolCall {
  let name =
    typeof block.name === "string" && block.name.trim()
      ? block.name.trim()
      : typeof block.tool_name === "string" && block.tool_name.trim()
        ? block.tool_name.trim()
        : "tool";

  let input: unknown = block.input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        input = JSON.parse(trimmed);
      } catch {
        input = trimmed;
      }
    } else if (trimmed) {
      input = trimmed;
    }
  }

  const id = typeof block.id === "string" ? block.id : undefined;

  const fn = block.function;
  if (fn && typeof fn === "object") {
    const f = fn as Record<string, unknown>;
    if (typeof f.name === "string" && f.name.trim()) {
      name = f.name.trim();
    }
    if (input === undefined || input === null) {
      const argStr = f.arguments;
      if (typeof argStr === "string") {
        const trimmed = argStr.trim();
        if (trimmed) {
          try {
            input = JSON.parse(trimmed);
          } catch {
            input = { command: trimmed };
          }
        }
      } else if (argStr !== undefined) {
        input = argStr;
      }
    }
  }

  if (input === undefined || input === null) {
    const raw = block.arguments;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) {
        try {
          input = JSON.parse(trimmed);
        } catch {
          input = { command: trimmed };
        }
      }
    } else if (raw !== undefined) {
      input = raw;
    }
  }

  return { name, input, id };
}
