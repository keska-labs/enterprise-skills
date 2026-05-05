import { SkillContent, SkillMeta } from "../types";

export interface BrowseChildEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
}

export interface CatalogSnapshot {
  skillsRoot: string;
  metas: SkillMeta[];
}

export interface SourceCatalogProvider {
  fetchCatalog(): Promise<CatalogSnapshot>;
  fetchContent(path: string): Promise<SkillContent>;
  listChildren?(path: string): Promise<BrowseChildEntry[]>;
}
