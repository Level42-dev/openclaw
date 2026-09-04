---
summary: "Disposition of the historical ClawTalk fork patches during the OpenClaw 2.x base rebuild"
read_when:
  - Reviewing the refreshed clawtalk/base candidate
  - Investigating a behavior that existed in the previous ClawTalk base
title: "ClawTalk OpenClaw 2.x compatibility record"
---

# ClawTalk OpenClaw 2.x compatibility record

This record compares the previous `clawtalk/base` head
`d2034cc93c44517c0267af78130bd49c86958c67` with the candidate rebuilt directly
on upstream commit `79e20aa5d1fd83ca0823f7cc5e6d32315fc31781`.

The historical branch contains 15 commits above its old release basis. The new
candidate evaluates their behavior rather than replaying their diffs.

## Historical patch disposition

| Commit        | Historical change                                         | Disposition                                                                                                                                                        |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `1958de29518` | Stabilize Voice PE Talk relay protocol                    | **Superseded.** Current `talk.session.*` ownership and `talk.event` broadcasting replace the old relay surface.                                                    |
| `b3b371ad0e1` | Commit realtime relay audio turns                         | **Superseded/deferred.** Current provider/session lifecycle owns commits; explicit Push-to-Talk end-turn behavior must be validated during the Voice PE migration. |
| `1c2f5c3e30a` | Let server VAD own relay commits                          | **Superseded.** Current upstream owns server-VAD and session lifecycle behavior.                                                                                   |
| `92803f23d3b` | Tolerate relay commit races                               | **Superseded.** Current relay implementation and tests own race handling.                                                                                          |
| `054bdea8dd1` | Return forced consult replies to relay                    | **Superseded.** Current forced agent-consult and result delivery cover this behavior.                                                                              |
| `c640480cde3` | Lazy-load realtime Talk consult                           | **Superseded.** Current module and relay ownership no longer matches the historical patch boundary.                                                                |
| `9e1eb1fe1a7` | Fall back when upstream GitHub App tokens are unavailable | **Retained by reimplementation.** Current workflows conditionally use the optional App secrets and otherwise use `github.token`.                                   |
| `5d6a6829bf0` | Record the old Jarvis App-token policy                    | **Replaced.** `docs/PROJECT_COORDINATION.md` now describes the Level42 repository and current least-privilege policy.                                              |
| `ab249fa6782` | Route GitHub notification emails by topic lane            | **Deferred.** Gmail/GitHub workflow routing is not required by the Voice PE runtime base and has no current integration requirement in this phase.                 |
| `73b9b040b55` | Repair broadcast CI failures                              | **Superseded.** The current upstream Gateway broadcast and Talk implementation has moved beyond these fixes.                                                       |
| `abc8c9c2826` | Skip scheduled live/provider checks in forks              | **Retained by reimplementation.** Both current scheduled jobs are repository-gated; the supported manual dispatch remains available.                               |
| `61fc21db60d` | Add the old upstream-sync runbook                         | **Replaced.** The current coordination document separates manual development worktrees from OpenClaw-managed session worktrees.                                    |
| `c5f4a7a2932` | Document stale TaskFlow cleanup                           | **Excluded.** TaskFlow cleanup is outside the Voice PE runtime base.                                                                                               |
| `d38e0a4dd94` | Clarify the old release basis in the upstream README      | **Replaced.** Exact-SHA deployment belongs in fork coordination documentation, without fork branding in the upstream README.                                       |
| `d2034cc93c4` | Add Voice PE diagnostic compatibility defaults            | **Deferred to configuration and firmware migration.** No `voice-pe` device-family special case is restored in core.                                                |

## Current Talk boundary

The candidate intentionally keeps the current upstream Talk implementation
unchanged. Voice PE must use the Gateway-owned `talk.session.*` methods,
subscribe to `talk.event`, and authenticate with the current least-privilege
Talk scope. Provider-specific or removed relay method names are migration input,
not a reason to restore the previous core implementation.

## Current node-diagnostics boundary

OpenClaw now shapes node commands with `gateway.nodes.commands.allow` and
`gateway.nodes.commands.deny`. The old `gateway.nodes.allowCommands` name is a
dead/doctor-only legacy input. A Voice PE node must declare its exact command
surface, the operator must add non-default diagnostics to `commands.allow`, and
a widened paired command surface must be approved.

The current Gateway schema permits `paramsJSON` to be absent or `null` for a
parameterless node invocation. Firmware should accept both representations.
The existing Voice PE compatibility checker still encodes the historical
embedded-platform patch, old source-file locations, omission-only
`paramsJSON`, and the legacy configuration name. Failures in those assertions
are stale-checker or migration findings unless a current generic Gateway
contract test independently reproduces a defect.

## Scope held for the Voice PE phase

- migrate firmware and harnesses to the exact current Talk contract;
- replace legacy diagnostic config examples with
  `gateway.nodes.commands.allow`;
- update the static compatibility checker to current package/file ownership;
- prove server-VAD or the current managed-room transport for bounded
  Push-to-Talk turns;
- run attended hardware acceptance only after installing the reviewed exact
  fork SHA.

## Candidate validation evidence

Validated implementation head:
`8b4e5ab39aaecec2b2ca089a7b8a0fe7abb8da82`. The final review SHA also
contains this evidence-only documentation commit and is recorded at handoff.

- Fork workflow contract: 1 file, 2 tests passed.
- Workflow syntax/security: the repository-pinned actionlint revision passed;
  zizmor 1.29.0 reported no findings; CI Git-owner generation, composite-action
  interpolation, and conflict-marker checks passed.
- Host limitation: the `check:workflows` wrapper could not bootstrap
  pre-commit because this host lacks `python3-venv`. Its component checks were
  run directly or in isolated official containers instead.
- Talk baseline: 2 files, 203 tests passed.
- Generic node invoke schema regression: 2 files, 153 tests passed.
- Core TypeScript check: `pnpm tsgo:core` passed.
- Full build: passed in 13 minutes 40.9 seconds, including runtime, 90 external
  plugins, 149 public plugin-SDK subpaths, and Control UI.
- Documentation discovery and `git diff --check`: passed.
- The build produced no tracked worktree changes.

The existing Voice PE diagnostic checker passed 5 of 11 checks and reported six
failures. Their classifications are:

| Checker assertion                                          | Classification                               | Current evidence/action                                                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connect.commands schema location is supported              | Stale checker path/symbol                    | `packages/gateway-protocol/src/schema/frames.ts` accepts top-level `commands`; current reconciliation reads `connectParams.commands`.                                                                             |
| paired command snapshot preserves safe diagnostic defaults | Configuration and pairing migration          | Current policy intentionally requires approval for a widened command surface. Configure exact diagnostics through `gateway.nodes.commands.allow`, reconnect, and approve the pending surface.                     |
| Gateway forwards node.invoke.request fields                | Stale checker path plus resolved generic gap | Dispatch moved to `node-registry-private.ts` and payload construction to `node-invoke-request.ts`. The new generic contract test proves parameterless and session-bound builder output matches the public schema. |
| Gateway accepts node.invoke.result payload/error objects   | Stale checker implementation shape           | `nodes.handlers.invoke-result.ts` validates normalized params through `assertValidParams` and forwards payload/error to the registry.                                                                             |
| Voice PE gets embedded safe defaults                       | Configuration migration                      | The candidate deliberately has no device-family special case. Declare, allowlist, and approve exact Voice PE diagnostics.                                                                                         |
| node.invoke gates declaration and allowlist                | Stale checker file boundary                  | Current gating lives in `server-methods/nodes.invoke.ts` and checks both the declared command surface and resolved runtime allowlist before dispatch.                                                             |

No checker finding requires a Voice PE-specific Gateway patch. The later firmware
phase must update the checker to inspect current file ownership and policy names.

Validation captured no credentials, private network values, device identifiers,
transcripts, raw PCM, or base64 audio.
