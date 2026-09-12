"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PhoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { startWhatsappCallAction } from "../actions/start-call.action"
import { useWhatsappCallStore } from "./call-store"
import { useOptionalSipUserContext } from "./sip-user-provider"

type StartCallButtonProps = {
  conversationId: string
  contactName?: string | null
  /**
   * Whether this conversation's inbox is a WhatsApp number with
   * `sipProvisioningStatus === "enabled"` — resolved by the caller from
   * data already in scope (no query fired from this component).
   */
  sipCallingAvailable: boolean
}

/** Dial button in the message thread header. Hidden unless SIP calling is available. */
export function StartCallButton({
  conversationId,
  contactName,
  sipCallingAvailable,
}: StartCallButtonProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [isDialing, setIsDialing] = useState(false)
  const setOutgoingCall = useWhatsappCallStore((state) => state.setOutgoingCall)
  const sipUserContext = useOptionalSipUserContext()

  if (!(sipCallingAvailable && sipUserContext)) {
    return null
  }

  const { call } = sipUserContext

  const handleClick = async () => {
    if (!workspaceId || isDialing) {
      return
    }
    setIsDialing(true)
    try {
      const result = await startWhatsappCallAction(workspaceId, {
        conversationId,
      })
      if (result?.serverError) {
        toast.error(result.serverError)
        return
      }
      const data = result?.data
      if (!data) {
        return
      }
      setOutgoingCall({
        attemptId: data.attemptId,
        callId: data.callId,
        contactName,
      })
      await call(data.dialUri, data.attemptId)
    } catch {
      toast.error(t("whatsapp.calls.errors.audioConnectFailed"))
      setOutgoingCall(null)
    } finally {
      setIsDialing(false)
    }
  }

  return (
    <Button
      aria-label={t("whatsapp.calls.startCall")}
      className="shrink-0"
      disabled={isDialing}
      onClick={handleClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      <PhoneIcon />
    </Button>
  )
}
