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
 * Mounts the calling layer (VoIP provider/panel, the call realtime subscriber)
 * once the workspace socket is available and callingEnabled.
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
 * The one place allowed to know about both the channel-agnostic realtime
 * platform and the WhatsApp calling layer. callHistoryEnabled is independent
 * of callingEnabled — history can show without live calling.
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
