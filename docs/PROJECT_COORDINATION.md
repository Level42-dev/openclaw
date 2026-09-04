---
summary: "Level42 fork policy for rebuilding, reviewing, and deploying the ClawTalk OpenClaw base"
read_when:
  - Refreshing clawtalk/base from OpenClaw upstream
  - Preparing a ClawTalk Gateway build or Voice PE compatibility run
title: "ClawTalk project coordination"
---

# ClawTalk project coordination

The canonical OpenClaw fork is `Level42-dev/openclaw`. Its only long-lived
ClawTalk runtime branch is `clawtalk/base`. Treat `openclaw/openclaw` as
`upstream` and the Level42 fork as `origin` in local checkouts.

The runtime branch is a thin integration base, not an archive of every historic
ClawTalk experiment. Current upstream behavior wins unless a focused contract
test proves that Voice PE still needs a generic OpenClaw capability.

## Checkout and worktree ownership

Keep durable manual source checkouts outside the OpenClaw state directory:

- primary repositories: `/home/openclaw/src/`;
- linked development worktrees: `/home/openclaw/worktrees/`.

OpenClaw-managed coding sessions use the configured state-owned `worktreeRoot`,
which defaults to `<openclaw-state-dir>/worktrees`. Those registered session
worktrees follow OpenClaw's snapshot and cleanup lifecycle and are not durable
project source checkouts. Do not place manual development worktrees inside that
managed root.

Before changing a manual worktree, verify its identity and state:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git status --short --branch
```

Do not modify a Voice PE checkout that already contains unrelated or
uncommitted work while refreshing the OpenClaw base.

## Linear upstream refresh

1. Fetch `origin` and `upstream`, then record the exact `upstream/main` and
   `origin/clawtalk/base` SHAs.
2. Create a separate manual worktree under `/home/openclaw/worktrees/` on a
   branch named `sync/clawtalk-base-YYYYMMDD`, starting at the recorded upstream
   SHA.
3. Inventory the fork-only commits in chronological order. Classify behavior as
   retained, superseded, deferred, or excluded.
4. Reimplement only retained behavior against current files and interfaces.
   Do not mechanically replay obsolete Talk relay commits.
5. Keep the candidate linear. `git log --merges --oneline upstream/main..HEAD`
   must be empty.

For Talk conflicts, use the current Gateway-owned `talk.session.*` methods and
`talk.event` stream. Do not restore removed public RPCs to accommodate old
firmware. Record an actual missing capability as a failing generic contract
test before considering a core runtime patch.

## Required gates

Before publishing a candidate, run:

- the fork workflow contract test and repository workflow lint;
- `src/gateway/talk-realtime-relay.test.ts` and
  `src/gateway/server-methods/talk.test.ts`;
- the Voice PE static compatibility checker against the candidate, separating
  stale checker assumptions from real protocol gaps;
- documentation discovery/format checks and `git diff --check`;
- `pnpm tsgo:core` and a full build using the package-manager version pinned by
  the checkout.

Record test counts, failures, environment limitations, the candidate SHA, and
the old runtime SHA. Evidence must not include credentials, private network
values, device identifiers, transcripts, raw PCM, or base64 audio.

## Review, replacement, and rollback

Push the sync branch as a separate review branch first. Never update the
long-lived branch as part of the review-branch push.

Replacing `origin/clawtalk/base` requires explicit approval and a targeted
`git push --force-with-lease`. Preserve the old head SHA as the rollback point.
Do not use an unqualified force push.

Build and install the reviewed exact SHA from a detached runtime checkout.
Disable automatic source updates for a custom fork installation. Confirm the
running Gateway reports the intended build before any attended Voice PE
hardware test.

Rollback means rebuilding and activating the recorded old exact SHA while
leaving OpenClaw state and credentials intact. A branch-name checkout alone is
not sufficient evidence of the installed runtime.

## Fork-owned GitHub automation

The upstream GitHub App identities are optional in the Level42 fork. Workflows
that support them must skip token creation when their secrets are absent and
fall back to the least-privilege workflow `github.token`.

Scheduled live/provider workflows run automatically only in
`openclaw/openclaw`. The Level42 fork may still invoke the supported manual
workflow-dispatch path deliberately.
