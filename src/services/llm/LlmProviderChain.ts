import * as vscode from "vscode";
import { Logger } from "../../utils/logger";
import { RecommenderProviderId } from "./types";
import { VscodeLmProvider } from "./VscodeLmProvider";
import { CursorSdkProvider } from "./CursorSdkProvider";
import { OpenAiProvider } from "./OpenAiProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import type { LlmStreamSink } from "./streamEvents";

export interface ChainDeps {
  vscodeLm: VscodeLmProvider;
  cursorSdk?: CursorSdkProvider;
  openAi?: OpenAiProvider;
  anthropic?: AnthropicProvider;
}

export type LlmCompleter = {
  id: RecommenderProviderId;
  complete: (
    prompt: string,
    token: vscode.CancellationToken,
    stream?: LlmStreamSink
  ) => Promise<string | undefined>;
};

/** Exported for unit tests — ordered fallback chain. */
export async function tryLlmCompleters(
  providers: LlmCompleter[],
  prompt: string,
  token: vscode.CancellationToken,
  logger: Logger,
  stream?: LlmStreamSink
): Promise<{ providerId: RecommenderProviderId; raw: string } | undefined> {
  for (const p of providers) {
    stream?.({ type: "status", providerId: p.id, message: `Trying ${p.id}…` });
    try {
      const raw = await p.complete(prompt, token, stream);
      if (raw && raw.trim().length > 0) {
        return { providerId: p.id, raw };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      stream?.({ type: "error", providerId: p.id, message: msg });
      logger.warn(`LLM provider ${p.id} failed`, error);
    }
  }
  return undefined;
}

/**
 * Try providers in order; returns first non-empty model output.
 */
export async function runLlmProviderChain(
  deps: ChainDeps,
  prompt: string,
  token: vscode.CancellationToken,
  logger: Logger,
  stream?: LlmStreamSink
): Promise<{ providerId: RecommenderProviderId; raw: string } | undefined> {
  const providers: LlmCompleter[] = [
    { id: "vscode-lm", complete: (p, t, s) => deps.vscodeLm.complete(p, t, s) }
  ];
  if (deps.cursorSdk) {
    providers.push({ id: "cursor-sdk", complete: (p, t, s) => deps.cursorSdk!.complete(p, t, s) });
  }
  if (deps.openAi) {
    providers.push({ id: "openai", complete: (p, t, s) => deps.openAi!.complete(p, t, s) });
  }
  if (deps.anthropic) {
    providers.push({ id: "anthropic", complete: (p, t, s) => deps.anthropic!.complete(p, t, s) });
  }
  return tryLlmCompleters(providers, prompt, token, logger, stream);
}
