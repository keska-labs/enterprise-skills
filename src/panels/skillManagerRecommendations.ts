import { ConfigService } from "../services/ConfigService";
import { SkillCatalogStore, buildSourceKey } from "../services/SkillCatalogStore";
import { WorkspaceAnalyzer } from "../services/WorkspaceAnalyzer";
import { recommend } from "../services/SkillRecommender";
import { Recommendation } from "../../webview-ui/types/messages";

export async function buildRecommendationsPayload(
  workspaceAnalyzer: WorkspaceAnalyzer,
  configService: ConfigService,
  catalogStore: SkillCatalogStore
): Promise<{ recommendations: Recommendation[]; catalogReady: boolean }> {
  const sourceMode = configService.getSourceMode();
  const sourceRepository = configService.getSourceRepository();
  const registryUrl = configService.getRegistryUrl();
  const sourceKey = buildSourceKey(sourceMode, sourceRepository, registryUrl);
  const cached = catalogStore.load(sourceKey);
  if (!cached || cached.metas.length === 0) {
    return { recommendations: [], catalogReady: false };
  }

  const profile = await workspaceAnalyzer.analyze();
  const optedInSkills = configService.getOptedInSkills();
  const recommendations = recommend(profile, cached.metas, optedInSkills);
  return { recommendations, catalogReady: true };
}
