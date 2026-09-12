"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { hangupWhatsappCallAction } from "../actions/hangup-call.action"
import { useWhatsappCallStore } from "./call-store"
import { useSipUserContext } from "./sip-user-provider"

const formatElapsed = (startedAt: number): string => {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

const CallTimer = ({ startedAt }: { startedAt: number }) => {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 1000)
    return () => clearInterval(interval)
  }, [])
  return <span className="tabular-nums">{formatElapsed(startedAt)}</span>
}

/**
 * Floating dock for the FreeSWITCH agent softphone: a ringing
 * card per incoming SIP call, an active-call card (timer/mute/hang up) once
 * one is answered, and a dialing card for an outgoing attempt. Consumes the
 * single `SimpleUser` mounted by `SipUserProvider` (one per open
 * workspace) — mounted next to `ChatRealtime`, which feeds the ringing
 * enrichment.
 */
export function WhatsappCallDock() {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const incoming = useWhatsappCallStore((state) => state.incoming)
  const active = useWhatsappCallStore((state) => state.active)
  const outgoing = useWhatsappCallStore((state) => state.outgoing)
  const dismissIncoming = useWhatsappCallStore((state) => state.dismissIncoming)
  const setActiveCall = useWhatsappCallStore((state) => state.setActiveCall)
  const setOutgoingCall = useWhatsappCallStore((state) => state.setOutgoingCall)

  const { answer, decline, hangup, setMuted, isMuted } = useSipUserContext()

  const incomingCalls = Object.values(incoming)
  const firstIncoming = incomingCalls[0]

  const handleAnswer = useCallback(async () => {
    if (!firstIncoming) {
      return
    }
    try {
      await answer(firstIncoming.rootUuid)
    } catch {
      toast.error(t("whatsapp.calls.errors.audioConnectFailed"))
    }
  }, [answer, firstIncoming, t])

  const handleDecline = useCallback(async () => {
    if (!firstIncoming) {
      return
    }
    await decline().catch(() => undefined)
    dismissIncoming(firstIncoming.rootUuid)
  }, [decline, dismissIncoming, firstIncoming])

  const handleHangup = useCallback(async () => {
    await hangup().catch(() => undefined)
    const callId = active?.callId
    setActiveCall(null)
    if (workspaceId && callId) {
      await hangupWhatsappCallAction(workspaceId, { callId }).catch(() => {
        toast.error(t("whatsapp.calls.errors.hangupFailed"))
      })
    }
  }, [active, hangup, setActiveCall, t, workspaceId])

  if (active) {
    return (
      <Card className="fixed right-6 bottom-6 z-50 shadow-lg">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex flex-col">
            <span className="font-medium text-sm">
              {active.contactName ?? t("whatsapp.calls.unknownCaller")}
            </span>
            <span className="text-muted-foreground text-xs">
              <CallTimer startedAt={active.startedAt} />
            </span>
          </div>
          <Button
            onClick={() => setMuted(!isMuted)}
            size="icon"
            type="button"
            variant="outline"
          >
            {isMuted ? (
              <MicOffIcon className="size-4" />
            ) : (
              <MicIcon className="size-4" />
            )}
          </Button>
          <Button
            onClick={handleHangup}
            size="icon"
            type="button"
            variant="destructive"
          >
            <PhoneOffIcon className="size-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (outgoing) {
    return (
      <Card className="fixed right-6 bottom-6 z-50 shadow-lg">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex flex-col">
            <span className="font-medium text-sm">
              {outgoing.contactName ?? t("whatsapp.calls.unknownCaller")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("whatsapp.calls.dialing")}
            </span>
          </div>
          <Button
            onClick={() => setOutgoingCall(null)}
            size="icon"
            type="button"
            variant="outline"
          >
            <PhoneOffIcon className="size-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (firstIncoming) {
    return (
      <Card className="fixed right-6 bottom-6 z-50 shadow-lg">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex flex-col">
            <span className="font-medium text-sm">
              {firstIncoming.contactName ?? t("whatsapp.calls.unknownCaller")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("whatsapp.calls.incomingCall")}
            </span>
          </div>
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={handleAnswer}
            size="icon"
            type="button"
          >
            <PhoneIcon className="size-4" />
          </Button>
          <Button
            onClick={handleDecline}
            size="icon"
            type="button"
            variant="outline"
          >
            <PhoneOffIcon className="size-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
