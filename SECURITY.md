# Security

## Trusted-Local Use Only

`emacs_eval` evaluates arbitrary Emacs Lisp in an existing Emacs process. A
connected client receives the same effective access as that Emacs process and
the local user. It can inspect editor state, read credentials visible to Emacs,
modify buffers and files, execute subprocesses, and delete data.

Use this server only with trusted local MCP clients over stdio. Do not expose
it through a network bridge, shared service, untrusted agent, or multi-user
environment.

## Explicit Non-Guarantees

- There is no Lisp sandbox or command allowlist.
- Authentication and authorization are outside this local stdio server.
- Killing `emacsclient` at the request timeout does not guarantee cancellation
  of Lisp already running in Emacs.
- The server does not provide transactions or automatic rollback.
- `max_output_chars` and the transport ceiling protect response size and agent
  context, not Emacs memory. `prin1-to-string` constructs the complete printed
  value before truncation.
- The server does not classify arbitrary expressions as read-only or mutating
  and does not serialize concurrent requests.

After any timeout, treat runtime state as unknown. Probe Emacs health and every
relevant state value before another mutation.

## Reporting

Report vulnerabilities through the repository's private GitHub security
advisory flow. Do not include secrets, private buffer contents, or credentials
in a public issue.
