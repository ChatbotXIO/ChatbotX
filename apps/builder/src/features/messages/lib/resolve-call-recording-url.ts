/**
 * Shared by calls-table.tsx, whatsapp-call-card.tsx and
 * whatsapp-call-info-sheet.tsx so the dynamic import, null check and error
 * shape cannot drift between them. The action import stays dynamic so a
 * Calls page render that never opens a player never pulls in its module
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
