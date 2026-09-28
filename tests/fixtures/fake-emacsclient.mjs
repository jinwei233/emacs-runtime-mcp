#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const wrapper = args.at(-1) ?? "";
const encodedExpression = /base64-decode-string "([A-Za-z0-9+/]+={0,2})"/.exec(wrapper)?.[1];
const expression = encodedExpression
  ? Buffer.from(encodedExpression, "base64").toString("utf8")
  : "";

function respond(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  process.stdout.write(`${JSON.stringify(encoded)}\n`);
}

if (expression === "FAKE_CONNECTION_FAILURE") {
  process.stderr.write("Cannot connect to Emacs server: connection refused\n");
  process.exitCode = 1;
} else if (expression === "FAKE_TIMEOUT") {
  await new Promise((resolve) => setTimeout(resolve, 60_000));
} else if (expression === "FAKE_MALFORMED") {
  process.stdout.write("not-a-bridge-response\n");
} else if (expression === "FAKE_EXCESSIVE") {
  process.stdout.on("error", () => process.exit(0));
  process.stdout.write("x".repeat(2 * 1024 * 1024));
} else if (expression.startsWith("FAKE_RESPONSE:")) {
  const payload = JSON.parse(
    Buffer.from(expression.slice("FAKE_RESPONSE:".length), "base64").toString("utf8"),
  );
  respond(payload);
} else if (expression.startsWith("FAKE_RECORD:")) {
  const recordPath = Buffer.from(expression.slice("FAKE_RECORD:".length), "base64").toString(
    "utf8",
  );
  await writeFile(recordPath, JSON.stringify(args), "utf8");
  respond({
    ok: true,
    value: "nil",
    truncated: false,
    original_chars: 3,
  });
} else {
  respond({
    ok: true,
    value: "nil",
    truncated: false,
    original_chars: 3,
  });
}
