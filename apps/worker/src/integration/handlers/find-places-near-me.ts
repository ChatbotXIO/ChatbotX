import {
  findContactLocation,
  placeLocationService,
} from "@chatbotx.io/business"
import {
  type FindPlacesNearMeStepSchema,
  findUpstreamLocationFieldKeys,
  stepTypes,
  type WhatsappLocationStepSchema,
} from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"

type SkipReason =
  | "notWhatsapp"
  | "noLocationSource"
  | "noLocationValue"
  | "noPlaceFound"

/** `sendFlowMessage`, injected so this module does not import `step.ts`. */
export type SendLocationMessage = (
  props: ExecuteStepProps<WhatsappLocationStepSchema>,
) => Promise<void>

/**
 * Sends the place location nearest to the contact's shared location as a
 * WhatsApp location pin. The location comes from upstream Get User Data
 * (Location) steps of the executed flow version. Every "can't send" case is a
 * silent skip so the flow continues.
 */
export async function findPlacesNearMe(
  props: ExecuteStepProps<FindPlacesNearMeStepSchema>,
  send: SendLocationMessage,
): Promise<void> {
  const { conversation, contactInbox, flowVersion, step } = props
  const skip = (reason: SkipReason) => {
    logger.info(
      { conversationId: conversation.id, stepId: step.id, reason },
      "findPlacesNearMe: skipped",
    )
  }

  if (contactInbox.channel !== "whatsapp") {
    return skip("notWhatsapp")
  }

  const keys = findUpstreamLocationFieldKeys({
    nodes: flowVersion.nodes,
    edges: flowVersion.edges,
    stepId: step.id,
  })
  if (keys.length === 0) {
    return skip("noLocationSource")
  }

  const origin = await findContactLocation({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    keys,
  })
  if (!origin) {
    return skip("noLocationValue")
  }

  const place = await placeLocationService.findNearest({
    workspaceId: conversation.workspaceId,
    categoryId: step.placeCategoryId,
    latitude: origin.latitude,
    longitude: origin.longitude,
  })
  if (!place) {
    return skip("noPlaceFound")
  }

  await send({
    ...props,
    commentAnchor: undefined,
    step: {
      id: step.id,
      nodeId: step.nodeId,
      stepType: stepTypes.enum.whatsappLocation,
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.name,
    },
  })
}
