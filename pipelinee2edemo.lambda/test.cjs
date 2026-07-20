const fs = require("node:fs");
const path = require("node:path");
const { handler } = require("./index.js");

const markerPath = path.join(
  __dirname,
  "..",
  "pipelinee2edemo.cdk",
  "e2e-trigger.json",
);
const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));

if (
  marker.kind === "running-sibling-failure" &&
  process.env.PIPELINE_STAGE_ATTEMPT === "1"
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
