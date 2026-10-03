import { connectSessionOutcomeSchema } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  CONNECT_FAILURE_REASONS,
  CONNECT_ITEM_STATUSES,
} from "../src/inbox/connect-outcome-types"

describe("ConnectSession outcome vocabulary", () => {
  test("matches the client-safe connect outcome constants", () => {
    expect(
      [...connectSessionOutcomeSchema.shape.status.options].sort(),
    ).toEqual([...Object.values(CONNECT_ITEM_STATUSES)].sort())
    expect(
      [...connectSessionOutcomeSchema.shape.reason.unwrap().options].sort(),
    ).toEqual([...Object.values(CONNECT_FAILURE_REASONS)].sort())
  })
})
