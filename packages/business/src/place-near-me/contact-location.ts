import { parseCoordinatePair } from "@chatbotx.io/utils/coordinates"
import { contactCustomFieldService } from "../contact-custom-field/service"

/**
 * The newest `lat,lng` value the contact holds in any of the given custom
 * fields (ids or legacy names). An unparseable newest value falls through to
 * the next one; null when none qualifies.
 */
export async function findContactLocation(input: {
  workspaceId: string
  contactId: string
  keys: string[]
}): Promise<{ latitude: number; longitude: number } | null> {
  const rows = await contactCustomFieldService.listValuesByKeys(input)
  for (const row of rows) {
    const pair = parseCoordinatePair(row.value)
    if (pair) {
      return pair
    }
  }
  return null
}
