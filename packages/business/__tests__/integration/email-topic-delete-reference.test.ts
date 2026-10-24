// @vitest-environment node

import { db, eq } from "@chatbotx.io/database/client"
import {
  analyticsEmailTopicModel,
  emailTopicModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { emailTopicService } from "../../src/email-topic/service"

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

const ownerId = createId()
const workspaceId = createId()
const topicId = createId()

describe.skipIf(!realDatabaseUrl())(
  "email topic delete keeps attribution",
  () => {
    beforeAll(async () => {
      await db.insert(userModel).values({
        id: ownerId,
        email: `topic-delete-${ownerId}@example.test`,
        name: "Topic delete owner",
      })
      await db
        .insert(workspaceModel)
        .values({ id: workspaceId, name: `topic-${workspaceId}`, ownerId })
      await db
        .insert(emailTopicModel)
        .values({ id: topicId, name: "Topic", workspaceId })
    })

    afterAll(async () => {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, ownerId))
    })

    test("snapshots topicReferenceId on a not-yet-backfilled row before SET NULL", async () => {
      const token = createId()
      await db.insert(analyticsEmailTopicModel).values({
        workspaceId,
        topicId,
        topicReferenceId: null,
        email: "a@example.test",
        token,
      })

      const { deletedCount } = await emailTopicService.delete({
        workspaceId,
        ids: [topicId],
      })

      const [row] = await db
        .select({
          topicId: analyticsEmailTopicModel.topicId,
          topicReferenceId: analyticsEmailTopicModel.topicReferenceId,
        })
        .from(analyticsEmailTopicModel)
        .where(eq(analyticsEmailTopicModel.token, token))
      expect(deletedCount).toBe(1)
      expect(row).toEqual({ topicId: null, topicReferenceId: topicId })
    })
  },
)
