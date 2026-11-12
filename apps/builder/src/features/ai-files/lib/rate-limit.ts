import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"

// Search and reindex spend the workspace's own embedding key (search embeds
// the query, reindex re-embeds changed chunks); create-from-URL makes the
// server download a remote file: 5 per 10-second window ≈ 30/minute each.
const AI_FILE_OPERATION_LIMIT = 5

export async function assertAIFileSearchNotRateLimited(
  workspaceId: string,
  resHeaders?: Headers,
): Promise<void> {
  await assertApiNotRateLimited({
    scope: "ai-file-search-rate-limit",
    key: workspaceId,
    limit: AI_FILE_OPERATION_LIMIT,
    resHeaders,
  })
}

export async function assertAIFileReindexNotRateLimited(
  workspaceId: string,
  resHeaders?: Headers,
): Promise<void> {
  await assertApiNotRateLimited({
    scope: "ai-file-reindex-rate-limit",
    key: workspaceId,
    limit: AI_FILE_OPERATION_LIMIT,
    resHeaders,
  })
}

/** One bucket for the UI action and `aiFiles.create` with a `url`. */
export async function assertAIFileCreateFromUrlNotRateLimited(
  workspaceId: string,
  resHeaders?: Headers,
): Promise<void> {
  await assertApiNotRateLimited({
    scope: "ai-file-create-url-rate-limit",
    key: workspaceId,
    limit: AI_FILE_OPERATION_LIMIT,
    resHeaders,
  })
}

const rateLimitedMessageKey = {
  search: "aiFiles.testQuery.rateLimited",
  reindex: "aiFiles.reindex.rateLimited",
  create: "aiFiles.create.rateLimited",
} as const

const assertNotRateLimited = {
  search: assertAIFileSearchNotRateLimited,
  reindex: assertAIFileReindexNotRateLimited,
  create: assertAIFileCreateFromUrlNotRateLimited,
} as const satisfies Record<
  keyof typeof rateLimitedMessageKey,
  (workspaceId: string) => Promise<void>
>

/**
 * Server-action variant: same buckets as the public API (so neither path can
 * bypass the other), but the 429 carries a translated message for the toast.
 */
export async function assertAIFileActionNotRateLimited(
  operation: keyof typeof rateLimitedMessageKey,
  workspaceId: string,
): Promise<void> {
  try {
    await assertNotRateLimited[operation](workspaceId)
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "tooManyRequests"
    ) {
      const t = await getTranslations()
      throw new ChatbotXException(
        t(rateLimitedMessageKey[operation]),
        "tooManyRequests",
        429,
      )
    }
    throw error
  }
}
