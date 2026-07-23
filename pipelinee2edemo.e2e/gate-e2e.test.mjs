import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { runGate } from "./gate-e2e.mjs";

async function writeScenario(fileName, kind) {
  const scenarioPath = new URL(`./reports/${fileName}`, import.meta.url);
  await mkdir(new URL("./reports/", import.meta.url), { recursive: true });
  await writeFile(
    scenarioPath,
    `${JSON.stringify({ kind }, null, 2)}\n`,
  );
  return scenarioPath;
}

test("beta reports only the essential test", async () => {
  const outputPath = "reports/beta.json";
  const scenarioPath = await writeScenario("beta-scenario.json", "pass");
  try {
    const report = await runGate({
      commitId: "a".repeat(40),
      environmentId: "beta",
      executionId: "attempt-1",
      log: () => {},
      outputPath,
      scenarioPath,
      stageName: "gate_beta_e2e",
    });
    assert.deepEqual(
      report.tests.map((entry) => entry.testId),
      ["fixture.artifact-identity"],
    );
    assert.equal(report.setup.status, "passed");
    assert.equal(report.execution.shards.length, 1);
    assert.equal(report.cleanup.status, "passed");
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), report);
  } finally {
    await Promise.all([
      rm(outputPath, { force: true }),
      rm(scenarioPath, { force: true }),
    ]);
  }
});

test("prod reports the full manifest", async () => {
  const outputPath = "reports/prod.json";
  const scenarioPath = await writeScenario("prod-scenario.json", "pass");
  try {
    const report = await runGate({
      commitId: "b".repeat(40),
      environmentId: "prod",
      executionId: "attempt-2",
      log: () => {},
      outputPath,
      scenarioPath,
      plan: {
        shards: [{
          mode: "parallel",
          shardId: "parallel-0",
          testIds: ["fixture.artifact-identity"],
        }, {
          mode: "serial",
          shardId: "serial-0",
          testIds: ["fixture.environment-stage"],
        }],
      },
      stageName: "gate_prod_e2e",
    });
    assert.deepEqual(
      report.tests.map((entry) => entry.testId),
      ["fixture.artifact-identity", "fixture.environment-stage"],
    );
    assert.deepEqual(
      report.execution.shards.map(({ mode, shardId, testIds }) => ({
        mode,
        shardId,
        testIds,
      })),
      [{
        mode: "parallel",
        shardId: "parallel-0",
        testIds: ["fixture.artifact-identity"],
      }, {
        mode: "serial",
        shardId: "serial-0",
        testIds: ["fixture.environment-stage"],
      }],
    );
  } finally {
    await Promise.all([
      rm(outputPath, { force: true }),
      rm(scenarioPath, { force: true }),
    ]);
  }
});

test("controlled beta failure writes canonical evidence before throwing", async () => {
  const outputPath = "reports/failure.json";
  const scenarioPath = await writeScenario(
    "failure-scenario.json",
    "fail-beta-gate",
  );
  try {
    await assert.rejects(
      runGate({
        commitId: "c".repeat(40),
        environmentId: "beta",
        executionId: "attempt-3",
        log: () => {},
        outputPath,
        scenarioPath,
        stageName: "gate_beta_e2e",
      }),
      /Controlled beta Gate failure/,
    );
    const report = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(report.tests[0].status, "failed");
    assert.equal(report.execution.shards[0].status, "failed");
    assert.equal(report.cleanup.status, "passed");
  } finally {
    await Promise.all([
      rm(outputPath, { force: true }),
      rm(scenarioPath, { force: true }),
    ]);
  }
});

test("reads the runner plan and rejects invalid assignments", async () => {
  const planPath = "reports/plan.json";
  const outputPath = "reports/planned.json";
  const scenarioPath = await writeScenario("planned-scenario.json", "pass");
  await writeFile(planPath, `${JSON.stringify({
    shards: [{
      mode: "serial",
      shardId: "serial-0",
      testIds: [
        "fixture.artifact-identity",
        "fixture.environment-stage",
      ],
    }],
  }, null, 2)}\n`);
  try {
    const report = await runGate({
      commitId: "d".repeat(40),
      environmentId: "prod",
      executionId: "attempt-4",
      log: () => {},
      outputPath,
      planPath,
      scenarioPath,
      stageName: "gate_prod_e2e",
    });
    assert.equal(report.execution.shards[0].mode, "serial");
    await assert.rejects(
      runGate({
        commitId: "e".repeat(40),
        environmentId: "prod",
        executionId: "attempt-5",
        log: () => {},
        outputPath,
        scenarioPath,
        plan: {
          shards: [{
            mode: "parallel",
            shardId: "parallel-0",
            testIds: ["fixture.unknown"],
          }],
        },
        stageName: "gate_prod_e2e",
      }),
      /unknown test/,
    );
  } finally {
    await Promise.all([
      rm(planPath, { force: true }),
      rm(outputPath, { force: true }),
      rm(scenarioPath, { force: true }),
    ]);
  }
});
