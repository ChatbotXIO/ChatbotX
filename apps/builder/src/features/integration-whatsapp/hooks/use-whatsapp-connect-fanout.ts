"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import type { ConnectFlowFinished } from "@/features/channel-connect/hooks/use-connect-flow"
import { useConnectFlow } from "@/features/channel-connect/hooks/use-connect-flow"
import { connectViaApi } from "@/features/channel-connect/lib/connect-client"
import { CONNECT_CHANNEL_REGISTRY } from "@/features/channel-connect/lib/registry"
import { buildWhatsappConnectExtraSteps } from "../components/whatsapp-connect-extra-steps"
import type { PhoneNumberSelectionValues } from "../components/whatsapp-connect-sections"
import {
  adaptWhatsappConnectActionResult,
  type WhatsappConnectActionResultWithInfo,
  type WhatsappConnectedInfo,
} from "../libs/adapt-connect-result"
import {
  type ConnectWhatsappSchema,
  connectWhatsappViaSessionResponse,
  type WhatsappPhoneNumberOption,
} from "../schema"
import type { useWhatsappConnectForm } from "./use-whatsapp-connect-form"
import type { WhatsappConnectStagesApi } from "./use-whatsapp-connect-stages"

export type UseWhatsappConnectFanoutOptions = {
  form: ReturnType<typeof useWhatsappConnectForm>["form"]
  phoneSelection: { phoneNumbers: WhatsappPhoneNumberOption[] } | null
  stages: WhatsappConnectStagesApi
}

type PhoneNumberItem = {
  id: string
  name: string
  coexist: boolean
  aiReadsSyncedHistory: boolean
}

/**
 * Workspace/redirect from whichever item `connectOne` last connected —
 * stamped on every connect (single or batch), but only read on the batch
 * path (at the dialog's Continue click, via `advanceStage`'s "batch" case).
 * Every number in one batch shares a workspace (one signup session), so
 * "last connected" and "the batch's workspace" are the same value there;
 * the single path only falls back to it for `connectedWorkspaceId` below,
 * since its own result already carries the same info through
 * `useConnectFlow`'s `onFinished` payload.
 */
type WhatsappLastConnectedInfo = Pick<
  WhatsappConnectedInfo,
  "workspaceId" | "redirectUrl"
>

/** The form fields the session connect route accepts — the rest stay server-side. */
type SessionConnectFields = Pick<
  ConnectWhatsappSchema,
  | "signupSessionId"
  | "connectExisting"
  | "transferPhoneNumber"
  | "marketingMessageLite"
>

/**
 * One number's connect on the session path — the picker's fan-out never
 * reaches the manual / OAuth-direct paths, so the payload stays minimal:
 * never the workspaceId/code/accessToken/wabaId the session already carries
 * server-side. The route, not the server action: Next serializes server
 * actions from one browser, so the batch could only ever connect one number
 * at a time.
 */
async function connectPhoneNumberViaSession(
  item: PhoneNumberItem,
  fields: SessionConnectFields,
): Promise<WhatsappConnectActionResultWithInfo> {
  const result = await connectViaApi({
    route: CONNECT_CHANNEL_REGISTRY.whatsapp.connectRoute,
    body: {
      // The form field is `nullish` (the manual and OAuth paths carry no
      // session), but this path is only reachable from a signup session. An
      // empty string keeps the previous behaviour for the impossible case:
      // the route's own `min(1)` rejects it and the row lands on the shared
      // failed/unknown outcome, exactly as a `null` on the wire used to.
      signupSessionId: fields.signupSessionId ?? "",
      phoneNumberId: item.id,
      connectExisting: fields.connectExisting,
      transferPhoneNumber: fields.transferPhoneNumber,
      marketingMessageLite: fields.marketingMessageLite,
    },
    parse: (data) => connectWhatsappViaSessionResponse.parse(data),
    item,
  })

  return adaptWhatsappConnectActionResult({ data: result }, item)
}

/** The picker's selected ids plus their two per-row opt-ins, as batch items. */
function toPhoneNumberItems(
  { ids, coexistIds, aiReadsSyncedHistoryIds }: PhoneNumberSelectionValues,
  phoneNumbers: WhatsappPhoneNumberOption[] | undefined,
): PhoneNumberItem[] {
  const coexistIdSet = new Set(coexistIds)
  const aiReadsSyncedHistoryIdSet = new Set(aiReadsSyncedHistoryIds)

  return ids.map((id) => ({
    id,
    name:
      phoneNumbers?.find((phoneNumber) => phoneNumber.id === id)?.label ?? id,
    coexist: coexistIdSet.has(id),
    aiReadsSyncedHistory: aiReadsSyncedHistoryIdSet.has(id),
  }))
}

/**
 * Owns the per-id fan-out (`connectOne`) and the `useConnectFlow` wiring
 * both the picker section and the status dialog render off of.
 * `useConnectFlow`'s `onFinished` payload already carries the single-item
 * path's connected result, so this hook only needs its own state for what
 * that payload has no room for: the batch path's workspace/redirect, read
 * once at the dialog's Continue click.
 */
export function useWhatsappConnectFanout({
  form,
  phoneSelection,
  stages,
}: UseWhatsappConnectFanoutOptions) {
  const router = useRouter()
  const [lastConnectedInfo, setLastConnectedInfo] =
    useState<WhatsappLastConnectedInfo | null>(null)
  // The coexist call for a row runs immediately after that row's connect
  // resolves — before React has re-rendered with the state above — so the
  // workspace the connect just created is read from this ref instead.
  const lastConnectedInfoRef = useRef<WhatsappLastConnectedInfo | null>(null)
  /**
   * `undefined` until the first connect has stamped the ref — the coexist call
   * then reports a failure on that row instead of POSTing to an empty
   * workspace path. One helper, shared by `useConnectFlow` below and the
   * returned API, so the two cannot drift.
   */
  const resolveCoexistWorkspaceId = useCallback(
    () => lastConnectedInfoRef.current?.workspaceId,
    [],
  )

  const connectOne = useCallback(
    async (item: PhoneNumberItem) => {
      const adapted = await connectPhoneNumberViaSession(item, form.getValues())
      if (adapted.connected) {
        lastConnectedInfoRef.current = adapted.connected
        setLastConnectedInfo(adapted.connected)
      }
      return adapted
    },
    [form],
  )

  const advanceStage = useCallback(
    (finished: ConnectFlowFinished<WhatsappConnectActionResultWithInfo>) => {
      switch (finished.kind) {
        case "single":
          if (finished.result.connected) {
            stages.start(finished.result.connected)
          }
          return
        case "batch":
          if (lastConnectedInfo) {
            router.push(lastConnectedInfo.redirectUrl)
          }
          return
        default: {
          const exhaustiveCheck: never = finished
          return exhaustiveCheck
        }
      }
    },
    [lastConnectedInfo, router, stages.start],
  )

  const flow = useConnectFlow<
    PhoneNumberItem,
    WhatsappConnectActionResultWithInfo
  >({
    channel: "whatsapp",
    connectOne,
    onFinished: advanceStage,
    resolveCoexistWorkspaceId,
  })

  const onPickerContinue = useCallback(
    (selection: PhoneNumberSelectionValues) => {
      flow.start(toPhoneNumberItems(selection, phoneSelection?.phoneNumbers))
    },
    [flow, phoneSelection],
  )

  const connectedWorkspaceId = lastConnectedInfo?.workspaceId ?? ""

  const extraSteps = buildWhatsappConnectExtraSteps({
    workspaceId: connectedWorkspaceId,
  })

  return {
    flow,
    connectOne,
    extraSteps,
    onPickerContinue,
    workspaceId: connectedWorkspaceId,
    resolveCoexistWorkspaceId,
  }
}
