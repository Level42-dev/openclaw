import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = {
  id?: string;
  if?: string;
  "continue-on-error"?: boolean;
  with?: Record<string, unknown>;
};

type Job = { if?: string; steps?: Step[] };
type Workflow = { env?: Record<string, unknown>; jobs?: Record<string, Job> };

function readWorkflow(path: string): Workflow {
  return parse(readFileSync(path, "utf8")) as Workflow;
}

function expectOptionalAppTokenFallback(workflow: Workflow, jobName: string): void {
  const job = workflow.jobs?.[jobName];
  expect(job, `${jobName} job`).toBeDefined();
  const primary = job?.steps?.find((step) => step.id === "app-token");
  const fallback = job?.steps?.find((step) => step.id === "app-token-fallback");
  expect(primary?.if).toContain("env.HAS_GH_APP_PRIVATE_KEY == 'true'");
  expect(fallback?.if).toContain("env.HAS_GH_APP_PRIVATE_KEY_FALLBACK == 'true'");
  expect(fallback?.["continue-on-error"]).toBe(true);
  const tokenConsumers = (job?.steps ?? []).filter(
    (step) => step.with?.["github-token"] !== undefined || step.with?.["repo-token"] !== undefined,
  );
  expect(tokenConsumers.length).toBeGreaterThan(0);
  for (const step of tokenConsumers) {
    const token = step.with?.["github-token"] ?? step.with?.["repo-token"];
    expect(String(token)).toContain("github.token");
  }
}

describe("ClawTalk fork workflow policy", () => {
  it("falls back to the workflow token when upstream GitHub Apps are absent", () => {
    const autoResponse = readWorkflow(".github/workflows/auto-response.yml");
    expect(autoResponse.env).toMatchObject({
      HAS_GH_APP_PRIVATE_KEY: expect.anything(),
      HAS_GH_APP_PRIVATE_KEY_FALLBACK: expect.anything(),
    });
    expectOptionalAppTokenFallback(autoResponse, "auto-response");

    const labeler = readWorkflow(".github/workflows/labeler.yml");
    expect(labeler.env).toMatchObject({
      HAS_GH_APP_PRIVATE_KEY: expect.anything(),
      HAS_GH_APP_PRIVATE_KEY_FALLBACK: expect.anything(),
    });
    for (const jobName of ["label", "backfill-pr-labels", "label-issues"]) {
      expectOptionalAppTokenFallback(labeler, jobName);
    }
  });

  it("runs scheduled live checks only in the canonical upstream repository", () => {
    const workflow = readWorkflow(".github/workflows/openclaw-scheduled-live-checks.yml");
    for (const jobName of ["live_and_openwebui_checks", "weekly_upgrade_survivors"]) {
      expect(workflow.jobs?.[jobName]?.if).toContain("github.repository == 'openclaw/openclaw'");
    }
  });
});
