import {
  isValidWhatsappLocationCoordinate,
  WHATSAPP_LOCATION_LATITUDE_LIMIT,
  WHATSAPP_LOCATION_LONGITUDE_LIMIT,
  WHATSAPP_LOCATION_TEXT_MAX,
  type WhatsappLocationStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type { LocationMessage, WhatsappAuthValue } from "../../../schema"

const clean = (value: string | undefined) =>
  value?.trim().slice(0, WHATSAPP_LOCATION_TEXT_MAX) || undefined

/**
 * Converts the "Location" flow step into Meta's `location` message. Name and
 * address are optional; out-of-range coordinates are dropped (Meta rejects
 * them) instead of failing the whole flow run.
 */
export function* convertFlowStepWhatsappLocation(
  props: Parameters<
    MessageHandlers<
      WhatsappAuthValue,
      WhatsappLocationStepSchema
    >["sendFlowStep"]
  >[0],
): Generator<LocationMessage> {
  const {
    data: { step },
  } = props

  if (
    !(
      isValidWhatsappLocationCoordinate(
        step.latitude,
        WHATSAPP_LOCATION_LATITUDE_LIMIT,
      ) &&
      isValidWhatsappLocationCoordinate(
        step.longitude,
        WHATSAPP_LOCATION_LONGITUDE_LIMIT,
      )
    )
  ) {
    return
  }

  const name = clean(step.name)
  const address = clean(step.address)

  yield {
    _type: "location",
    type: "location",
    location: {
      latitude: step.latitude,
      longitude: step.longitude,
      ...(name ? { name } : {}),
      ...(address ? { address } : {}),
    },
  }
}
