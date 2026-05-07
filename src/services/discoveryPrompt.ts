import { SkillInfo } from "../../webview-ui/types/messages";
import { ResolvedSource } from "../types";
import { Logger } from "../utils/logger";
import { compositeSkillKey } from "../utils/sources";
import { SourceProviderRegistry } from "./SourceProviderRegistry";

/** Sentinel skill name for non-installable directory summary rows in the Catalog UI. */
export const DISCOVERY_SUMMARY_SKILL_NAME = "__directory__";

export interface DiscoveryPromptSection {
  source: ResolvedSource;
  /** Public repo URL the LLM is asked to consider. */
  repoUrl: string;
  /** Short structural hint about how skills are organized in that repo. */
  structureHint: string;
}

/**
 * Collect a short descriptor per discovery source. **Synchronous** — we no longer
 * fetch READMEs at recommendation time; the descriptor is static metadata describing
 * the repo URL and skill layout so the LLM can pick from its training knowledge.
 */
export function loadDiscoveryPromptSections(
  sources: ResolvedSource[],
  registry: SourceProviderRegistry,
  logger: Logger
): DiscoveryPromptSection[] {
  const out: DiscoveryPromptSection[] = [];
  for (const source of sources) {
    if (source.type !== "official-skills" && source.type !== "open-skills") {
      continue;
    }
    try {
      const provider = registry.get(source.sourceKey);
      if (!provider.getDiscoveryDescriptor) {
        continue;
      }
      const desc = provider.getDiscoveryDescriptor();
      out.push({ source, repoUrl: desc.repoUrl, structureHint: desc.structureHint });
    } catch (error) {
      logger.warn(`Discovery descriptor unavailable for ${source.label}`, error);
    }
  }
  return out;
}

export function resolveDiscoverySourceForRecommendation(
  sources: ResolvedSource[],
  discoverySourceKey?: string
): ResolvedSource | undefined {
  const discovery = sources.filter((s) => s.type === "official-skills" || s.type === "open-skills");
  if (discoverySourceKey?.trim()) {
    return discovery.find((s) => s.sourceKey === discoverySourceKey.trim());
  }
  if (discovery.length === 1) {
    return discovery[0];
  }
  return undefined;
}

export function discoveryDirectorySkillInfos(sources: ResolvedSource[]): SkillInfo[] {
  return sources
    .filter((s) => s.type === "official-skills" || s.type === "open-skills")
    .map((s) => ({
      compositeKey: compositeSkillKey(s.label, DISCOVERY_SUMMARY_SKILL_NAME),
      name: s.label,
      description:
        "Discovery directory — recommendations only. Install picks via the Recommended tab; the LLM uses its own knowledge of this repo.",
      version: "",
      category: "Discovery directories",
      skillType: "skill" as const,
      source: { label: s.label, type: s.type, sourceKey: s.sourceKey },
      isDiscoveryOnly: true,
      isDiscoverySummary: true
    }));
}

export function appendDiscoveryDirectoryCategory(
  categories: { name: string; skills: SkillInfo[] }[],
  sources: ResolvedSource[]
): void {
  const rows = discoveryDirectorySkillInfos(sources);
  if (rows.length === 0) {
    return;
  }
  categories.push({ name: "Discovery directories", skills: rows });
}
