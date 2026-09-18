"use client"

import type { ReactNode } from "react"
import { WhatsappCallPanel } from "@/features/integration-whatsapp/calling/voip/whatsapp-call-panel"
import { WhatsappCallRealtime } from "@/features/integration-whatsapp/calling/voip/whatsapp-call-realtime"
import { WhatsappVoipCallProvider } from "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context"
import { WhatsappCallInfoSheet } from "@/features/messages/components/whatsapp-call-info-sheet"
import { WorkspaceRealtimeProvider } from "@/features/realtime/workspace-realtime-provider"

type WorkspaceRealtimeShellProps = {
  realtimeEnabled: boolean
  callingEnabled: boolean
  callHistoryEnabled: boolean
  children: ReactNode
}

/**
 * Mounts the calling layer (VoIP provider/panel, the call realtime
 * subscriber) once the workspace socket is available and `callingEnabled`.
 */
function WorkspaceCallingLayer({ children }: { children: ReactNode }) {
  return (
    <>
      <WhatsappCallRealtime />
      <WhatsappVoipCallProvider>
        <WhatsappCallPanel />
        {children}
      </WhatsappVoipCallProvider>
    </>
  )
}

/**
 * The workspace-level composition of the realtime platform
 * (`features/realtime`, channel-agnostic) with the WhatsApp calling layer —
 * this file is the one place allowed to know about both. Mounted around
 * `{children}` in `app/space/[workspaceId]/layout.tsx`, driven entirely by
 * the gate contract computed there (`resolveWorkspaceRealtimeGates`):
 * - `realtimeEnabled` — the workspace socket itself;
 * - `callingEnabled` — the VoIP provider/panel and call subscriber;
 * - `callHistoryEnabled` — `WhatsappCallInfoSheet` (opened from a call
 *   card's Transcript/AI Summary buttons anywhere in the app), independent
 *   of whether calling itself is enabled.
 *
 * Presence is no longer a client-side lease mounted here: the realtime
 * server itself reports connected user ids to the builder every
 * `PRESENCE_REPORT_INTERVAL_MS` (10s, see
 * `apps/realtime/src/parties/workspaces.ts` and `docs/realtime.md`), so
 * there is nothing for this shell to mount for it any more.
 */
export function WorkspaceRealtimeShell({
  realtimeEnabled,
  callingEnabled,
  callHistoryEnabled,
  children,
}: WorkspaceRealtimeShellProps) {
  if (!realtimeEnabled) {
    return <>{children}</>
  }

  return (
    <WorkspaceRealtimeProvider>
      {callHistoryEnabled && <WhatsappCallInfoSheet />}
      {callingEnabled ? (
        <WorkspaceCallingLayer>{children}</WorkspaceCallingLayer>
      ) : (
        children
      )}
    </WorkspaceRealtimeProvider>
  )
}
