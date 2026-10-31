// @vitest-environment node

/**
 * The saved-reply image cleanup of an uninstall against a real Postgres: only
 * media files the installation itself created (under its own prefix) are
 * deleted; the installer's uploads and another installation's files are not.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

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

const deleteObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock("@chatbotx.io/filesystem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/filesystem")>()),
  uploader: { deleteObject },
}))
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))

await import("../../src/template/uninstall-effect-runners")
const { runUninstallEffects } = await import(
  "../../src/template/uninstall-effects"
)
const { savedReplyImagePrefix } = await import(
  "../../src/template/template-object-keys"
)

const databaseUrl = realDatabaseUrl()

const OWN_INSTALLATION_PATH = /\/tpl-inst-1[/:]/

describe.skipIf(!databaseUrl)(
  "saved-reply image cleanup on a real database",
  () => {
    const created: { workspaceId: string; userId: string }[] = []

    afterEach(async () => {
      deleteObject.mockClear()
      for (const { workspaceId, userId } of created.splice(0)) {
        await db
          .delete(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
        await db.delete(userModel).where(eq(userModel.id, userId))
      }
    })

    const seedFiles = async () => {
      const suffix = createId()
      const [owner] = await db
        .insert(userModel)
        .values({ email: `uninstall-effects-${suffix}@example.test` })
        .returning({ id: userModel.id })
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `uninstall-effects-${suffix}`, ownerId: owner.id })
        .returning({ id: workspaceModel.id })
      created.push({ workspaceId: workspace.id, userId: owner.id })
      const file = async (path: string) => {
        const [row] = await db
          .insert(mediaLibraryFileModel)
          .values({
            workspaceId: workspace.id,
            name: "image.png",
            path,
            mimeType: "image/png",
            size: 10,
          } as never)
          .returning({ id: mediaLibraryFileModel.id })
        return row.id
      }
      const prefix = savedReplyImagePrefix(workspace.id, "inst-1", {
        generation: 0,
      })
      return {
        workspaceId: workspace.id,
        own: await file(`${prefix}abc`),
        installers: await file(
          `public/space/${workspace.id}/media-library/uploaded-by-installer.png`,
        ),
        // What a sync staged (generation + attempt), and what older syncs
        // staged under `tpl-<id>:`: both are this installation's own.
        ownSync: await file(
          `${savedReplyImagePrefix(workspace.id, "inst-1", {
            generation: 2,
            attemptKey: "sync-1:token",
          })}abc`,
        ),
        ownLegacy: await file(
          `public/space/${workspace.id}/media-library/tpl-inst-1:sync-1:token/abc`,
        ),
        other: await file(
          `${savedReplyImagePrefix(workspace.id, "inst-2", { generation: 0 })}def`,
        ),
      }
    }

    const exists = async (id: string) =>
      (await db.$count(
        mediaLibraryFileModel,
        eq(mediaLibraryFileModel.id, id),
      )) === 1

    test("deletes the installation's own file and never the installer's or another installation's", async () => {
      const seed = await seedFiles()

      const done = await runUninstallEffects([
        {
          name: "savedReply.deleteImages",
          args: {
            workspaceId: seed.workspaceId,
            installationId: "inst-1",
            fileIds: [
              seed.own,
              seed.ownSync,
              seed.ownLegacy,
              seed.installers,
              seed.other,
            ].join(","),
          },
        },
      ])

      expect(done).toBe(true)
      expect(await exists(seed.own)).toBe(false)
      expect(await exists(seed.ownSync)).toBe(false)
      expect(await exists(seed.ownLegacy)).toBe(false)
      expect(await exists(seed.installers)).toBe(true)
      expect(await exists(seed.other)).toBe(true)
      expect(deleteObject).toHaveBeenCalledTimes(3)
      for (const [path] of deleteObject.mock.calls) {
        expect(path).toMatch(OWN_INSTALLATION_PATH)
      }
    })

    test("running it again is harmless", async () => {
      const seed = await seedFiles()
      const effect = {
        name: "savedReply.deleteImages",
        args: {
          workspaceId: seed.workspaceId,
          installationId: "inst-1",
          fileIds: seed.own,
        },
      }

      expect(await runUninstallEffects([effect])).toBe(true)
      expect(await runUninstallEffects([effect])).toBe(true)
      expect(deleteObject).toHaveBeenCalledTimes(1)
    })
  },
)
