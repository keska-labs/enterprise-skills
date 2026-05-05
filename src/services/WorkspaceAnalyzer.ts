import * as vscode from "vscode";

const MAX_PATTERN_FILES = 50;
const MAX_LANGUAGE_SAMPLE = 500;
const MAX_PACKAGE_JSON_READS = 24;
const MAX_FILE_READ_BYTES = 65536;
const AGENTS_MD_MAX = 32768;

const FINDFILE_EXCLUDE =
  "**/{node_modules,.git,dist,build,out,target,.venv,venv,__pycache__,vendor}/**";

export interface WorkspaceProfile {
  /** Normalized language ids from file extensions (e.g. typescript, python). */
  languages: Set<string>;
  /** Lowercased dependency/package names. */
  dependencies: Set<string>;
  /** Lowercased workspace-relative paths using forward slashes. */
  relativePaths: Set<string>;
  installedExtensions: Set<string>;
  /** Lowercased AGENTS.md excerpt for keyword matching. */
  agentsMdText: string | null;
  isMonorepo: boolean;
}

function extToLanguage(ext: string): string | undefined {
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".vue": "vue",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".swift": "swift",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".fs": "fsharp",
    ".scala": "scala",
    ".dart": "dart",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".sql": "sql",
    ".tf": "terraform",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".md": "markdown",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell"
  };
  return map[ext.toLowerCase()];
}

async function readUtf8Limited(uri: vscode.Uri): Promise<string | null> {
  try {
    const data = await vscode.workspace.fs.readFile(uri);
    const slice = data.byteLength > MAX_FILE_READ_BYTES ? data.slice(0, MAX_FILE_READ_BYTES) : data;
    return Buffer.from(slice).toString("utf8");
  } catch {
    return null;
  }
}

function collectJsonDeps(section: unknown, into: Set<string>): void {
  if (!section || typeof section !== "object") {
    return;
  }
  for (const key of Object.keys(section as Record<string, unknown>)) {
    into.add(key.toLowerCase());
  }
}

function parseRequirementsTxt(content: string, into: Set<string>): void {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) {
      continue;
    }
    const name = trimmed.split(/[=<>![\s]/)[0]?.trim();
    if (name) {
      into.add(name.toLowerCase());
    }
  }
}

function parsePyprojectToml(content: string, into: Set<string>): void {
  const depSection = /\[project\]\s*[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/;
  const poetrySection = /\[tool\.poetry\.dependencies\]\s*([\s\S]*?)(?:^\[|$)/m;
  const pep = content.match(depSection);
  if (pep?.[1]) {
    for (const m of pep[1].matchAll(/"([^"]+)"/g)) {
      const pkg = m[1]?.split(/[=<>![\s]/)[0]?.trim();
      if (pkg) {
        into.add(pkg.toLowerCase());
      }
    }
  }
  const poetry = content.match(poetrySection);
  if (poetry?.[1]) {
    for (const line of poetry[1].split(/\r?\n/)) {
      const mm = line.match(/^([a-zA-Z0-9_.-]+)\s*=/);
      if (mm && mm[1] !== "python") {
        into.add(mm[1].toLowerCase());
      }
    }
  }
}

function parseCargoToml(content: string, into: Set<string>): void {
  const block = content.match(/\[dependencies\]\s*([\s\S]*?)(?:^\[|$)/m);
  if (!block?.[1]) {
    return;
  }
  for (const line of block[1].split(/\r?\n/)) {
    const mm = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
    if (mm) {
      into.add(mm[1].toLowerCase());
    }
  }
}

function parseGoMod(content: string, into: Set<string>): void {
  for (const line of content.split(/\r?\n/)) {
    const mm = line.match(/^\s*require\s+(?:\(|)/);
    if (mm) {
      continue;
    }
    const req = line.match(/^\s*([a-zA-Z0-9_.\\/~-]+)\s+v[^\s]+/);
    if (req) {
      const mod = req[1].split("/").pop() ?? req[1];
      into.add(mod.toLowerCase());
    }
  }
}

export class WorkspaceAnalyzer {
  public async analyze(): Promise<WorkspaceProfile> {
    const languages = new Set<string>();
    const dependencies = new Set<string>();
    const relativePaths = new Set<string>();
    let agentsMdText: string | null = null;
    let isMonorepo = false;

    const folders = vscode.workspace.workspaceFolders ?? [];
    const installedExtensions = new Set(vscode.extensions.all.map((e) => e.id.toLowerCase()));

    if (folders.length === 0) {
      return {
        languages,
        dependencies,
        relativePaths,
        installedExtensions,
        agentsMdText,
        isMonorepo: false
      };
    }

    const markerGlobs = [
      "**/package.json",
      "**/pnpm-workspace.yaml",
      "**/pyproject.toml",
      "**/requirements.txt",
      "**/Cargo.toml",
      "**/go.mod",
      "**/tsconfig.json",
      "**/Dockerfile",
      "**/*.tf",
      "**/AGENTS.md",
      "**/.gitmessage",
      "**/openapi.yaml",
      "**/openapi.json",
      "**/swagger.yaml",
      "**/swagger.json",
      "**/.github/PULL_REQUEST_TEMPLATE.md",
      "**/CONTRIBUTING.md",
      "**/SECURITY.md",
      "**/.well-known/security.txt",
      "**/schema.graphql",
      "**/commitlint.config.*",
      "**/.commitlintrc",
      "**/.commitlintrc.json",
      "**/.commitlintrc.yaml",
      "**/.commitlintrc.yml",
      "**/.commitlintrc.js",
      "**/.czrc"
    ];

    for (const glob of markerGlobs) {
      const uris = await vscode.workspace.findFiles(glob, FINDFILE_EXCLUDE, MAX_PATTERN_FILES);
      for (const uri of uris) {
        const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/").toLowerCase();
        relativePaths.add(rel);
      }
    }

    const packageJsonUris = await vscode.workspace.findFiles("**/package.json", FINDFILE_EXCLUDE, MAX_PATTERN_FILES);
    if (packageJsonUris.length > 1) {
      isMonorepo = true;
    }

    let pjReads = 0;
    for (const uri of packageJsonUris) {
      if (pjReads >= MAX_PACKAGE_JSON_READS) {
        break;
      }
      pjReads++;
      const text = await readUtf8Limited(uri);
      if (!text) {
        continue;
      }
      try {
        const parsed = JSON.parse(text) as {
          workspaces?: unknown;
          dependencies?: unknown;
          devDependencies?: unknown;
          peerDependencies?: unknown;
          optionalDependencies?: unknown;
        };
        if (parsed.workspaces) {
          isMonorepo = true;
        }
        collectJsonDeps(parsed.dependencies, dependencies);
        collectJsonDeps(parsed.devDependencies, dependencies);
        collectJsonDeps(parsed.peerDependencies, dependencies);
        collectJsonDeps(parsed.optionalDependencies, dependencies);
      } catch {
        // ignore malformed package.json
      }
    }

    const pyUris = await vscode.workspace.findFiles("**/pyproject.toml", FINDFILE_EXCLUDE, MAX_PATTERN_FILES);
    for (const uri of pyUris) {
      const text = await readUtf8Limited(uri);
      if (text) {
        parsePyprojectToml(text, dependencies);
      }
    }

    const reqUris = await vscode.workspace.findFiles("**/requirements.txt", FINDFILE_EXCLUDE, MAX_PATTERN_FILES);
    for (const uri of reqUris) {
      const text = await readUtf8Limited(uri);
      if (text) {
        parseRequirementsTxt(text, dependencies);
      }
    }

    const cargoUris = await vscode.workspace.findFiles("**/Cargo.toml", FINDFILE_EXCLUDE, MAX_PATTERN_FILES);
    for (const uri of cargoUris) {
      const text = await readUtf8Limited(uri);
      if (text) {
        parseCargoToml(text, dependencies);
      }
    }

    const goUris = await vscode.workspace.findFiles("**/go.mod", FINDFILE_EXCLUDE, MAX_PATTERN_FILES);
    for (const uri of goUris) {
      const text = await readUtf8Limited(uri);
      if (text) {
        parseGoMod(text, dependencies);
      }
    }

    const agentsUris = await vscode.workspace.findFiles("**/AGENTS.md", FINDFILE_EXCLUDE, 5);
    if (agentsUris.length > 0) {
      const text = await readUtf8Limited(agentsUris[0]);
      if (text) {
        agentsMdText = text.slice(0, AGENTS_MD_MAX).toLowerCase();
      }
    }

    const sampleUris = await vscode.workspace.findFiles("**/*", FINDFILE_EXCLUDE, MAX_LANGUAGE_SAMPLE);
    for (const uri of sampleUris) {
      const fsPath = uri.fsPath ?? uri.path;
      const base = fsPath.replace(/\\/g, "/").split("/").pop() ?? "";
      const dot = base.lastIndexOf(".");
      if (dot >= 0) {
        const lang = extToLanguage(base.slice(dot));
        if (lang) {
          languages.add(lang);
        }
      }
    }

    return {
      languages,
      dependencies,
      relativePaths,
      installedExtensions,
      agentsMdText,
      isMonorepo
    };
  }
}
