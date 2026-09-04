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
