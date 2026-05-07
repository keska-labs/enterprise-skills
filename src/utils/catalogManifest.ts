import * as vscode from "vscode";
import * as crypto from "crypto";
import { ResolvedSource, SkillMeta, SkillTriggers, SkillType, SourceType } from "../types";
import { SkillCatalogStore } from "../services/SkillCatalogStore";

const SKILL_SYNC_DIR = ".cursor/skill-sync";
const CATALOG_FILE = "catalog.json";
/** Upper bound for file size; trim skill list if needed. */
const MAX_BYTES = 64 * 1024;

export interface WorkspaceCatalogManifest {
  generatedAt: string;
  /** Legacy single-source key. Always set to the first configured source's key for back-compat. */
  sourceKey: string;
  sources: Array<{ type: SourceType; value: string; label: string; sourceKey: string }>;
  skills: Array<{
    name: string;
    description?: string;
    category?: string;
    skillType: SkillType;
    triggers?: SkillTriggers;
    source?: { label: string; type: SourceType };
  }>;
}

function manifestFingerprint(metas: SkillMeta[]): string {
  const payload = metas
    .map((m) => ({ name: m.name, sha: m.shaOrVersion, source: m.source?.label ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Writes `.cursor/skill-sync/catalog.json` for the Cursor plugin subagent and tooling.
 * No-op when no workspace folder is open. Swallows errors (logged by caller if needed).
 *
 * Accepts either a single source key (legacy) or the resolved sources array (multi-source).
 */
export async function writeWorkspaceCatalogManifest(
  sourcesOrKey: string | ResolvedSource[],
  metas: SkillMeta[]
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const resolved: ResolvedSource[] = typeof sourcesOrKey === "string"
    ? []
    : sourcesOrKey;
  const legacySourceKey = typeof sourcesOrKey === "string"
    ? sourcesOrKey
    : (resolved[0]?.sourceKey ?? "");

  const skills = metas.map((m) => ({
    name: m.name,
    description: m.description,
    category: m.category,
    skillType: m.skillType,
    triggers: m.triggers,
    source: m.source ? { label: m.source.label, type: m.source.type } : undefined
  }));

  let manifest: WorkspaceCatalogManifest = {
    generatedAt: new Date().toISOString(),
    sourceKey: legacySourceKey,
    sources: resolved.map((s) => ({ type: s.type, value: s.value, label: s.label, sourceKey: s.sourceKey })),
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
