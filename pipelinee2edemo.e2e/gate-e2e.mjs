import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const testDefinitions = [{
  labels: ["essential", "smoke"],
  name: "Gate receives the immutable candidate identity",
  testId: "fixture.artifact-identity",
}, {
  labels: ["full", "deployment"],
  name: "Gate runs in the expected environment stage",
  testId: "fixture.environment-stage",
}];

function defaultPlan(environmentId) {
  if (environmentId !== "beta" && environmentId !== "prod") {
    throw new Error(
      `Unsupported Gate environment: ${environmentId || "<unset>"}`,
    );
  }
  const testIds = environmentId === "beta"
    ? ["fixture.artifact-identity"]
    : testDefinitions.map((test) => test.testId);
  return {
    shards: [{
      mode: "parallel",
      shardId: "parallel-0",
      testIds,
    }],
  };
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.shards) || plan.shards.length === 0) {
    throw new Error("PIPELINE_E2E_PLAN_PATH must contain at least one shard");
  }
  const knownTestIds = new Set(testDefinitions.map((test) => test.testId));
  const assignedTestIds = [];
  for (const [index, shard] of plan.shards.entries()) {
    if (
      !shard ||
      (shard.mode !== "parallel" && shard.mode !== "serial") ||
      typeof shard.shardId !== "string" ||
      !Array.isArray(shard.testIds) ||
      shard.testIds.length === 0
    ) {
      throw new Error(`Execution plan shard ${index} is invalid`);
    }
    for (const testId of shard.testIds) {
      if (!knownTestIds.has(testId)) {
        throw new Error(`Execution plan contains unknown test ${testId}`);
      }
      assignedTestIds.push(testId);
    }
  }
  if (new Set(assignedTestIds).size !== assignedTestIds.length) {
    throw new Error("Execution plan assigns a test more than once");
  }
  return plan;
}

async function executeTest(definition, shouldFail) {
  const startedAt = Date.now();
  await Promise.resolve();
  return {
    ...definition,
    durationMs: Date.now() - startedAt,
    status:
      shouldFail && definition.testId === "fixture.artifact-identity"
        ? "failed"
        : "passed",
  };
}

export async function runGate({
  commitId = process.env.PIPELINE_COMMIT_ID,
  environmentId = process.env.PIPELINE_ENVIRONMENT_ID,
  executionId = process.env.PIPELINE_EXECUTION_ID,
  log = console.log,
  outputPath = process.env.PIPELINE_E2E_REPORT_PATH ?? "reports/e2e.json",
  plan,
  planPath = process.env.PIPELINE_E2E_PLAN_PATH,
  scenarioPath = path.join(moduleDir, "scenario.json"),
  stageName = process.env.PIPELINE_STAGE_NAME,
} = {}) {
  if (!executionId || !commitId) {
    throw new Error("PIPELINE_EXECUTION_ID and PIPELINE_COMMIT_ID are required");
  }
  const startedAt = Date.now();
  const setupStartedAt = Date.now();
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
  const shouldFail = environmentId === "beta"
    && scenario.kind === "fail-beta-gate";
  const resolvedPlan = validatePlan(
    plan ?? (planPath
      ? JSON.parse(await readFile(planPath, "utf8"))
      : defaultPlan(environmentId)),
  );
  const setup = {
    durationMs: Date.now() - setupStartedAt,
    status: "passed",
  };
  const definitionsById = new Map(
    testDefinitions.map((definition) => [definition.testId, definition]),
  );
  const executionStartedAt = Date.now();
  const shardResults = await Promise.all(
    resolvedPlan.shards.map(async (shard) => {
      const shardStartedAt = Date.now();
      const tests = [];
      if (shard.mode === "serial") {
        for (const testId of shard.testIds) {
          tests.push(
            await executeTest(definitionsById.get(testId), shouldFail),
          );
        }
      } else {
        tests.push(...await Promise.all(
          shard.testIds.map((testId) =>
            executeTest(definitionsById.get(testId), shouldFail)
          ),
        ));
      }
      return {
        durationMs: Date.now() - shardStartedAt,
        mode: shard.mode,
        shardId: shard.shardId,
        status: tests.every((test) => test.status === "passed")
          ? "passed"
          : "failed",
        testIds: shard.testIds,
        tests,
      };
    }),
  );
  const tests = shardResults.flatMap((shard) => shard.tests);
  const execution = {
    durationMs: Date.now() - executionStartedAt,
    shards: shardResults.map(({ tests: _tests, ...shard }) => shard),
  };
  const cleanupStartedAt = Date.now();
  const cleanup = {
    durationMs: Date.now() - cleanupStartedAt,
    status: "passed",
  };
  const report = {
    cleanup,
    durationMs: Date.now() - startedAt,
    execution,
    format: "pipeline-e2e-v1",
    setup,
    tests,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  const targetDurationSeconds = Number.isSafeInteger(
      resolvedPlan.targetDurationSeconds,
    )
    ? resolvedPlan.targetDurationSeconds
    : undefined;
  log(JSON.stringify({
    cleanupDurationMs: cleanup.durationMs,
    durationMs: report.durationMs,
    eventType: "pipeline.e2e.duration",
    executionDurationMs: execution.durationMs,
    setupDurationMs: setup.durationMs,
    shardCount: execution.shards.length,
    suite: resolvedPlan.suite ?? process.env.PIPELINE_E2E_SUITE ?? "unknown",
    ...(targetDurationSeconds
      ? {
          targetDurationSeconds,
          withinTargetDuration:
            report.durationMs <= targetDurationSeconds * 1_000,
        }
      : {}),
  }));
  if (shouldFail) {
    throw new Error("Controlled beta Gate failure");
  }
  return report;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await runGate();
}
