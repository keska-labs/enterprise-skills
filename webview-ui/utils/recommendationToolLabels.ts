/**
 * Human-readable one-line labels for streamed tool_use cards (webview).
 */

const SHELL_NAMES = new Set([
  "shell",
  "bash",
  "sh",
  "zsh",
  "terminal",
  "run_terminal_cmd",
  "run_command",
  "execute_command",
  "exec"
]);

function singleLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (!one) {
    return "";
  }
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) {
      return singleLine(v.trim(), 480);
    }
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) {
      const joined = singleLine(v.join(" "), 480);
      if (joined) {
        return joined;
      }
    }
  }
  return undefined;
}

/**
 * Best-effort primary argument (command, path, query, …) for tool cards and status pills.
 */
export function extractPrimaryToolDetail(name: string, input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input === "string") {
    const t = singleLine(input, 480);
    return t || undefined;
  }
  if (typeof input !== "object") {
    return undefined;
  }
  const o = input as Record<string, unknown>;
  const n = name.toLowerCase();

  const isShell =
    SHELL_NAMES.has(n) || n.includes("terminal") || n.includes("shell") || n.includes("command");

  if (isShell) {
    return (
      pickString(o, ["command", "cmd", "shell_command", "script", "prompt", "line", "input", "args"]) ??
      pickString(o, ["cwd"])
    );
  }

  return (
    pickString(o, ["path", "file_path", "target_file", "file", "uri", "url"]) ??
    pickString(o, ["query", "pattern", "search", "grep", "glob"]) ??
    pickString(o, ["old_string", "new_string"])
  );
}

/** Title line for a tool card: `name` or `name — detail`. */
export function formatToolUseHeadline(name: string, input: unknown): string {
  const detail = extractPrimaryToolDetail(name, input);
  if (detail) {
    return `${name} — ${detail}`;
  }
  return name;
}
