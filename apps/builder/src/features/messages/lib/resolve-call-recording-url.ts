/**
 * M3 fix (dedup) — the ONE place that resolves a fresh signed playback URL
 * for a WhatsApp call recording. Previously copy-pasted three times
 * (`whatsapp-calls/calls-table.tsx`, `messages/components/
 * whatsapp-call-card.tsx`, `messages/components/whatsapp-call-info-sheet.tsx`)
 * with the exact same dynamic import + null-check + error shape — any future
 * change (a retry, a different error type) had to be applied three times in
 * lockstep or the three callers would silently drift.
 *
 * The action import stays dynamic (`apps/builder/src` allows/prefers it for
 * heavy client islands per `.agents/rules/no-dynamic-import.md`) so a Calls
 * page render that never opens a player never pulls in the action's module
 * graph.
 */
export function createResolveCallRecordingUrl(input: {
  workspaceId: string
  whatsappCallId: string | null | undefined
  /** Prefixes the thrown error so the failure is traceable to its caller. */
  context: string
}): () => Promise<string> {
  return async () => {
    if (!input.whatsappCallId) {
      throw new Error(`${input.context}: missing callId`)
    }
    const { getCallRecordingUrlAction } = await import(
      "@/features/messages/actions/get-call-recording-url.action"
    )
    const result = await getCallRecordingUrlAction(input.workspaceId, {
      whatsappCallId: input.whatsappCallId,
    })
    const url = result?.data?.url
    if (!url) {
      throw new Error(`${input.context}: no recording URL returned`)
    }
    return url
  }
}
