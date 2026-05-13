import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeVoiceProviderPlugin } from "../plugins/types.js";
import type { RealtimeVoiceBridgeCreateRequest } from "../realtime-voice/provider-types.js";
import {
  acknowledgeTalkRealtimeRelayMark,
  clearTalkRealtimeRelaySessionsForTest,
  createTalkRealtimeRelaySession,
  finalizeTalkRealtimeRelayTurn,
  sendTalkRealtimeRelayAudio,
  stopTalkRealtimeRelaySession,
  submitTalkRealtimeRelayToolResult,
} from "./talk-realtime-relay.js";

describe("talk realtime gateway relay", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearTalkRealtimeRelaySessionsForTest();
  });

  it("bridges browser audio, transcripts, marks, and tool results through a backend provider", async () => {
    let bridgeRequest: RealtimeVoiceBridgeCreateRequest | undefined;
    const bridge = {
      supportsToolResultContinuation: true,
      connect: vi.fn(async () => {
        bridgeRequest?.onReady?.();
        bridgeRequest?.onAudio(Buffer.from("audio-out"));
        bridgeRequest?.onMark?.("mark-1");
        bridgeRequest?.onTranscript?.("user", "hello", true);
        bridgeRequest?.onToolCall?.({
          itemId: "item-1",
          callId: "call-1",
          name: "openclaw_agent_consult",
          args: { question: "what now" },
        });
      }),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      sendUserMessage: vi.fn(),
      triggerGreeting: vi.fn(),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: (req) => {
        bridgeRequest = req;
        return bridge;
      },
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;

    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: { model: "provider-model" },
      instructions: "be brief",
      tools: [],
      model: "browser-model",
      voice: "voice-a",
    });
    await Promise.resolve();

    expect(session).toMatchObject({
      provider: "relay-test",
      transport: "gateway-relay",
      model: "browser-model",
      voice: "voice-a",
      audio: {
        inputEncoding: "pcm16",
        inputSampleRateHz: 24000,
        outputEncoding: "pcm16",
        outputSampleRateHz: 24000,
      },
    });
    expect(bridgeRequest).toMatchObject({
      providerConfig: { model: "provider-model" },
      audioFormat: { encoding: "pcm16", sampleRateHz: 24000, channels: 1 },
      instructions: "be brief",
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "talk.realtime.relay",
          connIds: ["conn-1"],
          payload: { relaySessionId: session.relaySessionId, type: "ready" },
        }),
        expect.objectContaining({
          payload: {
            relaySessionId: session.relaySessionId,
            type: "audio",
            audioBase64: Buffer.from("audio-out").toString("base64"),
          },
        }),
        expect.objectContaining({
          payload: { relaySessionId: session.relaySessionId, type: "mark", markName: "mark-1" },
        }),
        expect.objectContaining({
          payload: {
            relaySessionId: session.relaySessionId,
            type: "transcript",
            role: "user",
            text: "hello",
            final: true,
          },
        }),
        expect.objectContaining({
          payload: {
            relaySessionId: session.relaySessionId,
            type: "toolCall",
            itemId: "item-1",
            callId: "call-1",
            name: "openclaw_agent_consult",
            args: { question: "what now" },
          },
        }),
      ]),
    );

    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
      timestamp: 123,
    });
    acknowledgeTalkRealtimeRelayMark({ relaySessionId: session.relaySessionId, connId: "conn-1" });
    submitTalkRealtimeRelayToolResult({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      callId: "call-1",
      result: { ok: true },
    });
    stopTalkRealtimeRelaySession({ relaySessionId: session.relaySessionId, connId: "conn-1" });

    expect(bridge.sendAudio).toHaveBeenCalledWith(Buffer.from("audio-in"));
    expect(bridge.setMediaTimestamp).toHaveBeenCalledWith(123);
    expect(bridge.acknowledgeMark).toHaveBeenCalled();
    expect(bridge.submitToolResult).toHaveBeenCalledWith("call-1", { ok: true }, undefined);
    expect(bridge.close).toHaveBeenCalled();
  });

  it("commits accepted relay audio without closing and emits sanitized no-response markers", async () => {
    const bridge = {
      supportsToolResultContinuation: true,
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      sendUserMessage: vi.fn(),
      finalizeAudioInput: vi.fn(async () => ({ status: "no_response" as const })),
      triggerGreeting: vi.fn(),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;

    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
    });

    expect(bridge.finalizeAudioInput).toHaveBeenCalled();
    expect(bridge.close).not.toHaveBeenCalled();
    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });
    expect(JSON.stringify(events)).not.toContain("audio-in");
  });

  it("emits sanitized relay errors when commit finalization fails", async () => {
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => {
        throw new Error("401 invalid API key sk-live-secret");
      }),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await expect(
      finalizeTalkRealtimeRelayTurn({ relaySessionId: session.relaySessionId, connId: "conn-1" }),
    ).rejects.toThrow("realtime provider authentication error");

    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: {
        relaySessionId: session.relaySessionId,
        type: "error",
        category: "auth",
        hard: false,
        message: "realtime provider authentication error",
      },
    });
    expect(JSON.stringify(events)).not.toContain("sk-live-secret");
  });

  it("maps provider no-speech commit failures to sanitized no-response idle", async () => {
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => {
        throw new Error("input_audio_buffer.commit failed: no speech detected");
      }),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await expect(
      finalizeTalkRealtimeRelayTurn({ relaySessionId: session.relaySessionId, connId: "conn-1" }),
    ).resolves.toBeUndefined();

    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });
    expect(bridge.close).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain("no speech detected");
  });

  it("maps async provider no-speech errors after commit to sanitized no-response idle", async () => {
    let bridgeRequest: RealtimeVoiceBridgeCreateRequest | undefined;
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => ({ status: "committed" as const })),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: (req) => {
        bridgeRequest = req;
        return bridge;
      },
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
    });
    bridgeRequest?.onError?.(new Error("input audio buffer is empty"));

    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it("keeps unrelated async provider errors on the hard relay error path", async () => {
    let bridgeRequest: RealtimeVoiceBridgeCreateRequest | undefined;
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => ({ status: "committed" as const })),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: (req) => {
        bridgeRequest = req;
        return bridge;
      },
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
    });
    bridgeRequest?.onError?.(new Error("unexpected provider protocol failure"));

    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: {
        relaySessionId: session.relaySessionId,
        type: "error",
        category: "unknown",
        hard: true,
        message: "realtime provider error",
      },
    });
    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: {
        relaySessionId: session.relaySessionId,
        type: "paused",
        category: "unknown",
        reason: "provider_hard_error",
      },
    });
    expect(bridge.close).toHaveBeenCalled();
  });

  it("emits no-response idle when committed input produces no provider output", async () => {
    vi.useFakeTimers();
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => ({ status: "committed" as const })),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
    });
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();

    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });
  });

  it("emits idle markers for empty input or unsupported provider finalization", async () => {
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const noInputSession = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: noInputSession.relaySessionId,
      connId: "conn-1",
    });
    const unsupportedSession = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: unsupportedSession.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: unsupportedSession.relaySessionId,
      connId: "conn-1",
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: {
            relaySessionId: noInputSession.relaySessionId,
            type: "idle",
            reason: "no_input",
          },
        }),
        expect.objectContaining({
          payload: {
            relaySessionId: unsupportedSession.relaySessionId,
            type: "idle",
            reason: "unsupported",
          },
        }),
      ]),
    );
  });

  it("emits bounded no-response marker after committed relay audio produces no output", async () => {
    vi.useFakeTimers();
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => ({ status: "committed" as const })),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
    });
    expect(events).not.toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });

    await vi.advanceTimersByTimeAsync(2500);

    expect(events).toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });
    expect(JSON.stringify(events)).not.toContain("audio-in");
  });

  it("does not emit commit no-response fallback after provider output arrives", async () => {
    vi.useFakeTimers();
    let bridgeRequest: RealtimeVoiceBridgeCreateRequest | undefined;
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(async () => ({ status: "committed" as const })),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: (req) => {
        bridgeRequest = req;
        return bridge;
      },
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    sendTalkRealtimeRelayAudio({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
      audioBase64: Buffer.from("audio-in").toString("base64"),
    });

    await finalizeTalkRealtimeRelayTurn({
      relaySessionId: session.relaySessionId,
      connId: "conn-1",
    });
    bridgeRequest?.onTranscript?.("assistant", "ok", true);
    await vi.advanceTimersByTimeAsync(2500);

    expect(events).toContainEqual(
      expect.objectContaining({
        payload: {
          relaySessionId: session.relaySessionId,
          type: "transcript",
          role: "assistant",
          text: "ok",
          final: true,
        },
      }),
    );
    expect(events).not.toContainEqual({
      event: "talk.realtime.relay",
      connIds: ["conn-1"],
      payload: { relaySessionId: session.relaySessionId, type: "idle", reason: "no_response" },
    });
  });

  it("chunks relay audio downlink below the firmware decode budget", async () => {
    let bridgeRequest: RealtimeVoiceBridgeCreateRequest | undefined;
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: (req) => {
        bridgeRequest = req;
        return {
          connect: vi.fn(async () => undefined),
          sendAudio: vi.fn(),
          setMediaTimestamp: vi.fn(),
          submitToolResult: vi.fn(),
          acknowledgeMark: vi.fn(),
          close: vi.fn(),
          isConnected: vi.fn(() => true),
        };
      },
    };
    const events: Array<{ event: string; payload: unknown; connIds: string[] }> = [];
    const context = {
      broadcastToConnIds: (event: string, payload: unknown, connIds: ReadonlySet<string>) => {
        events.push({ event, payload, connIds: [...connIds] });
      },
    } as never;
    const session = createTalkRealtimeRelaySession({
      context,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });
    const audio = Buffer.alloc(50 * 1024, 0x5a);

    bridgeRequest?.onAudio(audio);

    const audioEvents = events
      .map((entry) => entry.payload)
      .filter(
        (payload): payload is { relaySessionId: string; type: "audio"; audioBase64: string } =>
          typeof payload === "object" &&
          payload !== null &&
          (payload as { type?: unknown }).type === "audio",
      );
    expect(audioEvents).toHaveLength(3);
    expect(audioEvents.every((event) => event.audioBase64.length < 32768)).toBe(true);
    expect(
      audioEvents.every((event) => Buffer.from(event.audioBase64, "base64").length <= 20 * 1024),
    ).toBe(true);
    expect(
      Buffer.concat(audioEvents.map((event) => Buffer.from(event.audioBase64, "base64"))),
    ).toEqual(audio);
    expect(audioEvents.every((event) => event.relaySessionId === session.relaySessionId)).toBe(
      true,
    );
  });

  it("keeps stop-only close distinct from relay commit", () => {
    const bridge = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      setMediaTimestamp: vi.fn(),
      finalizeAudioInput: vi.fn(),
      submitToolResult: vi.fn(),
      acknowledgeMark: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => bridge,
    };
    const session = createTalkRealtimeRelaySession({
      context: { broadcastToConnIds: vi.fn() } as never,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });

    stopTalkRealtimeRelaySession({ relaySessionId: session.relaySessionId, connId: "conn-1" });

    expect(bridge.close).toHaveBeenCalled();
    expect(bridge.finalizeAudioInput).not.toHaveBeenCalled();
  });

  it("rejects relay control from a different connection", () => {
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => ({
        connect: vi.fn(async () => undefined),
        sendAudio: vi.fn(),
        setMediaTimestamp: vi.fn(),
        submitToolResult: vi.fn(),
        acknowledgeMark: vi.fn(),
        close: vi.fn(),
        isConnected: vi.fn(() => true),
      }),
    };
    const session = createTalkRealtimeRelaySession({
      context: { broadcastToConnIds: vi.fn() } as never,
      connId: "conn-1",
      provider,
      providerConfig: {},
      instructions: "brief",
      tools: [],
    });

    expect(() =>
      sendTalkRealtimeRelayAudio({
        relaySessionId: session.relaySessionId,
        connId: "conn-2",
        audioBase64: Buffer.from("audio").toString("base64"),
      }),
    ).toThrow("Unknown realtime relay session");
  });

  it("caps active relay sessions per browser connection", () => {
    const provider: RealtimeVoiceProviderPlugin = {
      id: "relay-test",
      label: "Relay Test",
      isConfigured: () => true,
      createBridge: () => ({
        connect: vi.fn(async () => undefined),
        sendAudio: vi.fn(),
        setMediaTimestamp: vi.fn(),
        submitToolResult: vi.fn(),
        acknowledgeMark: vi.fn(),
        close: vi.fn(),
        isConnected: vi.fn(() => true),
      }),
    };
    const createSession = (connId: string) =>
      createTalkRealtimeRelaySession({
        context: { broadcastToConnIds: vi.fn() } as never,
        connId,
        provider,
        providerConfig: {},
        instructions: "brief",
        tools: [],
      });

    createSession("conn-1");
    createSession("conn-1");

    expect(() => createSession("conn-1")).toThrow(
      "Too many active realtime relay sessions for this connection",
    );
    expect(() => createSession("conn-2")).not.toThrow();
  });
});
