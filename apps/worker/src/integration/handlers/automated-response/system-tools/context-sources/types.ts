import type {
  AIConversationSourceModel,
  AttachmentModel,
} from "@chatbotx.io/database/types"

export type ConversationContextSourceType =
  | "document"
  | "image"
  | "url"
  | "web_search"

export type ConversationContextSnippet = {
  chunkIndex: number | null
  content: string
  similarity: number | null
  source: "cached_embedding" | "fallback_parse"
}

export type ResolvedConversationSource = {
  attachment?: AttachmentModel
  source: AIConversationSourceModel
}

export interface ResolveConversationSourceInput {
  conversationId: string
  messageId?: string
  query: string
  sourceHint?: string
  workspaceId: string
}

export interface RetrieveRelevantChunksInput {
  query: string
  resolvedSource: ResolvedConversationSource
  topK?: number
}

export interface PrepareConversationContextInput
  extends ResolveConversationSourceInput {
  topK?: number
}

export interface PreparedConversationContext {
  resolvedSource: ResolvedConversationSource
  snippets: ConversationContextSnippet[]
  summary: null | string
}

export interface ConversationContextSourceAdapter {
  prepareContext(
    input: PrepareConversationContextInput,
  ): Promise<null | PreparedConversationContext>
  resolveSource(
    input: ResolveConversationSourceInput,
  ): Promise<null | ResolvedConversationSource>
  retrieveRelevantChunks(
    input: RetrieveRelevantChunksInput,
  ): Promise<ConversationContextSnippet[]>
  sourceType: ConversationContextSourceType
}
