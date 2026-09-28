## Why

Agents need a small, client-neutral way to inspect and operate the user's
already-running, stateful Emacs instance without generating thousands of MCP
tools or maintaining a duplicated command catalog.  A standalone GitHub
project built around one general evaluation primitive can expose the full Emacs
Lisp runtime while keeping the permanent tool schema and integration cost
small.

## What Changes

- Create a standalone, publishable `emacs-runtime-mcp` project that connects
  local agents to an existing Emacs server over `emacsclient`.
- Expose exactly one general MCP tool, `emacs_eval`, for evaluating a caller
  supplied Emacs Lisp expression in the live Emacs runtime.
- Return bounded, structured success and failure results, including timeout,
  unavailable-server, evaluation-error, and oversized-output behavior.
- Support the default Emacs server and an explicitly selected local server
  socket without starting another Emacs process when connection fails.
- Provide an agent Skill that teaches capability discovery through Emacs
  introspection and configuration-source search instead of embedding a static
  function inventory.
- Document the trusted-local security model: `emacs_eval` is arbitrary local
  code execution and is not a sandbox or remote multi-tenant service.
- Keep structured Emacs Lisp helpers and asynchronous operation tracking out of
  v0.1; evaluate them as a possible v0.2 after the core protocol is stable.
- Keep a native Pi extension out of v0.1; add one only if validation shows that
  using the MCP server through the existing Pi MCP adapter is insufficient.

## Capabilities

### New Capabilities

- `emacs-runtime-agent-bridge`: Defines the single-tool MCP contract, live
  Emacs connection and evaluation behavior, bounded structured responses,
  introspection-driven discovery, local security boundary, packaging, and
  compatibility expectations.

### Modified Capabilities

None.

## Impact

- New standalone TypeScript/Node.js package and GitHub repository structure for
  the MCP server, evaluation core, agent Skill, documentation, examples, and
  tests.
- Runtime dependency on Node.js 20 or newer, the official MCP TypeScript SDK,
  `emacsclient`, and an already-running local Emacs server.
- The public MCP surface remains one tool; Org, lsp-bridge, Dired, project
  commands, user-defined functions, and future packages are reached through
  runtime discovery rather than project-specific tool additions.
- The OpenSpec artifacts SHALL move into the standalone repository before
  implementation.  This `.emacs.d` repository will retain only its eventual
  installation and client configuration.
- Existing Emacs configuration and command semantics are not changed by
  default; users opt in by configuring a local MCP client.
