import * as vscode from "vscode";
import * as crypto from "crypto";
import { SkillMeta, SkillTriggers, SkillType } from "../types";
import { SkillCatalogStore } from "../services/SkillCatalogStore";

const SKILL_SYNC_DIR = ".cursor/skill-sync";
const CATALOG_FILE = "catalog.json";
/** Upper bound for file size; trim skill list if needed. */
const MAX_BYTES = 64 * 1024;

export interface WorkspaceCatalogManifest {
  generatedAt: string;
  sourceKey: string;
  skills: Array<{
    name: string;
    description?: string;
    category?: string;
    skillType: SkillType;
    triggers?: SkillTriggers;
  }>;
}

function manifestFingerprint(metas: SkillMeta[]): string {
  const payload = metas
    .map((m) => ({ name: m.name, sha: m.shaOrVersion }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Writes `.cursor/skill-sync/catalog.json` for the Cursor plugin subagent and tooling.
 * No-op when no workspace folder is open. Swallows errors (logged by caller if needed).
 */
export async function writeWorkspaceCatalogManifest(sourceKey: string, metas: SkillMeta[]): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const skills = metas.map((m) => ({
    name: m.name,
    description: m.description,
    category: m.category,
    skillType: m.skillType,
    triggers: m.triggers
  }));

  let manifest: WorkspaceCatalogManifest = {
    generatedAt: new Date().toISOString(),
    sourceKey,
    skills
  };

  let json = Buffer.from(JSON.stringify(manifest, null, 0), "utf8");
  while (json.byteLength > MAX_BYTES && manifest.skills.length > 1) {
    manifest = {
      ...manifest,
      skills: manifest.skills.slice(0, Math.floor(manifest.skills.length * 0.85))
    };
    json = Buffer.from(JSON.stringify(manifest, null, 0), "utf8");
  }

  try {
    const dir = vscode.Uri.joinPath(folder.uri, SKILL_SYNC_DIR);
    await vscode.workspace.fs.createDirectory(dir);
    const fileUri = vscode.Uri.joinPath(dir, CATALOG_FILE);
    await vscode.workspace.fs.writeFile(fileUri, json);
  } catch {
    // Missing permissions or no workspace — ignore
  }
}

export function catalogManifestFingerprint(metas: SkillMeta[]): string {
  return manifestFingerprint(metas);
}

/** After catalogStore.save/merge, persist workspace manifest for the Cursor plugin subagent. */
export function persistCatalogManifestFromStore(catalogStore: SkillCatalogStore, sourceKey: string): void {
  const loaded = catalogStore.load(sourceKey);
  if (loaded?.metas?.length) {
    void writeWorkspaceCatalogManifest(sourceKey, loaded.metas);
  }
}
