# emacs-runtime-mcp

A small MCP stdio server that evaluates one Emacs Lisp form in an
already-running Emacs instance. It exposes exactly one tool, `emacs_eval`;
agents discover built-in, package, and user-defined capabilities from the live
runtime instead of loading a generated command catalog.

## Security

**This package provides arbitrary code execution with the permissions of your
Emacs process and user account. Use it only with trusted local MCP clients.**

It is not a sandbox, access-control boundary, transaction system, or safe
network service. A connected client can read, modify, or delete user-accessible
data and control Emacs. A request timeout only terminates `emacsclient`; Lisp
already accepted by Emacs may continue running. Output limits do not prevent
Emacs from constructing a large value in memory.

See [SECURITY.md](SECURITY.md) before enabling the server.

## Requirements

| Component | Supported |
| --- | --- |
| Node.js | 20 or newer |
| Emacs and `emacsclient` | 28 or newer, preferably from the same installation |
| Transport | Local stdio MCP |
| Platform | macOS and Linux |

The server never starts Emacs. Start a daemon yourself (`emacs --daemon`) or
enable `server-mode` in the Emacs instance you want to control.

## Install

From npm after a release:

```sh
npm install --global emacs-runtime-mcp
```

From a source checkout:

```sh
pnpm install
pnpm build
node dist/cli.js --help
```

## MCP Client Configuration

For a global installation:

```json
{
  "mcpServers": {
    "emacs": {
      "command": "emacs-runtime-mcp"
    }
  }
}
```

For a named daemon such as `emacs --daemon=work`:

```json
{
  "mcpServers": {
    "emacs": {
      "command": "emacs-runtime-mcp",
      "args": ["--socket-name", "work"]
    }
  }
}
```

An explicit server file is also supported:

```json
{
  "mcpServers": {
    "emacs": {
      "command": "emacs-runtime-mcp",
      "args": ["--server-file", "/absolute/path/to/server-file"]
    }
  }
}
```

`--socket-name` and `--server-file` are mutually exclusive. Every invocation
passes `--alternate-editor=false`, so an unavailable server fails instead of
starting another editor or daemon.

### Options And Environment

| CLI option | Environment variable | Default |
| --- | --- | --- |
| `--emacsclient PATH` | `EMACS_RUNTIME_MCP_EMACSCLIENT` | `emacsclient` |
| `--socket-name NAME` | `EMACS_RUNTIME_MCP_SOCKET_NAME` | default server |
| `--server-file PATH` | `EMACS_RUNTIME_MCP_SERVER_FILE` | unset |
| `--timeout-ms N` | `EMACS_RUNTIME_MCP_TIMEOUT_MS` | `10000` |
| `--max-output-chars N` | `EMACS_RUNTIME_MCP_MAX_OUTPUT_CHARS` | `65536` |

CLI values override the corresponding environment value. Supplying both kinds
of server selector is a startup error.

## Tool

`emacs_eval` accepts:

```json
{
  "expression": "(list (emacs-version) (buffer-name))",
  "timeout_ms": 10000,
  "max_output_chars": 65536
}
```

`expression` must contain exactly one readable Emacs Lisp form. Node validates
the request shape and numeric limits; the selected Emacs runtime performs Lisp
reading and rejects trailing non-whitespace content before evaluation.

Supported limits:

- `expression`: 1 to 262,144 Unicode code points
- `timeout_ms`: 100 to 120,000
- `max_output_chars`: 1 to 262,144
- combined subprocess stdout/stderr: fixed 1 MiB hard ceiling

The tool returns the `prin1-to-string` representation, not an automatic
JSON conversion of the Lisp value.

### Success

```json
{
  "ok": true,
  "value": "(\"GNU Emacs 31.1\" \"notes.org\")",
  "truncated": false,
  "original_chars": 31,
  "elapsed_ms": 4
}
```

`original_chars` is always present. `max_output_chars` limits only `value`.
Counts use Emacs string characters after printing, not UTF-8 bytes or grapheme
clusters.

### Failure

```json
{
  "ok": false,
  "error": {
    "code": "elisp_error",
    "message": "Symbol's value as variable is void: missing",
    "data": {
      "symbol": "void-variable"
    }
  },
  "elapsed_ms": 3
}
```

Stable codes are `invalid_request`, `invalid_expression`,
`emacs_unavailable`, `elisp_error`, `evaluation_timeout`,
`output_too_large`, `bridge_protocol_error`, and `internal_error`.

MCP results carry the same envelope in `structuredContent` and JSON text
content. Failed envelopes set `isError: true`.

## Agent Discovery Skill

[`skills/emacs-live/SKILL.md`](skills/emacs-live/SKILL.md) teaches agents to:

1. inspect explicit live buffer, window, mode, and project context;
2. discover symbols with Emacs introspection;
3. review signatures, interactive prompts, source, and side effects;
4. invoke one explicit operation;
5. verify its postcondition.

The Skill contains reusable discovery patterns, not a command inventory.

## Troubleshooting

- `emacs_unavailable`: verify the daemon name or server file with
  `emacsclient --alternate-editor=false --socket-name NAME --eval t`.
- `invalid_expression`: submit one form; wrap multiple intended operations in
  `progn`.
- `elisp_error`: inspect `error.data.symbol` and the message, then inspect the
  candidate function and runtime context.
- `evaluation_timeout`: assume runtime state is unknown. Run a read-only health
  probe and inspect relevant state before another mutation.
- `output_too_large`: narrow the query. Increasing `max_output_chars` cannot
  exceed the fixed transport ceiling.
- `bridge_protocol_error`: confirm `emacsclient` and Emacs are compatible and
  that no wrapper output is being modified.

All server diagnostics go to stderr. Stdout is reserved for MCP JSON-RPC.

## Development

```sh
pnpm check
pnpm test:integration
pnpm build
pnpm pack
```

Integration tests create a random named `emacs -Q` daemon with temporary state
and always target it explicitly; they never use the developer's default server.

Licensed under MIT.
