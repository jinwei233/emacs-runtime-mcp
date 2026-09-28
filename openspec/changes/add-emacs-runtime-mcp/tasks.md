## 1. Establish The Standalone Repository

- [x] 1.1 Check GitHub and npm name availability and record the final repository, package, and executable names.
- [x] 1.2 Create the standalone repository with an MIT license, then move this proposal, design, capability spec, and task list into it as the implementation source of truth.
- [x] 1.3 Remove the planning copy from `.emacs.d` after migration is verified; retain only eventual local installation and MCP client configuration here.
- [x] 1.4 Initialize a pnpm-based Node.js 20+ ESM TypeScript package with strict type checking, formatting, tests, build scripts, and the official `@modelcontextprotocol/server` v2 dependency.

## 2. Lock The Core Contract With Tests

- [x] 2.1 Define typed request, success, failure, server-selection, and stable error-code contracts with shared defaults and supported limits.
- [x] 2.2 Add tests proving Node rejects invalid field types, empty or oversized input, and invalid numeric ranges without invoking `emacsclient`.
- [x] 2.3 Add a fake `emacsclient` fixture that records argv and simulates success, connection failure, timeout, malformed bridge output, and excessive transport output.
- [x] 2.4 Add tests for default, socket-name, and server-file selection, mutual exclusion, `--alternate-editor=false`, and exact argument forwarding without a shell.
- [x] 2.5 Add tests for the exact success and failure envelopes, including always-present `original_chars`, `value`-only truncation, Unicode character counts, and stable error mapping.

## 3. Implement The Evaluation Core

- [x] 3.1 Implement Node-side request validation for shape, empty input, input length, timeout range, and output range.
- [x] 3.2 Implement UTF-8 base64 expression transport so caller text is never interpolated as shell or wrapper syntax.
- [x] 3.3 Implement the stock-Emacs wrapper that reads exactly one form and returns `invalid_expression` for read failures or trailing non-whitespace content before evaluation.
- [x] 3.4 Implement one-time evaluation, `prin1-to-string`, Emacs-character counting, `value` truncation, condition capture, JSON serialization, and base64 response encoding.
- [x] 3.5 Implement `emacsclient` execution with argument vectors, explicit server selection, `--alternate-editor=false`, bounded stdout/stderr collection, and elapsed timing.
- [x] 3.6 Implement timeout termination and the hard transport ceiling without claiming server-side cancellation or Emacs memory protection.
- [x] 3.7 Implement strict response decoding and classification for `invalid_request`, `invalid_expression`, `emacs_unavailable`, `elisp_error`, `evaluation_timeout`, `output_too_large`, `bridge_protocol_error`, and `internal_error`.
- [x] 3.8 Make the core unit suite, type checking, formatting, and linting pass without a running Emacs server.

## 4. Implement The Single-Tool MCP Server

- [x] 4.1 Register exactly one stdio MCP tool named `emacs_eval` with input and output schemas derived from the core contract.
- [x] 4.2 Return identical envelopes through structured content and JSON text content, setting `isError: true` exactly when `ok` is `false`.
- [x] 4.3 Add CLI and environment configuration for the `emacsclient` executable, socket name, server file, and default limits, rejecting conflicts before transport starts.
- [x] 4.4 Route diagnostics exclusively to stderr and keep stdout valid for MCP JSON-RPC.
- [x] 4.5 Add protocol tests proving tool listing exposes only `emacs_eval` and run an MCP Inspector invocation smoke test.

## 5. Verify Against Isolated Emacs

- [x] 5.1 Build a harness that starts and always cleans up `emacs -Q --daemon=mcp-test` with temporary state and never targets the developer's default server.
- [x] 5.2 Verify primitive, list, multiline, and Unicode values plus state persistence across calls.
- [x] 5.3 Verify unreadable input and trailing forms return `invalid_expression`, while signaled Lisp conditions return `elisp_error`.
- [x] 5.4 Verify complete and truncated values always report Emacs-character `original_chars`, including combining and joined emoji sequences.
- [x] 5.5 Verify explicit server selection and unavailable-server behavior, including proof that no fallback editor or daemon starts.
- [x] 5.6 Verify timeout and transport-limit failures leave the harness recoverable, then probe runtime health and relevant state before any follow-up mutation.

## 6. Add The Discovery Skill And Safety Guidance

- [x] 6.1 Write `skills/emacs-live/SKILL.md` with the inspect, discover, review, invoke, and verify workflow and no generated command inventory.
- [x] 6.2 Add compact discovery patterns for live context, apropos, documentation, argument lists, interactive forms, symbol source, key bindings, loaded features, and targeted configuration search.
- [x] 6.3 Document explicit buffer/window selection, unattended minibuffer hazards, one-at-a-time mutations, postcondition checks, and mandatory re-probing after timeouts.
- [x] 6.4 Validate the Skill against one built-in command, one user-defined function, and one dynamically loaded package without changing the MCP tool list.
- [x] 6.5 Add prominent documentation that arbitrary evaluation is trusted-local code execution and that timeout/output bounds do not provide cancellation, sandboxing, transactions, or Emacs memory isolation.

## 7. Package And Validate v0.1

- [x] 7.1 Document installation, server selection, tool schema, envelopes, limits, generic MCP client configuration, troubleshooting, and the supported Node/Emacs matrix.
- [x] 7.2 Add minimal GitHub Actions checks for formatting, type checking, unit tests, isolated Emacs integration, and package contents.
- [x] 7.3 Run `pnpm pack`, inspect the archive, install it into a clean temporary project, and verify the stdio binary and Skill are present and usable.
- [x] 7.4 Validate the packaged MCP server through the existing Pi MCP adapter and record concrete compatibility gaps without implementing a native Pi adapter.
- [x] 7.5 Test the release candidate read-only against the user's live Emacs configuration, perform one reversible mutation, verify its postcondition, and record rollback evidence.
- [x] 7.6 Decide whether to publish v0.1 only after all contract, isolated-runtime, package, and live-runtime checks pass.
