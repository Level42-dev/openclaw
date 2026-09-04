# ClawTalk OpenClaw 2.x Base Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a current, tested Level42 ClawTalk fork candidate based directly on OpenClaw upstream commit `79e20aa5d1fd83ca0823f7cc5e6d32315fc31781`.

**Architecture:** Keep the Gateway and Talk runtime identical to current upstream unless a focused compatibility test proves a generic missing capability. Re-express only fork-owned GitHub workflow safety policy, document the linear rebuild procedure, and record the disposition of every historical fork commit.

**Tech Stack:** TypeScript, Vitest, GitHub Actions YAML, pnpm 12.1.0, Markdown, Git worktrees

**Spec:** `docs/refactor/clawtalk-openclaw-2-base-refresh.md`

## Global Constraints

- The candidate base is exactly `79e20aa5d1fd83ca0823f7cc5e6d32315fc31781`.
- Keep `clawtalk/base` linear on `upstream/main`; no merge commit may exist above the base.
- Prefer current upstream behavior and configuration over historical fork patches.
- Do not restore removed Talk RPCs for compatibility with existing firmware.
- Do not modify the Voice PE repository during this phase.
- Do not add Voice PE-specific Gateway runtime behavior without a failing generic contract test.
- Do not update `origin/clawtalk/base` without explicit user approval and `--force-with-lease`.
- Deploy and test exact SHAs, never a moving branch tip.

---

### Task 1: Fork-safe GitHub workflows

**Files:**

- Create: `test/scripts/clawtalk-fork-workflows.test.ts`
- Modify: `.github/workflows/auto-response.yml`
- Modify: `.github/workflows/labeler.yml`
- Modify: `.github/workflows/openclaw-scheduled-live-checks.yml`

**Interfaces:**

- Consumes: current upstream GitHub workflow structure and the two optional secrets `GH_APP_PRIVATE_KEY` and `GH_APP_PRIVATE_KEY_FALLBACK`
- Produces: workflows that use App tokens when provisioned, fall back to `github.token` in the Level42 fork, and skip costly scheduled live/provider jobs outside `openclaw/openclaw`

- [x] **Step 1: Write the failing workflow policy test**

Create `test/scripts/clawtalk-fork-workflows.test.ts` with YAML-backed assertions:

```ts
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
```

- [x] **Step 2: Run the test and verify the current upstream workflows fail the fork contract**

Run:

```bash
corepack pnpm exec vitest run --config test/vitest/vitest.tooling.config.ts test/scripts/clawtalk-fork-workflows.test.ts
```

Expected: FAIL because the current workflows neither expose the secret-presence environment flags nor use `github.token`, and the scheduled jobs lack the canonical-repository guard.

- [x] **Step 3: Implement optional GitHub App authentication**

In both `auto-response.yml` and `labeler.yml`, add:

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"
  HAS_GH_APP_PRIVATE_KEY: ${{ secrets.GH_APP_PRIVATE_KEY != '' }}
  HAS_GH_APP_PRIVATE_KEY_FALLBACK: ${{ secrets.GH_APP_PRIVATE_KEY_FALLBACK != '' }}
```

For every `app-token` step add:

```yaml
if: env.HAS_GH_APP_PRIVATE_KEY == 'true'
```

For every `app-token-fallback` step use:

```yaml
if: steps.app-token.outcome != 'success' && env.HAS_GH_APP_PRIVATE_KEY_FALLBACK == 'true'
continue-on-error: true
```

Append `|| github.token` to every `github-token` and `repo-token` expression fed by those two steps. Add `issues: write` to affected labeler jobs where the fallback workflow token performs issue-label writes.

- [x] **Step 4: Restrict scheduled live checks to upstream**

Use these exact job conditions in `.github/workflows/openclaw-scheduled-live-checks.yml`:

```yaml
live_and_openwebui_checks:
  if: >-
    github.event_name == 'workflow_dispatch' ||
    (github.repository == 'openclaw/openclaw' && github.event.schedule == '23 4 * * *')

weekly_upgrade_survivors:
  if: >-
    github.repository == 'openclaw/openclaw' &&
    github.event_name == 'schedule' &&
    github.event.schedule == '41 6 * * 1'
```

- [x] **Step 5: Run focused tests and workflow lint**

Run:

```bash
corepack pnpm exec vitest run --config test/vitest/vitest.tooling.config.ts test/scripts/clawtalk-fork-workflows.test.ts
corepack pnpm check:workflows
```

Expected: the new policy test passes and workflow lint exits successfully.

Host note: this machine lacks `python3-venv`, so `check:workflows` cannot
bootstrap its pre-commit environment. The same gate was completed with the
repository-pinned actionlint revision in an isolated Go container, zizmor
`1.29.0` in its official container, and the remaining repository checks
directly on the host.

- [x] **Step 6: Commit the workflow adaptation**

```bash
git add .github/workflows/auto-response.yml .github/workflows/labeler.yml \
  .github/workflows/openclaw-scheduled-live-checks.yml \
  test/scripts/clawtalk-fork-workflows.test.ts
git commit -m "ci: make upstream automation safe in Level42 fork"
```

### Task 2: Current fork coordination and historical compatibility record

**Files:**

- Create: `docs/PROJECT_COORDINATION.md`
- Create: `docs/refactor/clawtalk-openclaw-2-compatibility.md`

**Interfaces:**

- Consumes: the design spec, upstream/fork remote names, the old head `d2034cc93c44517c0267af78130bd49c86958c67`, and the new base SHA
- Produces: a current operator runbook and an auditable disposition for all 15 historical commits

- [x] **Step 1: Write the coordination runbook**

Create `docs/PROJECT_COORDINATION.md` with OpenClaw doc frontmatter and these enforceable rules:

- canonical fork: `Level42-dev/openclaw`;
- long-lived runtime branch: `clawtalk/base`;
- manual development worktrees live under `/home/openclaw/worktrees/`;
- OpenClaw-managed session worktrees use the configured state-owned `worktreeRoot` and are not used as durable source checkouts;
- refresh from a recorded `upstream/main` SHA using a separate `sync/clawtalk-base-YYYYMMDD` branch;
- rebuild by behavior instead of blindly replaying old commits;
- require a linear history, focused Talk tests, workflow checks, docs checks, compatibility evidence, and a full build;
- push a separate review branch first;
- replace `origin/clawtalk/base` only with explicit approval and `--force-with-lease`;
- install a detached exact reviewed SHA with automatic source updates disabled.

- [x] **Step 2: Record all historical commit dispositions**

Create `docs/refactor/clawtalk-openclaw-2-compatibility.md` with a table containing every commit below exactly once:

| Commit        | Disposition                                                                         |
| ------------- | ----------------------------------------------------------------------------------- |
| `1958de29518` | Superseded by current `talk.session.*` ownership and `talk.event` broadcasting      |
| `b3b371ad0e1` | Superseded; explicit end-turn compatibility is a Voice PE migration question        |
| `1c2f5c3e30a` | Superseded by current provider/session lifecycle                                    |
| `92803f23d3b` | Superseded by current relay race handling                                           |
| `054bdea8dd1` | Superseded by current forced agent-consult/result delivery                          |
| `c640480cde3` | Superseded by current module and relay ownership                                    |
| `9e1eb1fe1a7` | Retained by reimplementation against current workflow structure                     |
| `5d6a6829bf0` | Replaced by the current coordination runbook                                        |
| `ab249fa6782` | Deferred; Gmail/GitHub lane routing is not required by the Voice PE runtime base    |
| `73b9b040b55` | Superseded by current upstream Gateway implementation                               |
| `abc8c9c2826` | Retained by reimplementation against both current scheduled jobs                    |
| `61fc21db60d` | Replaced by the current coordination runbook                                        |
| `c5f4a7a2932` | Excluded; stale TaskFlow cleanup is outside the Voice PE runtime base               |
| `d38e0a4dd94` | Replaced by exact-SHA deployment documentation; no fork branding in upstream README |
| `d2034cc93c4` | Deferred to Voice PE config/migration; no device-family special case in core        |

Also explain that current configuration uses `gateway.nodes.commands.allow`, node command changes require pairing approval, and the existing Voice PE checker still encodes obsolete file paths and `gateway.nodes.allowCommands` assumptions.

- [x] **Step 3: Validate documentation**

Run:

```bash
corepack pnpm docs:list
git diff --check
```

Expected: both commands exit successfully.

- [x] **Step 4: Commit the coordination and compatibility docs**

```bash
git add docs/PROJECT_COORDINATION.md docs/refactor/clawtalk-openclaw-2-compatibility.md
git commit -m "docs: define current ClawTalk fork coordination"
```

### Task 3: Align node.invoke.request builder and public schema

**Files:**

- Create: `src/gateway/node-invoke-request.test.ts`
- Modify: `src/gateway/node-invoke-request.ts`
- Modify: `packages/gateway-protocol/src/schema/nodes.ts`

**Interfaces:**

- Consumes: `buildNodeInvokeRequest(...)` and `NodeInvokeRequestEventSchema`
- Produces: schema-valid parameterless and session-bound node invoke request events without changing authorization or pairing policy

- [x] **Step 1: Write failing generic schema contract tests**

Create `src/gateway/node-invoke-request.test.ts`:

```ts
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { NodeInvokeRequestEventSchema } from "../../packages/gateway-protocol/src/schema/nodes.js";
import { buildNodeInvokeRequest } from "./node-invoke-request.js";

describe("buildNodeInvokeRequest", () => {
  it("omits paramsJSON when an invocation has no params", () => {
    const payload = buildNodeInvokeRequest({
      id: "invoke-1",
      nodeId: "node-1",
      command: "device.status",
      timeoutMs: 30_000,
    });

    expect(payload).not.toHaveProperty("paramsJSON");
    expect(Value.Check(NodeInvokeRequestEventSchema, payload)).toBe(true);
  });

  it("keeps a normalized sessionKey inside the public event schema", () => {
    const payload = buildNodeInvokeRequest({
      id: "invoke-2",
      nodeId: "node-1",
      command: "system.run",
      params: { command: ["echo", "ok"] },
      timeoutMs: 30_000,
      sessionKey: " agent:main:main ",
    });

    expect(payload.sessionKey).toBe("agent:main:main");
    expect(Value.Check(NodeInvokeRequestEventSchema, payload)).toBe(true);
  });
});
```

- [x] **Step 2: Run RED and confirm both mismatches**

Run:

```bash
corepack pnpm exec vitest run --config test/vitest/vitest.gateway.config.ts src/gateway/node-invoke-request.test.ts
```

Expected: the parameterless case fails because `paramsJSON` is `null`, and the
session-bound case fails because the closed event schema lacks `sessionKey`.

- [x] **Step 3: Implement the minimal builder/schema alignment**

In `buildNodeInvokeRequest`, normalize `sessionKey` once and construct optional
fields conditionally:

```ts
const sessionKey = normalizeOptionalString(params.sessionKey);
return {
  id: params.id,
  nodeId: params.nodeId,
  command: params.command,
  ...(params.params === undefined ? {} : { paramsJSON: JSON.stringify(params.params) }),
  timeoutMs: params.timeoutMs,
  idempotencyKey: params.idempotencyKey,
  ...(sessionKey ? { sessionKey } : {}),
};
```

Add the optional field to `NodeInvokeRequestEventSchema`:

```ts
sessionKey: Type.Optional(NonEmptyString),
```

- [x] **Step 4: Run GREEN and focused node invoke regression tests**

Run:

```bash
corepack pnpm exec vitest run --config test/vitest/vitest.gateway.config.ts \
  src/gateway/node-invoke-request.test.ts src/gateway/node-registry.test.ts
```

Expected: both test files pass.

- [x] **Step 5: Commit the generic protocol fix**

```bash
git add src/gateway/node-invoke-request.test.ts src/gateway/node-invoke-request.ts \
  packages/gateway-protocol/src/schema/nodes.ts \
  docs/refactor/clawtalk-openclaw-2-base-refresh.md \
  docs/refactor/clawtalk-openclaw-2-base-refresh-plan.md
git commit -m "fix(gateway): align node invoke requests with schema"
```

### Task 4: Candidate compatibility and runtime validation

**Files:**

- Modify: `docs/refactor/clawtalk-openclaw-2-compatibility.md`

**Interfaces:**

- Consumes: the completed workflow/doc candidate and the existing read-only Voice PE compatibility checker
- Produces: recorded validation evidence separating obsolete checker assumptions from genuine protocol gaps

- [x] **Step 1: Verify the Talk baseline**

Run:

```bash
corepack pnpm exec vitest run --config test/vitest/vitest.gateway.config.ts \
  src/gateway/talk-realtime-relay.test.ts src/gateway/server-methods/talk.test.ts
```

Expected: all focused Talk tests pass.

- [x] **Step 2: Run the existing Voice PE checker read-only**

From `/home/openclaw/src/openclaw-voice-pe`, run:

```bash
node tools/voice-pe-node-diagnostics-compat.mjs \
  --gateway-repo /home/openclaw/worktrees/openclaw-clawtalk-sync-20260904 --json
```

Expected: the checker may fail because it searches superseded Gateway files, requires the old embedded-platform core patch, rejects schema-valid `paramsJSON: null`, and looks for the removed `gateway.nodes.allowCommands` key. Do not modify the Voice PE repository in this phase.

- [x] **Step 3: Record sanitized validation evidence**

Append a validation section to the compatibility report with:

- candidate SHA;
- focused Talk test file/test counts;
- workflow policy test result;
- workflow/docs check result;
- each failed Voice PE checker assertion classified as stale checker, configuration migration, firmware migration, or genuine core gap;
- confirmation that no raw audio, credentials, device identifiers, or private network values were captured.

If a genuine generic core gap appears, stop and amend the design before changing runtime code.

- [x] **Step 4: Run type/build validation**

Run:

```bash
corepack pnpm tsgo:core
NODE_OPTIONS=--max-old-space-size=12288 corepack pnpm build
```

Expected: both commands exit successfully. A runtime-only build is not sufficient for branch replacement; if the full build cannot finish locally, preserve the failure output and require passing CI before replacement.

- [x] **Step 5: Commit validation evidence**

```bash
git add docs/refactor/clawtalk-openclaw-2-compatibility.md
git commit -m "docs: record ClawTalk refresh validation"
```

### Task 5: Final branch integrity and review handoff

**Files:**

- Verify only; no planned file changes

**Interfaces:**

- Consumes: validated candidate branch
- Produces: exact review SHA and a separate remote review branch without modifying `origin/clawtalk/base`

- [x] **Step 1: Verify branch topology and scope**

Run:

```bash
git log --merges --oneline upstream/main..HEAD
git rev-list --left-right --count HEAD...upstream/main
git diff --name-status upstream/main..HEAD
git diff --check upstream/main..HEAD
git status --short --branch
```

Expected: no merge commits, zero uncommitted changes, and only the design/plan, workflow/test, coordination, compatibility, and validation files listed by the plan.

- [x] **Step 2: Re-run the focused release gate**

Run:

```bash
corepack pnpm exec vitest run --config test/vitest/vitest.tooling.config.ts test/scripts/clawtalk-fork-workflows.test.ts
corepack pnpm exec vitest run --config test/vitest/vitest.gateway.config.ts \
  src/gateway/talk-realtime-relay.test.ts src/gateway/server-methods/talk.test.ts
corepack pnpm docs:list
```

Expected: every command exits successfully.

- [ ] **Step 3: Publish only the review branch**

```bash
git push --set-upstream origin sync/clawtalk-base-20260904
```

Record `git rev-parse HEAD` as the candidate SHA. Do not force-push or update `origin/clawtalk/base` in this task.

- [ ] **Step 4: Request explicit branch-replacement approval**

Present the review branch, candidate SHA, old `clawtalk/base` SHA, all gate results, and remaining Voice PE migration items. Wait for explicit approval before running any `git push --force-with-lease` command or installing the candidate as the active Gateway.
