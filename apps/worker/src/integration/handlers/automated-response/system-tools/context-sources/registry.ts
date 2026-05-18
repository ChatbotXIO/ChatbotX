import { documentContextSourceAdapter } from "./document-source"
import type {
  ConversationContextSourceAdapter,
  ConversationContextSourceType,
} from "./types"
import { urlContextSourceAdapter } from "./url-source"

const contextSourceRegistry: Partial<
  Record<ConversationContextSourceType, ConversationContextSourceAdapter>
> = {
  document: documentContextSourceAdapter,
  url: urlContextSourceAdapter,
}

export function getContextSourceAdapter(
  sourceType: ConversationContextSourceType,
): ConversationContextSourceAdapter | null {
  return contextSourceRegistry[sourceType] ?? null
}
