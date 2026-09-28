import { z } from "zod";
import {
  ERROR_CODES,
  MAX_EXPRESSION_CHARS,
  MAX_MAX_OUTPUT_CHARS,
  MAX_TIMEOUT_MS,
  MIN_MAX_OUTPUT_CHARS,
  MIN_TIMEOUT_MS,
} from "./contracts.js";

export const emacsEvalInputSchema = z
  .object({
    expression: z
      .string()
      .min(1)
      .max(MAX_EXPRESSION_CHARS)
      .describe("One Emacs Lisp form to evaluate in the live Emacs runtime."),
    timeout_ms: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).optional(),
    max_output_chars: z
      .number()
      .int()
      .min(MIN_MAX_OUTPUT_CHARS)
      .max(MAX_MAX_OUTPUT_CHARS)
      .optional(),
  })
  .strict();

export const bridgeSuccessSchema = z
  .object({
    ok: z.literal(true),
    value: z.string(),
    truncated: z.boolean(),
    original_chars: z.number().int().nonnegative(),
  })
  .strict();

export const bridgeFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string(),
        data: z.record(z.string(), z.json()).optional(),
      })
      .strict(),
  })
  .strict();

export const bridgeResultSchema = z.discriminatedUnion("ok", [
  bridgeSuccessSchema,
  bridgeFailureSchema,
]);

const successSchema = z
  .object({
    ok: z.literal(true),
    value: z.string(),
    truncated: z.boolean(),
    original_chars: z.number().int().nonnegative(),
    elapsed_ms: z.number().nonnegative(),
  })
  .strict();

const failureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string(),
        data: z.record(z.string(), z.json()).optional(),
      })
      .strict(),
    elapsed_ms: z.number().nonnegative(),
  })
  .strict();

export const emacsEvalOutputSchema = z.discriminatedUnion("ok", [successSchema, failureSchema]);
