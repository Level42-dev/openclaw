import { describe, expect, it } from "vitest";
import {
  normalizeDeclaredNodeCommands,
  resolveNodeCommandAllowlist,
} from "./node-command-policy.js";

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

  it("classifies Voice PE / ESP32-S3 nodes as embedded device diagnostics by default", () => {
    const allowlist = resolveNodeCommandAllowlist(
      {},
      { platform: "esp32-s3", deviceFamily: "voice-pe" },
    );

    expect(allowlist.has("device.status")).toBe(true);
    expect(allowlist.has("debug.logs")).toBe(false);
    expect(allowlist.has("speaker.diagnostics")).toBe(false);
    expect(allowlist.has("system.run")).toBe(false);
    expect(allowlist.has("system.which")).toBe(false);
    expect(allowlist.has("camera.snap")).toBe(false);
  });

  it("still requires explicit allowCommands for Voice PE extended diagnostics", () => {
    const allowlist = resolveNodeCommandAllowlist(
      {
        gateway: {
          nodes: {
            allowCommands: ["debug.logs", "speaker.diagnostics"],
          },
        },
      },
      {
        platform: "esp32-s3",
        deviceFamily: "voice-pe",
      },
    );

    expect(allowlist.has("device.status")).toBe(true);
    expect(allowlist.has("debug.logs")).toBe(true);
    expect(allowlist.has("speaker.diagnostics")).toBe(true);
    expect(allowlist.has("system.run")).toBe(false);
    expect(allowlist.has("system.which")).toBe(false);
    expect(allowlist.has("camera.snap")).toBe(false);
  });
});
