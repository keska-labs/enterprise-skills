/** vscode.SecretStorage keys — never store these in settings.json */
export const RECOMMENDATION_SECRET_KEYS = {
  openai: "agentSkillSync.recommendations.openaiApiKey",
  anthropic: "agentSkillSync.recommendations.anthropicApiKey",
  cursorSdk: "agentSkillSync.recommendations.cursorSdkApiKey"
} as const;
