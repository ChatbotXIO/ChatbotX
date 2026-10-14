import {
  integrationWhatsappService,
  whatsappFlowService,
} from "@chatbotx.io/business"
import {
  miniAppPublicationService,
  miniAppService,
} from "@chatbotx.io/business/mini-app"
import type { MiniAppPublicationModel } from "@chatbotx.io/database/types"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { buildWhatsappContext } from "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import type { WhatsappFlowRemovalOutcome } from "../schema/public"

/** Meta calls in flight at once, so a bulk delete neither stalls nor floods the WABA. */
const FLOW_REMOVAL_CONCURRENCY = 5

const NUMBER_NOT_CONNECTED = "WhatsApp number is no longer in this workspace"

export type WhatsappFlowRemoval = {
  miniAppId: string
  integrationWhatsappId: string
  /** Meta's Flow id. */
  flowId: string
  outcome: WhatsappFlowRemovalOutcome
  /** Why Meta refused; only on `failed`. */
  error?: string
}

export type DeleteMiniAppsResult = {
  deletedCount: number
  whatsappFlows: WhatsappFlowRemoval[]
}

type WhatsappContext = Awaited<ReturnType<typeof buildWhatsappContext>>

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err)

/** One context per number; null when the number left the workspace or cannot be loaded. */
async function buildWhatsappContexts(
  workspaceId: string,
  integrationWhatsappIds: string[],
): Promise<Map<string, WhatsappContext | null>> {
  const contexts = new Map<string, WhatsappContext | null>()
  for (const id of new Set(integrationWhatsappIds)) {
    try {
      const integrationWhatsapp =
        await integrationWhatsappService.findByIdForWorkspace({
          id,
          workspaceId,
        })
      contexts.set(
        id,
        integrationWhatsapp
          ? await buildWhatsappContext(workspaceId, integrationWhatsapp)
          : null,
      )
    } catch (err) {
      logger.warn({ err, integrationWhatsappId: id }, "WhatsApp context failed")
      contexts.set(id, null)
    }
  }
  return contexts
}

/**
 * Deletes (draft) or deprecates (published) one Flow on Meta, then mirrors
 * the result locally. A refusal is reported, never thrown, so one Flow
 * cannot stop the others.
 */
async function removeFlow(props: {
  workspaceId: string
  publication: MiniAppPublicationModel
  whatsappContext: WhatsappContext | null | undefined
}): Promise<WhatsappFlowRemoval> {
  const { publication } = props
  const base = {
    miniAppId: publication.miniAppId,
    integrationWhatsappId: publication.integrationWhatsappId,
    flowId: publication.sourceId,
  }
  if (!props.whatsappContext) {
    return { ...base, outcome: "failed", error: NUMBER_NOT_CONNECTED }
  }
  let result: { outcome: WhatsappFlowRemoval["outcome"]; status: string | null }
  try {
    result = await integrations.whatsapp.runAction("deleteFlow", {
      ctx: props.whatsappContext,
      params: { flowSourceId: publication.sourceId },
    })
  } catch (err) {
    logger.warn(
      { err, flowSourceId: publication.sourceId },
      "WhatsApp Flow not removed while deleting its Mini App",
    )
    return { ...base, outcome: "failed", error: errorMessage(err) }
  }
  try {
    await whatsappFlowService.markRemovedOnMeta({
      workspaceId: props.workspaceId,
      sourceId: publication.sourceId,
      status: result.status,
    })
  } catch (err) {
    // Meta already did it; the next Flows sync repairs the local copy.
    logger.warn(
      { err, flowSourceId: publication.sourceId },
      "Local WhatsApp Flow copy not updated",
    )
  }
  return { ...base, outcome: result.outcome }
}

/**
 * Deletes Mini Apps and, when asked, the WhatsApp Flows they were published
 * as. The Mini Apps go first: if that fails nothing has changed on Meta yet,
 * and a Flow Meta then refuses is reported per Flow instead of hidden.
 * Shared by the builder action and the public API.
 */
export async function deleteMiniApps(props: {
  workspaceId: string
  ids: string[]
  deleteWhatsappFlows: boolean
}): Promise<DeleteMiniAppsResult> {
  // Read before the delete: it cascades the publication rows away.
  const publications = props.deleteWhatsappFlows
    ? await miniAppPublicationService.listForMiniApps({
        workspaceId: props.workspaceId,
        miniAppIds: props.ids,
      })
    : []
  const deletedCount = await miniAppService.deleteMany({
    workspaceId: props.workspaceId,
    ids: props.ids,
  })
  if (publications.length === 0) {
    return { deletedCount, whatsappFlows: [] }
  }
  const contexts = await buildWhatsappContexts(
    props.workspaceId,
    publications.map((publication) => publication.integrationWhatsappId),
  )
  // `removeFlow` reports a refusal instead of throwing, so every result is fulfilled.
  const results = await mapWithConcurrency(
    publications,
    FLOW_REMOVAL_CONCURRENCY,
    (publication) =>
      removeFlow({
        workspaceId: props.workspaceId,
        publication,
        whatsappContext: contexts.get(publication.integrationWhatsappId),
      }),
  )
  const whatsappFlows = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  )
  return { deletedCount, whatsappFlows }
}
