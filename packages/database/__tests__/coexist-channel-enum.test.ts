import { COEXIST_CHANNELS } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import { coexistChannel } from "../src/schema/coexist-sync-run"

describe("coexistChannel pgEnum", () => {
  test("enumValues matches COEXIST_CHANNELS exactly (same order, no drift)", () => {
    expect(coexistChannel.enumValues).toEqual(COEXIST_CHANNELS)
  })
})
