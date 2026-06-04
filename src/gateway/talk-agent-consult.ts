// Gateway Talk realtime agent-consult bridge.
// Starts chat.send runs that answer realtime Talk tool calls.
import { randomUUID } from "node:crypto";
import {
  ErrorCodes,
  errorShape,
  type ConnectParams,
  type ErrorShape,
} from "../../packages/gateway-protocol/src/index.js";
import { normalizeTalkSection } from "../config/talk.js";
import { buildRealtimeVoiceAgentConsultChatMessage } from "../talk/agent-consult-tool.js";
import { agentHandlers } from "./server-methods/agent.js";
import { chatHandlers } from "./server-methods/chat.js";
import type {
  GatewayClient,
  GatewayRequestContext,
  GatewayRequestHandlers,
} from "./server-methods/shared-types.js";
import {
  registerTalkRealtimeRelayAgentRun,
  submitTalkRealtimeRelayToolResult,
} from "./talk-realtime-relay.js";
import { formatForLog } from "./ws-log.js";

type TalkChatSendAckStatus = "started" | "in_flight" | "ok" | "timeout" | "error";

function normalizeTalkChatSendAckStatus(result: unknown): TalkChatSendAckStatus {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return "started";
  }
  const status = (result as Record<string, unknown>).status;
  return status === "in_flight" || status === "ok" || status === "timeout" || status === "error"
    ? status
    : "started";
}

function terminalTalkChatSendAckError(status: TalkChatSendAckStatus): ErrorShape | undefined {
  if (status === "timeout") {
    return errorShape(
      ErrorCodes.UNAVAILABLE,
      "Realtime agent consult ended before the run started.",
    );
  }
  if (status === "error") {
    return errorShape(
      ErrorCodes.UNAVAILABLE,
      "Realtime agent consult failed before the run started.",
    );
  }
  if (status === "ok") {
    return errorShape(
      ErrorCodes.UNAVAILABLE,
      "Realtime agent consult completed before the tool result subscription started.",
    );
  }
  return undefined;
}

/**
 * Starts the agent-consult chat run that backs realtime Talk tool calls.
 */

const REALTIME_AGENT_CONSULT_WAIT_TIMEOUT_MS = 35_000;
export async function startTalkRealtimeAgentConsult(params: {
  context: GatewayRequestContext;
  client: GatewayClient | null;
  isWebchatConnect: (params: ConnectParams | null | undefined) => boolean;
  requestId: string;
  sessionKey: string;
  callId: string;
  args: unknown;
  relaySessionId?: string;
  connId?: string;
}): Promise<
  { ok: true; runId: string; idempotencyKey: string } | { ok: false; error: ErrorShape }
> {
  let message: string;
  try {
    message = buildRealtimeVoiceAgentConsultChatMessage(params.args);
  } catch (err) {
    return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, formatForLog(err)) };
  }
  const idempotencyKey = `talk-${params.callId}-${randomUUID()}`;
  const normalizedTalk = normalizeTalkSection(params.context.getRuntimeConfig().talk);
  const chatResponse = await new Promise<
    { ok: true; result: unknown } | { ok: false; error: ErrorShape } | undefined
  >((resolve) => {
    let acknowledged = false;
    const chatSendResult = chatHandlers["chat.send"]({
      req: {
        type: "req",
        id: `${params.requestId}:talk-tool-call`,
        method: "chat.send",
      },
      client: params.client,
      isWebchatConnect: params.isWebchatConnect,
      context: params.context,
      params: {
        sessionKey: params.sessionKey,
        message,
        idempotencyKey,
        ...(normalizedTalk?.consultThinkingLevel
          ? { thinking: normalizedTalk.consultThinkingLevel }
          : {}),
        ...(typeof normalizedTalk?.consultFastMode === "boolean"
          ? { fastMode: normalizedTalk.consultFastMode }
          : {}),
      },
      respond: (ok: boolean, result?: unknown, error?: ErrorShape) => {
        acknowledged = true;
        resolve(
          ok
            ? { ok: true, result }
            : {
                ok: false,
                error:
                  error ?? errorShape(ErrorCodes.UNAVAILABLE, "chat.send failed without error"),
              },
        );
      },
    } as Parameters<GatewayRequestHandlers[string]>[0]);
    void Promise.resolve(chatSendResult).then(
      () => {
        if (!acknowledged) {
          resolve(undefined);
        }
      },
      (error: unknown) => {
        if (acknowledged) {
          params.context.logGateway.warn(
            `realtime Talk agent consult failed after acknowledgement: ${formatForLog(error)}`,
          );
          return;
        }
        resolve({
          ok: false,
          error: errorShape(ErrorCodes.UNAVAILABLE, formatForLog(error)),
        });
      },
    );
  });

  if (!chatResponse) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.UNAVAILABLE, "chat.send did not return a realtime tool result"),
    };
  }
  if (!chatResponse.ok) {
    return { ok: false, error: chatResponse.error };
  }
  const result = chatResponse.result;
  const terminalAckError = terminalTalkChatSendAckError(normalizeTalkChatSendAckStatus(result));
  if (terminalAckError) {
    return { ok: false, error: terminalAckError };
  }
  const runId =
    result && typeof result === "object" && !Array.isArray(result)
      ? typeof (result as Record<string, unknown>).runId === "string"
        ? (result as Record<string, string>).runId
        : idempotencyKey
      : idempotencyKey;
  if (params.relaySessionId && params.connId) {
    registerTalkRealtimeRelayAgentRun({
      relaySessionId: params.relaySessionId,
      connId: params.connId,
      sessionKey: params.sessionKey,
      runId,
      callId: params.callId,
    });
    void waitForTalkRealtimeAgentConsultResult({
      context: params.context,
      client: params.client,
      isWebchatConnect: params.isWebchatConnect,
      requestId: params.requestId,
      runId,
      relaySessionId: params.relaySessionId,
      connId: params.connId,
      callId: params.callId,
    }).catch((error: unknown) => {
      params.context.logGateway.warn(
        `realtime talk agent consult wait failed: ${formatForLog(error)}`,
      );
    });
  }
  return { ok: true, runId, idempotencyKey };
}

async function waitForTalkRealtimeAgentConsultResult(params: {
  context: GatewayRequestContext;
  client: GatewayClient | null;
  isWebchatConnect: (params: ConnectParams | null | undefined) => boolean;
  requestId: string;
  runId: string;
  relaySessionId: string;
  connId: string;
  callId: string;
}): Promise<void> {
  let waitResponse: { ok: true; result: unknown } | { ok: false; error: ErrorShape } | undefined;
  await agentHandlers["agent.wait"]({
    req: {
      type: "req",
      id: `${params.requestId}:talk-tool-wait`,
      method: "agent.wait",
    },
    client: params.client,
    isWebchatConnect: params.isWebchatConnect,
    context: params.context,
    params: {
      runId: params.runId,
      timeoutMs: REALTIME_AGENT_CONSULT_WAIT_TIMEOUT_MS,
    },
    respond: (ok: boolean, result?: unknown, error?: ErrorShape) => {
      waitResponse = ok
        ? { ok: true, result }
        : {
            ok: false,
            error: error ?? errorShape(ErrorCodes.UNAVAILABLE, "agent.wait failed without error"),
          };
    },
  } as Parameters<GatewayRequestHandlers[string]>[0]);

  const result = !waitResponse?.ok
    ? {
        error: waitResponse?.error?.message ?? "OpenClaw did not return a voice result.",
      }
    : (() => {
        const text = readTalkRealtimeAgentConsultTextFromDedupe(params.context, params.runId);
        return text
          ? { result: text }
          : { error: "OpenClaw did not return a speakable voice result." };
      })();

  try {
    submitTalkRealtimeRelayToolResult({
      relaySessionId: params.relaySessionId,
      connId: params.connId,
      callId: params.callId,
      result,
    });
  } catch (error: unknown) {
    params.context.logGateway.warn(
      `realtime talk agent consult tool result submit failed: ${formatForLog(error)}`,
    );
  }
}

function readTalkRealtimeAgentConsultTextFromDedupe(
  context: GatewayRequestContext,
  runId: string,
): string | undefined {
  for (const key of [`chat:${runId}`, `agent:${runId}`]) {
    const payload = context.dedupe.get(key)?.payload;
    const text = readTextFromAgentResultPayload(payload);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function readTextFromAgentResultPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const directText = (payload as Record<string, unknown>).text;
  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return undefined;
  }
  const resultText = (result as Record<string, unknown>).text;
  if (typeof resultText === "string" && resultText.trim()) {
    return resultText.trim();
  }
  const payloads = (result as Record<string, unknown>).payloads;
  if (!Array.isArray(payloads)) {
    return undefined;
  }
  const parts = payloads
    .map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).text
        : undefined,
    )
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  return parts.join("\n").trim() || undefined;
}
