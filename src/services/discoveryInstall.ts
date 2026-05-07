import { SkillMeta } from "../types";
import { compositeSkillKey, resolveSource } from "../utils/sources";
import { ConfigService } from "./ConfigService";
import { SyncEngine } from "./SyncEngine";
import { Logger } from "../utils/logger";

/**
 * Enable a discovery-only catalog skill by adding its backing GitHub repo (if missing)
 * and opting in under that repo's resolved label.
 */
export async function installFromDiscoveryMeta(
  meta: SkillMeta,
  discoveryCompositeKey: string,
  configService: ConfigService,
  syncEngine: SyncEngine,
  logger: Logger
): Promise<void> {
  if (!meta.isDiscoveryOnly || !meta.installSourceRef || meta.installSourceRef.type !== "github-repo") {
    throw new Error("installFromDiscoveryMeta requires a discovery-only meta with a GitHub installSourceRef.");
  }

  const value = meta.installSourceRef.value.trim();
  if (!value) {
    throw new Error("installSourceRef.value is empty.");
  }

  await configService.addSource({ type: "github-repo", value });

  const resolved = resolveSource({ type: "github-repo", value });
  const targetComposite = compositeSkillKey(resolved.label, meta.name);

  const opted = configService
    .getOptedInSkills()
    .filter((k) => k !== discoveryCompositeKey && k !== targetComposite);
  opted.push(targetComposite);
  await configService.setOptedInSkills([...new Set(opted)]);

  logger.log(`Discovery install: added GitHub source ${value}, opted in ${targetComposite}`);
  await syncEngine.sync(true);
}
