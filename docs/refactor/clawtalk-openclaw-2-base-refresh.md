---
summary: "Design for rebuilding the ClawTalk fork on current OpenClaw main without replaying obsolete relay patches"
read_when:
  - Refreshing the Level42 ClawTalk fork onto a newer OpenClaw base
  - Deciding which historical ClawTalk patches remain necessary
title: "ClawTalk OpenClaw 2.x base refresh"
---

# ClawTalk OpenClaw 2.x Base Refresh

## Goal

Rebuild the long-lived `clawtalk/base` branch from the current `upstream/main`, retain only
Level42-specific behavior that is still required, and produce a tested exact commit that can be
used as the OpenClaw runtime base for the separate `openclaw-voice-pe` firmware migration.

This phase changes the OpenClaw fork only. It does not rewrite `origin/clawtalk/base`, install a
Gateway, modify the Voice PE repository, or provision credentials.

## Starting point

- Previous fork head: `d2034cc93c44517c0267af78130bd49c86958c67`.
- Previous release base: `v2026.7.1-2`.
- New upstream base captured on 2026-09-04:
  `79e20aa5d1fd83ca0823f7cc5e6d32315fc31781`.
- The previous fork contains 15 commits above its release base.
- Replaying the first historical relay commit onto the new upstream conflicts in six core
  Gateway/Talk files. The branch must therefore be reconstructed, not mechanically rebased.

## Design principles

1. Keep `clawtalk/base` linear on `upstream/main` as required by the fork coordination policy.
2. Prefer current upstream behavior and configuration over fork patches.
3. Do not reintroduce removed public Talk RPCs solely for compatibility with the current firmware.
4. Keep the runtime branch generic. Voice PE-specific protocol adaptation belongs in the firmware
   repository unless a focused test proves a missing core capability.
5. Deploy and test exact SHAs; never run a production Gateway from a moving branch tip.
6. Preserve the old remote branch until the reconstructed branch has passed review and the user
   explicitly approves a `--force-with-lease` update.

## Historical patch disposition

### Superseded Talk and relay patches

The first six historical commits are not replayed initially:

- relay protocol stabilization;
- explicit realtime audio commit/end-turn support;
- server-VAD commit ownership and race tolerance;
- forced consult result delivery;
- lazy loading of realtime consult code.

Current upstream owns Gateway-managed realtime sessions through `talk.session.*`, broadcasts
`talk.event`, requires `operator.talk`, and implements provider relay, cancellation, forced agent
consult, result delivery, audio framing, connection ownership, and lifecycle cleanup. Replaying the
old implementation would restore removed API surface and compete with the current owner boundary.

The missing explicit Push-to-Talk end-of-turn behavior is recorded as a Voice PE integration
question. Phase 2 must prove whether server VAD is sufficient, whether `stt-tts/managed-room` is the
correct native Push-to-Talk transport, or whether a new generic core capability is required.

### Fork operations and product patches

The remaining historical commits are reviewed by behavior, not cherry-picked blindly:

- GitHub App fallback and scheduled-check policy may be re-expressed against current workflows if
  the current upstream behavior still requires fork-specific handling.
- Gmail/GitHub topic routing is retained only if current product use is confirmed by tests or
  maintained documentation.
- Task Flow cleanup is not part of the Voice PE runtime base and is excluded unless a current
  Level42 requirement proves otherwise.
- Old release-basis and sync documentation is rewritten for the reconstructed branch.
- Voice PE diagnostic defaults are replaced with explicit
  `gateway.nodes.commands.allow` configuration where possible. A core patch is considered only if
  configuration plus pairing approval cannot provide the required diagnostic surface.

## Deliverables

The reconstructed branch contains:

1. current `upstream/main` as its direct base;
2. a current Level42 fork-coordination document using the canonical repository name and current
   rebuild procedure;
3. only the smallest still-required CI/workflow adaptations, each backed by a focused check;
4. a compatibility report that records every historical commit as retained, superseded, or
   deferred;
5. no Voice PE-specific Gateway runtime patch unless a failing contract test demonstrates the need.

## Generic node invoke schema alignment

Validation against the current Voice PE diagnostic client exposed one generic
Gateway protocol mismatch that is in scope for the rebuilt base. The
`node.invoke.request` builder emits `paramsJSON: null` for a parameterless
request even though `NodeInvokeRequestEventSchema` allows only a string or an
absent field. The builder can also forward a normalized `sessionKey`, while the
closed event schema does not declare that field.

This is not a Voice PE device-family exception. Add a generic contract test that
checks builder output against the public event schema, omit `paramsJSON` when no
params exist, and declare optional non-empty `sessionKey` in the event schema.
No node authorization, pairing, platform defaults, or Talk behavior changes.

## Validation

Before the branch can replace `clawtalk/base`:

- `git log --merges --oneline upstream/main..HEAD` must be empty.
- Focused Talk baseline tests must pass:
  `src/gateway/talk-realtime-relay.test.ts` and
  `src/gateway/server-methods/talk.test.ts`.
- Fork-specific workflow changes must pass their relevant syntax/policy checks.
- Documentation changes must pass `git diff --check` and the applicable docs checks.
- The Voice PE static compatibility checker must be run against the candidate. Checker failures
  caused by upstream file refactors must be separated from actual protocol or policy gaps.
- A clean build must pass using the package-manager version pinned by the candidate checkout. If
  the local host cannot complete declaration generation, the runtime-only build may be used for a
  local smoke, but full build evidence must come from CI or a suitably sized builder before branch
  replacement.

## Rollout and rollback

The candidate is pushed as a separate review branch. The old `clawtalk/base` head is recorded in
the review description and retained as a recovery ref. Updating the long-lived branch requires an
explicitly reviewed `git push --force-with-lease` targeted only at `origin/clawtalk/base`.

After replacement, a detached runtime worktree is built from the exact reviewed fork SHA. OpenClaw
automatic updates remain disabled for the custom runtime. The separate Voice PE phase then updates
firmware, harnesses, and documentation to the new Talk methods and least-privilege voice-node
credentials before any attended hardware acceptance run.

## Out of scope

- Changing or flashing Voice PE firmware.
- Replacing the remote `clawtalk/base` branch.
- Installing or configuring the production Gateway.
- Migrating secrets or existing OpenClaw state.
- Reintroducing provider-specific relay behavior without a failing generic contract test.
