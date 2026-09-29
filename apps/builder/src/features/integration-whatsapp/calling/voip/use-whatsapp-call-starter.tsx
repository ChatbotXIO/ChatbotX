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
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { logger } from "@/lib/log"
import type {
  NoneCallModeReason,
  ResolveOutboundCallModeResult,
} from "../actions/resolve-outbound-call-mode.action"
import type { StartOutboundOutcome } from "./use-whatsapp-voip-call"
import { useOptionalWhatsappVoipCallContext } from "./whatsapp-voip-call-context"

/**
 * Every non-dialing/occupied/cancelled outcome maps 1:1 to a
 * whatsapp.calls.outbound.* key. occupied/cancelled are purely local silent no-
 * ops, so they're intentionally absent here.
 */
export const OUTCOME_MESSAGE_KEYS: Partial<
  Record<StartOutboundOutcome, string>
> = {
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
  callAccessDenied: "whatsapp.calls.outbound.callAccessDenied",
}

/**
 * Maps a mode: none reason to the whatsapp.calls.capability.* sentence shown in
 * the capability AlertDialog.
 */
export const NONE_REASON_MESSAGE_KEYS: Record<NoneCallModeReason, string> = {
  callingNotEnabled: "whatsapp.calls.capability.enableCalling",
  webhookNotSubscribed: "whatsapp.calls.capability.reconnectChannel",
  tokenInvalid: "whatsapp.calls.capability.reconnectChannel",
  ineligibleNumber: "whatsapp.calls.outbound.ineligibleNumber",
  notWhatsappConversation: "whatsapp.calls.errors.notWhatsappConversation",
  // Reuses the same key a failed dial attempt maps to — one denial sentence
  // regardless of whether it surfaced from a mode resolve or an actual dial
  // attempt.
  callAccessDenied: "whatsapp.calls.outbound.callAccessDenied",
}

/**
 * Which category of capability AlertDialog is showing — drives the dialog's
 * title so a mic-permission or dial-failure alert isn't mislabelled as a
 * calling-eligibility one.
 */
export type CapabilityAlertCategory =
  | "eligibility"
  | "micPermission"
  | "dialFailure"

export const CAPABILITY_ALERT_TITLE_KEYS: Record<
  CapabilityAlertCategory,
  string
> = {
  eligibility: "whatsapp.calls.capability.title",
  micPermission: "whatsapp.calls.capability.micPermissionTitle",
  dialFailure: "whatsapp.calls.capability.dialFailureTitle",
}

export const MIC_PERMISSION_OUTCOMES = new Set<StartOutboundOutcome>([
  "micPermissionDenied",
  "micNotFound",
])

export type UseWhatsappCallStarterParams = {
  conversationId: string
  contactName?: string | null
  contactInboxId?: string
  /**
   * Undefined while resolveOutboundCallModeAction is pending. Only decides
   * what a click does, not whether the trigger renders — callers disable the
   * trigger via isResolvingMode instead to avoid a premature direct dial.
   */
  outboundCallMode: ResolveOutboundCallModeResult | undefined
}

export type UseWhatsappCallStarterResult = {
  /**
   * null when calling is disabled for this workspace/member — every caller must
   * render no call control at all in that case rather than throwing.
   */
  voipCallContext: ReturnType<typeof useOptionalWhatsappVoipCallContext>
  isResolvingMode: boolean
  isVoipMode: boolean
  canDialDirectly: boolean
  isDialing: boolean
  /**
   * Starts (or opens the permission-request flow / capability alert for) an
   * outbound call — the single entry point every call trigger wires to its
   * click handler.
   */
  handleClick: () => Promise<void>
  /**
   * The two AlertDialogs (capability alert, manual-integration warning) every
   * call trigger renders alongside its own button — kept as one shared render
   * so their copy/behavior can't drift between callers.
   */
  dialogs: ReactNode
}

/**
 * The starter — everything a WhatsApp outbound-call trigger needs besides its
 * own button markup. Extracted so the header call button, a call-back control,
 * and the contact-panel dial button share exactly one implementation instead of
 * three drifting copies.
 */
export function useWhatsappCallStarter({
  conversationId,
  contactName,
  contactInboxId,
  outboundCallMode,
}: UseWhatsappCallStarterParams): UseWhatsappCallStarterResult {
  const t = useTranslations()
  const [isDialing, setIsDialing] = useState(false)
  // Synchronous mutex for dial(): isDialing (React state) only reflects reality
  // after a re-render, so two activations in the same tick could both read
  // false and both call startOutbound. This ref is set synchronously before the
  // first await, so the second call is a guaranteed no-op.
  const isDialingRef = useRef(false)
  const [alertMessageKey, setAlertMessageKey] = useState<string | null>(null)
  const [alertCategory, setAlertCategory] =
    useState<CapabilityAlertCategory>("eligibility")
  // Manually-connected integrations can't be confirmed subscribed to the
  // calls webhook field (and one with no App Secret is never signature-
  // verified), so the agent must acknowledge a warning once per integration.
  // The dialog's open state is scoped to the integration AND conversation it
  // opened for, so either changing underneath it closes it instead of dialing
  // whatever conversation is current at click time.
  const [manualWarningTarget, setManualWarningTarget] = useState<{
    integrationId: string
    conversationId: string
  } | null>(null)
  const [acknowledgedIntegrationId, setAcknowledgedIntegrationId] = useState<
    string | null
  >(null)
  const voipCallContext = useOptionalWhatsappVoipCallContext()

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

  // A target that stopped matching is discarded, not just hidden — otherwise
  // returning to the original conversation would re-open the old dialog without
  // a new click.
  useEffect(() => {
    if (manualWarningTarget !== null && !manualWarningIsOpen) {
      setManualWarningTarget(null)
    }
  }, [manualWarningTarget, manualWarningIsOpen])

  const dial = async () => {
    if (isDialingRef.current || !voipCallContext) {
      return
    }
    isDialingRef.current = true
    setIsDialing(true)
    try {
      const outcome = await voipCallContext.startOutbound({
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
    // The warning may no longer apply to the integration it opened for — no-op
    // rather than dialing whatever conversation is now current.
    if (!(manualWarningIsOpen && outboundCallMode?.mode === "voip")) {
      return
    }
    setAcknowledgedIntegrationId(outboundCallMode.integrationId)
    // Close first so the dialog never sits over the call panel while the dial
    // is preparing; dial()'s ref lock makes a second activation a no-op.
    setManualWarningTarget(null)
    dial().catch((error: unknown) => {
      logger.error({ err: error }, "WhatsApp VoIP call-anyway dial failed")
    })
  }

  const dialogs = (
    <>
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

  return {
    voipCallContext,
    isResolvingMode,
    isVoipMode,
    canDialDirectly,
    isDialing,
    handleClick,
    dialogs,
  }
}
