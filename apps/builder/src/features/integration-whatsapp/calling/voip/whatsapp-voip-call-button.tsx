"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PhoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { logger } from "@/lib/log"
import type {
  NoneCallModeReason,
  ResolveOutboundCallModeResult,
} from "../actions/resolve-outbound-call-mode.action"
import { RequestCallPermissionDialog } from "../request-call-permission-dialog"
import type { StartOutboundOutcome } from "./use-whatsapp-voip-call"
import { useWhatsappVoipCallContext } from "./whatsapp-voip-call-context"

type WhatsappVoipCallButtonProps = {
  conversationId: string
  contactName?: string | null
  contactInboxId?: string
  /**
   * The async capability resolution — `undefined` while
   * `resolveOutboundCallModeAction` is still pending. NEVER used to gate
   * whether this button renders (the caller renders it synchronously for
   * every WhatsApp conversation.); only used to decide what
   * a click does. While still `undefined` the control is rendered DISABLED,
   * so a click always acts on a resolved permission state — clicking during
   * the resolve window used to dial directly while the same click a moment
   * later opened the permission dialog, which read as "random".
   */
  outboundCallMode: ResolveOutboundCallModeResult | undefined
}

/** Every non-"dialing"/"occupied"/"cancelled" outcome maps 1:1 to a
 * `whatsapp.calls.outbound.*` key — see `initiate-outbound-voip-call.action.ts`
 * and `use-whatsapp-voip-call.ts`. `"occupied"`/`"cancelled"` are purely
 * local, silent no-ops, so they are intentionally absent here. */
const OUTCOME_MESSAGE_KEYS: Partial<Record<StartOutboundOutcome, string>> = {
  needsPermission: "whatsapp.calls.outbound.needsPermission",
  callAlreadyInProgress: "whatsapp.calls.outbound.callAlreadyInProgress",
  dailyLimitReached: "whatsapp.calls.outbound.dailyLimitReached",
  ineligibleNumber: "whatsapp.calls.outbound.ineligibleNumber",
  recipientUncallable: "whatsapp.calls.outbound.recipientUncallable",
  temporarilyDisabled: "whatsapp.calls.outbound.temporarilyDisabled",
  rateLimited: "whatsapp.calls.outbound.rateLimited",
  paymentIssue: "whatsapp.calls.outbound.paymentIssue",
  callingNotEnabled: "whatsapp.calls.outbound.callingNotEnabled",
  callFailed: "whatsapp.calls.outbound.callFailed",
  micPermissionDenied: "whatsapp.calls.outbound.micPermissionDenied",
  micNotFound: "whatsapp.calls.outbound.micNotFound",
}

/** Maps a `mode: "none"` reason to the `whatsapp.calls.capability.*`
 * sentence shown in the capability `AlertDialog`.*/
const NONE_REASON_MESSAGE_KEYS: Record<NoneCallModeReason, string> = {
  callingNotEnabled: "whatsapp.calls.capability.enableCalling",
  webhookNotSubscribed: "whatsapp.calls.capability.reconnectChannel",
  tokenInvalid: "whatsapp.calls.capability.reconnectChannel",
  ineligibleNumber: "whatsapp.calls.outbound.ineligibleNumber",
  notWhatsappConversation: "whatsapp.calls.errors.notWhatsappConversation",
}

/** Which category of capability `AlertDialog` is showing — drives the
 * dialog's title, so a mic-permission or dial-failure alert is not
 * mislabelled as a calling-eligibility one. */
type CapabilityAlertCategory = "eligibility" | "micPermission" | "dialFailure"

const CAPABILITY_ALERT_TITLE_KEYS: Record<CapabilityAlertCategory, string> = {
  eligibility: "whatsapp.calls.capability.title",
  micPermission: "whatsapp.calls.capability.micPermissionTitle",
  dialFailure: "whatsapp.calls.capability.dialFailureTitle",
}

const MIC_PERMISSION_OUTCOMES = new Set<StartOutboundOutcome>([
  "micPermissionDenied",
  "micNotFound",
])

/**
 * VoIP (browser WebRTC) call control, rendered SYNCHRONOUSLY by
 * `MessageHead` for every WhatsApp conversation — never gated on
 * `outboundCallMode` (that only decides what a click does).
 *
 * - `mode: "voip"` + no direct-dial permission -> the existing
 *   request-permission affordance.
 * - `mode: "voip"` + direct-dial permission, or the mode is still resolving
 *   -> an enabled call button; clicking dials directly (the `preparing`
 *   phase absorbs any remaining wait for the mode query).
 * - `mode: "none"` -> an enabled-looking button whose click opens a
 *   capability `AlertDialog` explaining why (Img 19), instead of dialing.
 */
export function WhatsappVoipCallButton({
  conversationId,
  contactName,
  contactInboxId,
  outboundCallMode,
}: WhatsappVoipCallButtonProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [isDialing, setIsDialing] = useState(false)
  // Synchronous mutex for `dial()`: `isDialing` (React state) only reflects
  // reality after a re-render, so two activations dispatched in the same
  // tick (e.g. two rapid clicks on "Call anyway", or a double-click on the
  // direct-dial button) can both read `isDialing === false` and both call
  // `startOutbound`. This ref is set synchronously, before the first
  // `await`, so the second activation's `dial()` call is a guaranteed no-op.
  const isDialingRef = useRef(false)
  const [alertMessageKey, setAlertMessageKey] = useState<string | null>(null)
  const [alertCategory, setAlertCategory] =
    useState<CapabilityAlertCategory>("eligibility")
  // R4 §6.4 + calls-subscription notice: for EVERY manually-connected
  // integration ChatbotX cannot confirm the customer's own Meta app is
  // subscribed to the `calls` webhook field (`manualCallsSubscriptionUnverified`),
  // and a manual integration with no Meta App Secret is additionally never
  // signature-verified (`unsignedWebhookWarning`; see
  // `resolve-outbound-call-mode.action.ts` and `signature-policy.ts`). The
  // agent may still dial, but only after acknowledging the warning once —
  // scoped to `integrationId` (not a bare boolean) so switching to a
  // different WhatsApp number/conversation shows the warning again rather
  // than silently reusing an acknowledgement from an unrelated integration.
  //
  // The dialog's open state is scoped to the integration AND conversation it
  // was opened for (rather than a bare boolean) so that if either changes
  // underneath it — navigating to another conversation (even on the same
  // number), or the mode query refetching onto a different integration/mode —
  // the dialog closes itself (and "Call anyway" becomes a no-op) instead of
  // staying open and dialing whatever conversation is current at click time.
  const [manualWarningTarget, setManualWarningTarget] = useState<{
    integrationId: string
    conversationId: string
  } | null>(null)
  const [acknowledgedIntegrationId, setAcknowledgedIntegrationId] = useState<
    string | null
  >(null)
  const { startOutbound } = useWhatsappVoipCallContext()

  // `undefined` = `resolveOutboundCallModeAction` still in flight. A click
  // during this window used to fall through to a direct dial, while the exact
  // same click a moment later (once resolved to no-permission) opened the
  // request-permission dialog — the "random: sometimes asks, sometimes not"
  // the timing produced. Gating the control on this flag makes a click always
  // act on a resolved permission state, so the behaviour is deterministic.
  const isResolvingMode = outboundCallMode === undefined
  const isVoipMode = outboundCallMode?.mode === "voip"
  const canDialDirectly =
    isVoipMode &&
    (outboundCallMode.permissionStatus === "temporary" ||
      outboundCallMode.permissionStatus === "permanent")
  const manualWarningApplies =
    isVoipMode &&
    (outboundCallMode.unsignedWebhookWarning ||
      outboundCallMode.manualCallsSubscriptionUnverified)
  const manualWarningIsOpen =
    manualWarningApplies &&
    isVoipMode &&
    manualWarningTarget?.integrationId === outboundCallMode.integrationId &&
    manualWarningTarget.conversationId === conversationId

  // A target that stopped matching (navigated away, or the mode refetched)
  // is discarded, not just hidden — otherwise returning to the original
  // conversation would re-open the old dialog without a new click.
  useEffect(() => {
    if (manualWarningTarget !== null && !manualWarningIsOpen) {
      setManualWarningTarget(null)
    }
  }, [manualWarningTarget, manualWarningIsOpen])

  const dial = async () => {
    if (isDialingRef.current) {
      return
    }
    isDialingRef.current = true
    setIsDialing(true)
    try {
      const outcome = await startOutbound({
        conversationId,
        contactInboxId,
        contactName,
      })
      if (
        outcome === "dialing" ||
        outcome === "occupied" ||
        outcome === "cancelled"
      ) {
        return
      }
      setAlertCategory(
        MIC_PERMISSION_OUTCOMES.has(outcome) ? "micPermission" : "dialFailure",
      )
      setAlertMessageKey(
        OUTCOME_MESSAGE_KEYS[outcome] ?? "whatsapp.calls.outbound.callFailed",
      )
    } finally {
      isDialingRef.current = false
      setIsDialing(false)
    }
  }

  const handleClick = async () => {
    if (isDialing) {
      return
    }
    if (outboundCallMode?.mode === "none") {
      setAlertCategory("eligibility")
      setAlertMessageKey(NONE_REASON_MESSAGE_KEYS[outboundCallMode.reason])
      return
    }
    if (
      outboundCallMode?.mode === "voip" &&
      (outboundCallMode.unsignedWebhookWarning ||
        outboundCallMode.manualCallsSubscriptionUnverified) &&
      acknowledgedIntegrationId !== outboundCallMode.integrationId
    ) {
      setManualWarningTarget({
        integrationId: outboundCallMode.integrationId,
        conversationId,
      })
      return
    }
    await dial()
  }

  const handleCallAnyway = () => {
    // The warning may no longer apply to the integration it was opened for
    // (mode/integration changed underneath the open dialog) — no-op rather
    // than dialing whatever conversation is now current.
    if (!(manualWarningIsOpen && outboundCallMode?.mode === "voip")) {
      return
    }
    setAcknowledgedIntegrationId(outboundCallMode.integrationId)
    // Close first so the dialog never sits over the call panel while the dial
    // is preparing; `dial()`'s ref lock makes a second activation a no-op.
    setManualWarningTarget(null)
    dial().catch((error: unknown) => {
      logger.error({ err: error }, "WhatsApp VoIP call-anyway dial failed")
    })
  }

  if (isResolvingMode) {
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

  if (isVoipMode && !canDialDirectly) {
    // No known direct-dial permission: offer the request-permission flow. A
    // permanent permission that already exists Meta-side (138017) is
    // reconciled by the worker when the request send returns that code, so a
    // later resolve flips this control to direct-dial on its own.
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
        disabled={isDialing}
        onClick={handleClick}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PhoneIcon />
      </Button>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setAlertMessageKey(null)
          }
        }}
        open={alertMessageKey !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(CAPABILITY_ALERT_TITLE_KEYS[alertCategory])}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alertMessageKey ? t(alertMessageKey) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAlertMessageKey(null)}>
              {t("whatsapp.calls.capability.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isVoipMode && (
        <AlertDialog
          onOpenChange={(open) => {
            if (!open) {
              setManualWarningTarget(null)
            }
          }}
          open={manualWarningIsOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("whatsapp.calls.manualIntegrationCallWarning.title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="flex flex-col gap-2">
                {outboundCallMode.manualCallsSubscriptionUnverified && (
                  <span>
                    {t(
                      "whatsapp.calls.manualIntegrationCallWarning.callsSubscription",
                    )}
                  </span>
                )}
                {outboundCallMode.unsignedWebhookWarning && (
                  <span>
                    {t(
                      "whatsapp.calls.manualIntegrationCallWarning.unsignedWebhook",
                    )}
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDialing}
                onClick={handleCallAnyway}
              >
                {t("whatsapp.calls.manualIntegrationCallWarning.callAnyway")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
