type StartTalkRealtimeAgentConsult =
  typeof import("./talk-agent-consult.js").startTalkRealtimeAgentConsult;

let startTalkRealtimeAgentConsultPromise: Promise<StartTalkRealtimeAgentConsult> | undefined;

export function loadStartTalkRealtimeAgentConsult(): Promise<StartTalkRealtimeAgentConsult> {
  startTalkRealtimeAgentConsultPromise ??= import("./talk-agent-consult.js").then(
    ({ startTalkRealtimeAgentConsult }) => startTalkRealtimeAgentConsult,
  );
  return startTalkRealtimeAgentConsultPromise;
}
