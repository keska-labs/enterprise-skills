# Security

If you believe you have found a security vulnerability, please **do not** open a public issue.

Instead, report it privately to the maintainers (use GitHub Security Advisories for this repository if enabled, or contact the repository owners directly).

Include steps to reproduce, affected versions, and impact if you can.

## Optional analytics

If you enable `skillSync.ga4MeasurementId`, the Skill Manager webview may load third-party scripts from Google (Tag Manager / Analytics). That is **off by default** (empty Measurement ID). Unless `skillSync.ga4AllowWithoutProductTelemetry` is true, GA is not applied when product telemetry is off (`vscode.env.isTelemetryEnabled`).
