import { describe, expect, test } from "vitest"
import {
  CROSS_FLOW_NODE_FIELD,
  DISCRIMINATED_REFERENCE_FIELDS,
  FLOW_REFERENCE_FIELD,
  REFERENCE_ARRAY_FIELD_ENTITY_KIND,
  REFERENCE_FIELD_ENTITY_KIND,
  REFERENCE_SLOT_SHAPE_BY_KEY,
} from "../src/import-export/reference-fields"

/** The step reference keys tools and the store added (a poll's `afterVoteFlowId` is a column, not a step field): each must say what an unresolved id becomes. */
const TOOL_AND_STORE_KEYS = [
  "sharingFlowId",
  "referralWelcomeFlowId",
  "abandonedCartFlowId",
  "checkoutFlowId",
  "orderConfirmationFlowId",
  "prizeNameCustomFieldId",
  "minigameId",
  "openHoursId",
  "openerTagIds",
  "playerTagIds",
  "newFriendTagIds",
] as const

/** Keys the generic tables resolve; a per-step meaning goes in STEP_REFERENCE_OVERRIDES instead. */
const genericTables: Readonly<Record<string, readonly string[]>> = {
  single: Object.keys(REFERENCE_FIELD_ENTITY_KIND),
  array: Object.keys(REFERENCE_ARRAY_FIELD_ENTITY_KIND),
  discriminated: Object.keys(DISCRIMINATED_REFERENCE_FIELDS),
  flow: [FLOW_REFERENCE_FIELD],
  crossFlowNode: [CROSS_FLOW_NODE_FIELD],
}

describe("reference key declarations", () => {
  test("a key means one thing: no key is in two generic tables", () => {
    const owners = new Map<string, string[]>()
    for (const [table, keys] of Object.entries(genericTables)) {
      for (const key of keys) {
        owners.set(key, [...(owners.get(key) ?? []), table])
      }
    }
    const collisions = [...owners].filter(([, tables]) => tables.length > 1)

    expect(collisions).toEqual([])
  })

  test("every tool and store key is registered", () => {
    const registered = new Set(Object.values(genericTables).flat())
    const missing = TOOL_AND_STORE_KEYS.filter((key) => !registered.has(key))

    expect(missing).toEqual([])
  })

  test("every single-id tool and store key declares a slot shape other than the default required", () => {
    const singles = TOOL_AND_STORE_KEYS.filter(
      (key) => key in REFERENCE_FIELD_ENTITY_KIND,
    )
    const undeclared = singles.filter(
      (key) => !(key in REFERENCE_SLOT_SHAPE_BY_KEY),
    )

    expect(undeclared).toEqual([])
  })
})
