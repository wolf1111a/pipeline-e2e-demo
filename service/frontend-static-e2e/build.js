const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.join(__dirname, "dist");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "index.html"),
  [
    "<!doctype html>",
    "<html>",
    "<head><meta charset=\"utf-8\"><title>Pipeline Frontend E2E</title></head>",
    "<body>",
    "<main id=\"app\">pipeline-platform-frontend-static-e2e-20260626</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(outputDir, "version.json"),
  JSON.stringify({
    service: "pipeline-platform-frontend-static-e2e",
    version: "frontend-static-e2e-20260626",
  }, null, 2) + "\n",
);
