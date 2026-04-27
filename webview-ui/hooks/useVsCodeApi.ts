type VsCodeApi = {
  postMessage: (message: unknown) => void;
  setState: (state: unknown) => void;
  getState: () => unknown;
};

declare const acquireVsCodeApi: () => VsCodeApi;

let vscodeApi: VsCodeApi | undefined;

export function useVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}
