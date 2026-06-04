---
summary: "Project coordination anchor for Jarvis/OpenClaw PO-led work"
read_when:
  - Coordinating OpenClaw project work through Jarvis
  - Opening issue branches, PRs, QA, or hardware/live validation windows
title: "Project Coordination"
---

# Project Coordination

This repository is coordinated by the Jarvis Project Lead / PO flow when work is
delegated outside the main Jarvis conversation.

## Operational Sources

1. GitHub Project board fields, when a relevant project item exists.
2. GitHub issues and PRs.
3. PR reviews and CI.
4. This coordination document and durable architecture/runbook docs.
5. Sanitized local evidence logs.

Do not create routine status snapshots. Use focused issue comments, PR notes, and
dated diagnostic logs for active slices.

## Checkout Policy

- Do not develop inside Jarvis' workspace checkout.
- Use PO-owned checkouts under `/home/openclaw/.openclaw/project-checkouts/`.
- Before any patch, build, live capture, or doc update, verify:
  - `pwd`
  - `git rev-parse --show-toplevel`
  - `git remote -v`
  - `git status --short --branch`
- Keep distinct feature/fix work on issue branches or worktrees.

## Safety And Privacy

- Do not write secrets, raw private transcripts, auth tokens, or device secrets
  into prompts, docs, issues, PRs, or logs.
- Logs referenced from issues or PRs must be sanitized and described by path.
- No hardware flashing, destructive device action, NVS erase, or live gate unless
  Jarvis explicitly authorizes that specific window.

## Active Slices

### Realtime Talk Tomatenmauer Triage, 2026-06-04

- Anchor issue: <https://github.com/openclaw/openclaw/issues/78725>
- Branch: `clawtalk/tomatenmauer-realtime-talk-triage`
- Draft PR: <https://github.com/Jarvis-Level42/openclaw/pull/14>
- Coordination branch: `origin/clawtalk/tomatenmauer-realtime-talk-triage`;
  verify the current head with `git rev-parse HEAD` before resuming.
- Code baseline for diagnostics: `origin/clawtalk/base` at
  `907df590dbc6ed7ae9574410500bed80daa33bad`
  (`fix(talk): tolerate relay commit races`).
- Diagnostic log: `docs/diagnostics/realtime-talk-tomatenmauer-2026-06-04.md`
- Current next action: capture a sanitized timeline for one failing Talk turn on
  Tomatenmauer, covering transcript receipt, agent response production,
  `talk.speak` synthesis, and playback start/end or failure.
- Resume rule: use a fresh PO-owned checkout/worktree under
  `/home/openclaw/.openclaw/project-checkouts/`, verify `pwd`, git root,
  remotes, and status before any capture/build/patch, and do not rely on hidden
  Jarvis session context.
