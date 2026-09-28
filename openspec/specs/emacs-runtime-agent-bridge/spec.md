# emacs-runtime-agent-bridge Specification

## Purpose
Define a client-neutral bridge that lets trusted local agents evaluate one
Emacs Lisp form in an already-running Emacs server and discover live
capabilities through a single bounded MCP tool.

## Requirements
### Requirement: MCP exposes one general Emacs tool
The MCP server SHALL expose exactly one public tool named `emacs_eval`.
The server MUST NOT generate one tool per Emacs command, package, mode, or
user-defined function.

#### Scenario: Client lists MCP tools
- **WHEN** an MCP client requests the server's tool list
- **THEN** the response SHALL contain `emacs_eval`
- **THEN** the response SHALL contain no additional Emacs command tools

#### Scenario: A newly installed Emacs package adds commands
- **WHEN** the connected Emacs runtime loads a package that defines new commands
- **THEN** the MCP tool list SHALL remain unchanged
- **THEN** the new commands SHALL be reachable through `emacs_eval` and runtime discovery

### Requirement: Evaluation targets an existing local Emacs server
`emacs_eval` SHALL evaluate expressions in an already-running local Emacs
server.  The package SHALL support the default server and explicit local
server selection, and MUST NOT start Emacs or a new daemon when the selected
server is unavailable.

#### Scenario: Evaluate against the default server
- **WHEN** the MCP server has no explicit server selector and the default Emacs server is reachable
- **THEN** `emacs_eval` SHALL execute in that server's live runtime
- **THEN** the expression SHALL be able to observe its loaded packages, buffers, and user configuration

#### Scenario: Evaluate against an explicitly selected server
- **WHEN** the MCP server is configured with a valid server name or server file
- **THEN** every evaluation SHALL target that selected server
- **THEN** the default server SHALL not receive the expression

#### Scenario: Selected server is unavailable
- **WHEN** `emacsclient` cannot connect to the selected server
- **THEN** `emacs_eval` SHALL return an `emacs_unavailable` failure
- **THEN** the package MUST NOT start a fallback editor or Emacs daemon

### Requirement: Evaluation input is small and deterministic
`emacs_eval` SHALL accept an Emacs Lisp `expression` string and optional
`timeout_ms` and `max_output_chars` limits.  Node SHALL validate field types,
empty input, input length, and numeric ranges before invoking `emacsclient`.
The live Emacs runtime SHALL parse the transported text and require exactly one
readable Emacs Lisp form.

#### Scenario: Evaluate a valid expression
- **WHEN** a caller submits a valid Emacs Lisp form within the configured limits
- **THEN** the selected Emacs runtime SHALL evaluate that form exactly once
- **THEN** the tool SHALL return the printed Emacs Lisp representation of its value

#### Scenario: Reject an invalid request shape
- **WHEN** `expression` is empty, is not a string, exceeds its input limit, or a numeric limit is outside its supported range
- **THEN** the tool SHALL return an `invalid_request` failure
- **THEN** `emacsclient` SHALL not be invoked

#### Scenario: Reject invalid Emacs Lisp
- **WHEN** the transported expression is unreadable or has trailing non-whitespace content after its first form
- **THEN** Emacs SHALL reject it before evaluating the form
- **THEN** the tool SHALL return an `invalid_expression` failure

### Requirement: Results use a bounded structured envelope
Every tool result SHALL use a stable structured envelope.  Successful results
SHALL contain `ok: true`, `value`, `truncated`, `original_chars`, and
`elapsed_ms`.  Failed results SHALL contain `ok: false`, an error object with
stable `code` and human-readable `message` fields, and `elapsed_ms`.
`max_output_chars` SHALL limit only the `value` field; fixed envelope and
metadata overhead are outside that limit.  Character counts SHALL use Emacs
string characters after `prin1-to-string`, not UTF-8 bytes or user-perceived
grapheme clusters.

#### Scenario: Evaluation succeeds within the output limit
- **WHEN** the printed value fits within `max_output_chars`
- **THEN** the result SHALL contain the complete value
- **THEN** `truncated` SHALL be `false`
- **THEN** `original_chars` SHALL contain the untruncated character count

#### Scenario: Evaluation value exceeds the output limit
- **WHEN** the printed value exceeds `max_output_chars`
- **THEN** the returned value SHALL be truncated deterministically at the limit
- **THEN** `truncated` SHALL be `true`
- **THEN** the response SHALL report the original character count

#### Scenario: Count a Unicode printed value
- **WHEN** a printed value contains multibyte, combining, variation-selector, or joined emoji characters
- **THEN** truncation and `original_chars` SHALL use Emacs string-character counts
- **THEN** the count SHALL not be calculated from UTF-8 byte length or grapheme clusters

#### Scenario: Transport output exceeds its hard safety limit
- **WHEN** `emacsclient` produces output that cannot be decoded within the implementation's fixed transport bound
- **THEN** the tool SHALL stop collecting output
- **THEN** the tool SHALL return an `output_too_large` failure

#### Scenario: A value is expensive to print
- **WHEN** `prin1-to-string` constructs a large intermediate string before value truncation
- **THEN** the documented output limit SHALL be described as a transport and agent-context bound
- **THEN** the project MUST NOT claim that the limit protects Emacs memory

### Requirement: Failures are classified without corrupting MCP transport
The server SHALL classify invalid requests, unavailable servers, Emacs Lisp
errors, timeouts, oversized output, malformed bridge responses, and internal
failures with distinct stable error codes.  Expected tool failures MUST be
returned as tool results and MUST NOT write protocol-invalid content to MCP
stdout.

#### Scenario: MCP maps a successful envelope
- **WHEN** the core returns `ok: true`
- **THEN** the MCP tool result SHALL omit `isError` or set it to `false`

#### Scenario: MCP maps a failed envelope
- **WHEN** the core returns `ok: false`
- **THEN** the MCP tool result SHALL set `isError` to `true`
- **THEN** structured content and JSON text content SHALL contain the same failure envelope

#### Scenario: Emacs Lisp signals an error
- **WHEN** the evaluated form signals an Emacs Lisp error
- **THEN** the tool SHALL return an `elisp_error` failure
- **THEN** the error SHALL include the Emacs error symbol and a readable message when available

#### Scenario: Evaluation exceeds its timeout
- **WHEN** the `emacsclient` request does not complete within `timeout_ms`
- **THEN** the client process SHALL be terminated
- **THEN** the tool SHALL return an `evaluation_timeout` failure
- **THEN** the documentation SHALL state that terminating `emacsclient` cannot guarantee cancellation of code already executing inside Emacs

#### Scenario: Continue after an evaluation timeout
- **WHEN** a request times out
- **THEN** the affected runtime state SHALL be treated as unknown
- **THEN** the agent guidance SHALL require a fresh health and relevant-state probe before another mutation

#### Scenario: Server emits diagnostics
- **WHEN** the MCP process logs startup, request, or diagnostic information
- **THEN** the information SHALL be written to stderr
- **THEN** stdout SHALL remain reserved for MCP JSON-RPC traffic

### Requirement: Process execution does not introduce shell interpretation
The Node.js bridge SHALL invoke `emacsclient` with an executable-and-argument
API and MUST NOT concatenate caller input into a shell command.  The generated
Emacs Lisp bridge wrapper SHALL preserve the caller expression as data until
the live Emacs reader parses it.

#### Scenario: Expression contains shell metacharacters
- **WHEN** an expression contains quotes, dollar signs, semicolons, newlines, or command-substitution syntax
- **THEN** those characters SHALL be passed as an `emacsclient` argument
- **THEN** no shell SHALL interpret them

#### Scenario: Emacs cannot read the transported expression
- **WHEN** the live Emacs runtime decodes the transport but cannot read exactly one expression
- **THEN** the tool SHALL return an `invalid_expression` failure
- **THEN** no partial result SHALL be reported as success

#### Scenario: Node cannot decode the bridge response
- **WHEN** the `emacsclient` result is not a valid encoded bridge envelope
- **THEN** the tool SHALL return a `bridge_protocol_error` failure
- **THEN** no partial result SHALL be reported as success

### Requirement: Agents discover capabilities at runtime
The project SHALL include an `emacs-live` agent Skill that directs agents to
discover relevant symbols through Emacs introspection and targeted
configuration-source search.  The Skill MUST NOT carry a comprehensive or
generated catalog of Emacs commands.

#### Scenario: Agent needs an unfamiliar operation
- **WHEN** an agent does not know which Emacs function implements an operation
- **THEN** the Skill SHALL direct it to query facilities such as apropos, documentation, interactive forms, symbol files, active modes, and key bindings through `emacs_eval`
- **THEN** the Skill SHALL direct it to search the user's configuration source when runtime introspection is insufficient

#### Scenario: Candidate function is interactive
- **WHEN** discovery finds a command whose interactive form prompts through the minibuffer
- **THEN** the Skill SHALL direct the agent to inspect its signature and implementation before invocation
- **THEN** the agent SHALL supply explicit non-interactive arguments or call an underlying function instead of blocking on unattended input

#### Scenario: Agent prepares a mutation
- **WHEN** an agent intends to edit buffers, files, windows, or runtime state
- **THEN** the Skill SHALL direct it to inspect the target and relevant state first
- **THEN** the Skill SHALL direct it not to issue parallel mutating evaluations against the same runtime
- **THEN** the Skill SHALL direct it to verify the postcondition after evaluation

### Requirement: Distribution is standalone and client-neutral
The GitHub project SHALL be installable independently of a user's Emacs
configuration repository.  It SHALL provide a stdio executable, example client
configurations, and an explicit supported runtime matrix.

#### Scenario: Install into an arbitrary Emacs setup
- **WHEN** a user with a supported Node.js version, `emacsclient`, and a running local Emacs server installs the package
- **THEN** the MCP executable SHALL run without depending on this source Emacs configuration
- **THEN** ordinary `emacs_eval` requests SHALL require no Emacs Lisp helper library

#### Scenario: Configure another MCP client
- **WHEN** a client can launch a local stdio MCP server
- **THEN** the documentation SHALL provide a command and arguments that start `emacs-runtime-mcp`
- **THEN** no client-specific adapter SHALL be required

### Requirement: Arbitrary evaluation is an explicit trusted-local boundary
The project SHALL describe `emacs_eval` as arbitrary code execution with the
permissions of the Emacs process and user account.  The initial release SHALL
support local stdio clients only and MUST NOT advertise sandboxing, access
control, or safe exposure over a network.

#### Scenario: User reviews installation guidance
- **WHEN** the user reads the README or package metadata before enabling the server
- **THEN** a prominent security section SHALL state that a connected client can read, modify, or delete user-accessible data and control Emacs
- **THEN** the guidance SHALL restrict use to trusted local clients

#### Scenario: Server starts in the initial release
- **WHEN** the MCP server starts normally
- **THEN** it SHALL use stdio transport
- **THEN** it SHALL not listen on an HTTP, WebSocket, or raw TCP port
