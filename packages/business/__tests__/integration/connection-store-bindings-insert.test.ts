// @vitest-environment node

/**
 * `CONNECTION_STORE_BINDINGS`'s workspace-integration bindings' `insertRow`
 * against a real Postgres — proves the PR #1185 re-review fix for I1:
 * connecting claude/deepseek/gemini/openai/openrouter via the generic
 * credential-strategy flow (`connectFromCredentials`, whose `configFields`
 * only declare `apiKey` — see `credential-providers.ts`'s
 * `makeAiKeyProvider`) no longer 500s on the satellite table's NOT NULL
 * `model`/`maxOutputTokens` columns, and that `openaiCompatible`'s `baseURL`
 * (previously dropped before reaching the insert — see `credentials.ts`'s
 * `extraConfig` fix) is actually persisted alongside its own NOT NULL
 * `defaultModel`/`preset`/`name` defaults.
 *
 * Each `config` passed to `insertRow` below is exactly what
 * `connectFromCredentials` would forward for a bare `{ apiKey }` (or, for
 * `openaiCompatible`, `{ apiKey, baseURL }`) connect request — a mocked `tx`
 * (as `packages/database/__tests__/integration/insert-required-columns.test.ts`
 * uses for repositories) only proves the mock was called correctly; this
 * needs the real column constraints.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db } from "@chatbotx.io/database/client"
import {
  integrationClaudeModel,
  integrationDeepseekModel,
  integrationGeminiModel,
  integrationOpenaiCompatibleModel,
  integrationOpenaiModel,
  integrationOpenrouterModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { CONNECTION_STORE_BINDINGS } from "../../src/connection/store-bindings"

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

const databaseUrl = realDatabaseUrl()

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
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

const seedWorkspace = async (tx: DatabaseClient): Promise<string> => {
  const ownerId = createId()
  const workspaceId = createId()
  await tx.insert(userModel).values({
    id: ownerId,
    email: `store-binding-${ownerId}@example.test`,
    name: "Store binding test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Store binding test workspace",
  })
  return workspaceId
}

const testAuth: SecretTextAuthValue = {
  authType: AuthType.secretText,
  secretText: "test-api-key",
}

const getBinding = (provider: keyof typeof CONNECTION_STORE_BINDINGS) => {
  const binding = CONNECTION_STORE_BINDINGS[provider]
  if (!binding) {
    throw new Error(`No store binding registered for ${provider}`)
  }
  return binding
}

/** Reads the inserted satellite row back by its own PK for assertions. */
const loadRow = async <TTable extends PgTable & { id: PgTable["id"] }>(
  tx: DatabaseClient,
  table: TTable,
  id: string,
) => {
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1)
  if (!row) {
    throw new Error("Inserted row was not found")
  }
  return row
}

describe.skipIf(!databaseUrl)(
  "CONNECTION_STORE_BINDINGS workspace-integration bindings insert against Postgres",
  () => {
    test("claude: a bare apiKey connect fills the NOT NULL model/maxOutputTokens defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("claude").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: { sourceId: "workspace", displayName: "Claude" },
            config: {},
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(tx, integrationClaudeModel, inserted.id)
        expect(row.model).toBe("claude-sonnet-4-6")
        expect(row.maxOutputTokens).toBe(1024)
      })
    })

    test("deepseek: a bare apiKey connect fills the NOT NULL model/maxOutputTokens defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("deepseek").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: { sourceId: "workspace", displayName: "DeepSeek" },
            config: {},
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(tx, integrationDeepseekModel, inserted.id)
        expect(row.model).toBe("deepseek-flash")
        expect(row.maxOutputTokens).toBe(1024)
      })
    })

    test("gemini: a bare apiKey connect fills the NOT NULL model/maxOutputTokens defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("gemini").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: { sourceId: "workspace", displayName: "Gemini" },
            config: {},
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(tx, integrationGeminiModel, inserted.id)
        expect(row.model).toBe("gemini-3.5-flash")
        expect(row.maxOutputTokens).toBe(1024)
      })
    })

    test("openai: a bare apiKey connect fills the NOT NULL model/maxOutputTokens defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("openai").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: { sourceId: "workspace", displayName: "OpenAI" },
            config: {},
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(tx, integrationOpenaiModel, inserted.id)
        expect(row.model).toBe("gpt-5.4-mini")
        expect(row.maxOutputTokens).toBe(1024)
      })
    })

    test("openrouter: a bare apiKey connect fills the NOT NULL model/maxOutputTokens defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("openrouter").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: { sourceId: "workspace", displayName: "OpenRouter" },
            config: {},
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(tx, integrationOpenrouterModel, inserted.id)
        expect(row.model).toBe("openai/gpt-5.4-mini")
        expect(row.maxOutputTokens).toBe(1024)
      })
    })

    test("openaiCompatible: an apiKey+baseURL connect persists baseURL and fills the NOT NULL defaultModel/preset/name defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("openaiCompatible").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: {
              sourceId: "workspace",
              displayName: "OpenAI-compatible",
            },
            config: { baseURL: "https://example.com/v1" },
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(
          tx,
          integrationOpenaiCompatibleModel,
          inserted.id,
        )
        expect(row.baseURL).toBe("https://example.com/v1")
        expect(row.defaultModel).toBe("gpt-4o-mini")
        expect(row.preset).toBe("custom")
        expect(row.name).toBe("OpenAI-compatible")
      })
    })
  },
)
