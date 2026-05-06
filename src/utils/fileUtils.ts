import * as vscode from "vscode";
import { sanitizeSourceLabel } from "./sources";

const RULES_DIR = ".cursor/rules";
const SKILLS_DIR = ".cursor/skills";
const MAX_SKILL_FILE_BYTES = 256 * 1024;

export function normalizeSkillName(skillName: string): string {
  const normalized = skillName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-");
  const safe = normalized.replace(/^-|-$/g, "");
  if (!safe || safe === "." || safe === "..") {
    throw new Error(`Invalid skill name: ${skillName}`);
  }
  return safe;
}

function normalizeLabel(label: string): string {
  return sanitizeSourceLabel(label);
}

/** Split a normalized label (which may contain `/`) into individual path segments. */
function labelSegments(label: string): string[] {
  return normalizeLabel(label).split("/").filter(Boolean);
}

function getWorkspaceRootUri(): vscode.Uri {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error("No workspace folder is open.");
  }

  return workspace.uri;
}

// ─── Cursor-rule helpers (.cursor/rules/<label>/<name>.mdc) ──────────────────

export function getSkillFileUri(label: string, skillName: string): vscode.Uri {
  return vscode.Uri.joinPath(
    getWorkspaceRootUri(),
    RULES_DIR,
    ...labelSegments(label),
    `${normalizeSkillName(skillName)}.mdc`
  );
}

export async function ensureRulesDir(label?: string): Promise<vscode.Uri> {
  const root = getWorkspaceRootUri();
  const rulesDir = label
    ? vscode.Uri.joinPath(root, RULES_DIR, ...labelSegments(label))
    : vscode.Uri.joinPath(root, RULES_DIR);
  await vscode.workspace.fs.createDirectory(rulesDir);
  return rulesDir;
}

export async function writeSkillFile(label: string, skillName: string, content: string): Promise<void> {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_SKILL_FILE_BYTES) {
    throw new Error(`Skill ${skillName} exceeds size limit (${MAX_SKILL_FILE_BYTES} bytes).`);
  }
  const fileUri = getSkillFileUri(label, skillName);
  await ensureRulesDir(label);
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
}

export async function deleteSkillFile(label: string, skillName: string): Promise<void> {
  const fileUri = getSkillFileUri(label, skillName);
  try {
    await vscode.workspace.fs.delete(fileUri, { useTrash: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ENOENT") && !message.includes("not found")) {
      throw error;
    }
  }
}

export interface ExistingSkillFile {
  label: string;
  name: string;
}

/**
 * Walk `.cursor/rules/**\/*.mdc` and return labelled entries.
 *
 * Multi-segment labels (e.g. `owner/repo` for two-level layouts like
 * `.cursor/rules/owner/repo/foo.mdc`) are reported with the full nested path
 * as `label`. Loose `.mdc` files at the rules root (legacy flat layout) are
 * reported with `label: ""` so callers can treat them as orphans
 * pre-migration.
 */
export async function listExistingSkillFiles(): Promise<ExistingSkillFile[]> {
  const rulesDir = vscode.Uri.joinPath(getWorkspaceRootUri(), RULES_DIR);
  const out: ExistingSkillFile[] = [];

  async function walk(dirUri: vscode.Uri, relative: string): Promise<void> {
    let entries: Array<[string, vscode.FileType]>;
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      return;
    }
    for (const [name, fileType] of entries) {
      const childRelative = relative ? `${relative}/${name}` : name;
      if (fileType === vscode.FileType.Directory) {
        await walk(vscode.Uri.joinPath(dirUri, name), childRelative);
      } else if (fileType === vscode.FileType.File && name.endsWith(".mdc")) {
        const lastSlash = childRelative.lastIndexOf("/");
        const label = lastSlash >= 0 ? childRelative.slice(0, lastSlash) : "";
        out.push({ label, name: name.replace(/\.mdc$/, "") });
      }
    }
  }

  await walk(rulesDir, "");
  return out;
}

// ─── Skill-package helpers (.cursor/skills/<label>/<name>/**) ────────────────

export function getSkillPackageDirUri(label: string, skillName: string): vscode.Uri {
  return vscode.Uri.joinPath(
    getWorkspaceRootUri(),
    SKILLS_DIR,
    ...labelSegments(label),
    normalizeSkillName(skillName)
  );
}

/**
 * Write a single file within a skill package.
 * `relativeFilePath` is the path relative to the package directory root
 * (e.g. `"prompt.md"` or `"examples/sample.md"`).
 */
export async function writeSkillPackageFile(
  label: string,
  skillName: string,
  relativeFilePath: string,
  content: string
): Promise<void> {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_SKILL_FILE_BYTES) {
    throw new Error(
      `File ${relativeFilePath} in skill package ${skillName} exceeds size limit (${MAX_SKILL_FILE_BYTES} bytes).`
    );
  }
  const pkgDir = getSkillPackageDirUri(label, skillName);
  const fileUri = vscode.Uri.joinPath(pkgDir, ...relativeFilePath.split("/"));
  // Ensure parent directories exist
  const parentDir = vscode.Uri.joinPath(fileUri, "..");
  await vscode.workspace.fs.createDirectory(parentDir);
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
}

export async function deleteSkillPackage(label: string, skillName: string): Promise<void> {
  const pkgDir = getSkillPackageDirUri(label, skillName);
  try {
    await vscode.workspace.fs.delete(pkgDir, { recursive: true, useTrash: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ENOENT") && !message.includes("not found")) {
      throw error;
    }
  }
}

export interface ExistingSkillPackage {
  label: string;
  name: string;
}

/**
 * Walk `.cursor/skills/<label>/<name>/` recursively to support multi-segment
 * labels (e.g. `.cursor/skills/owner/repo/<pkg>/SKILL.md`).
 *
 * Heuristic for telling label directories from package directories: a
 * directory whose immediate children are **all** directories is treated as a
 * label segment and we recurse; the first directory that contains any file
 * is treated as the package itself. Pre-migration flat packages directly
 * under `.cursor/skills/<name>/` are reported with `label: ""` so callers
 * can prune them as orphans.
 */
export async function listExistingSkillPackages(): Promise<ExistingSkillPackage[]> {
  const skillsDir = vscode.Uri.joinPath(getWorkspaceRootUri(), SKILLS_DIR);
  const out: ExistingSkillPackage[] = [];

  async function walk(dirUri: vscode.Uri, relative: string): Promise<void> {
    let entries: Array<[string, vscode.FileType]>;
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      return;
    }
    if (entries.length === 0) {
      return;
    }
    const allDirs = entries.every(([, t]) => t === vscode.FileType.Directory);
    if (allDirs && relative !== "") {
      // Continue recursing — this dir is a label segment, not a package.
      for (const [name] of entries) {
        await walk(vscode.Uri.joinPath(dirUri, name), `${relative}/${name}`);
      }
      return;
    }
    if (relative === "") {
      // Top-level: recurse into every subdirectory; we'll classify each one.
      for (const [name, fileType] of entries) {
        if (fileType === vscode.FileType.Directory) {
          await walk(vscode.Uri.joinPath(dirUri, name), name);
        }
      }
      return;
    }
    // Mixed contents (or all-files): treat this directory as the package.
    const lastSlash = relative.lastIndexOf("/");
    const label = lastSlash >= 0 ? relative.slice(0, lastSlash) : "";
    const name = lastSlash >= 0 ? relative.slice(lastSlash + 1) : relative;
    out.push({ label, name });
  }

  await walk(skillsDir, "");
  return out;
}

// ─── Legacy flat-layout helpers (used by the workspace migration step) ──────

export async function listLegacyFlatSkillFiles(): Promise<string[]> {
  try {
    const rulesDir = vscode.Uri.joinPath(getWorkspaceRootUri(), RULES_DIR);
    const entries = await vscode.workspace.fs.readDirectory(rulesDir);
    return entries
      .filter(([name, fileType]) => fileType === vscode.FileType.File && name.endsWith(".mdc"))
      .map(([name]) => name);
  } catch {
    return [];
  }
}

export async function listLegacyFlatSkillPackages(): Promise<string[]> {
  try {
    const skillsDir = vscode.Uri.joinPath(getWorkspaceRootUri(), SKILLS_DIR);
    const entries = await vscode.workspace.fs.readDirectory(skillsDir);
    const out: string[] = [];
    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.Directory) {
        continue;
      }
      const subDir = vscode.Uri.joinPath(skillsDir, name);
      try {
        const sub = await vscode.workspace.fs.readDirectory(subDir);
        if (sub.some(([, t]) => t === vscode.FileType.File)) {
          out.push(name);
        }
      } catch {
        // ignore
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * One-shot: move `.cursor/rules/*.mdc` and `.cursor/skills/<name>/` (flat
 * layout produced by previous releases) into `<label>/...` underneath, where
 * `label` is the freshly migrated single source. No-op when there is more
 * than one source (we cannot infer which one owns the flat files) or when no
 * legacy files exist.
 */
export async function migrateLegacyWorkspaceLayout(label: string): Promise<{ movedFiles: number; movedPackages: number }> {
  let movedFiles = 0;
  let movedPackages = 0;
  try {
    const root = getWorkspaceRootUri();
    const rulesDir = vscode.Uri.joinPath(root, RULES_DIR);
    const labeledRulesDir = vscode.Uri.joinPath(rulesDir, ...labelSegments(label));

    const looseRules = await listLegacyFlatSkillFiles();
    if (looseRules.length > 0) {
      await vscode.workspace.fs.createDirectory(labeledRulesDir);
      for (const filename of looseRules) {
        const src = vscode.Uri.joinPath(rulesDir, filename);
        const dst = vscode.Uri.joinPath(labeledRulesDir, filename);
        try {
          await vscode.workspace.fs.rename(src, dst, { overwrite: true });
          movedFiles += 1;
        } catch {
          // best-effort; leave the original in place if the rename fails
        }
      }
    }

    const skillsDir = vscode.Uri.joinPath(root, SKILLS_DIR);
    const labeledSkillsDir = vscode.Uri.joinPath(skillsDir, ...labelSegments(label));
    const flatPackages = await listLegacyFlatSkillPackages();
    if (flatPackages.length > 0) {
      await vscode.workspace.fs.createDirectory(labeledSkillsDir);
      for (const pkg of flatPackages) {
        const src = vscode.Uri.joinPath(skillsDir, pkg);
        const dst = vscode.Uri.joinPath(labeledSkillsDir, pkg);
        try {
          await vscode.workspace.fs.rename(src, dst, { overwrite: true });
          movedPackages += 1;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore — workspace might not exist or be writable
  }
  return { movedFiles, movedPackages };
}
