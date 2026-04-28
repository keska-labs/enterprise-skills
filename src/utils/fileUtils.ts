import * as vscode from "vscode";

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

function getWorkspaceRootUri(): vscode.Uri {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error("No workspace folder is open.");
  }

  return workspace.uri;
}

// ─── Cursor-rule helpers (.cursor/rules/<name>.mdc) ───────────────────────────

export function getSkillFileUri(skillName: string): vscode.Uri {
  return vscode.Uri.joinPath(getWorkspaceRootUri(), RULES_DIR, `${normalizeSkillName(skillName)}.mdc`);
}

export async function ensureRulesDir(): Promise<vscode.Uri> {
  const root = getWorkspaceRootUri();
  const rulesDir = vscode.Uri.joinPath(root, RULES_DIR);
  await vscode.workspace.fs.createDirectory(rulesDir);
  return rulesDir;
}

export async function writeSkillFile(skillName: string, content: string): Promise<void> {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_SKILL_FILE_BYTES) {
    throw new Error(`Skill ${skillName} exceeds size limit (${MAX_SKILL_FILE_BYTES} bytes).`);
  }
  const fileUri = getSkillFileUri(skillName);
  await ensureRulesDir();
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
}

export async function deleteSkillFile(skillName: string): Promise<void> {
  const fileUri = getSkillFileUri(skillName);
  try {
    await vscode.workspace.fs.delete(fileUri, { useTrash: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ENOENT") && !message.includes("not found")) {
      throw error;
    }
  }
}

export async function listExistingSkillFiles(): Promise<string[]> {
  try {
    const rulesDir = vscode.Uri.joinPath(getWorkspaceRootUri(), RULES_DIR);
    const files = await vscode.workspace.fs.readDirectory(rulesDir);
    return files
      .filter(([name, fileType]) => fileType === vscode.FileType.File && name.endsWith(".mdc"))
      .map(([name]) => name.replace(/\.mdc$/, ""));
  } catch {
    return [];
  }
}

// ─── Skill-package helpers (.cursor/skills/<name>/**) ─────────────────────────

export function getSkillPackageDirUri(skillName: string): vscode.Uri {
  return vscode.Uri.joinPath(getWorkspaceRootUri(), SKILLS_DIR, normalizeSkillName(skillName));
}

/**
 * Write a single file within a skill package.
 * `relativeFilePath` is the path relative to the package directory root
 * (e.g. `"prompt.md"` or `"examples/sample.md"`).
 */
export async function writeSkillPackageFile(
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
  const pkgDir = getSkillPackageDirUri(skillName);
  const fileUri = vscode.Uri.joinPath(pkgDir, ...relativeFilePath.split("/"));
  // Ensure parent directories exist
  const parentDir = vscode.Uri.joinPath(fileUri, "..");
  await vscode.workspace.fs.createDirectory(parentDir);
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
}

export async function deleteSkillPackage(skillName: string): Promise<void> {
  const pkgDir = getSkillPackageDirUri(skillName);
  try {
    await vscode.workspace.fs.delete(pkgDir, { recursive: true, useTrash: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ENOENT") && !message.includes("not found")) {
      throw error;
    }
  }
}

export async function listExistingSkillPackages(): Promise<string[]> {
  try {
    const skillsDir = vscode.Uri.joinPath(getWorkspaceRootUri(), SKILLS_DIR);
    const entries = await vscode.workspace.fs.readDirectory(skillsDir);
    return entries
      .filter(([, fileType]) => fileType === vscode.FileType.Directory)
      .map(([name]) => name);
  } catch {
    return [];
  }
}
