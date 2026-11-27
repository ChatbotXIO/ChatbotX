// @vitest-environment node

/**
 * `mediaLibraryFileRepository.deleteIfUnusedByPosts` against a real Postgres:
 * an unused file is removed, a file a post references is kept, and a post insert racing the delete is serialised by the
 * row lock (it either commits first and the file is kept, or the insert fails).
 * Commits for real, so every test deletes its workspace afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import {
  mediaLibraryFileModel,
  socialPostMediaModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test } from "vitest"

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

type Fixture = { userId: string; workspaceId: string }

describe.skipIf(!realDatabaseUrl())(
  "discarding an imported library file on a real database",
  () => {
    const created: Fixture[] = []

    afterEach(async () => {
      for (const { userId, workspaceId } of created.splice(0)) {
        await db
          .delete(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
        await db.delete(userModel).where(eq(userModel.id, userId))
      }
    })

    const makeFixture = async (): Promise<Fixture> => {
      const suffix = `${Date.now()}-${Math.random()}`
      const [user] = await db
        .insert(userModel)
        .values({ email: `discard-${suffix}@example.test` })
        .returning({ id: userModel.id })
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `discard-${suffix}`, ownerId: user.id })
        .returning({ id: workspaceModel.id })
      const fixture = { userId: user.id, workspaceId: workspace.id }
      created.push(fixture)
      return fixture
    }

    const makeFile = async (workspaceId: string, path: string) => {
      const [file] = await db
        .insert(mediaLibraryFileModel)
        .values({
          mimeType: "image/jpeg",
          name: "p.jpg",
          path,
          size: 10,
          workspaceId,
        })
        .returning({ id: mediaLibraryFileModel.id })
      return file.id
    }

    const makePostWithMedia = async (workspaceId: string, fileId: string) => {
      const postId = createId()
      await socialPostRepository.insertPost({
        createdById: null,
        createdVia: "api",
        id: postId,
        idempotencyKey: null,
        idempotencyRequestHash: null,
        linkUrl: null,
        text: "x",
        workspaceId,
      })
      await db.insert(socialPostMediaModel).values({
        kind: "image",
        mediaLibraryFileId: fileId,
        mimeType: "image/jpeg",
        path: "p",
        position: 0,
        size: 10,
        socialPostId: postId,
        workspaceId,
      })
    }

    test("an unused file's row is deleted and its path is returned", async () => {
      const { workspaceId } = await makeFixture()
      const path = `media-library/discard-${Date.now()}`
      const first = await makeFile(workspaceId, path)
      const result = await mediaLibraryFileRepository.deleteIfUnusedByPosts({
        id: first,
        workspaceId,
      })
      expect(result).toEqual({ deleted: true, path })
    })

    test("a file a post references is kept", async () => {
      const { workspaceId } = await makeFixture()
      const fileId = await makeFile(
        workspaceId,
        `media-library/kept-${Date.now()}`,
      )
      await makePostWithMedia(workspaceId, fileId)
      expect(
        await mediaLibraryFileRepository.deleteIfUnusedByPosts({
          id: fileId,
          workspaceId,
        }),
      ).toEqual({ deleted: false })
      expect(
        await db
          .select({ id: mediaLibraryFileModel.id })
          .from(mediaLibraryFileModel)
          .where(eq(mediaLibraryFileModel.id, fileId)),
      ).toHaveLength(1)
    })

    test("a missing file, or one of another workspace, is not deleted", async () => {
      const mine = await makeFixture()
      const other = await makeFixture()
      const fileId = await makeFile(
        other.workspaceId,
        `media-library/o-${Date.now()}`,
      )
      expect(
        await mediaLibraryFileRepository.deleteIfUnusedByPosts({
          id: fileId,
          workspaceId: mine.workspaceId,
        }),
      ).toEqual({ deleted: false, missing: true })
    })

    test("a post insert racing the delete never loses its picture silently", async () => {
      const { workspaceId } = await makeFixture()
      const fileId = await makeFile(
        workspaceId,
        `media-library/race-${Date.now()}`,
      )
      const [deleted, inserted] = await Promise.allSettled([
        mediaLibraryFileRepository.deleteIfUnusedByPosts({
          id: fileId,
          workspaceId,
        }),
        makePostWithMedia(workspaceId, fileId),
      ])
      const stillThere = (
        await db
          .select({ id: mediaLibraryFileModel.id })
          .from(mediaLibraryFileModel)
          .where(eq(mediaLibraryFileModel.id, fileId))
      ).length
      if (inserted.status === "fulfilled") {
        // The post committed with the link: the file must have been kept.
        expect(stillThere).toBe(1)
        expect(deleted.status).toBe("fulfilled")
        expect(
          (deleted as PromiseFulfilledResult<{ deleted: boolean }>).value
            .deleted,
        ).toBe(false)
      } else {
        // The delete won: the insert failed on the foreign key, nothing is silently detached.
        expect(stillThere).toBe(0)
      }
    })
  },
)
