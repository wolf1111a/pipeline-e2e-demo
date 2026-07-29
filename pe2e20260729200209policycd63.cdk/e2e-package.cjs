const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const markerPath = path.join(__dirname, "e2e-trigger.json");
const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));

function packageHoldEnabled() {
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
    const projectPath =
      process.env.PIPELINE_SHARED_CONFIG_PROJECT_PATH || "shared";
    const config = JSON.parse(raw);
    const projectConfig = config[projectPath] ??
      (projectPath === "pipeline-e2e-demo" ? config.shared : undefined);
    return projectConfig?.beta?.["e2e-hold-package"] === "true";
  } catch {
    return false;
  }
}

if (
  marker.kind === "package-edge-middle" ||
  marker.kind === "package-edge-latest"
) {
  const deadline = Date.now() + (15 * 60_000);
  while (packageHoldEnabled() && Date.now() < deadline) {
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      5_000,
    );
  }
}
