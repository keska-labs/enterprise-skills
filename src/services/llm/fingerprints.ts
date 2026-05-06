import * as crypto from "crypto";
import { WorkspaceProfile } from "../WorkspaceAnalyzer";

export function workspaceProfileFingerprint(profile: WorkspaceProfile): string {
  const sortedPaths = [...profile.relativePaths].sort().slice(0, 120);
  const agentsSnippet = profile.agentsMdText?.slice(0, 4000) ?? "";
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        languages: [...profile.languages].sort(),
        dependencies: [...profile.dependencies].sort(),
        paths: sortedPaths,
        extensions: [...profile.installedExtensions].sort(),
        agentsSnippet,
        isMonorepo: profile.isMonorepo
      })
    )
    .digest("hex");
}

export function recommendationCacheCompositeKey(parts: {
  workspaceUri: string;
  sourcesKey: string;
  profileFp: string;
  catalogFp: string;
  modelFamily: string;
  cursorSdkModel: string;
  openAiModel: string;
  anthropicModel: string;
}): string {
  return crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex");
}
