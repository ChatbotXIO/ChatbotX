"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import {
  answerWhatsappCallAction,
  hangupWhatsappCallAction,
} from "./actions/call-session.action"
import { useWhatsappCallStore } from "./call-store"
import { useLivekitCall } from "./use-livekit-call"

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
 * Floating dock for in-app WhatsApp calling (beta): an incoming-call card
 * while a call rings, and an active-call card (timer, mute, hang up) once
 * the agent answers. Mounted next to ChatRealtime, which feeds the store.
 */
export function WhatsappCallDock() {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const incomingCall = useWhatsappCallStore((state) => state.incomingCall)
  const activeCall = useWhatsappCallStore((state) => state.activeCall)
  const setIncomingCall = useWhatsappCallStore((state) => state.setIncomingCall)
  const setActiveCall = useWhatsappCallStore((state) => state.setActiveCall)

  const { connect, disconnect, setMuted, isMuted } = useLivekitCall()
  const activeWacidRef = useRef<string | undefined>(undefined)

  const answer = useAction(
    answerWhatsappCallAction.bind(null, workspaceId ?? ""),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )
  const hangup = useAction(
    hangupWhatsappCallAction.bind(null, workspaceId ?? ""),
  )

  const handleAnswer = useCallback(async () => {
    if (!incomingCall) {
      return
    }
    const result = await answer.executeAsync({ wacid: incomingCall.wacid })
    const session = result?.data
    if (!session) {
      return
    }
    try {
      await connect(session.url, session.token)
    } catch {
      toast.error(t("whatsapp.calls.errors.audioConnectFailed"))
      return
    }
    activeWacidRef.current = incomingCall.wacid
    setActiveCall({
      wacid: incomingCall.wacid,
      roomName: session.roomName,
      contactName: incomingCall.contactName,
      startedAt: Date.now(),
    })
    setIncomingCall(null)
  }, [answer, connect, incomingCall, setActiveCall, setIncomingCall, t])

  const handleHangup = useCallback(async () => {
    await disconnect()
    if (activeCall?.wacid) {
      hangup.execute({ wacid: activeCall.wacid })
    }
    setActiveCall(null)
  }, [activeCall, disconnect, hangup, setActiveCall])

  // Remote end (customer hung up / room closed) — tear the audio down too.
  useEffect(() => {
    if (!activeCall && activeWacidRef.current) {
      activeWacidRef.current = undefined
      disconnect().catch(() => {
        /* already disconnected */
      })
    }
  }, [activeCall, disconnect])

  if (activeCall) {
    return (
      <Card className="fixed right-6 bottom-6 z-50 shadow-lg">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex flex-col">
            <span className="font-medium text-sm">
              {activeCall.contactName ?? t("whatsapp.calls.unknownCaller")}
            </span>
            <span className="text-muted-foreground text-xs">
              <CallTimer startedAt={activeCall.startedAt} />
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

  if (incomingCall) {
    return (
      <Card className="fixed right-6 bottom-6 z-50 shadow-lg">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex flex-col">
            <span className="font-medium text-sm">
              {incomingCall.contactName ?? t("whatsapp.calls.unknownCaller")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("whatsapp.calls.incomingCall")}
            </span>
          </div>
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            disabled={answer.isPending}
            onClick={handleAnswer}
            size="icon"
            type="button"
          >
            <PhoneIcon className="size-4" />
          </Button>
          <Button
            onClick={() => setIncomingCall(null)}
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
