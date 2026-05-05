import * as vscode from "vscode";
import { Logger } from "../../utils/logger";
import { RecommenderProviderId } from "./types";
import { VscodeLmProvider } from "./VscodeLmProvider";
import { CursorSdkProvider } from "./CursorSdkProvider";
import { OpenAiProvider } from "./OpenAiProvider";
import { AnthropicProvider } from "./AnthropicProvider";

export interface ChainDeps {
  vscodeLm: VscodeLmProvider;
  cursorSdk?: CursorSdkProvider;
  openAi?: OpenAiProvider;
  anthropic?: AnthropicProvider;
}

export type LlmCompleter = {
  id: RecommenderProviderId;
  complete: (prompt: string, token: vscode.CancellationToken) => Promise<string | undefined>;
};

/** Exported for unit tests — ordered fallback chain. */
export async function tryLlmCompleters(
  providers: LlmCompleter[],
  prompt: string,
  token: vscode.CancellationToken,
  logger: Logger
): Promise<{ providerId: RecommenderProviderId; raw: string } | undefined> {
  for (const p of providers) {
    try {
      const raw = await p.complete(prompt, token);
      if (raw && raw.trim().length > 0) {
        return { providerId: p.id, raw };
      }
    } catch (error) {
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
  logger: Logger
): Promise<{ providerId: RecommenderProviderId; raw: string } | undefined> {
  const providers: LlmCompleter[] = [
    { id: "vscode-lm", complete: (p, t) => deps.vscodeLm.complete(p, t) }
  ];
  if (deps.cursorSdk) {
    providers.push({ id: "cursor-sdk", complete: (p, t) => deps.cursorSdk!.complete(p, t) });
  }
  if (deps.openAi) {
    providers.push({ id: "openai", complete: (p, t) => deps.openAi!.complete(p, t) });
  }
  if (deps.anthropic) {
    providers.push({ id: "anthropic", complete: (p, t) => deps.anthropic!.complete(p, t) });
  }
  return tryLlmCompleters(providers, prompt, token, logger);
}
