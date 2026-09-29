"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PhoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import type { ResolveOutboundCallModeResult } from "../actions/resolve-outbound-call-mode.action"
import { RequestCallPermissionDialog } from "../request-call-permission-dialog"
import { useWhatsappCallStarter } from "./use-whatsapp-call-starter"

type WhatsappVoipCallButtonProps = {
  conversationId: string
  contactName?: string | null
  contactInboxId?: string
  /**
   * Undefined while resolveOutboundCallModeAction is pending; only decides
   * what a click does, never whether the button renders. Control stays
   * disabled until resolved.
   */
  outboundCallMode: ResolveOutboundCallModeResult | undefined
}

/**
 * VoIP call control, rendered synchronously for every WhatsApp conversation -
 * never gated on outboundCallMode (that only decides what a click does):
 * "voip" without direct-dial permission shows the request-permission
 * affordance; "voip" with permission (or still resolving) dials directly;
 * "none" opens an explanatory AlertDialog instead of dialing.
 *
 * A thin consumer of useWhatsappCallStarter, shared with the call-back
 * control on WhatsappCallCard and the contact-panel dial button.
 */
export function WhatsappVoipCallButton({
  conversationId,
  contactName,
  contactInboxId,
  outboundCallMode,
}: WhatsappVoipCallButtonProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const starter = useWhatsappCallStarter({
    conversationId,
    contactName,
    contactInboxId,
    outboundCallMode,
  })

  // Calling disabled for this workspace/member (the provider is not mounted) -
  // no call control renders at all rather than throwing.
  if (!starter.voipCallContext) {
    return null
  }

  if (starter.isResolvingMode) {
    // Capability still resolving: show the control disabled rather than let a
    // click behave differently depending on whether the query has returned.
    return (
      <Button
        aria-label={t("whatsapp.calls.startCall")}
        className="shrink-0"
        disabled
        size="icon"
        type="button"
        variant="ghost"
      >
        <PhoneIcon />
      </Button>
    )
  }

  if (starter.isVoipMode && !starter.canDialDirectly) {
    // No known direct-dial permission: offer the request-permission flow. A
    // permanent permission that already exists Meta-side (138017) is reconciled
    // by the worker when the request send returns that code, so a later resolve
    // flips this control to direct-dial on its own.
    return (
      <RequestCallPermissionDialog
        conversationId={conversationId}
        workspaceId={workspaceId}
      >
        <Button
          aria-label={t("whatsapp.calls.permissionRequestTitle")}
          className="shrink-0"
          size="icon"
          type="button"
          variant="ghost"
        >
          <PhoneIcon />
        </Button>
      </RequestCallPermissionDialog>
    )
  }

  return (
    <>
      <Button
        aria-label={t("whatsapp.calls.startCall")}
        className="shrink-0"
        disabled={starter.isDialing}
        onClick={starter.handleClick}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PhoneIcon />
      </Button>
      {starter.dialogs}
    </>
  )
}
