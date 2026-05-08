import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import {
  isForegroundRestrictedPluginNodeCommand,
  isNodeCommandAllowed,
  normalizeDeclaredNodeCommands,
  resolveNodeCommandAllowlist,
} from "./node-command-policy.js";
import { reconcileNodePairingOnConnect } from "./node-connect-reconcile.js";
import type { ConnectParams } from "./protocol/index.js";

describe("gateway/node-command-policy", () => {
  afterEach(() => {
    resetPluginRuntimeStateForTest();
  });

  function installCanvasPluginDefaults() {
    const registry = createEmptyPluginRegistry();
    (registry.nodeInvokePolicies ??= []).push({
      pluginId: "canvas",
      pluginName: "Canvas",
      source: "/extensions/canvas/index.ts",
      rootDir: "/extensions/canvas",
      pluginConfig: {},
      policy: {
        commands: ["canvas.snapshot", "canvas.present"],
        defaultPlatforms: ["ios", "android", "macos", "windows", "unknown"],
        foregroundRestrictedOnIos: true,
        handle: (ctx) => ctx.invokeNode(),
      },
    });
    setActivePluginRegistry(registry);
  }

  it("normalizes declared node commands against the allowlist", () => {
    const allowlist = new Set(["canvas.snapshot", "system.run"]);
    expect(
      normalizeDeclaredNodeCommands({
        declaredCommands: [" canvas.snapshot ", "", "system.run", "system.run", "screen.record"],
        allowlist,
      }),
    ).toEqual(["canvas.snapshot", "system.run"]);
  });

  it("allows declared push-to-talk commands on trusted talk-capable nodes", () => {
    const cfg = {} as OpenClawConfig;
    for (const platform of ["ios", "android", "macos", "other"]) {
      const allowlist = resolveNodeCommandAllowlist(cfg, { platform, caps: ["talk"] });
      expect(allowlist.has("talk.ptt.start")).toBe(true);
      expect(allowlist.has("talk.ptt.stop")).toBe(true);
      expect(allowlist.has("talk.ptt.cancel")).toBe(true);
      expect(allowlist.has("talk.ptt.once")).toBe(true);
      expect(
        isNodeCommandAllowed({
          command: "talk.ptt.start",
          declaredCommands: ["talk.ptt.start"],
          allowlist,
        }),
      ).toEqual({ ok: true });
    }
  });

  it("does not allow push-to-talk commands from platform label alone", () => {
    const cfg = {} as OpenClawConfig;
    const allowlist = resolveNodeCommandAllowlist(cfg, {
      platform: "android",
      caps: ["device"],
      commands: [],
    });

    expect(allowlist.has("talk.ptt.start")).toBe(false);
  });

  it("defaults Voice PE / ESP32-S3 nodes to safe device.status only", () => {
    const allowlist = resolveNodeCommandAllowlist({} as OpenClawConfig, {
      platform: "esp32-s3",
      deviceFamily: "voice-pe",
    });

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
      cfg: {} as OpenClawConfig,
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
      cfg: { gateway: { nodes: { allowCommands: ["debug.logs"] } } } as OpenClawConfig,
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

  it("allows push-to-talk commands when the node declares talk command support", () => {
    const cfg = {} as OpenClawConfig;
    const allowlist = resolveNodeCommandAllowlist(cfg, {
      platform: "custom",
      commands: ["talk.ptt.start"],
    });

    expect(allowlist.has("talk.ptt.start")).toBe(true);
  });

  it("keeps canvas commands out of core defaults when the canvas plugin is not active", () => {
    const allowlist = resolveNodeCommandAllowlist({} as OpenClawConfig, {
      platform: "windows",
      deviceFamily: "Windows",
    });

    expect(allowlist.has("canvas.snapshot")).toBe(false);
  });

  it("adds canvas commands from the active canvas plugin node policy", () => {
    installCanvasPluginDefaults();

    const allowlist = resolveNodeCommandAllowlist({} as OpenClawConfig, {
      platform: "windows",
      deviceFamily: "Windows",
    });

    expect(allowlist.has("canvas.snapshot")).toBe(true);
    expect(allowlist.has("canvas.present")).toBe(true);
  });

  it("reads foreground restriction metadata from plugin node policies", () => {
    expect(isForegroundRestrictedPluginNodeCommand("canvas.snapshot")).toBe(false);

    installCanvasPluginDefaults();

    expect(isForegroundRestrictedPluginNodeCommand("canvas.snapshot")).toBe(true);
    expect(isForegroundRestrictedPluginNodeCommand("system.run")).toBe(false);
  });
});
