import { getTableColumns } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { contactInboxModel } from "../src/schema/contact-inbox"

describe("ContactInbox thread owner app id columns", () => {
  const columns = getTableColumns(contactInboxModel)

  test.each([
    "threadOwnerAppId",
    "threadPreviousOwnerAppId",
  ] as const)("%s is a nullable text column without a default", (name) => {
    const column = columns[name]
    expect(column.notNull).toBe(false)
    expect(column.dataType).toBe("string")
    expect(column.hasDefault).toBe(false)
    expect(column.name).toBe(name)
  })
})
