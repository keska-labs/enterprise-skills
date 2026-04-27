import * as vscode from "vscode";
import { SkillMeta } from "../types";

const STORAGE_VERSION = 1;

interface StoredCatalogPayload {
  v: typeof STORAGE_VERSION;
  savedAt: string;
  skillsRoot: string;
  metas: SkillMeta[];
}

function catalogKey(sourceKey: string): string {
  return `agentSkillSync.catalog.v${STORAGE_VERSION}:${sourceKey}`;
}

export function buildSourceKey(sourceMode: "github-repo" | "custom-registry", sourceRepository: string, registryUrl: string): string {
  if (sourceMode === "github-repo") {
    return `github:${sourceRepository.trim()}`;
  }
  return `registry:${registryUrl.trim()}`;
}

export class SkillCatalogStore {
  public constructor(private readonly memento: vscode.Memento) {}

  public load(sourceKey: string): { skillsRoot: string; metas: SkillMeta[] } | undefined {
    const raw = this.memento.get<string | undefined>(catalogKey(sourceKey), undefined);
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as StoredCatalogPayload;
      if (!parsed || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.metas)) {
        return undefined;
      }
      return {
        skillsRoot: parsed.skillsRoot ?? "",
        metas: parsed.metas
      };
    } catch {
      return undefined;
    }
  }

  public save(sourceKey: string, skillsRoot: string, metas: SkillMeta[]): void {
    const payload: StoredCatalogPayload = {
      v: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      skillsRoot,
      metas
    };
    void this.memento.update(catalogKey(sourceKey), JSON.stringify(payload));
  }

  public merge(sourceKey: string, skillsRoot: string, incoming: SkillMeta[]): void {
    const existing = this.load(sourceKey);
    const map = new Map<string, SkillMeta>();
    for (const meta of existing?.metas ?? []) {
      map.set(meta.name, meta);
    }
    for (const meta of incoming) {
      map.set(meta.name, meta);
    }
    this.save(sourceKey, skillsRoot || existing?.skillsRoot || "", [...map.values()]);
  }

  public clear(sourceKey: string): void {
    void this.memento.update(catalogKey(sourceKey), undefined);
  }
}
