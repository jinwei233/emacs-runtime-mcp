## Context

Emacs already exposes a server protocol through `emacsclient`, and the user's
long-running graphical process contains the state an agent actually needs:
loaded packages, open buffers, active modes, project state, diagnostics, and
user-defined functions.  Existing Emacs MCP projects commonly expose a fixed
set of domain tools.  That is convenient for a narrow workflow but duplicates
Emacs APIs, becomes stale as packages change, and can add hundreds or thousands
of schemas to an agent context.

This change instead defines a standalone GitHub project,
`emacs-runtime-mcp`, whose stable public primitive is arbitrary evaluation in a
selected live Emacs runtime.  Agents discover appropriate functions through
the runtime's own introspection facilities and, when useful, by searching the
user's configuration source.  Org and lsp-bridge are validation examples, not
architectural dependencies.

The first release targets trusted local use on macOS and Linux with Node.js 20
or newer, Emacs 28 or newer, and a compatible `emacsclient` on `PATH`.  The
server uses stdio MCP transport.  It does not own Emacs startup and cannot
safely cancel arbitrary Lisp that has already begun executing on Emacs's main
thread.

This `.emacs.d` repository is only the temporary planning location.  Before
implementation, the proposal, design, capability spec, and task list move into
the standalone project's repository, which becomes their source of truth.
This repository will eventually contain only local installation and client
configuration.

## Goals / Non-Goals

**Goals:**

- Keep the permanent MCP surface to one tool while preserving access to the
  general Emacs Lisp runtime.
- Evaluate against the user's existing stateful Emacs process without silently
  creating a second editor or daemon.
- Make request validation, output limits, errors, and timing predictable enough
  for autonomous agents.
- Teach agents a disciplined discover, inspect, invoke, and verify workflow
  instead of shipping a static command list.
- Package the result as a small, independently installable open-source project
  with unit, integration, and protocol-level tests.

**Non-Goals:**

- Do not create individual MCP tools for Org, Dired, lsp-bridge, Magit, or other
  Emacs features.
- Do not offer a restricted Elisp sandbox or claim that arbitrary evaluation
  can be made safe for untrusted callers.
- Do not expose HTTP, WebSocket, TCP, or remote multi-user transport in v0.1.
- Do not start, restart, configure, or supervise Emacs.
- Do not emulate interactive minibuffer sessions or synthesize GUI input.
- Do not guarantee interruption of Lisp already running in Emacs when the
  client-side timeout expires.
- Do not add an Emacs Lisp helper or asynchronous operation registry in v0.1;
  reconsider those only after the core protocol is stable.
- Do not add a native Pi extension in v0.1; first validate the MCP server
  through the existing Pi MCP adapter.
- Do not implement transaction semantics, mutation classification, or a
  server-side concurrency scheduler.

## Decisions

### D1: Publish one Node package with a binary and reusable exports

The repository will be an ESM TypeScript package on Node.js 20 or newer.  It
will expose:

- an `emacs-runtime-mcp` stdio executable;
- a typed evaluation core used by the executable and tests;
- `skills/emacs-live/SKILL.md`;
- client configuration examples and security documentation.

The implementation will use the official `@modelcontextprotocol/server` v2
package and the repository's chosen validation library.  One package avoids a
workspace and release process before the codebase needs that complexity.
Only deliberate public entrypoints will appear in package exports.

Alternatives considered:

- An Emacs-only package cannot present a standard MCP stdio process to clients.
- A Python server is viable, but TypeScript aligns with the official SDK and
  keeps the protocol and process boundaries typed.
- Adding a Pi entrypoint now would duplicate a path that an existing Pi MCP
  adapter may already cover.

### D2: Keep `emacs_eval` as the only public tool

The MCP server registers only `emacs_eval` with this input shape:

- `expression: string` (required);
- `timeout_ms: integer` (optional);
- `max_output_chars: integer` (optional).

Initial defaults are 10 seconds and 65,536 returned characters.  The supported
ranges are 100-120,000 milliseconds, 1-262,144 output characters, and at most
262,144 input characters.  These values are constants exported by the core so
the MCP adapter, CLI help, and tests cannot drift.

The MCP definition includes an output schema.  For broad client compatibility,
the adapter returns the same envelope as structured content and as serialized
JSON in a text content item.  Adding another MCP tool requires a future
specification change, not an implementation convenience.

Alternatives considered:

- One tool per Emacs command has unacceptable schema growth and cannot cover
  user-defined or dynamically loaded behavior.
- Separate `discover`, `context`, and `invoke` tools would be friendlier but
  make an artificial protocol layer that duplicates Lisp functions and creates
  pressure for further specialized tools.
- A free-form shell tool is less portable, harder to classify, and expands the
  security boundary beyond Emacs.

### D3: Use `emacsclient` as an argument-vector subprocess

The core invokes `emacsclient` with `execFile` or `spawn`, passing every option
and evaluation form as an argument array.  It never builds a shell command.
The executable defaults to `emacsclient` and can be overridden at MCP process
startup for testing or nonstandard installations.

Server selection is process configuration, not a per-call field:

- no selector uses the default Emacs server;
- `--socket-name` / `EMACS_RUNTIME_MCP_SOCKET_NAME` selects a server socket or
  server name;
- `--server-file` / `EMACS_RUNTIME_MCP_SERVER_FILE` selects an explicit server
  file;
- the two explicit selectors are mutually exclusive.

The invocation always includes `--alternate-editor=false`, so a connection
failure becomes a classified error rather than starting another Emacs.  The
MCP process is therefore a client of runtime state, not its lifecycle owner.

Alternatives considered:

- Direct socket protocol implementation would couple the project to an
  internal Emacs protocol and duplicate `emacsclient`.
- A preflight connectivity probe introduces a probe/evaluate race.  The actual
  evaluation call is the source of truth.
- Passing the server selector on every tool call adds schema noise and permits
  accidental cross-runtime operations within one client session.

### D4: Transport the expression as data and return a base64 JSON envelope

Before invoking Emacs, Node validates field types, empty input, input length,
and numeric ranges, then base64-encodes the UTF-8 expression.  Node does not
parse Emacs Lisp.  The generated wrapper contains the encoded payload and
numeric limits, not raw caller text.  Inside Emacs the wrapper:

1. decodes the expression;
2. uses `read-from-string` and returns `invalid_expression` for unreadable input
   or trailing non-whitespace content after the first form;
3. evaluates the single form in the live runtime;
4. prints the value with `prin1-to-string`;
5. truncates the printed value by Emacs character count when required;
6. catches ordinary Lisp conditions with `condition-case`;
7. JSON-serializes the success or error payload and base64-encodes it.

`emacsclient --eval` prints the returned base64 string as a quoted Lisp string.
Because the payload alphabet is ASCII and requires no escaping, Node can
validate the outer quotes, decode the payload, parse JSON, and then append
`elapsed_ms`.  This avoids writing an Elisp parser in Node and avoids ambiguity
between diagnostic text and a successful value.

The success envelope is:

```json
{
  "ok": true,
  "value": "(printed Emacs Lisp value)",
  "truncated": false,
  "original_chars": 26,
  "elapsed_ms": 4
}
```

The failure envelope is:

```json
{
  "ok": false,
  "error": {
    "code": "elisp_error",
    "message": "Readable summary",
    "data": {}
  },
  "elapsed_ms": 4
}
```

The core owns stable codes: `invalid_request`, `invalid_expression`,
`emacs_unavailable`, `elisp_error`, `evaluation_timeout`,
`output_too_large`, `bridge_protocol_error`, and `internal_error`.
Error `data` is optional and must not be required for client control flow.
`original_chars` is present on every success.  `max_output_chars` applies only
to `value`, not to the fixed JSON envelope or metadata.  The count is Emacs
`length` on the non-unibyte string produced by `prin1-to-string`: it counts
Emacs characters, not UTF-8 bytes or user-perceived grapheme clusters.

The MCP adapter sets `isError: true` whenever the core envelope has
`ok: false`; successful results omit `isError` or set it to `false`.
Structured content and the compatibility JSON text item carry the same
envelope.

Alternatives considered:

- Returning raw `emacsclient` stdout makes errors and values difficult to
  distinguish and gives no reliable truncation metadata.
- Parsing arbitrary printed Lisp in Node adds a parser only to recover a value
  that can remain a string.
- Requiring the helper library for an envelope makes the basic server fail
  against stock Emacs and user configurations that have not installed it.

### D5: Bound output in both Emacs and Node

Normal result truncation happens inside Emacs before JSON and base64 encoding,
so large printed values do not cross the subprocess pipe.  Node also enforces a
fixed 1 MiB stdout/stderr transport ceiling to contain malformed wrappers,
unexpected diagnostics, or incompatible clients.  Crossing that hard ceiling
terminates the client process and returns `output_too_large`.

This is a transport and agent-context bound, not an Emacs memory bound.
`prin1-to-string` constructs the complete intermediate string before
truncation, so a caller can still consume substantial Emacs memory by printing
a large object.  v0.1 documents this limitation rather than introducing a
custom bounded Lisp printer with different printing semantics.

The timeout starts immediately before spawning `emacsclient`.  On expiry Node
sends termination to the child, escalates if needed, and returns
`evaluation_timeout`.  Documentation and error text explicitly warn that this
only bounds the MCP request: Emacs may continue code that it already started.
After a timeout, the runtime and affected data are treated as unknown until a
fresh health and relevant-state probe succeeds.  The Skill directs agents not
to issue parallel mutating evaluations against one runtime.  This is an agent
discipline, not a server lock: the server cannot reliably classify arbitrary
Lisp as read-only or mutating.

Alternatives considered:

- Node-only truncation allows an arbitrarily large value to be formatted and
  transferred first.
- Running evaluation on an Emacs worker thread is not generally available for
  arbitrary editor operations and would violate normal Emacs thread rules.
- Pretending process termination cancels server-side evaluation would create a
  false safety guarantee.

### D6: Treat discovery as agent procedure, not protocol surface

The `emacs-live` Skill will teach a short loop:

1. inspect live context such as selected window, current buffer, major/minor
   modes, project, and loaded features;
2. search candidates with Emacs facilities such as `apropos-internal`,
   `commandp`, `documentation`, `help-function-arglist`, `interactive-form`,
   `symbol-file`, `where-is-internal`, and mode maps;
3. use targeted repository search when custom configuration or package source
   is the authority;
4. inspect prompting, side effects, and asynchronous behavior;
5. avoid parallel mutations against the same runtime;
6. invoke with explicit arguments and explicit buffer/window context;
7. query state again to verify the postcondition, and always re-probe after a
   timeout before another mutation.

The Skill includes compact reusable query patterns, but not an inventory of
domain commands.  This lets installed packages and private functions become
available immediately without schema regeneration.

Alternatives considered:

- A generated symbol index becomes stale, consumes context, and still lacks
  runtime state.
- A maintained command allowlist conflicts with the goal of a general trusted
  local runtime bridge.
- Blindly invoking interactive commands can wait forever in a minibuffer or
  depend on transient UI state.

### D7: Test layers separately, then exercise a real isolated Emacs

Unit tests use a fake `emacsclient` executable to cover exact argv, server
selection, no-shell behavior, validation, timeout, output ceilings, envelope
decoding, error mapping, and MCP result mapping.

Integration tests start `emacs -Q --daemon=mcp-test` with an isolated temporary
home and server directory, then exercise:

- primitive and Unicode values;
- live state persistence across calls;
- read errors and signaled errors;
- deterministic truncation;
- explicit server selection;
- unavailable-server behavior without daemon creation.

An MCP Inspector smoke test lists tools and invokes `emacs_eval`.  CI runs
format, typecheck, unit tests, package-content checks, and supported integration
tests.  Tests never connect to the developer's default Emacs server.

## Risks / Trade-offs

- [A trusted client can execute destructive code with the user's permissions] →
  State this prominently, keep v0.1 local and stdio-only, and do not claim a
  sandbox or expose a network listener.
- [An expression can freeze the live Emacs UI] → Default to a short timeout,
  teach preflight inspection, avoid unattended interactive commands, and
  document that client termination is not server-side cancellation; after a
  timeout, require state re-probing before another mutation.
- [A large printed value can exhaust memory before truncation] → Describe the
  limit as a transport/context bound and advise targeted expressions; do not
  claim memory isolation or add a semantics-changing printer in v0.1.
- [Current-buffer and selected-window state can be ambiguous] → Do not promise
  implicit GUI focus; require expressions to select buffers and windows
  explicitly when correctness depends on context.
- [Printed Lisp values are less convenient than arbitrary JSON conversion] →
  Preserve every printable Emacs value consistently; reconsider generic
  structure helpers only after v0.1 usage demonstrates the need.
- [Emacs or `emacsclient` versions can format errors differently] → Catch
  ordinary Lisp errors inside the wrapper and use fixture plus real-runtime
  compatibility tests for transport failures.
- [The package name may be unavailable on npm] → Verify availability before the
  first release and use an organization scope without changing the GitHub
  project or executable name if necessary.

## Migration Plan

1. Create the standalone repository and move this OpenSpec change into it
   before writing product code.
2. Initialize the Node/TypeScript package and minimal CI in that repository.
3. Implement and unit-test the evaluation core, wrapper protocol, limits, and
   classified errors using a fake executable.
4. Add the one-tool MCP stdio adapter and verify it with MCP Inspector.
5. Add isolated real-Emacs integration tests and establish the supported
   Node/Emacs matrix.
6. Add the `emacs-live` Skill, security guidance, generic client examples, and
   package dry-run validation.
7. Validate the MCP server through the existing Pi MCP adapter and record
   whether any gap justifies a later native adapter.
8. Test the release candidate against the user's live Emacs configuration
   before deciding whether to publish v0.1.

Rollback is configuration-only: stop the MCP process, remove the MCP client
entry, and uninstall the package.  The server creates no daemon, database,
persistent runtime state, or automatic Emacs configuration changes.

## Open Questions

- Is the unscoped npm name `emacs-runtime-mcp` available at release time, or
  should publication use an organization scope while retaining the executable
  and repository name?
