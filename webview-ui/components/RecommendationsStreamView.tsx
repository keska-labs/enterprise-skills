import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LlmStreamEvent } from "../types/llmStreamEvents";
import {
  foldRecommendationStream,
  statusPillFromFold,
  type FoldedPastLine,
  type StreamActive
} from "../utils/recommendationsStreamFold";

export function appendRecoStreamEvent(prev: LlmStreamEvent[], ev: LlmStreamEvent): LlmStreamEvent[] {
  const last = prev[prev.length - 1];
  if (last && ev.type === "text" && last.type === "text" && last.providerId === ev.providerId) {
    return [...prev.slice(0, -1), { ...last, delta: last.delta + ev.delta }];
  }
  if (last && ev.type === "thinking" && last.type === "thinking" && last.providerId === ev.providerId) {
    return [...prev.slice(0, -1), { ...last, delta: last.delta + ev.delta }];
  }
  /** Same-line “pulse” updates during long tool runs (host may emit periodic status). */
  if (last && ev.type === "status" && last.type === "status" && last.providerId === ev.providerId) {
    return [...prev.slice(0, -1), { ...last, message: ev.message }];
  }
  /** Many providers re-emit toolUse as `input` JSON streams in — coalesce on `id` (or trailing call). */
  if (last && ev.type === "toolUse" && last.type === "toolUse" && last.providerId === ev.providerId) {
    const sameId = ev.id && last.id && ev.id === last.id;
    const sameTrailing = !ev.id && !last.id && last.name === ev.name;
    if (sameId || sameTrailing) {
      return [
        ...prev.slice(0, -1),
        { ...last, name: ev.name || last.name, input: ev.input ?? last.input, id: ev.id ?? last.id }
      ];
    }
  }
  return [...prev, ev];
}

function providerLabel(id: string): string {
  switch (id) {
    case "vscode-lm":
      return "VS Code LM";
    case "cursor-sdk":
      return "Cursor SDK";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "cache":
      return "Cache";
    case "recommendations":
      return "Skill Sync";
    default:
      return id;
  }
}

function activePhaseLabel(active: StreamActive): string {
  switch (active.kind) {
    case "thinking":
      return "Thinking";
    case "tool_running":
      return active.command ? "Running" : "Calling";
    case "tool_done":
      return active.ok ? "Finished" : "Failed";
    case "response":
      return "Response";
  }
}

function activePhaseTone(active: StreamActive): string {
  switch (active.kind) {
    case "thinking":
      return "rec-stream-active--thinking";
    case "tool_running":
      return "rec-stream-active--tool";
    case "tool_done":
      return active.ok ? "rec-stream-active--tool-ok" : "rec-stream-active--tool-error";
    case "response":
      return "rec-stream-active--response";
  }
}

function PastTag({ line }: { line: FoldedPastLine }): JSX.Element {
  if (line.tag === "Thought") {
    return <span className="rec-stream-past-tag rec-stream-past-tag--thought">Thought</span>;
  }
  if (line.tag === "Response") {
    return <span className="rec-stream-past-tag rec-stream-past-tag--response">Response</span>;
  }
  if (line.error) {
    return <span className="rec-stream-past-tag rec-stream-past-tag--error">{line.tag}</span>;
  }
  return <span className="rec-stream-past-tag">{line.tag}</span>;
}

function PastLineRow({ row }: { row: FoldedPastLine }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  const updateTruncated = useCallback(() => {
    const el = textRef.current;
    if (!el || !row.text || expanded) {
      setTruncated(false);
      return;
    }
    setTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [row.text, expanded]);

  useLayoutEffect(() => {
    updateTruncated();
  }, [updateTruncated]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const ro = new ResizeObserver(() => updateTruncated());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateTruncated]);

  const toggleable = Boolean(row.text) && (truncated || expanded);

  const onActivate = (): void => {
    if (!toggleable) {
      return;
    }
    setExpanded((v) => !v);
  };

  const rowTitle = row.text ? `${row.tag} — ${row.text}` : undefined;

  const inner = (
    <>
      <PastTag line={row} />
      {row.text ? (
        <span
          ref={textRef}
          className={`rec-stream-past-text${expanded ? " rec-stream-past-text--expanded" : ""}`}
        >
          {row.text}
        </span>
      ) : null}
      {toggleable ? (
        <span className="rec-stream-past-toggle-hint" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className={`rec-stream-past-line${row.error ? " rec-stream-past-line--error" : ""}${
        expanded ? " rec-stream-past-line--expanded" : ""
      }`}
    >
      {toggleable ? (
        <button
          type="button"
          className={`rec-stream-past-hit${expanded ? " rec-stream-past-hit--expanded" : ""}`}
          title={!expanded ? rowTitle : undefined}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${row.tag} detail` : `Expand ${row.tag} detail`}
          onClick={onActivate}
        >
          {inner}
        </button>
      ) : (
        <div className="rec-stream-past-hit rec-stream-past-hit--static" title={rowTitle}>
          {inner}
        </div>
      )}
    </li>
  );
}

function ActiveBody({ active }: { active: StreamActive }): JSX.Element {
  switch (active.kind) {
    case "thinking":
      return <p className="rec-stream-active-thinking">{active.body}</p>;
    case "tool_running":
      if (!active.command) {
        return (
          <p className="rec-stream-active-empty">
            Calling <code>{active.toolName}</code>… waiting for arguments
          </p>
        );
      }
      return (
        <pre className="rec-stream-active-command">
          <span className="rec-stream-active-prompt">›</span> {active.command}
        </pre>
      );
    case "tool_done": {
      const nodes: ReactNode[] = [];
      if (active.command) {
        nodes.push(
          <pre key="cmd" className="rec-stream-active-command">
            <span className="rec-stream-active-prompt">›</span> {active.command}
          </pre>
        );
      }
      if (active.preview) {
        nodes.push(
          <pre key="out" className="rec-stream-active-output">
            {active.preview}
          </pre>
        );
      }
      if (nodes.length === 0) {
        nodes.push(
          <p key="empty" className="rec-stream-active-empty">
            {active.ok ? "Completed." : "No output."}
          </p>
        );
      }
      return <>{nodes}</>;
    }
    case "response":
      return <pre className="rec-stream-active-response">{active.body}</pre>;
  }
}

export interface RecommendationsStreamViewProps {
  events: LlmStreamEvent[];
  streaming: boolean;
}

export function RecommendationsStreamView({
  events,
  streaming
}: RecommendationsStreamViewProps): JSX.Element {
  const folded = useMemo(() => foldRecommendationStream(events), [events]);
  const activeInnerRef = useRef<HTMLDivElement>(null);
  const pastRef = useRef<HTMLUListElement>(null);
  const stickActiveBottomRef = useRef(true);
  const stickPastBottomRef = useRef(true);

  const headerProvider = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.providerId !== "recommendations") {
        return e.providerId;
      }
    }
    return events[0]?.providerId ?? "recommendations";
  }, [events]);

  const statusLine = useMemo(() => statusPillFromFold(folded, events), [folded, events]);

  useEffect(() => {
    void folded.active;
    const el = activeInnerRef.current;
    if (!el || !stickActiveBottomRef.current) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [folded.active]);

  useEffect(() => {
    void folded.past;
    const el = pastRef.current;
    if (!el || !stickPastBottomRef.current) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [folded.past]);

  const onActiveScroll = useCallback(() => {
    const el = activeInnerRef.current;
    if (!el) {
      return;
    }
    stickActiveBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const onPastScroll = useCallback(() => {
    const el = pastRef.current;
    if (!el) {
      return;
    }
    stickPastBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  }, []);

  const showIdleHint =
    streaming &&
    folded.past.length === 0 &&
    !folded.active &&
    events.length > 0 &&
    events.every((e) => e.type === "status");

  return (
    <section className="rec-stream-root" aria-busy={streaming} aria-label="LLM ranking progress">
      <header className="rec-stream-header">
        <div className="rec-stream-title-row">
          <span className="rec-stream-title">Ranking</span>
          <span className="rec-stream-provider">{providerLabel(headerProvider)}</span>
        </div>
        <span className={`rec-stream-status-pill${streaming ? " rec-stream-status-pill--live" : ""}`}>
          {streaming ? <span className="rec-stream-status-dot" aria-hidden /> : null}
          {statusLine}
        </span>
      </header>
      <div className="rec-stream-body">
        {folded.past.length > 0 ? (
          <section className="rec-stream-past-section" aria-label="Earlier steps">
            <ul className="rec-stream-past" ref={pastRef} onScroll={onPastScroll}>
              {folded.past.map((row) => (
                <PastLineRow key={row.key} row={row} />
              ))}
            </ul>
          </section>
        ) : null}
        {folded.active ? (
          <article
            className={`rec-stream-active ${activePhaseTone(folded.active)}`}
            aria-live="polite"
          >
            <header className="rec-stream-active-head">
              <span className="rec-stream-active-phase">{activePhaseLabel(folded.active)}</span>
              {folded.active.kind === "tool_running" || folded.active.kind === "tool_done" ? (
                <span className="rec-stream-active-tool-name">{folded.active.toolName}</span>
              ) : null}
              {streaming &&
              (folded.active.kind === "thinking" ||
                folded.active.kind === "tool_running" ||
                folded.active.kind === "response") ? (
                <span className="rec-stream-active-spinner" aria-hidden>
                  <span className="rec-stream-active-spinner-dot" />
                  <span className="rec-stream-active-spinner-dot" />
                  <span className="rec-stream-active-spinner-dot" />
                </span>
              ) : null}
            </header>
            <div
              className="rec-stream-active-body"
              ref={activeInnerRef}
              onScroll={onActiveScroll}
            >
              <ActiveBody active={folded.active} />
            </div>
          </article>
        ) : null}
        {showIdleHint ? <p className="rec-stream-idle">Waiting for model…</p> : null}
        {folded.errorMessage ? (
          <div className="rec-stream-error" role="alert">
            {folded.errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
