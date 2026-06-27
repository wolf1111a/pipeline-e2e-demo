const fs = require("node:fs");
const path = require("node:path");

const version = "merge-trigger-e2e-20260627T111114Z";
const outputDir = path.join(__dirname, "dist");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "index.html"),
  [
    "<!doctype html>",
    "<html>",
    "<head><meta charset=\"utf-8\"><title>Pipeline Merge Trigger E2E</title></head>",
    "<body>",
    `<main id="app">${version}</main>`,
    "</body>",
    "</html>",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(outputDir, "version.json"),
  JSON.stringify({
    service: "pipeline-platform-merge-trigger-e2e",
    version,
  }, null, 2) + "\n",
);
