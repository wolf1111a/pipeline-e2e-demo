const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { handler } = require("./index.js");

const markerPath = path.join(
  __dirname,
  "..",
  "pipelinee2edemo.cdk",
  "e2e-trigger.json",
);
const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
const controlledFailureKind = "build-failure";

function buildFailureEnabled() {
  const secretId = process.env.PIPELINE_SHARED_CONFIG_SECRET_ID;
  if (!secretId) {
    return false;
  }
  try {
    const raw = execFileSync(
      "aws",
      [
        "secretsmanager",
        "get-secret-value",
        "--secret-id",
        secretId,
        "--query",
        "SecretString",
        "--output",
        "text",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(raw).shared?.beta?.["e2e-hold-build"] === "true";
  } catch {
    return false;
  }
}

if (
  marker.kind === controlledFailureKind &&
  buildFailureEnabled()
) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    10_000,
  );
  throw new Error("Controlled Lambda build failure with CDK still running");
}

handler().then((result) => {
  if (result.statusCode !== 200) {
    process.exitCode = 1;
  }
});
