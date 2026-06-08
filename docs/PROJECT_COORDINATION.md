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
