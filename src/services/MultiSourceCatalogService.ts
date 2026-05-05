import { ResolvedSource, SkillMeta, SyncFailureReason } from "../types";
import { CatalogService } from "./CatalogService";
import { CatalogSnapshot } from "./SourceCatalogProvider";
import { compositeSkillKey } from "../utils/sources";
import { Logger } from "../utils/logger";
import { ServiceError } from "./ServiceError";

export interface PerSourceResult {
  source: ResolvedSource;
  snapshot?: CatalogSnapshot;
  error?: string;
  /** Failure category — set alongside `error` so callers can branch on auth/network/etc. */
  errorReason?: SyncFailureReason;
  /** True when `snapshot` was served from cache because the upstream fetch failed. */
  stale?: boolean;
  /** Reason the upstream fetch failed; only set when `stale` is true. */
  staleReason?: SyncFailureReason;
  /** ISO timestamp of when the upstream is expected to be reachable; only set when `stale` is true. */
  retryAt?: string;
}

export interface MergedCatalog {
  /** Flat catalog with each meta stamped with its source provenance. */
  metas: SkillMeta[];
  /** Per-source results, including any per-source fetch errors. */
  perSource: PerSourceResult[];
  /** Composite-keyed lookup `<sourceLabel>/<name>` → meta. */
  byCompositeKey: Map<string, SkillMeta>;
}

export class MultiSourceCatalogService {
  public constructor(
    private readonly catalogService: CatalogService,
    private readonly logger: Logger
  ) {}

  /**
   * Fetch each source's catalog snapshot in parallel and merge into a single
   * `MergedCatalog`. Per-source failures do not abort the merge — the failing
   * source's `error` is recorded and its skills are simply absent from the
   * result. Same `<sourceLabel>/<name>` collisions resolve to the first
   * occurrence (later sources are dropped) so opted-in identifiers stay stable.
   */
  public async getMergedCatalog(
    sources: ResolvedSource[],
    opts?: { forceRefresh?: boolean }
  ): Promise<MergedCatalog> {
    const perSource: PerSourceResult[] = await Promise.all(
      sources.map(async (source) => {
        try {
          const snapshot = await this.catalogService.getCatalog(source, { forceRefresh: opts?.forceRefresh ?? false });
          const result: PerSourceResult = { source, snapshot };
          if (snapshot.isStale) {
            result.stale = true;
            result.staleReason = snapshot.staleReason;
            result.retryAt = snapshot.retryAt;
          }
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const errorReason: SyncFailureReason = error instanceof ServiceError ? error.reason : "unknown";
          // `source_invalid` (e.g. "this repo isn't a skills repo") is an
          // expected user-configuration outcome — log without the stack trace
          // so the output channel stays readable. Genuine failures (network,
          // auth, parse errors) keep the full error logging.
          if (errorReason === "source_invalid") {
            this.logger.warn(`Source ${source.label} (${source.sourceKey}) skipped: ${message}`);
          } else {
            this.logger.error(`Failed to load catalog from ${source.label} (${source.sourceKey})`, error);
          }
          return { source, error: message, errorReason };
        }
      })
    );

    const merged: SkillMeta[] = [];
    const byCompositeKey = new Map<string, SkillMeta>();

    for (const result of perSource) {
      if (!result.snapshot) {
        continue;
      }
      for (const meta of result.snapshot.metas) {
        const key = compositeSkillKey(result.source.label, meta.name);
        if (byCompositeKey.has(key)) {
          this.logger.warn(
            `Duplicate skill composite key ${key} from source ${result.source.sourceKey}; keeping first occurrence.`
          );
          continue;
        }
        byCompositeKey.set(key, meta);
        merged.push(meta);
      }
    }

    return { metas: merged, perSource, byCompositeKey };
  }
}
