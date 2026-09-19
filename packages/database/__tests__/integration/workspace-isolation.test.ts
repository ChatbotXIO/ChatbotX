// @vitest-environment node

/**
 * Cross-workspace isolation safety net.
 *
 * Workspace scoping in this repo is convention-based, not enforced by
 * Postgres Row-Level Security (see docs/adr/0003-workspace-isolation-strategy.md):
 * every repository method that takes a `workspaceId` is trusted to filter by
 * it. This suite seeds two real workspaces' worth of Contact, Conversation,
 * and Message rows against a real Postgres and asserts that a read scoped to
 * workspace A never returns workspace B's row for any of the three models —
 * a regression here means a repository dropped its `workspaceId` filter.
 *
 * SKIPS itself unless `DATABASE_URL` points at a reachable database. Run
 * against local docker Postgres with:
 *
 *     pnpm --filter @chatbotx.io/database test:db
 */

import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { db } from "../../src/client"
import { contactRepository } from "../../src/repositories/contact/repository"
import { findConversationAIContextState } from "../../src/repositories/conversation-ai-context/repository"
import { createMessageRepository } from "../../src/repositories/message"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  inboxModel,
  messageModel,
  userModel,
  workspaceModel,
} from "../../src/schema"

/** The `setup-env` sentinel: a real database never listens on port 1. */
const NON_ROUTABLE_PORT = "1"

function realDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === NON_ROUTABLE_PORT ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()

type SeededWorkspace = {
  contactId: string
  contactInboxId: string
  conversationId: string
  messageId: string
  workspaceId: string
}

describe.skipIf(!databaseUrl)(
  "cross-workspace isolation",
  () => {
    const seeded: SeededWorkspace[] = []
    const createdWorkspaceIds: string[] = []
    let userId: string

    async function seedWorkspace(label: string): Promise<SeededWorkspace> {
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `isolation-test-${label}`, ownerId: userId })
        .returning({ id: workspaceModel.id })

      const workspaceId = workspace?.id
      if (!workspaceId) {
        throw new Error("Failed to seed workspace")
      }
      createdWorkspaceIds.push(workspaceId)

      const [contact] = await db
        .insert(contactModel)
        .values({ workspaceId })
        .returning({ id: contactModel.id })
      const contactId = contact?.id
      if (!contactId) {
        throw new Error("Failed to seed contact")
      }

      const [inbox] = await db
        .insert(inboxModel)
        .values({
          workspaceId,
          name: `isolation-test-inbox-${label}`,
          channel: "webchat",
          sourceId: createId(),
        })
        .returning({ id: inboxModel.id })
      const inboxId = inbox?.id
      if (!inboxId) {
        throw new Error("Failed to seed inbox")
      }

      const [contactInbox] = await db
        .insert(contactInboxModel)
        .values({
          originalContactId: contactId,
          contactId,
          inboxId,
          channel: "webchat",
          source: "webchat",
          sourceId: createId(),
        })
        .returning({ id: contactInboxModel.id })
      const contactInboxId = contactInbox?.id
      if (!contactInboxId) {
        throw new Error("Failed to seed contact inbox")
      }

      const [conversation] = await db
        .insert(conversationModel)
        .values({ workspaceId, contactId })
        .returning({ id: conversationModel.id })
      const conversationId = conversation?.id
      if (!conversationId) {
        throw new Error("Failed to seed conversation")
      }

      const messageRepository = await createMessageRepository(db)
      const message = await messageRepository.create({
        conversationId,
        contactInboxId,
        workspaceId,
        messageType: "incoming",
        contentType: "text",
        senderType: "contact",
        text: `isolation-test-message-${label}`,
      })

      return {
        contactId,
        contactInboxId,
        conversationId,
        messageId: message.id,
        workspaceId,
      }
    }

    beforeAll(async () => {
      const [user] = await db
        .insert(userModel)
        .values({
          email: `isolation-test-${createId()}@example.com`,
          name: "Isolation Test",
          emailVerified: true,
        })
        .returning({ id: userModel.id })
      const id = user?.id
      if (!id) {
        throw new Error("Failed to seed user")
      }
      userId = id

      seeded.push(await seedWorkspace("a"))
      seeded.push(await seedWorkspace("b"))
    })

    afterAll(async () => {
      // Deliberately NOT `messageRepository.deleteById`: it (like every other
      // createdAt-scoped method on IMessageRepository) matches `createdAt`
      // with exact equality against a `timestamp(precision: 6)` column, but
      // `pg` returns a JS `Date` truncated to millisecond precision — even
      // the exact object `create()` just returned silently matches zero
      // rows. That looks like a real latent bug in the shared repository
      // (worth its own follow-up), so test cleanup goes around it with a
      // direct id-scoped delete instead of masking it here.
      for (const workspace of seeded) {
        await db
          .delete(messageModel)
          .where(eq(messageModel.id, workspace.messageId))
      }
      // Delete every workspace created in `beforeAll`, even one whose seed
      // failed partway through (e.g. a later insert threw) — cascading FKs
      // clean up its contact/inbox/contactInbox/conversation rows, and this
      // must happen before the owning `User` row is deleted below.
      for (const workspaceId of createdWorkspaceIds) {
        await db
          .delete(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
      }
      if (userId) {
        await db.delete(userModel).where(eq(userModel.id, userId))
      }
    })

    test("contact repository never returns another workspace's contact", async () => {
      const [workspaceA, workspaceB] = seeded

      const ownRead = await contactRepository.findPublicById({
        workspaceId: workspaceA.workspaceId,
        id: workspaceA.contactId,
      })
      expect(ownRead?.id).toBe(workspaceA.contactId)

      const crossRead = await contactRepository.findPublicById({
        workspaceId: workspaceB.workspaceId,
        id: workspaceA.contactId,
      })
      expect(crossRead).toBeUndefined()
    })

    test("conversation AI-context lookup never crosses workspaces", async () => {
      const [workspaceA, workspaceB] = seeded

      const ownRead = await findConversationAIContextState({
        conversationId: workspaceA.conversationId,
        workspaceId: workspaceA.workspaceId,
      })
      expect(ownRead).not.toBeNull()

      const crossRead = await findConversationAIContextState({
        conversationId: workspaceA.conversationId,
        workspaceId: workspaceB.workspaceId,
      })
      expect(crossRead).toBeNull()
    })

    test("message repository never returns another workspace's message", async () => {
      const [workspaceA, workspaceB] = seeded
      const messageRepository = await createMessageRepository(db)
      const sinceTime = new Date(Date.now() - 60_000)

      const ownRead = await messageRepository.findManyByConversation(
        workspaceA.conversationId,
        { limit: 10, sinceTime, workspaceId: workspaceA.workspaceId },
      )
      expect(ownRead.map((message) => message.id)).toContain(
        workspaceA.messageId,
      )

      const crossRead = await messageRepository.findManyByConversation(
        workspaceA.conversationId,
        { limit: 10, sinceTime, workspaceId: workspaceB.workspaceId },
      )
      expect(crossRead).toHaveLength(0)
    })
  },
  30_000,
)
