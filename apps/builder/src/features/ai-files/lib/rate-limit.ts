import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"

// Both spend the workspace's own embedding key (search embeds the query,
// reindex re-embeds changed chunks): 5 per 10-second window ≈ 30/minute.
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

const rateLimitedMessageKey = {
  search: "aiFiles.testQuery.rateLimited",
  reindex: "aiFiles.reindex.rateLimited",
} as const

/**
 * Server-action variant: same buckets as the public API (so neither path can
 * bypass the other), but the 429 carries a translated message for the toast.
 */
export async function assertAIFileActionNotRateLimited(
  operation: keyof typeof rateLimitedMessageKey,
  workspaceId: string,
): Promise<void> {
  try {
    await (operation === "search"
      ? assertAIFileSearchNotRateLimited(workspaceId)
      : assertAIFileReindexNotRateLimited(workspaceId))
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
