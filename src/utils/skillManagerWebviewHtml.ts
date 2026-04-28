import * as crypto from "crypto";
import * as vscode from "vscode";

/**
 * Shared HTML + CSP for Skill Manager webviews (sidebar + panel).
 * CSP allows loading GA4 gtag from Google Tag Manager when enabled in settings.
 */
export function getSkillManagerWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
  const scriptUrl = `${scriptUri.toString()}?v=${Date.now()}`;
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' https://www.googletagmanager.com`,
    [
      "connect-src",
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://region1.google-analytics.com",
      "https://www.googletagmanager.com",
      "https://*.googletagmanager.com",
      "https://*.analytics.google.com",
      "https://stats.g.doubleclick.net",
      "https://www.google.com"
    ].join(" "),
    [
      "img-src",
      "https://www.google-analytics.com",
      "https://www.googletagmanager.com",
      "https://*.google-analytics.com",
      "data:"
    ].join(" ")
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Skill Manager</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUrl}"></script>
</body>
</html>`;
}
