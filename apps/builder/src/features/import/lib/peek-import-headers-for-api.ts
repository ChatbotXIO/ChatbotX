import { peekImportHeaders } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"

type PeekImportHeadersInput = Parameters<typeof peekImportHeaders>[0]

/**
 * Header peek for the token API. The service attaches `data` (e.g. the size
 * limit) for the builder to re-localize; the API shows the exception's English
 * message as is, and would append that data to it ("(size=20)"), so it is
 * dropped here.
 */
export async function peekImportHeadersForApi(
  input: PeekImportHeadersInput,
): Promise<string[]> {
  try {
    return await peekImportHeaders(input)
  } catch (error) {
    if (error instanceof ChatbotXException && error.data) {
      throw new ChatbotXException(
        error.message,
        error.code,
        error.httpStatusCode,
      )
    }
    throw error
  }
}
