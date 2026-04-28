import type { SkillManagerState } from "../types/messages";
import { trackGa4Event } from "./ga4";

export function bucketCount(n: number): string {
  if (n <= 0) {
    return "0";
  }
  if (n <= 10) {
    return "1_10";
  }
  if (n <= 50) {
    return "11_50";
  }
  if (n <= 200) {
    return "51_200";
  }
  if (n <= 1000) {
    return "201_1000";
  }
  return "1000_plus";
}

export function bucketStringLength(len: number): string {
  if (len <= 0) {
    return "0";
  }
  if (len <= 2) {
    return "1_2";
  }
  if (len <= 8) {
    return "3_8";
  }
  if (len <= 24) {
    return "9_24";
  }
  if (len <= 64) {
    return "25_64";
  }
  return "65_plus";
}

function enabledTabSkillRows(state: SkillManagerState): number {
  return state.enabledCategories.reduce((acc, c) => acc + c.skills.length, 0);
}

function registrySkillRows(state: SkillManagerState): number {
  return state.categories.reduce((acc, c) => acc + c.skills.length, 0);
}

/**
 * Shared GA4 custom parameters (no repo, paths, skill names, or free-text queries).
 * Keep under GA4 per-event custom param practical limits.
 */
export function buildSkillManagerBaseParams(state: SkillManagerState): Record<string, string | number | boolean> {
  const a = state.analyticsSession;
  return {
    webview_host: a.webviewHost,
    ext_ver: a.extensionVersion,
    vscode_ver: a.vscodeVersion,
    host_app: a.appName,
    ui_lang: a.language,
    os: a.platform,
    ui_kind: a.uiKind,
    src_mode: state.sourceMode,
    connected: state.isConnected,
    conn_health: state.connectionHealth,
    catalog_n: state.catalogSize,
    catalog_bucket: bucketCount(state.catalogSize),
    opted_n: state.optedInSkills.length,
    cat_cfg_n: state.categories.length,
    en_rows: enabledTabSkillRows(state),
    reg_rows: registrySkillRows(state),
    sync_st: state.syncStatus,
    cat_st: state.catalogStatus,
    has_root: Boolean(state.skillsRootPath)
  };
}

export function trackSkillManagerEvent(
  state: SkillManagerState | null | undefined,
  name: string,
  extra?: Record<string, string | number | boolean>
): void {
  if (!state?.ga4MeasurementId) {
    return;
  }
  trackGa4Event(name, { ...buildSkillManagerBaseParams(state), ...extra });
}
