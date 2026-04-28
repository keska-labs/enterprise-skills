import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVsCodeApi } from "./hooks/useVsCodeApi";
import { BrowseTree } from "./components/BrowseTree";
import { CategoryGroup } from "./components/CategoryGroup";
import { EnabledEmptyCallout } from "./components/EnabledEmptyCallout";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { BrowseEntry, ExtensionMessage, SkillInfo, SkillManagerState } from "./types/messages";
import { initGa4 } from "./analytics/ga4";
import {
  bucketCount,
  bucketStringLength,
  trackSkillManagerEvent
} from "./analytics/skillManagerEvents";
import "./styles/global.css";

type LoadPhase = "loading" | "ready";
type MainTab = "manage" | "browse";

function BrowseTreeSkeleton(): React.JSX.Element {
  return (
    <div className="skeleton-tree" aria-busy="true" aria-label="Loading repository layout">
      {[72, 88, 56, 80, 64].map((width, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export function App(): React.JSX.Element {
  const vscode = useVsCodeApi();
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [state, setState] = useState<SkillManagerState | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("manage");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [browseChildren, setBrowseChildren] = useState<Record<string, BrowseEntry[]>>({});
  const [browseSkillsRoot, setBrowseSkillsRoot] = useState<string | null>(null);
  const [browseTreeLoading, setBrowseTreeLoading] = useState(false);
  const [expandingPath, setExpandingPath] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSearchResults, setCatalogSearchResults] = useState<SkillInfo[] | null>(null);
  const [catalogSearching, setCatalogSearching] = useState(false);

  const prevSourceKey = useRef<string | null>(null);
  const stateRef = useRef<SkillManagerState | null>(null);
  const openEventSentRef = useRef(false);
  const browseRootReadySentRef = useRef(false);
  const prevConnectionHealthRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as ExtensionMessage;
      if (data.type === "setState") {
        stateRef.current = data.payload;
        setState(data.payload);
        setPhase("ready");
        setSyncMessage(data.payload.syncMessage);
        setSyncFailed(Boolean(data.payload.lastError));
        setIsSyncing(data.payload.syncStatus === "running");
      } else if (data.type === "syncComplete") {
        trackSkillManagerEvent(stateRef.current, "skill_manager_sync_done", {
          outcome: data.payload.status,
          reason: data.payload.reason,
          upd_n: data.payload.updated.length,
          del_n: data.payload.deleted.length,
          err_n: data.payload.errors.length
        });
        setIsSyncing(false);
        setSyncMessage(data.payload.message);
        setSyncFailed(data.payload.status === "failed" || data.payload.status === "partial");
      } else if (data.type === "error") {
        trackSkillManagerEvent(stateRef.current, "skill_manager_error", {
          msg_len_bucket: bucketStringLength(data.message.length)
        });
        setIsSyncing(false);
        setSyncMessage(data.message);
        setSyncFailed(true);
        setExpandingPath(null);
        setBrowseTreeLoading(false);
        setCatalogSearching(false);
        setPhase("ready");
      } else if (data.type === "browseUpdate") {
        const skillsRootPath = data.skillsRootPath;
        const atSkillsRoot = Boolean(skillsRootPath && data.parentPath === skillsRootPath);
        trackSkillManagerEvent(stateRef.current, "skill_manager_browse_nodes", {
          entry_n: data.entries.length,
          at_skills_root: atSkillsRoot
        });
        setBrowseChildren((prev) => ({ ...prev, [data.parentPath]: data.entries }));
        if (data.skillsRootPath) {
          setBrowseSkillsRoot(data.skillsRootPath);
          setBrowseTreeLoading(false);
        }
        setExpandingPath(null);
      } else if (data.type === "catalogSearchResults") {
        trackSkillManagerEvent(stateRef.current, "skill_manager_catalog_results", {
          q_bucket: bucketStringLength(data.query.length),
          result_n: data.skills.length,
          result_bucket: bucketCount(data.skills.length)
        });
        setCatalogSearchResults(data.skills);
        setCatalogSearching(false);
      }
    };
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, [vscode]);

  useEffect(() => {
    initGa4(state?.ga4MeasurementId ?? null);
  }, [state?.ga4MeasurementId]);

  useEffect(() => {
    openEventSentRef.current = false;
  }, [state?.ga4MeasurementId]);

  useEffect(() => {
    if (phase !== "ready" || !state?.ga4MeasurementId || openEventSentRef.current) {
      return;
    }
    openEventSentRef.current = true;
    const managedRows = state.enabledCategories.reduce((n, c) => n + c.skills.length, 0);
    const registryRows = state.categories.reduce((n, c) => n + c.skills.length, 0);
    trackSkillManagerEvent(state, "skill_manager_open", {
      started_connected: state.isConnected,
      github_browse_eligible: state.sourceMode === "github-repo" && state.isConnected,
      managed_rows: managedRows,
      registry_rows: registryRows,
      manage_tab_empty: state.sourceMode === "github-repo" && state.isConnected && managedRows === 0
    });
  }, [phase, state]);

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }
    const s = stateRef.current;
    trackSkillManagerEvent(s, "skill_manager_tab", { tab: mainTab });
  }, [mainTab, phase]);

  useEffect(() => {
    if (phase !== "ready" || !state?.ga4MeasurementId) {
      return;
    }
    const h = state.connectionHealth;
    const prev = prevConnectionHealthRef.current;
    prevConnectionHealthRef.current = h;
    if (h !== "auth_required" || prev === "auth_required") {
      return;
    }
    trackSkillManagerEvent(state, "skill_manager_auth_banner");
  }, [phase, state]);

  useEffect(() => {
    if (mainTab !== "browse") {
      browseRootReadySentRef.current = false;
    }
  }, [mainTab]);

  useEffect(() => {
    if (phase !== "ready" || mainTab !== "manage") {
      return;
    }
    const len = searchQuery.trim().length;
    if (len === 0) {
      return;
    }
    const handle = window.setTimeout(() => {
      const s = stateRef.current;
      if (!s) {
        return;
      }
      const q = searchQuery.trim().toLowerCase();
      const cats = s.sourceMode === "github-repo" ? s.enabledCategories : s.categories; // filter across all managed skills
      let hitRows = 0;
      for (const cat of cats) {
        for (const sk of cat.skills) {
          if (sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q)) {
            hitRows += 1;
          }
        }
      }
      trackSkillManagerEvent(s, "skill_manager_manage_filter", {
        q_bucket: bucketStringLength(len),
        hit_rows: hitRows
      });
    }, 450);
    return () => window.clearTimeout(handle);
  }, [searchQuery, mainTab, phase]);

  useEffect(() => {
    if (!state) {
      return;
    }
    const key = `${state.sourceRepository}|${state.sourceMode}`;
    if (prevSourceKey.current !== null && prevSourceKey.current !== key) {
      setBrowseChildren({});
      setBrowseSkillsRoot(null);
      setCatalogSearchResults(null);
      setCatalogQuery("");
      setBrowseTreeLoading(false);
      setCatalogSearching(false);
      browseRootReadySentRef.current = false;
    }
    prevSourceKey.current = key;
  }, [state?.sourceRepository, state?.sourceMode]);

  useEffect(() => {
    if (phase !== "ready" || mainTab !== "browse") {
      return;
    }
    if (!state?.isConnected || state.sourceMode !== "github-repo") {
      return;
    }
    setBrowseTreeLoading(true);
    trackSkillManagerEvent(stateRef.current, "skill_manager_browse_fetch_root", {});
    vscode.postMessage({ type: "loadBrowseRoot" });
  }, [phase, mainTab, state?.isConnected, state?.sourceMode, state?.sourceRepository, vscode]);

  useEffect(() => {
    if (mainTab !== "browse") {
      setCatalogSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      const q = catalogQuery.trim();
      if (q.length < 2) {
        setCatalogSearchResults(null);
        setCatalogSearching(false);
        return;
      }
      setCatalogSearching(true);
      trackSkillManagerEvent(stateRef.current, "skill_manager_catalog_search", {
        q_bucket: bucketStringLength(q.length)
      });
      vscode.postMessage({ type: "searchCatalog", query: q });
    }, 450);
    return () => window.clearTimeout(handle);
  }, [catalogQuery, mainTab, vscode]);

  useEffect(() => {
    if (phase !== "ready" || mainTab !== "browse") {
      return;
    }
    const skillsRoot = state?.skillsRootPath ?? browseSkillsRoot;
    const rootEntries = skillsRoot ? browseChildren[skillsRoot] : undefined;
    const s = stateRef.current;
    if (!s?.ga4MeasurementId || browseTreeLoading || !skillsRoot || !rootEntries?.length) {
      return;
    }
    if (browseRootReadySentRef.current) {
      return;
    }
    browseRootReadySentRef.current = true;
    trackSkillManagerEvent(s, "skill_manager_browse_root_ready", { root_entries_n: rootEntries.length });
  }, [
    phase,
    mainTab,
    browseTreeLoading,
    state?.skillsRootPath,
    browseSkillsRoot,
    browseChildren,
    state?.ga4MeasurementId
  ]);

  const categories = useMemo(() => state?.categories ?? [], [state]);
  const isConnected = Boolean(state?.isConnected);
  const connectionHealth = state?.connectionHealth ?? "unknown";
  const optedInCount = state?.optedInSkills.length ?? 0;

  const manageTabCategories = useMemo(() => {
    if (!state) {
      return [];
    }
    if (state.sourceMode === "github-repo") {
      return state.enabledCategories;
    }
    return state.categories;
  }, [state]);

  const filteredManageTabCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return manageTabCategories;
    }
    const q = searchQuery.toLowerCase();
    return manageTabCategories
      .map((cat) => ({
        ...cat,
        skills: cat.skills.filter(
          (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        )
      }))
      .filter((cat) => cat.skills.length > 0);
  }, [manageTabCategories, searchQuery]);

  const hasManageTabSkills = manageTabCategories.some((c) => c.skills.length > 0);

  const totalCount = useMemo(() => {
    if (!state) {
      return 0;
    }
    if (state.sourceMode === "github-repo") {
      return Math.max(state.catalogSize ?? 0, optedInCount);
    }
    return categories.reduce((acc, c) => acc + c.skills.length, 0);
  }, [state, categories, optedInCount]);

  const sourceHint =
    state?.isConnected && state.lastError && state.connectionHealth !== "ok" ? state.lastError : null;

  const postConnectRepo = (surface: string) => {
    trackSkillManagerEvent(stateRef.current, "skill_manager_connect", {
      surface,
      empty_health: connectionHealth
    });
    vscode.postMessage({ type: "connectRepo" });
  };

  const onConnectEmpty = () => postConnectRepo("empty_state");
  const onChangeSource = () => postConnectRepo("connected_header");

  const onSyncNow = () => {
    trackSkillManagerEvent(stateRef.current, "skill_manager_sync_request", {});
    setIsSyncing(true);
    setSyncMessage(null);
    vscode.postMessage({ type: "syncNow" });
  };
  const onToggle = (skillName: string, optIn: boolean) => {
    const s = stateRef.current;
    trackSkillManagerEvent(s, "skill_manager_toggle", {
      opt_in: optIn,
      pre_opted_n: s?.optedInSkills.length ?? 0
    });
    setIsSyncing(true);
    vscode.postMessage({ type: "toggleSkill", skillName, optIn });
  };

  const onExpandDir = useCallback(
    (fullPath: string) => {
      if (browseChildren[fullPath]) {
        return;
      }
      const depth = fullPath.split("/").filter(Boolean).length;
      trackSkillManagerEvent(stateRef.current, "skill_manager_browse_expand", { path_depth: depth });
      setExpandingPath(fullPath);
      vscode.postMessage({ type: "expandBrowsePath", path: fullPath });
    },
    [browseChildren, vscode]
  );

  const onTabRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" && mainTab === "manage") {
      e.preventDefault();
      trackSkillManagerEvent(stateRef.current, "skill_manager_tab_key", { to_tab: "browse" });
      setMainTab("browse");
    } else if (e.key === "ArrowLeft" && mainTab === "browse") {
      e.preventDefault();
      trackSkillManagerEvent(stateRef.current, "skill_manager_tab_key", { to_tab: "manage" });
      setMainTab("manage");
    }
  };

  if (phase === "loading") {
    return (
      <main className="app-shell app-shell--centered">
        <div className="loading-state loading-state--hero">
          <div className="loading-mark" aria-hidden>
            <span className="loading-orbit" />
          </div>
          <p className="loading-title">Skill Manager</p>
          <div className="loading-dots" aria-hidden>
            <span /><span /><span />
          </div>
          <p className="loading-label">Preparing your workspace…</p>
        </div>
      </main>
    );
  }

  const skillsRoot = state?.skillsRootPath ?? browseSkillsRoot;
  const rootEntries = skillsRoot ? browseChildren[skillsRoot] : undefined;

  return (
    <main className="app-shell">
      {!isConnected ? (
        <EmptyState
          connectionHealth={connectionHealth}
          detailMessage={state?.lastError ?? null}
          onConnect={onConnectEmpty}
        />
      ) : (
        <>
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={mainTab === "manage"}
            sourceMode={state?.sourceMode ?? "github-repo"}
            sourceRepository={state?.sourceRepository ?? ""}
            lastSynced={state?.lastSyncTime ?? null}
            isSyncing={isSyncing}
            optedInCount={optedInCount}
            totalCount={totalCount}
            sourceHint={sourceHint}
            onChangeRepo={onChangeSource}
            onSyncNow={onSyncNow}
          />
          {syncMessage && syncFailed ? (
            <div className="status-banner error" role="status">
              <span className="status-dot is-error" aria-hidden />
              <span>{syncMessage}</span>
            </div>
          ) : null}
          {connectionHealth === "auth_required" && (
            <div className="status-banner error" role="alert">
              <span className="status-dot is-error" aria-hidden />
              <span>GitHub session expired — sign in to keep skills in sync.</span>
              <button type="button" className="inline-action" onClick={() => postConnectRepo("auth_banner")}>
                Sign in
              </button>
            </div>
          )}
          <div
            className="tab-row"
            role="tablist"
            aria-label="Skill manager"
            onKeyDown={onTabRowKeyDown}
          >
            <button
              type="button"
              role="tab"
              id="tab-manage"
              className={`tab-button${mainTab === "manage" ? " active" : ""}`}
              aria-selected={mainTab === "manage"}
              aria-controls="tab-panel-manage"
              onClick={() => setMainTab("manage")}
            >
              Manage
            </button>
            <button
              type="button"
              role="tab"
              id="tab-browse"
              className={`tab-button${mainTab === "browse" ? " active" : ""}`}
              aria-selected={mainTab === "browse"}
              aria-controls="tab-panel-browse"
              onClick={() => setMainTab("browse")}
            >
              Browse
            </button>
          </div>
          {mainTab === "manage" ? (
            <div id="tab-panel-manage" role="tabpanel" aria-labelledby="tab-manage">
              {hasManageTabSkills ? (
                <>
                  {filteredManageTabCategories.length === 0 ? (
                    <p className="no-results">Nothing matches “{searchQuery}”. Try a shorter phrase.</p>
                  ) : (
                    filteredManageTabCategories.map((category) => (
                      <CategoryGroup
                        key={category.name}
                        category={category}
                        optedInSkills={state?.optedInSkills ?? []}
                        onToggle={onToggle}
                      />
                    ))
                  )}
                </>
              ) : state?.sourceMode === "github-repo" ? (
                <EnabledEmptyCallout
                  onOpenBrowse={() => {
                    trackSkillManagerEvent(stateRef.current, "skill_manager_nav", {
                      to: "browse",
                      from: "manage_empty_cta"
                    });
                    setMainTab("browse");
                  }}
                />
              ) : (
                <section className="callout-card callout-card--subtle" aria-labelledby="registry-empty-title">
                  <div className="callout-body">
                    <h2 id="registry-empty-title" className="callout-title">
                      No skills returned
                    </h2>
                    <p className="callout-text">
                      The registry responded but did not list any skills. Confirm the endpoint and categories in settings.
                    </p>
                  </div>
                </section>
              )}
            </div>
          ) : state?.sourceMode === "custom-registry" ? (
            <div id="tab-panel-browse" role="tabpanel" aria-labelledby="tab-browse">
              <section className="callout-card callout-card--subtle">
                <div className="callout-body">
                  <h2 className="callout-title">Browse is for GitHub sources</h2>
                  <p className="callout-text">
                    Custom registries already load the full catalog on the <strong>Manage</strong> tab. Switch back to filter and enable skills there.
                  </p>
                  <button
                    type="button"
                    className="button cta-button callout-cta"
                    onClick={() => {
                      trackSkillManagerEvent(stateRef.current, "skill_manager_nav", {
                        to: "manage",
                        from: "browse_registry_help"
                      });
                      setMainTab("manage");
                    }}
                  >
                    Go to Manage
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <div id="tab-panel-browse" role="tabpanel" aria-labelledby="tab-browse" className="browse-layout">
              <div className="browse-search-bar">
                <div className="catalog-input-row">
                  <input
                    id="catalog-search-input"
                    className="search-input"
                    type="search"
                    placeholder="Search skills…"
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.currentTarget.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search skills"
                  />
                  {catalogSearching ? (
                    <span className="catalog-search-spinner" aria-label="Searching">
                      <span className="catalog-search-spinner-dot" />
                      <span className="catalog-search-spinner-dot" />
                      <span className="catalog-search-spinner-dot" />
                    </span>
                  ) : null}
                </div>
              </div>

              {catalogQuery.trim().length >= 2 ? (
                catalogSearchResults && catalogSearchResults.length > 0 ? (
                  <CategoryGroup
                    variant="results"
                    category={{ name: "Results", skills: catalogSearchResults }}
                    optedInSkills={state?.optedInSkills ?? []}
                    onToggle={onToggle}
                  />
                ) : !catalogSearching && catalogSearchResults !== null ? (
                  <p className="no-results">No skills matched "{catalogQuery.trim()}".</p>
                ) : null
              ) : (
                <section className="surface-card tree-card" aria-label="Repository folders">
                  <div className="surface-card-header">
                    <h2 className="surface-card-title">Repository tree</h2>
                  </div>
                  <div className="surface-card-body">
                    {browseTreeLoading && !rootEntries ? (
                      <BrowseTreeSkeleton />
                    ) : !skillsRoot || !rootEntries ? (
                      <p className="subtle tree-fallback">Waiting for repository data…</p>
                    ) : (
                      <BrowseTree
                        entries={rootEntries}
                        browseChildren={browseChildren}
                        expandingPath={expandingPath}
                        onExpandDir={onExpandDir}
                      />
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
