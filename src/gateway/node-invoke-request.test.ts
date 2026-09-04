import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { NodeInvokeRequestEventSchema } from "../../packages/gateway-protocol/src/schema/nodes.js";
import { buildNodeInvokeRequest } from "./node-invoke-request.js";

describe("buildNodeInvokeRequest", () => {
  it("omits paramsJSON when an invocation has no params", () => {
    const payload = buildNodeInvokeRequest({
      id: "invoke-1",
      nodeId: "node-1",
      command: "device.status",
      timeoutMs: 30_000,
    });

    expect(payload).not.toHaveProperty("paramsJSON");
    expect(Value.Check(NodeInvokeRequestEventSchema, payload)).toBe(true);
  });

  it("keeps a normalized sessionKey inside the public event schema", () => {
    const payload = buildNodeInvokeRequest({
      id: "invoke-2",
      nodeId: "node-1",
      command: "system.run",
      params: { command: ["echo", "ok"] },
      timeoutMs: 30_000,
      sessionKey: " agent:main:main ",
    });

    expect(payload.sessionKey).toBe("agent:main:main");
    expect(Value.Check(NodeInvokeRequestEventSchema, payload)).toBe(true);
  });
});
