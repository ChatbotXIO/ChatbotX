// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { conversationTranslationStateRepository } from "../../src/repositories/translation/conversation-state"
import { messageTranslationRepository } from "../../src/repositories/translation/message-translation"
import { inboxTranslationSettingsRepository } from "../../src/repositories/translation/settings"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const withRolledBackTransaction = async (
  db: DatabaseClient,
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

const seedWorkspace = async (tx: DatabaseClient, label: string) => {
  const suffix = `${label}-${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `inbox-translation-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `inbox-translation-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  return workspace.id
}

const seedConversation = async (
  tx: DatabaseClient,
  workspaceId: string,
  additionalAttributes?: Record<string, unknown>,
) => {
  const [contact] = await tx
    .insert(schema.contactModel)
    .values({ workspaceId })
    .returning({ id: schema.contactModel.id })
  const [conversation] = await tx
    .insert(schema.conversationModel)
    .values({ workspaceId, contactId: contact.id, additionalAttributes })
    .returning()
  return conversation
}

const translationInput = (
  workspaceId: string,
  conversationId: string,
  overrides: Partial<
    Parameters<typeof messageTranslationRepository.upsertResult>[0]
  > = {},
) => ({
  workspaceId,
  conversationId,
  messageId: "9000000000000001",
  messageCreatedAt: new Date("2026-11-19T00:00:00.000Z"),
  direction: "inbound" as const,
  status: "translated" as const,
  sourceLanguage: "es",
  targetLanguage: "vi",
  confidence: 0.99,
  displayText: "Xin chào",
  modelId: "test-model",
  failureCode: null,
  sourceHash: "hash-a",
  ...overrides,
})

describe.skipIf(!databaseUrl)("inbox translation repositories", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  const run = (fn: (tx: DatabaseClient) => Promise<void>) =>
    withRolledBackTransaction(createDatabase(client), fn)

  describe("conversation state", () => {
    test.each([
      ["NULL", undefined],
      ["an empty object", {}],
      ["an existing challenge", { challenge: { type: "quickReply" } }],
    ])("setLanguage writes when additionalAttributes is %s", (_label, attrs) =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "lang")
        const conversation = await seedConversation(tx, workspaceId, attrs)

        const updated =
          await conversationTranslationStateRepository.setLanguage(
            { workspaceId, conversationId: conversation.id, language: "es" },
            tx,
          )

        expect(updated?.additionalAttributes).toMatchObject({
          ...attrs,
          translation: { language: "es", languageSource: "manual" },
        })
      }))

    test("setOverride and setLanguage keep each other's keys and other attributes", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "merge")
        const conversation = await seedConversation(tx, workspaceId, {
          challenge: { type: "quickReply" },
        })
        const ref = { workspaceId, conversationId: conversation.id }

        await conversationTranslationStateRepository.setOverride(
          { ...ref, enabledOverride: false },
          tx,
        )
        const updated =
          await conversationTranslationStateRepository.setLanguage(
            { ...ref, language: "fr" },
            tx,
          )

        expect(updated?.additionalAttributes).toMatchObject({
          challenge: { type: "quickReply" },
          translation: {
            enabledOverride: false,
            language: "fr",
            languageSource: "manual",
          },
        })

        const cleared =
          await conversationTranslationStateRepository.setOverride(
            { ...ref, enabledOverride: null },
            tx,
          )
        const translation = (
          cleared?.additionalAttributes as {
            translation: Record<string, unknown>
          }
        ).translation
        expect(translation).not.toHaveProperty("enabledOverride")
        expect(translation.language).toBe("fr")
      }))

    test("setLanguageIfUnset writes only when unset, never over manual", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "unset")
        const conversation = await seedConversation(tx, workspaceId)
        const ref = { workspaceId, conversationId: conversation.id }

        const first =
          await conversationTranslationStateRepository.setLanguageIfUnset(
            { ...ref, language: "es", workspaceLanguage: "vi" },
            tx,
          )
        expect(first?.additionalAttributes).toMatchObject({
          translation: { language: "es", languageSource: "auto" },
        })

        const second =
          await conversationTranslationStateRepository.setLanguageIfUnset(
            { ...ref, language: "en", workspaceLanguage: "vi" },
            tx,
          )
        expect(second).toBeNull()

        await conversationTranslationStateRepository.setLanguage(
          { ...ref, language: "fr" },
          tx,
        )
        const afterManual =
          await conversationTranslationStateRepository.setLanguageIfUnset(
            { ...ref, language: "de", workspaceLanguage: "vi" },
            tx,
          )
        expect(afterManual).toBeNull()
      }))

    test("setLanguageIfUnset upgrades an auto language equal to the workspace's", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "upgrade")
        const conversation = await seedConversation(tx, workspaceId)
        const ref = { workspaceId, conversationId: conversation.id }

        await conversationTranslationStateRepository.setLanguageIfUnset(
          { ...ref, language: "vi", workspaceLanguage: "vi" },
          tx,
        )
        const sameLanguage =
          await conversationTranslationStateRepository.setLanguageIfUnset(
            { ...ref, language: "vi", workspaceLanguage: "vi" },
            tx,
          )
        expect(sameLanguage).toBeNull()

        const upgraded =
          await conversationTranslationStateRepository.setLanguageIfUnset(
            { ...ref, language: "es", workspaceLanguage: "vi" },
            tx,
          )
        expect(upgraded?.additionalAttributes).toMatchObject({
          translation: { language: "es", languageSource: "auto" },
        })
      }))

    test("does not touch a conversation of another workspace", () =>
      run(async (tx) => {
        const workspaceA = await seedWorkspace(tx, "a")
        const workspaceB = await seedWorkspace(tx, "b")
        const conversation = await seedConversation(tx, workspaceA)

        const updated =
          await conversationTranslationStateRepository.setLanguage(
            {
              workspaceId: workspaceB,
              conversationId: conversation.id,
              language: "es",
            },
            tx,
          )

        expect(updated).toBeNull()
      }))
  })

  describe("message translation", () => {
    test("upsertResult keeps a good translation of the same text and language", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "keep")
        const conversation = await seedConversation(tx, workspaceId)
        const input = translationInput(workspaceId, conversation.id)

        await messageTranslationRepository.upsertResult(input, tx)
        const again = await messageTranslationRepository.upsertResult(
          { ...input, displayText: "Khác" },
          tx,
        )

        expect(again).toBeNull()
        const [row] = await messageTranslationRepository.findByMessageIds(
          workspaceId,
          [input.messageId],
          tx,
        )
        expect(row.displayText).toBe("Xin chào")
      }))

    test("upsertResult replaces a failed row, an edited text and a stale target language", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "replace")
        const conversation = await seedConversation(tx, workspaceId)
        const base = translationInput(workspaceId, conversation.id)

        await messageTranslationRepository.upsertResult(
          {
            ...base,
            status: "failed",
            displayText: null,
            failureCode: "timeout",
          },
          tx,
        )
        const fromFailed = await messageTranslationRepository.upsertResult(
          base,
          tx,
        )
        expect(fromFailed?.status).toBe("translated")

        const edited = await messageTranslationRepository.upsertResult(
          { ...base, sourceHash: "hash-b", displayText: "Đã sửa" },
          tx,
        )
        expect(edited?.displayText).toBe("Đã sửa")

        const retargeted = await messageTranslationRepository.upsertResult(
          {
            ...base,
            sourceHash: "hash-b",
            targetLanguage: "en",
            displayText: "Edited",
          },
          tx,
        )
        expect(retargeted?.targetLanguage).toBe("en")
      }))

    test("upsertResult never lets a failure of other text replace a good row", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "stale-failure")
        const conversation = await seedConversation(tx, workspaceId)
        // A newer job already translated the edited text.
        const edited = translationInput(workspaceId, conversation.id, {
          sourceHash: "hash-edited",
          displayText: "Đã sửa",
        })
        await messageTranslationRepository.upsertResult(edited, tx)

        // The slow job of the old text fails afterwards.
        const staleFailure = await messageTranslationRepository.upsertResult(
          {
            ...edited,
            sourceHash: "hash-old",
            status: "failed",
            displayText: null,
            failureCode: "providerError",
          },
          tx,
        )

        expect(staleFailure).toBeNull()
        const [row] = await messageTranslationRepository.findByMessageIds(
          workspaceId,
          [edited.messageId],
          tx,
        )
        expect(row.status).toBe("translated")
        expect(row.displayText).toBe("Đã sửa")
      }))

    test("deleteByMessageIds removes only the workspace's rows of those messages", () =>
      run(async (tx) => {
        const workspaceA = await seedWorkspace(tx, "bulk-a")
        const workspaceB = await seedWorkspace(tx, "bulk-b")
        const conversation = await seedConversation(tx, workspaceA)
        const kept = translationInput(workspaceA, conversation.id, {
          messageId: "9000000000000002",
        })
        const removed = translationInput(workspaceA, conversation.id)
        await messageTranslationRepository.upsertResult(removed, tx)
        await messageTranslationRepository.upsertResult(kept, tx)

        expect(
          await messageTranslationRepository.deleteByMessageIds(
            workspaceB,
            [removed.messageId],
            tx,
          ),
        ).toBe(0)
        expect(
          await messageTranslationRepository.deleteByMessageIds(
            workspaceA,
            [removed.messageId, "9000000000000099"],
            tx,
          ),
        ).toBe(1)
        expect(
          await messageTranslationRepository.findByMessageIds(
            workspaceA,
            [removed.messageId, kept.messageId],
            tx,
          ),
        ).toEqual([expect.objectContaining({ messageId: kept.messageId })])
      }))

    test("scopes reads and deletes by workspace", () =>
      run(async (tx) => {
        const workspaceA = await seedWorkspace(tx, "scope-a")
        const workspaceB = await seedWorkspace(tx, "scope-b")
        const conversation = await seedConversation(tx, workspaceA)
        const input = translationInput(workspaceA, conversation.id)
        await messageTranslationRepository.upsertResult(input, tx)

        expect(
          await messageTranslationRepository.findByMessageIds(
            workspaceB,
            [input.messageId],
            tx,
          ),
        ).toHaveLength(0)
        expect(
          await messageTranslationRepository.deleteByMessageId(
            workspaceB,
            input.messageId,
            tx,
          ),
        ).toBe(false)
        expect(
          await messageTranslationRepository.deleteByMessageId(
            workspaceA,
            input.messageId,
            tx,
          ),
        ).toBe(true)
      }))
  })

  describe("settings", () => {
    test("enabledAt is set on first enable and never moved afterwards", () =>
      run(async (tx) => {
        const workspaceId = await seedWorkspace(tx, "settings")

        const off = await inboxTranslationSettingsRepository.upsert(
          { workspaceId, enabled: false, modelConfig: null },
          tx,
        )
        expect(off.enabledAt).toBeNull()

        const on = await inboxTranslationSettingsRepository.upsert(
          { workspaceId, enabled: true, modelConfig: null },
          tx,
        )
        expect(on.enabledAt).not.toBeNull()

        await inboxTranslationSettingsRepository.upsert(
          { workspaceId, enabled: false, modelConfig: null },
          tx,
        )
        const again = await inboxTranslationSettingsRepository.upsert(
          { workspaceId, enabled: true, modelConfig: null },
          tx,
        )
        expect(again.enabledAt?.getTime()).toBe(on.enabledAt?.getTime())
      }))
  })
})
