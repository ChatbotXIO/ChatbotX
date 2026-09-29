import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { whatsappCallModel } from "../src/schema/whatsapp-call"

describe("WhatsappCall.workspaceId foreign key", () => {
  test("cascades on Workspace delete — a deleted workspace must never strand orphaned call rows", () => {
    const config = getTableConfig(whatsappCallModel)
    const workspaceForeignKey = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === "workspaceId"),
    )

    expect(workspaceForeignKey).toBeDefined()
    expect(workspaceForeignKey?.onDelete).toBe("cascade")
  })
})
