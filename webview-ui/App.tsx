import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVsCodeApi } from "./hooks/useVsCodeApi";
import { BrowseTree } from "./components/BrowseTree";
import { CategoryGroup } from "./components/CategoryGroup";
import { EnabledEmptyCallout } from "./components/EnabledEmptyCallout";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { BrowseEntry, ExtensionMessage, SkillInfo, SkillManagerState } from "./types/messages";
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
        setIsSyncing(false);
        setSyncMessage(data.payload.message);
        setSyncFailed(data.payload.status === "failed" || data.payload.status === "partial");
      } else if (data.type === "error") {
        setIsSyncing(false);
        setSyncMessage(data.message);
        setSyncFailed(true);
        setExpandingPath(null);
        setBrowseTreeLoading(false);
        setCatalogSearching(false);
        setPhase("ready");
      } else if (data.type === "browseUpdate") {
        setBrowseChildren((prev) => ({ ...prev, [data.parentPath]: data.entries }));
        if (data.skillsRootPath) {
          setBrowseSkillsRoot(data.skillsRootPath);
          setBrowseTreeLoading(false);
        }
        setExpandingPath(null);
      } else if (data.type === "catalogSearchResults") {
        setCatalogSearchResults(data.skills);
        setCatalogSearching(false);
      }
    };
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, [vscode]);

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
      vscode.postMessage({ type: "searchCatalog", query: q });
    }, 450);
    return () => window.clearTimeout(handle);
  }, [catalogQuery, mainTab, vscode]);

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

  const postConnectRepo = () => {
    vscode.postMessage({ type: "connectRepo" });
  };

  const onConnectEmpty = () => postConnectRepo();
  const onChangeSource = () => postConnectRepo();

  const onSyncNow = () => {
    setIsSyncing(true);
    setSyncMessage(null);
    vscode.postMessage({ type: "syncNow" });
  };
  const onToggle = (skillName: string, optIn: boolean) => {
    setIsSyncing(true);
    vscode.postMessage({ type: "toggleSkill", skillName, optIn });
  };

  const onExpandDir = useCallback(
    (fullPath: string) => {
      if (browseChildren[fullPath]) {
        return;
      }
      setExpandingPath(fullPath);
      vscode.postMessage({ type: "expandBrowsePath", path: fullPath });
    },
    [browseChildren, vscode]
  );

  const onTabRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" && mainTab === "manage") {
      e.preventDefault();
      setMainTab("browse");
    } else if (e.key === "ArrowLeft" && mainTab === "browse") {
      e.preventDefault();
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
              <button type="button" className="inline-action" onClick={() => postConnectRepo()}>
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
                <EnabledEmptyCallout onOpenBrowse={() => setMainTab("browse")} />
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
                    onClick={() => setMainTab("manage")}
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
