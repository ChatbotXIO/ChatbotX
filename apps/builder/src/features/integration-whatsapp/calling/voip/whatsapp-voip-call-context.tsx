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
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import { logger } from "@/lib/log"
import type {
  StartOutboundOutcome,
  StartOutboundParams,
} from "./use-whatsapp-voip-call"
import { useWhatsappVoipCall } from "./use-whatsapp-voip-call"
import {
  isCallSlotFree,
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
} from "./voip-call-store"

/**
 * Lets callers decide whether to navigate without re-reading voip-call-store.
 * "pendingConfirmation" means the replacement dialog opened; onAnswered fires
 * later once confirmReplacement resolves.
 */
export type AnswerOutcome = "answered" | "declined" | "pendingConfirmation"

export type WhatsappVoipCallContextValue = {
  /**
   * Accepts an offer (the slot's call, or a basket entry by id). Answering a
   * basket entry while the slot is engaged with a different call first shows a
   * confirmation dialog. onAnswered fires with the conversationId once the
   * answer actually succeeds, immediately or later via confirmReplacement.
   */
  answer: (
    whatsappCallId?: string,
    onAnswered?: (conversationId: string) => void,
  ) => Promise<AnswerOutcome>
  /**
   * Silences an incoming ring locally. With no id, the current slot's ring
   * (does not end the call for others). With an id, drops just that basket
   * entry.
   */
  dismiss: (whatsappCallId?: string) => void
  /**
   * Ends the current active call, or cancels an outbound call still
   * preparing/dialing/ringing.
   */
  hangup: () => Promise<void>
  toggleMute: () => void
  /**
   * Clears a lingering ended call immediately instead of waiting out the ~2s
   * auto-dismiss.
   */
  dismissEnded: () => void
  startOutbound: (params: StartOutboundParams) => Promise<StartOutboundOutcome>
}

const WhatsappVoipCallContext =
  createContext<WhatsappVoipCallContextValue | null>(null)

/**
 * The offer being confirmed for replacement, and the call it would replace —
 * captured as display snapshots at dialog-open time so the dialog's copy never
 * needs to re-read the store.
 */
type ReplacementTarget = {
  currentCallId: string
  currentContactName: string
  incomingCallId: string
  incomingContactName: string
  /**
   * The offer's own conversation — needed so confirmReplacement can report the
   * same conversationId to onAnswered that an immediate answer would have.
   */
  incomingConversationId: string
  /** Captured from the answer() call that opened this dialog. */
  onAnswered?: (conversationId: string) => void
}

/**
 * Single owner of useWhatsappVoipCall — its RTCPeerConnection and mic track
 * live in refs, so mounting it twice would race two peer connections. Also
 * owns the "replace the active call?" confirmation dialog.
 */
export function WhatsappVoipCallProvider({
  children,
}: {
  children: ReactNode
}) {
  const t = useTranslations()
  const {
    remoteAudioRef,
    answer: answerCall,
    dismiss,
    hangup,
    toggleMute,
    dismissEnded,
    startOutbound,
  } = useWhatsappVoipCall()
  const [replacementTarget, setReplacementTarget] =
    useState<ReplacementTarget | null>(null)

  // Shared by both the immediate-answer and delayed confirmReplacement paths:
  // reads the store back after answerCall settles and reports success to
  // onAnswered only if the target call is genuinely active for the conversation
  // it claims, so the two call sites can never drift on what counts as success.
  const resolveAnswered = useCallback(
    (
      conversationId: string,
      onAnswered?: (conversationId: string) => void,
    ): AnswerOutcome => {
      const current = useWhatsappVoipCallStore.getState().call
      const answered =
        current?.phase === WhatsappVoipCallPhase.active &&
        current.conversationId === conversationId
      if (answered) {
        onAnswered?.(conversationId)
      }
      return answered ? "answered" : "declined"
    },
    [],
  )

  const answer = useCallback(
    async (
      whatsappCallId?: string,
      onAnswered?: (conversationId: string) => void,
    ): Promise<AnswerOutcome> => {
      const state = useWhatsappVoipCallStore.getState()
      const targetId = whatsappCallId ?? state.call?.whatsappCallId
      if (!targetId) {
        return "declined"
      }
      const current = state.call
      const slotIsEngaged = !isCallSlotFree(current)
      const isSlotsOwnCall = current?.whatsappCallId === targetId
      const conversationId = isSlotsOwnCall
        ? current.conversationId
        : state.ringingCalls.find((entry) => entry.whatsappCallId === targetId)
            ?.conversationId
      // No replacement to confirm: either the slot is free, or the target
      // already is the slot's own call — the common path.
      if (!slotIsEngaged || isSlotsOwnCall) {
        await answerCall(targetId)
        return conversationId
          ? resolveAnswered(conversationId, onAnswered)
          : "declined"
      }
      // Don't offer the replacement dialog while the slot's own call already
      // has an answer in flight — useWhatsappVoipCall.answer's mutex is held
      // the instant answerIncoming starts. Confirming would call answerCall
      // again for a different id, which the mutex silently rejects, closing the
      // dialog with no feedback. Better to never offer a confirmation that can
      // only confirm into a no-op.
      if (current?.phase === WhatsappVoipCallPhase.answering) {
        return "declined"
      }
      const incoming = state.ringingCalls.find(
        (entry) => entry.whatsappCallId === targetId,
      )
      if (!(incoming && current)) {
        // Not a real, currently-offered call (already answered elsewhere,
        // expired, or dismissed) — nothing to confirm or answer.
        return "declined"
      }
      setReplacementTarget({
        currentCallId: current.whatsappCallId,
        currentContactName:
          current.contactName ?? t("whatsapp.calls.unknownCaller"),
        incomingCallId: incoming.whatsappCallId,
        incomingContactName:
          incoming.contactName ?? t("whatsapp.calls.unknownCaller"),
        incomingConversationId: incoming.conversationId,
        onAnswered,
      })
      return "pendingConfirmation"
    },
    [answerCall, resolveAnswered, t],
  )

  // The offer can lapse or be answered elsewhere while the agent is still
  // reading this dialog. Closing it immediately is the real fix; this covers
  // the last few milliseconds, since without it answer returns silently and the
  // agent believes they took the call.
  const confirmReplacement = useCallback(() => {
    const target = replacementTarget
    setReplacementTarget(null)
    if (!target) {
      return
    }
    const stillRinging = useWhatsappVoipCallStore
      .getState()
      .ringingCalls.some(
        (entry) => entry.whatsappCallId === target.incomingCallId,
      )
    if (!stillRinging) {
      toast.error(t("whatsapp.calls.errors.callNoLongerRinging"))
      return
    }
    answerCall(target.incomingCallId)
      .then(() =>
        resolveAnswered(target.incomingConversationId, target.onAnswered),
      )
      .catch((error: unknown) => {
        logger.error(
          { err: error, whatsappCallId: target.incomingCallId },
          "WhatsApp VoIP replacement answer failed",
        )
      })
  }, [answerCall, replacementTarget, resolveAnswered, t])

  // Auto-close the confirmation when the named offer stops ringing (expired,
  // dismissed, or won elsewhere) — a stale confirmation can only ever confirm
  // into a no-op.
  const ringingCalls = useWhatsappVoipCallStore((state) => state.ringingCalls)
  useEffect(() => {
    if (!replacementTarget) {
      return
    }
    const stillRinging = ringingCalls.some(
      (entry) => entry.whatsappCallId === replacementTarget.incomingCallId,
    )
    if (!stillRinging) {
      setReplacementTarget(null)
    }
  }, [ringingCalls, replacementTarget])

  // Memoized because this provider re-renders on every store change it
  // subscribes to. A fresh object each time would re-render every consumer —
  // including every virtualized ConversationItem — on a mute toggle or
  // countdown tick, exactly what each row's selector is written to avoid.
  const contextValue = useMemo(
    () => ({
      answer,
      dismiss,
      hangup,
      toggleMute,
      dismissEnded,
      startOutbound,
    }),
    [answer, dismiss, hangup, toggleMute, dismissEnded, startOutbound],
  )

  return (
    <WhatsappVoipCallContext.Provider value={contextValue}>
      {/** biome-ignore lint/a11y/useMediaCaption: remote call audio has no captions to attach */}
      <audio autoPlay ref={remoteAudioRef} />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setReplacementTarget(null)
          }
        }}
        open={replacementTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {replacementTarget &&
                t("whatsapp.calls.replaceConfirm.title", {
                  current: replacementTarget.currentContactName,
                })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {replacementTarget &&
                t("whatsapp.calls.replaceConfirm.description", {
                  current: replacementTarget.currentContactName,
                  incoming: replacementTarget.incomingContactName,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("whatsapp.calls.replaceConfirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmReplacement}
            >
              {t("whatsapp.calls.replaceConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {children}
    </WhatsappVoipCallContext.Provider>
  )
}

/**
 * Consumes the single useWhatsappVoipCall instance owned by
 * WhatsappVoipCallProvider.
 */
export function useWhatsappVoipCallContext(): WhatsappVoipCallContextValue {
  const context = useContext(WhatsappVoipCallContext)
  if (!context) {
    throw new Error(
      "useWhatsappVoipCallContext must be used within a WhatsappVoipCallProvider",
    )
  }
  return context
}

/**
 * Optional variant for consumers rendered on every workspace page that must not
 * throw when calling is disabled for the workspace/member and the provider
 * isn't mounted. null means render nothing, never a crash.
 */
export function useOptionalWhatsappVoipCallContext(): WhatsappVoipCallContextValue | null {
  return useContext(WhatsappVoipCallContext)
}
