import type { ContactInfoSourceType } from "@chatbotx.io/database/partials"
import type { OutgoingBotMessage } from "@chatbotx.io/database/repositories"
import {
  APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
  APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
  APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  BROADCAST_PAYLOAD_TYPE,
  GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
  UPDATE_STATUS_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import z from "zod"

/**
 * How `resolveLastBotSource` ended a pass over a page of bot messages.
 * `attributed`: the latest bot content belongs to a source. `stop`: it belongs
 * to nothing we attribute to. `continue`: the page held only continuation
 * messages of one flow; look at older messages.
 */
export const botSourceResolutionKinds = z.enum([
  "attributed",
  "stop",
  "continue",
])

/** What the walk has learned from the newer messages already seen. */
type BotSourceWalkState = {
  /** The flow the newer continuation messages belong to, once one was seen. */
  followedFlowId?: string
}

export type BotSourceResolution =
  | {
      kind: typeof botSourceResolutionKinds.enum.attributed
      followedFlowId?: string
      sourceId: string
      sourceType: ContactInfoSourceType
    }
  | { kind: typeof botSourceResolutionKinds.enum.stop }
  | {
      kind: typeof botSourceResolutionKinds.enum.continue
      followedFlowId?: string
    }

/**
 * Where each source marks its bot messages. A template message carries the id
 * directly in `contentAttributes`; a flow message carries it in
 * `contentAttributes.metadata` next to `metadata.type`. A future source is one
 * entry here plus one `contactInfoSourceTypes` value.
 */
const SOURCE_MARKERS: Record<
  ContactInfoSourceType,
  { idKey: string; metadataType: string }
> = {
  broadcast: { idKey: "broadcastId", metadataType: BROADCAST_PAYLOAD_TYPE },
}

/**
 * Metadata types a flow stamps on its own follow-up messages, so the message
 * still belongs to the flow named by `flowId` (see `metadataSchema`). Any other
 * metadata type (sequence, comment automation, unknown) belongs to another
 * automation and ends the search even with the same `flowId`.
 */
const FLOW_CONTINUATION_METADATA_TYPES: ReadonlySet<string> = new Set([
  UPDATE_STATUS_PAYLOAD_TYPE,
  APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
  APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
  GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
])

const BIGINT_ID_RE = /^\d+$/

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const asBigintId = (value: unknown): string | undefined =>
  typeof value === "string" && BIGINT_ID_RE.test(value) ? value : undefined

type SourceMatch = { sourceId?: string; sourceType: ContactInfoSourceType }

/** The source a message names, if any; `sourceId` is missing when it names one without a usable id. */
const findSource = (
  contentAttributes: Record<string, unknown>,
  metadataType: string | undefined,
  metadata: Record<string, unknown> | undefined,
): SourceMatch | undefined => {
  for (const [sourceType, marker] of Object.entries(SOURCE_MARKERS) as [
    ContactInfoSourceType,
    (typeof SOURCE_MARKERS)[ContactInfoSourceType],
  ][]) {
    const direct = asBigintId(contentAttributes[marker.idKey])
    if (direct) {
      return { sourceId: direct, sourceType }
    }
    if (metadataType === marker.metadataType) {
      return { sourceId: asBigintId(metadata?.[marker.idKey]), sourceType }
    }
  }
  return
}

/**
 * Walks bot/system messages newest to oldest and decides what the bot's latest
 * content belongs to. Precedence per message:
 * 1. names a source (template id or `metadata.type`): attribute to it, provided
 *    the newer continuation messages share this message's `flowId`;
 * 2. metadata of another automation, or an unknown type: stop;
 * 3. has a `flowId` and no metadata or a flow-continuation metadata: remember
 *    the flow and look further back; a different flow than remembered: stop;
 * 4. no `flowId`: stop.
 * Malformed `contentAttributes` never throws: it reads as "no flow", so stop.
 */
export const resolveLastBotSource = (
  messages: readonly OutgoingBotMessage[],
  state: BotSourceWalkState = {},
): BotSourceResolution => {
  let followedFlowId = state.followedFlowId

  for (const message of messages) {
    const contentAttributes = asRecord(message.contentAttributes) ?? {}
    const metadata = asRecord(contentAttributes.metadata)
    const metadataType =
      typeof metadata?.type === "string" ? metadata.type : undefined
    const flowId = asBigintId(contentAttributes.flowId)

    const source = findSource(contentAttributes, metadataType, metadata)
    if (source) {
      const sameFlow = followedFlowId === undefined || followedFlowId === flowId
      if (!(source.sourceId && sameFlow)) {
        return { kind: botSourceResolutionKinds.enum.stop }
      }
      return {
        followedFlowId,
        kind: botSourceResolutionKinds.enum.attributed,
        sourceId: source.sourceId,
        sourceType: source.sourceType,
      }
    }

    if (metadataType && !FLOW_CONTINUATION_METADATA_TYPES.has(metadataType)) {
      return { kind: botSourceResolutionKinds.enum.stop }
    }

    if (!flowId || (followedFlowId && followedFlowId !== flowId)) {
      return { kind: botSourceResolutionKinds.enum.stop }
    }
    followedFlowId = flowId
  }

  return { followedFlowId, kind: botSourceResolutionKinds.enum.continue }
}
