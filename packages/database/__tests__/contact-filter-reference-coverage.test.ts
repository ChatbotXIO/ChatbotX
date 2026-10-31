import { CONTACT_FILTER_FIELD_REFERENCE } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { type ContactFilterField, contactFilterFields } from "../src/partials"

/**
 * A Condition row's `value` is rewritten at template install only for the
 * contact-filter fields in `CONTACT_FILTER_FIELD_REFERENCE`. Every field whose
 * value is an id must be listed, or an install silently keeps a foreign id.
 */
const ID_VALUED_FIELDS = [
  "inbox",
  "tags",
  "subscribedToDripCampaign",
  "conversationAssigned",
  "entryPointsLinks",
  "completedWhatsAppFlows",
  "keywordsReceived",
  "executedFlow",
  "executedStep",
  "commentedOnPost",
  "broadcastSent",
  "broadcastDelivered",
  "broadcastSeen",
  "broadcastClicked",
  "broadcastFailed",
  "emailSent",
  "emailDelivered",
  "emailOpened",
  "emailClicked",
  "clickedAd",
  "boughtItems",
  "shoppingCartContainsItems",
] as const satisfies readonly ContactFilterField[]

describe("CONTACT_FILTER_FIELD_REFERENCE", () => {
  test("covers every contact-filter field whose value is an id", () => {
    expect(Object.keys(CONTACT_FILTER_FIELD_REFERENCE).sort()).toEqual(
      [...ID_VALUED_FIELDS].sort(),
    )
  })

  test("only names real contact-filter fields", () => {
    const known = new Set<string>(contactFilterFields.options)
    for (const field of Object.keys(CONTACT_FILTER_FIELD_REFERENCE)) {
      expect(known.has(field)).toBe(true)
    }
  })
})
