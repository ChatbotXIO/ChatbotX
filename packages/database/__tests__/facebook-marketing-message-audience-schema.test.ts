import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { facebookMarketingMessageAudienceModel } from "../src/schema"

describe("FacebookMarketingMessageAudience", () => {
  const config = getTableConfig(facebookMarketingMessageAudienceModel)

  test("is named FacebookMarketingMessageAudience", () => {
    expect(config.name).toBe("FacebookMarketingMessageAudience")
  })

  test("stores the Meta audience id uniquely so a retry cannot duplicate a row", () => {
    const unique = config.indexes.find(
      (index) =>
        index.config.name ===
        "FacebookMarketingMessageAudience_customAudienceId_key",
    )
    expect(unique?.config.unique).toBe(true)
  })

  test("indexes workspaceId", () => {
    expect(
      config.indexes.some(
        (index) =>
          index.config.name ===
          "FacebookMarketingMessageAudience_workspaceId_idx",
      ),
    ).toBe(true)
  })

  test("has the columns the service relies on", () => {
    const columns = Object.fromEntries(
      config.columns.map((column) => [column.name, column]),
    )
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "workspaceId",
        "customAudienceId",
        "adAccountId",
        "pageId",
        "name",
        "description",
        "rowsUploaded",
        "readyAt",
        "facebookUserId",
      ]),
    )
    expect(columns.customAudienceId?.notNull).toBe(true)
    expect(columns.pageId?.notNull).toBe(true)
    expect(columns.description?.notNull).toBe(false)
    expect(columns.readyAt?.notNull).toBe(false)
    expect(columns.rowsUploaded?.notNull).toBe(true)
  })

  test("cascades on workspace delete", () => {
    const fk = config.foreignKeys[0]?.reference()
    expect(fk?.foreignTable).toBeDefined()
    expect(config.foreignKeys[0]?.onDelete).toBe("cascade")
  })
})
