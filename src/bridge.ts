import { TextDecoder } from "node:util";
import type { BridgeResult } from "./contracts.js";
import { bridgeResultSchema } from "./schemas.js";

const BASE64_RESULT_PATTERN = /^"([A-Za-z0-9+/]+={0,2})"\r?\n?$/;

function failureExpression(code: "invalid_expression" | "elisp_error", errorName: string): string {
  return `(list (cons "ok" :json-false)
              (cons "error"
                    (list (cons "code" "${code}")
                          (cons "message" (error-message-string ${errorName}))
                          (cons "data"
                                (list (cons "symbol"
                                            (symbol-name (car ${errorName}))))))))`;
}

export function encodeExpression(expression: string): string {
  return Buffer.from(expression, "utf8").toString("base64");
}

export function buildBridgeExpression(expression: string, maxOutputChars: number): string {
  const encodedExpression = encodeExpression(expression);
  const invalidExpression = failureExpression("invalid_expression", "read-error");
  const elispError = failureExpression("elisp_error", "eval-error");

  return `(progn
  (require 'json)
  (let* ((source (decode-coding-string
                       (base64-decode-string "${encodedExpression}")
                       'utf-8))
       (max-output ${maxOutputChars})
       (payload
        (condition-case read-error
            (let* ((read-result (read-from-string source))
                   (form (car read-result))
                   (position (cdr read-result)))
              (if (not (string-match-p "\\\\\`[[:space:]]*\\\\'" (substring source position)))
                  (list (cons "ok" :json-false)
                        (cons "error"
                              (list (cons "code" "invalid_expression")
                                    (cons "message"
                                          "Expression must contain exactly one form."))))
                (condition-case eval-error
                    (let* ((printed (prin1-to-string (eval form)))
                           (original-chars (length printed))
                           (truncated (> original-chars max-output)))
                      (list (cons "ok" t)
                            (cons "value"
                                  (if truncated
                                      (substring printed 0 max-output)
                                    printed))
                            (cons "truncated" (if truncated t :json-false))
                            (cons "original_chars" original-chars)))
                  (error ${elispError}))))
          (error ${invalidExpression}))))
  (base64-encode-string
   (encode-coding-string (json-encode payload) 'utf-8)
   t)))`;
}

export function decodeBridgeOutput(stdout: string): BridgeResult {
  const match = BASE64_RESULT_PATTERN.exec(stdout);
  if (!match?.[1]) {
    throw new Error("emacsclient output is not one quoted base64 value.");
  }

  const encoded = match[1];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== encoded) {
    throw new Error("emacsclient returned invalid base64.");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Bridge payload is not valid UTF-8.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Bridge payload is not valid JSON.");
  }

  const result = bridgeResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Bridge payload does not match the result contract.");
  }
  return result.data as BridgeResult;
}
