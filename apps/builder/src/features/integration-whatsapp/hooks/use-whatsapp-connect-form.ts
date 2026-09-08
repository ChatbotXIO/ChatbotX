"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import {
  connectFailureMessageKey,
  SESSION_ERROR_MESSAGE_KEYS,
} from "@/features/channel-connect/lib/row-status"
import { MAX_CONNECT_SELECTIONS } from "@/features/channel-connect/schema"
import { connectWhatsappAction } from "../actions/connect.action"
import { toConnectResultIntent } from "../libs/connect-result-intent"
import { FORM_FIELDS } from "../libs/form-fields"
import {
  buildConnectWhatsappSchema,
  type ConnectWhatsappSchema,
  type WhatsappConnectOutcome,
  type WhatsappPhoneNumberOption,
} from "../schema"
import type { WhatsappConnectStagesApi } from "./use-whatsapp-connect-stages"

/** A directly-connected (non-picker) outcome eligible for the coexist opt-in popup. */
type DirectCoexistState = {
  integrationId: string
  workspaceId: string
  stageParams: {
    outcome: WhatsappConnectOutcome
    workspaceId: string
    redirectUrl: string
  }
}

export type UseWhatsappConnectFormOptions = {
  workspaceId?: string | null
  stages: WhatsappConnectStagesApi
}

/**
 * Owns the top-level connect form (`useHookFormAction`) and its `onSuccess`
 * result dispatch (`toConnectResultIntent`, a pure classification —
 * `libs/connect-result-intent.ts`): the phone-number selection state the
 * picker section consumes, the session-error flag the SDK section freezes
 * on, and the top-level form's own single-shot coexist popup (manual /
 * auto-select paths only — the picker's fan-out opts in per row instead, via
 * `useConnectFlow` inside `use-whatsapp-connect-fanout.ts`).
 */
type ConnectIntent = ReturnType<typeof toConnectResultIntent>
type SelectionIntent = Extract<ConnectIntent, { kind: "selection" }>
type ConnectedIntent = Extract<ConnectIntent, { kind: "connected" }>

/** Default values for one mount of the top-level connect form. */
const connectFormDefaults = (workspaceId?: string | null) => ({
  // UI
  connectExisting: false,
  transferPhoneNumber: false,
  manualConnect: false,
  marketingMessageLite: true,
  workspaceId: workspaceId ?? "",

  // Main fields
  wabaId: "",
  businessId: "",
  phoneNumberId: "",
  manualPhoneNumberId: "",
  coexistPhoneNumberIds: [],
  aiReadsSyncedHistoryPhoneNumberIds: [],
  accessToken: "",
  code: "",
  signupSessionId: "",
})

/**
 * Meta returned a list to pick from: seed the session id and clear every
 * selection field.
 *
 * The three id lists are reset together — opt-ins left over from an earlier
 * signup attempt in the same mounted form must not carry into the next
 * selection. The form is then reset as a NEW phase: no errors, not submitted,
 * keeping the values just written. That last part is belt-and-braces rather
 * than a fix for a specific report: a `handleSubmit` earlier in this mount
 * stores resolver errors for every field, including ones that only mount
 * later, so the picker could otherwise open showing a message about a
 * selection nobody has made. On-change validation is unaffected
 * (`mode: "onChange"` validates on change whether or not the form has been
 * submitted), so the message still appears the moment the operator empties the
 * selection themselves (pinned by a test).
 */
const applySelectionIntent = (
  form: UseFormReturn<ConnectWhatsappSchema>,
  intent: SelectionIntent,
) => {
  form.setValue(FORM_FIELDS.SIGNUP_SESSION_ID, intent.signupSessionId)
  form.setValue(FORM_FIELDS.PHONE_NUMBER_IDS, [])
  form.setValue(FORM_FIELDS.COEXIST_PHONE_NUMBER_IDS, [])
  form.setValue(FORM_FIELDS.AI_READS_SYNCED_HISTORY_PHONE_NUMBER_IDS, [])
  form.reset(undefined, {
    keepValues: true,
    keepDirty: true,
    keepErrors: false,
    keepIsSubmitted: false,
    keepSubmitCount: false,
  })
}

export function useWhatsappConnectForm({
  workspaceId,
  stages,
}: UseWhatsappConnectFormOptions) {
  const t = useTranslations()
  const [phoneSelection, setPhoneSelection] = useState<{
    phoneNumbers: WhatsappPhoneNumberOption[]
  } | null>(null)
  const [sessionErrored, setSessionErrored] = useState(false)
  const [directCoexist, setDirectCoexist] = useState<DirectCoexistState | null>(
    null,
  )

  /**
   * A single connected number, from the manual / auto-select paths (the
   * picker's fan-out opts into coexist per row instead). A coexist-eligible
   * number opens the single-shot popup; anything else goes straight to the
   * post-connect stages.
   */
  const startConnectedStages = (intent: ConnectedIntent) => {
    setPhoneSelection(null)
    toast.success(t("messages.connectSuccess", { feature: "Whatsapp" }))

    const stageParams = {
      outcome: intent.outcome,
      workspaceId: intent.workspaceId,
      redirectUrl: intent.redirectUrl,
    }
    if (intent.outcome.coexistEligible) {
      setDirectCoexist({
        integrationId: intent.outcome.integrationId ?? "",
        workspaceId: intent.workspaceId,
        stageParams,
      })
      return
    }
    stages.start(stageParams)
  }

  /**
   * One connect result, classified once (`toConnectResultIntent`) and routed
   * to the surface that owns it — the session-error flag, a toast, the phone
   * picker, or the post-connect stages.
   */
  const applyConnectIntent = (intent: ConnectIntent) => {
    setSessionErrored(intent.kind === "sessionError")
    form.setValue(FORM_FIELDS.CODE, "")

    switch (intent.kind) {
      case "sessionError":
        toast.error(t(SESSION_ERROR_MESSAGE_KEYS[intent.code]))
        return
      case "itemFailure":
        toast.error(t(connectFailureMessageKey("whatsapp", intent.outcome)))
        return
      case "selection":
        applySelectionIntent(form, intent)
        setPhoneSelection({ phoneNumbers: intent.phoneNumbers })
        return
      case "toastError":
        toast.error(t(intent.messageKey))
        return
      case "connected":
        startConnectedStages(intent)
        return
      default: {
        const exhaustiveCheck: never = intent
        return exhaustiveCheck
      }
    }
  }

  const { action, form, handleSubmitWithAction } = useHookFormAction(
    connectWhatsappAction,
    zodResolver(
      buildConnectWhatsappSchema({
        min: t("channels.connectMany.validation.min"),
        max: t("channels.connectMany.validation.max", {
          max: MAX_CONNECT_SELECTIONS,
        }),
        duplicate: t("channels.connectMany.validation.duplicate"),
      }),
    ),
    {
      actionProps: {
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
        onSuccess: ({ data }) => {
          if (data) {
            applyConnectIntent(toConnectResultIntent(data))
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: connectFormDefaults(workspaceId),
      },
    },
  )

  /** Runs the coexist popup's own stage sequence, then clears the popup. */
  const resolveDirectCoexist = useCallback(() => {
    if (directCoexist) {
      stages.start(directCoexist.stageParams)
    }
    setDirectCoexist(null)
  }, [directCoexist, stages.start])

  return {
    form,
    action,
    handleSubmitWithAction,
    phoneSelection,
    sessionErrored,
    directCoexist,
    resolveDirectCoexist,
  }
}
