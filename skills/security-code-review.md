# Security Code Review

When reviewing code for security issues, always check for the following:

## Injection vulnerabilities
- SQL injection: ensure all database queries use parameterized statements or an ORM that escapes inputs. Never concatenate user-supplied strings into query strings.
- Command injection: avoid passing user input to shell commands. Use safe APIs (e.g., `subprocess` with a list argument, not `shell=True`).
- Path traversal: validate and sanitize file paths; reject `..` segments and resolve to an absolute canonical path before opening files.

## Authentication and authorization
- Verify that every endpoint checks authentication **before** performing any work.
- Confirm that resource ownership is checked (user A cannot access user B's data).
- Ensure session tokens are randomly generated, never guessable, and invalidated on logout.

## Secrets management
- No secrets, API keys, or credentials should appear in source code or committed configuration files.
- Use environment variables or a secrets manager; ensure `.gitignore` excludes `.env` files.

## Dependency hygiene
- Flag newly added dependencies; check their licence and known CVEs before approving.

## Cryptography
- Prefer standard library functions over custom crypto.
- Use strong algorithms: AES-256-GCM, SHA-256+, bcrypt/argon2 for passwords.
- Never use MD5 or SHA-1 for security-sensitive hashes.

## Output encoding
- HTML-encode all user-controlled data before inserting into HTML.
- Use framework templating (e.g., JSX, Jinja2 autoescaping) rather than raw string concatenation.

When raising a finding, include: **severity** (Critical / High / Medium / Low), the **file and line**, a **description** of the risk, and a **suggested fix**.
