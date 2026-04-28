/**
 * Optional Google Analytics 4 in the Skill Manager webview only.
 * Loads only when extension state includes a valid `G-...` measurement ID from settings
 * when the extension supplies a measurement ID (host may also require product telemetry unless opted out in settings).
 */

let activeMeasurementId: string | null = null;

type QueuedEvent = { name: string; params: Record<string, string | number | boolean> };
const pendingEvents: QueuedEvent[] = [];
const MAX_QUEUE = 64;

function isTestEnv(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}

function flushPending(): void {
  const w = window as Window & { gtag?: (...args: unknown[]) => void };
  const gtag = w.gtag;
  if (typeof gtag !== "function") {
    return;
  }
  while (pendingEvents.length > 0) {
    const next = pendingEvents.shift();
    if (next) {
      gtag("event", next.name, next.params);
    }
  }
}

function clearPending(): void {
  pendingEvents.length = 0;
}

export function initGa4(measurementId: string | null): void {
  if (isTestEnv()) {
    return;
  }
  if (!measurementId) {
    activeMeasurementId = null;
    clearPending();
    document.getElementById("ga4-gtag-js")?.remove();
    return;
  }
  if (activeMeasurementId === measurementId) {
    return;
  }
  activeMeasurementId = measurementId;
  clearPending();

  const prev = document.getElementById("ga4-gtag-js");
  prev?.remove();

  const script = document.createElement("script");
  script.id = "ga4-gtag-js";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  script.addEventListener("error", () => {
    console.warn(
      "[Skill Manager GA4] Failed to load gtag.js (check CSP, network, or ad blockers). Measurement ID is configured."
    );
  });

  script.addEventListener("load", () => {
    const w = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer ?? [];
    w.gtag = function gtag(...args: unknown[]): void {
      w.dataLayer?.push(args);
    };
    w.gtag("js", new Date());
    w.gtag("config", measurementId, { send_page_view: false });
    flushPending();
  });
}

export function trackGa4Event(name: string, params?: Record<string, string | number | boolean>): void {
  if (isTestEnv()) {
    return;
  }
  const w = window as Window & { gtag?: (...args: unknown[]) => void };
  const gtag = w.gtag;
  const payload = params ?? {};
  if (typeof gtag === "function") {
    gtag("event", name, payload);
    return;
  }
  pendingEvents.push({ name, params: payload });
  while (pendingEvents.length > MAX_QUEUE) {
    pendingEvents.shift();
  }
}
