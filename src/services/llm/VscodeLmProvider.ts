import * as vscode from "vscode";
import type { LlmStreamSink } from "./streamEvents";

type LanguageModelChatResponse = {
  text: AsyncIterable<string>;
};

type SelectableModel = {
  sendRequest: (
    messages: unknown[],
    options: Record<string, unknown>,
    token: vscode.CancellationToken
  ) => Thenable<LanguageModelChatResponse>;
};

type VscodeWithLm = typeof vscode & {
  lm?: {
    selectChatModels(selector?: Record<string, string>): Thenable<SelectableModel[]>;
  };
  LanguageModelChatMessage?: {
    User: (content: string) => unknown;
  };
};

async function streamToText(
  response: LanguageModelChatResponse,
  token: vscode.CancellationToken,
  providerId: string,
  stream?: LlmStreamSink
): Promise<string> {
  let out = "";
  try {
    for await (const fragment of response.text) {
      if (token.isCancellationRequested) {
        break;
      }
      out += fragment;
      if (fragment) {
        stream?.({ type: "text", providerId, delta: fragment });
      }
    }
  } catch {
    return out;
  }
  return out;
}

export class VscodeLmProvider {
  public readonly id = "vscode-lm" as const;

  public constructor(private readonly modelFamily: string) {}

  public async complete(
    prompt: string,
    token: vscode.CancellationToken,
    stream?: LlmStreamSink
  ): Promise<string | undefined> {
    const v = vscode as VscodeWithLm;
    const lm = v.lm;
    if (!lm?.selectChatModels) {
      return undefined;
    }

    let models: SelectableModel[];
    try {
      models = await lm.selectChatModels({ family: this.modelFamily });
    } catch {
      return undefined;
    }

    if (!models || models.length === 0) {
      return undefined;
    }

    const User = v.LanguageModelChatMessage?.User;
    const messages = User ? [User(prompt)] : [{ role: "user", parts: [{ text: prompt }] }];

    try {
      const response = await models[0].sendRequest(messages as unknown[], {}, token);
      const text = await streamToText(response, token, this.id, stream);
      return text.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
