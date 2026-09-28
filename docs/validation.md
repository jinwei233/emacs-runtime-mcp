# v0.1 Validation

Validation date: 2026-09-28

## Local Toolchain

- Node.js 22.18.0
- pnpm 10.34.5
- GNU Emacs and emacsclient 31.1
- `@modelcontextprotocol/server` 2.1.0
- MCP Inspector current package
- Pi 0.84.1
- `pi-mcp-adapter` 2.20.1 with MCP client 2.0.0

## Automated Checks

- `pnpm check`: passed
- Unit and in-memory protocol tests: 41 passed
- `pnpm test:integration`: 15 passed against a random named `emacs -Q`
  daemon with temporary state
- `openspec validate add-emacs-runtime-mcp --strict`: passed
- MCP Inspector strict `tools/list`: passed with zero schema findings
- MCP Inspector `tools/call` through stdio: passed

## Package Check

`pnpm pack` produced `emacs-runtime-mcp-0.1.0.tgz`. Its contents were
inspected, then installed into a clean temporary npm project.

Verified:

- `node_modules/.bin/emacs-runtime-mcp --version` returned `0.1.0`
- package exports returned `TOOL_NAME=emacs_eval` and
  `DEFAULT_TIMEOUT_MS=10000`
- `skills/emacs-live/SKILL.md`, `README.md`, and `SECURITY.md` were present

## Pi MCP Adapter

The clean-installed tarball was started through
`pi-mcp-adapter`'s `McpServerManager`, using the adapter's default legacy MCP
negotiation path. The adapter:

- connected successfully;
- discovered exactly `emacs_eval`;
- called `emacs_eval`;
- preserved JSON text content, structured content, and `isError: false`.

No compatibility gap was observed. A native Pi adapter is not justified for
v0.1. The validation used the adapter directly without an LLM call, so it was
deterministic and consumed no model tokens.

## Live Emacs

The clean-installed package connected to the user's existing default Emacs
server.

Read-only evidence:

- Emacs version: 31.1
- `user-emacs-directory`: `~/.emacs.d/`
- current server buffer: ` *server*`

Reversible mutation evidence:

1. Confirmed a unique validation symbol was unbound.
2. Set it to a unique string.
3. Read the symbol and verified the exact string.
4. Called `makunbound`.
5. Verified `boundp` returned `nil`.

No persistent buffer, file, configuration, or package state was created by the
validation.

## Release Decision

The implementation satisfies the v0.1 contract and is technically ready to
publish. Publication was intentionally not performed during implementation;
it requires an explicit release action and npm credentials.
