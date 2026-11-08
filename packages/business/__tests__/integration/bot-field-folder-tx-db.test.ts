// @vitest-environment node

/**
 * A bot field created in a folder made earlier in the same, still
 * uncommitted, transaction — what a template install with "create a folder"
 * does. The folder check must read through that transaction.
 *
 * Commits for real, so each test deletes what it created.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { userModel, workspaceModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { botFieldService } from "../../src/bot-field/service"
import { folderService } from "../../src/folder/service"

// No audit recorder is registered in a test process.
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

describe.skipIf(!realDatabaseUrl())(
  "bot field in a folder of the same transaction",
  () => {
    const cleanup: { workspaceIds: string[]; userIds: string[] } = {
      workspaceIds: [],
      userIds: [],
    }

    afterEach(async () => {
      for (const id of cleanup.workspaceIds.splice(0)) {
        await db.delete(workspaceModel).where(eq(workspaceModel.id, id))
      }
      for (const id of cleanup.userIds.splice(0)) {
        await db.delete(userModel).where(eq(userModel.id, id))
      }
    })

    const newWorkspace = async (): Promise<string> => {
      const [owner] = await db
        .insert(userModel)
        .values({ email: `bff-${createId()}@example.test` })
        .returning({ id: userModel.id })
      cleanup.userIds.push(owner.id)
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `bff-${createId()}`, ownerId: owner.id })
        .returning({ id: workspaceModel.id })
      cleanup.workspaceIds.push(workspace.id)
      return workspace.id
    }

    test("is created in the folder the transaction has not committed yet", async () => {
      const workspaceId = await newWorkspace()

      const created = await db.transaction(async (tx) => {
        const folder = await folderService.create({
          workspaceId,
          data: {
            name: "Installed",
            parentId: null,
            folderType: "customField",
          },
          tx,
        })
        return await botFieldService.create({
          workspaceId,
          data: {
            name: `bff-${createId()}`,
            type: "shortText",
            value: "",
            folderId: folder.id,
          },
          tx,
        })
      })

      expect(created.folderId).not.toBeNull()
    })
  },
)
