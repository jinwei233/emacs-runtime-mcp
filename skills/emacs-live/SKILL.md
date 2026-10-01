---
name: emacs-live
description: Operates a trusted local live Emacs through emacs_eval. Use for runtime inspection, capability discovery, and verified Emacs changes. Do not use with untrusted clients. For org-roam note recording, resolve the roam directory at runtime and read its AGENTS.md conventions first.
---

# Emacs Live

Use `emacs_eval` as the only bridge to an already-running Emacs server. Treat every expression
as code execution with the permissions of Emacs and the local user.

## Workflow

1. **Inspect** the relevant live state before choosing an operation. For org-roam note recording,
   read the roam directory's `AGENTS.md` conventions first (see below).
2. **Discover** candidate symbols through runtime introspection. Search configuration or package
   source only when runtime evidence is insufficient.
3. **Review** the candidate's arguments, interactive form, source, side effects, and asynchronous
   behavior.
4. **Invoke** one explicit expression with explicit buffer and window targets.
5. **Verify** the postcondition with a separate read-only expression.

Do not issue parallel mutating evaluations against the same Emacs runtime.

## Inspect Live Context

Query only the context relevant to the task. Do not assume the current buffer matches the selected
GUI window.

```elisp
(let* ((window (selected-window))
       (buffer (window-buffer window)))
  (with-current-buffer buffer
    (list :window (window-parameter window 'window-id)
          :buffer (buffer-name)
          :file buffer-file-name
          :point (point)
          :major-mode major-mode
          :minor-modes
          (delq nil
                (mapcar (lambda (entry)
                          (when (and (boundp (car entry))
                                     (symbol-value (car entry)))
                            (car entry)))
                        minor-mode-alist)))))
```

For project context:

```elisp
(when (fboundp 'project-current)
  (when-let ((project (project-current nil)))
    (project-root project)))
```

For loaded capabilities:

```elisp
(list :feature-loaded (featurep 'FEATURE)
      :function-defined (fboundp 'FUNCTION)
      :variable-defined (boundp 'VARIABLE))
```

## Org-Roam Notes: Read Repository Conventions First

When the task records notes into org-roam (capture, create, edit, link, or index), resolve the
roam directory at runtime and load the repository conventions before touching any note. Never
hardcode `~/roam` or any other fixed path.

1. **Resolve** the directory and probe for `AGENTS.md` in one read-only expression:

   ```elisp
   (let* ((dir (when (boundp 'org-roam-directory)
                 (expand-file-name org-roam-directory)))
          (agents (and dir (expand-file-name "AGENTS.md" dir))))
     (list :feature-loaded (featurep 'org-roam)
           :roam-directory dir
           :agents-file agents
           :agents-exists (and agents (file-readable-p agents))))
   ```

   If `org-roam-directory` is unbound and the feature is not loaded, run `(require 'org-roam nil t)`
   once, then re-probe. Only if org-roam itself is unavailable, ask the user where the notes live.

2. **Read** the returned `AGENTS.md` path completely with a plain file read (not `emacs_eval`)
   before creating or modifying any note. Follow its conventions for naming, templates, link
   targets, escaping, and database sync. If no `AGENTS.md` exists, proceed with the generic
   workflow.

3. **Re-resolve** the directory per task instead of reusing a previously observed path; the
   directory variable may point elsewhere for different sessions or worktrees.

The pattern generalizes: whenever a working directory may carry its own conventions file
(`AGENTS.md` or similar), resolve the directory at runtime, read the file when present, and
follow it instead of assuming a hardcoded path or generic defaults.

## Discover And Review

Search commands or functions by a narrow pattern:

```elisp
(mapcar #'symbol-name (apropos-internal "PATTERN" #'fboundp))
```

Restrict the search to interactive commands when appropriate:

```elisp
(mapcar #'symbol-name (apropos-internal "PATTERN" #'commandp))
```

Inspect a candidate before calling it:

```elisp
(let ((symbol 'CANDIDATE))
  (list :documentation (documentation symbol t)
        :arguments (help-function-arglist symbol t)
        :interactive (interactive-form symbol)
        :source (symbol-file symbol 'defun)
        :bindings (where-is-internal symbol nil nil)))
```

Inspect a key binding in a known map:

```elisp
(lookup-key MODE-MAP (kbd "KEY"))
```

Inspect loaded features without returning the entire list:

```elisp
(delq nil
      (mapcar (lambda (feature)
                (when (string-match-p "PATTERN" (symbol-name feature))
                  feature))
              features))
```

When a user-defined function or package behavior remains unclear, search the smallest relevant
configuration or source tree with a code-search tool such as `rg`. Confirm the discovered file
against `symbol-file` or the live function definition before invocation.

## Invoke Safely

Do not call an interactive command blindly. If `interactive-form` prompts through the minibuffer,
pass explicit non-interactive arguments or call the underlying function. An unattended minibuffer
can block the Emacs main thread.

Select targets in the expression:

```elisp
(with-current-buffer (get-buffer "BUFFER")
  (save-excursion
    (goto-char POSITION)
    (FUNCTION ARGUMENTS)))
```

When the operation depends on a window:

```elisp
(let ((window (get-buffer-window "BUFFER" t)))
  (unless (window-live-p window)
    (error "Target window is not live"))
  (with-selected-window window
    (FUNCTION ARGUMENTS)))
```

Inspect before mutating, mutate once, then verify with a separate expression. Prefer reversible
operations when validating an unfamiliar function.

## Timeout And Failure Rules

An `evaluation_timeout` only means the `emacsclient` request was terminated. Lisp already accepted
by Emacs may still run. After any timeout:

1. Treat runtime and affected state as unknown.
2. Wait only when the operation itself has a known bounded completion time.
3. Run a read-only health probe such as `(+ 1 1)`.
4. Probe every state value relevant to the timed-out operation.
5. Perform no further mutation until those probes succeed.

`max_output_chars` limits the returned printed value, not Emacs memory usage. `prin1-to-string`
still constructs the complete value before truncation. Use targeted queries.

## Security Boundary

`emacs_eval` is arbitrary trusted-local code execution. It is not a sandbox, transaction system,
authorization layer, cancellation boundary, or memory-isolation mechanism. Never expose it to an
untrusted client or network transport.
