import { describe, expect, it } from "vitest";
import {
  isNodeCommandAllowed,
  normalizeDeclaredNodeCommands,
  resolveNodeCommandAllowlist,
} from "./node-command-policy.js";
import { reconcileNodePairingOnConnect } from "./node-connect-reconcile.js";
import type { ConnectParams } from "./protocol/index.js";

describe("gateway/node-command-policy", () => {
  it("normalizes declared node commands against the allowlist", () => {
    const allowlist = new Set(["canvas.snapshot", "system.run"]);
    expect(
      normalizeDeclaredNodeCommands({
        declaredCommands: [" canvas.snapshot ", "", "system.run", "system.run", "screen.record"],
        allowlist,
      }),
    ).toEqual(["canvas.snapshot", "system.run"]);
  });

  it("defaults Voice PE / ESP32-S3 nodes to safe device.status only", () => {
    const allowlist = resolveNodeCommandAllowlist(
      {},
      { platform: "esp32-s3", deviceFamily: "voice-pe" },
    );

    expect([...allowlist].sort()).toEqual(["device.status"]);
    expect(
      isNodeCommandAllowed({
        command: "device.status",
        declaredCommands: ["device.status"],
        allowlist,
      }),
    ).toEqual({ ok: true });
    expect(
      isNodeCommandAllowed({
        command: "debug.logs",
        declaredCommands: ["debug.logs"],
        allowlist,
      }),
    ).toEqual({ ok: false, reason: "command not allowlisted" });
  });

  it("keeps safe default diagnostics across stale paired command snapshots", async () => {
    const connectParams: ConnectParams = {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: "node-host",
        version: "test",
        platform: "esp32-s3",
        deviceFamily: "voice-pe",
        mode: "node",
      },
      commands: ["device.status", "debug.logs"],
    };
    const requestedPairings: unknown[] = [];

    const result = await reconcileNodePairingOnConnect({
      cfg: {},
      connectParams,
      pairedNode: {
        nodeId: "node-host",
        token: "paired-token",
        commands: [],
        createdAtMs: 1,
        approvedAtMs: 1,
      },
      requestPairing: async (input) => {
        requestedPairings.push(input);
        return {
          status: "pending",
          created: true,
          request: { ...input, requestId: "pending-1", ts: 1 },
        };
      },
    });

    expect(result.effectiveCommands).toEqual(["device.status"]);
    expect(result.pendingPairing).toBeUndefined();
    expect(requestedPairings).toEqual([]);

    const upgradeResult = await reconcileNodePairingOnConnect({
      cfg: { gateway: { nodes: { allowCommands: ["debug.logs"] } } },
      connectParams,
      pairedNode: {
        nodeId: "node-host",
        token: "paired-token",
        commands: [],
        createdAtMs: 1,
        approvedAtMs: 1,
      },
      requestPairing: async (input) => {
        requestedPairings.push(input);
        return {
          status: "pending",
          created: true,
          request: { ...input, requestId: "pending-1", ts: 1 },
        };
      },
    });

    expect(upgradeResult.effectiveCommands).toEqual(["device.status"]);
    expect(upgradeResult.pendingPairing).toBeDefined();
    expect(requestedPairings).toHaveLength(1);
  });
});
