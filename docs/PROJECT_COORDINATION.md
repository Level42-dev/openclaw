---
summary: "Jarvis fork coordination policy for upstream workflow integrations"
title: "Project coordination"
---

# Project coordination

This repository is the Jarvis fork of OpenClaw. Treat upstream/original OpenClaw
automation paths as optional fork imports unless Jarvis explicitly provisions and
documents equivalent infrastructure.

## GitHub App token paths

Some inherited workflows still contain GitHub App token branches for upstream
automation identities, including the numeric app ids `2729701` and `2971289`.
Those ids are not Jarvis-fork requirements.

Do not ask Bjorn/Jarvis to supply client IDs, private keys, or GitHub App
configuration for these inherited app ids. Both relevant Jarvis accounts were
checked on 2026-06-08 and did not own GitHub Apps for these paths.

For Jarvis-fork operation, use the declared workflow-scoped `github.token`
fallback unless Jarvis intentionally provisions its own GitHub Apps later and
records the new app ownership, client IDs, private-key secret names, and reason
for using app identity instead of `github.token`.

`actions/create-github-app-token` deprecation warnings for skipped upstream app
token branches are non-actionable in the Jarvis fork. They become actionable only
if Jarvis chooses to run those app-token branches with Jarvis-owned apps.

When triaging CI or workflow failures:

- Treat missing `GH_APP_PRIVATE_KEY` or `GH_APP_PRIVATE_KEY_FALLBACK` as expected
  unless a Jarvis-owned app integration has been explicitly documented.
- Prefer defensive workflow behavior that skips unavailable app-token branches
  and falls back to `github.token` with the smallest needed job permissions.
- Avoid broad workflow churn that removes upstream automation identities unless
  the cleanup is intentionally scoped and reviewed as fork-maintenance work.

## ClawTalk upstream sync runbook

`clawtalk/base` is the only long-lived ClawTalk adaptation branch. Do not create
or retain `clawtalk/base-v*` variants for upstream refresh work.

Upstream syncs must keep `clawtalk/base` linear on the current OpenClaw base:

1. Work only from a PO-owned checkout or worktree under
   `/home/openclaw/.openclaw/project-checkouts/`.
2. Before edits, verify `pwd`, `git rev-parse --show-toplevel`, `git remote -v`,
   `git branch --show-current`, and `git status --short --branch`.
3. Fetch both remotes:

   ```sh
   git fetch --prune origin
   git fetch --prune upstream
   ```

4. Use `upstream/main` as the default current upstream target unless a release
   lane explicitly names a release branch or tag. Record the upstream SHA and
   current `origin/clawtalk/base` SHA in the GitHub coordination issue.
5. Identify the fork-only patch set with:

   ```sh
   git merge-base origin/clawtalk/base upstream/main
   git cherry -v upstream/main origin/clawtalk/base
   git log --reverse --format='%H %s' --no-merges \
     "$(git merge-base origin/clawtalk/base upstream/main)"..origin/clawtalk/base
   ```

6. First try a clean linear rebuild from current upstream:

   ```sh
   git worktree add -B sync/clawtalk-rebase-YYYYMMDD \
     ../openclaw-clawtalk-rebase-YYYYMMDD upstream/main
   git cherry-pick <fork-only commits in chronological order>
   ```

   If a commit is already present upstream, skip it only after `git cherry -v`
   or conflict inspection proves it is redundant.

7. Resolve conflicts by preserving ClawTalk/Voice PE behavior unless upstream
   clearly supersedes it. For realtime Talk relay conflicts, keep ClawTalk
   forced-consult/result-delivery behavior and also preserve upstream structured
   realtime issue/error payloads and ready/error delivery.
8. Confirm the rebuilt branch has no merge commits above upstream:

   ```sh
   git log --merges --oneline upstream/main..HEAD
   git rev-list --left-right --count HEAD...upstream/main
   ```

9. Run the smallest meaningful non-hardware gates for the changed surface. For
   realtime relay syncs, include:

   ```sh
   pnpm exec vitest run --config test/vitest/vitest.gateway.config.ts \
     src/gateway/talk-realtime-relay.test.ts src/gateway/server-methods/talk.test.ts
   pnpm tsgo:core
   ```

10. Update the GitHub coordination lane with SHAs, conflict decisions, gates,
    and next action. Push with `--force-with-lease` only after confirming the
    target is `origin/clawtalk/base`; do not land merge commits from upstream.
