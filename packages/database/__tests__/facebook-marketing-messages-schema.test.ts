import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import {
  facebookMarketingMessageModel,
  facebookMarketingMessagesAuthModel,
} from "../src/schema"

describe("FacebookMarketingMessagesAuth", () => {
  const config = getTableConfig(facebookMarketingMessagesAuthModel)

  test("is named FacebookMarketingMessagesAuth", () => {
    expect(config.name).toBe("FacebookMarketingMessagesAuth")
  })

  test("holds one grant per workspace", () => {
    const unique = config.indexes.find(
      (index) =>
        index.config.name === "FacebookMarketingMessagesAuth_workspaceId_key",
    )

    expect(unique?.config.unique).toBe(true)
  })

  test("carries the App-Scoped User ID and an expiry", () => {
    const columns = config.columns.map((column) => column.name)

    expect(columns).toEqual(
      expect.arrayContaining([
        "facebookUserId",
        "tokenExpiresAt",
        "auth",
        "status",
      ]),
    )
  })
})

describe("FacebookMarketingMessage", () => {
  const config = getTableConfig(facebookMarketingMessageModel)

  test("is named FacebookMarketingMessage", () => {
    expect(config.name).toBe("FacebookMarketingMessage")
  })

  test("stores the Meta campaign id uniquely so a retry cannot duplicate a row", () => {
    const unique = config.indexes.find(
      (index) =>
        index.config.name === "FacebookMarketingMessage_campaignId_key",
    )

    expect(unique?.config.unique).toBe(true)
  })

  test("keeps the page as a raw id with no foreign key", () => {
    const pageId = config.columns.find((column) => column.name === "pageId")

    expect(pageId).toBeDefined()
    expect(
      config.foreignKeys.map((fk) => fk.reference().foreignTable),
    ).not.toContain("IntegrationMessenger")
  })

  test("records the currency offset alongside the minor-unit budget", () => {
    const columns = config.columns.map((column) => column.name)

    expect(columns).toEqual(
      expect.arrayContaining([
        "currency",
        "currencyOffset",
        "budgetType",
        "budgetMinorUnits",
        "content",
        "campaignId",
        "facebookUserId",
      ]),
    )
  })
})
