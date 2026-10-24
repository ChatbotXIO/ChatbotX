import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import {
  facebookMarketingMessageModel,
  facebookMarketingMessageRecipientModel,
} from "../src/schema"

describe("FacebookMarketingMessageRecipient", () => {
  test("recipient table is unique per campaign+token", () => {
    const c = getTableConfig(facebookMarketingMessageRecipientModel)
    expect(c.name).toBe("FacebookMarketingMessageRecipient")
    expect(
      c.indexes.find(
        (i) =>
          i.config.name ===
          "FacebookMarketingMessageRecipient_campaign_token_key",
      )?.config.unique,
    ).toBe(true)
  })

  test("has a partial due index", () => {
    const c = getTableConfig(facebookMarketingMessageRecipientModel)
    const due = c.indexes.find(
      (i) => i.config.name === "FacebookMarketingMessageRecipient_due_idx",
    )
    expect(due?.config.where).toBeDefined()
  })

  test("campaign has delivery columns", () => {
    const names = getTableConfig(facebookMarketingMessageModel).columns.map(
      (c) => c.name,
    )
    expect(names).toEqual(
      expect.arrayContaining([
        "status",
        "startsAt",
        "firstSentAt",
        "statusReason",
        "tokenCount",
        "dayTarget",
        "daySent",
        "metaEndsAt",
        "timezoneName",
        "resumeCount",
      ]),
    )
  })
})
