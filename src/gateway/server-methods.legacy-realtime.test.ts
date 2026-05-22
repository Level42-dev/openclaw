import { describe, expect, it, vi } from "vitest";
import { handleGatewayRequest } from "./server-methods.js";
import type { GatewayRequestHandler, GatewayRequestOptions } from "./server-methods/types.js";

const noWebchat = () => false;

function buildContext(): GatewayRequestOptions["context"] {
  return {
    logGateway: {
      warn: vi.fn(),
    },
  } as unknown as GatewayRequestOptions["context"];
}

function buildClient(): GatewayRequestOptions["client"] {
  return {
    connect: {
      role: "operator",
      scopes: ["operator.write"],
      client: {
        id: "test",
        version: "1.0.0",
        platform: "esp32",
        mode: "node",
      },
      minProtocol: 1,
      maxProtocol: 1,
    },
    connId: "conn-1",
    clientIp: "10.0.0.5",
  } as GatewayRequestOptions["client"];
}

describe("legacy realtime relay RPC normalization", () => {
  it("maps relayAudio relaySessionId onto appendAudio sessionId without leaking legacy params", async () => {
    const handler = vi.fn<GatewayRequestHandler>(({ params, respond }) => {
      respond(true, { params }, undefined);
    });
    const respond = vi.fn();

    await handleGatewayRequest({
      req: {
        type: "req",
        id: "1",
        method: "talk.realtime.relayAudio",
        params: {
          relaySessionId: "relay-1",
          audioBase64: "aGVsbG8=",
          timestamp: 123,
        },
      },
      respond,
      client: buildClient(),
      isWebchatConnect: noWebchat,
      context: buildContext(),
      extraHandlers: {
        "talk.session.appendAudio": handler,
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].req.method).toBe("talk.session.appendAudio");
    expect(handler.mock.calls[0]?.[0].params).toEqual({
      sessionId: "relay-1",
      audioBase64: "aGVsbG8=",
      timestamp: 123,
    });
    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
  });

  it("maps relayStop relaySessionId onto close sessionId without leaking legacy params", async () => {
    const handler = vi.fn<GatewayRequestHandler>(({ params, respond }) => {
      respond(true, { params }, undefined);
    });
    const respond = vi.fn();

    await handleGatewayRequest({
      req: {
        type: "req",
        id: "1",
        method: "talk.realtime.relayStop",
        params: {
          relaySessionId: "relay-1",
          reason: "completed",
        },
      },
      respond,
      client: buildClient(),
      isWebchatConnect: noWebchat,
      context: buildContext(),
      extraHandlers: {
        "talk.session.close": handler,
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].req.method).toBe("talk.session.close");
    expect(handler.mock.calls[0]?.[0].params).toEqual({
      sessionId: "relay-1",
      reason: "completed",
    });
    expect(respond).toHaveBeenCalledWith(true, expect.any(Object), undefined);
  });
});
