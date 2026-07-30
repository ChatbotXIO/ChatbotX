import { SdkException } from "@chatbotx.io/sdk"

export class MetaCatalogException extends SdkException {
  readonly statusCode: number
  readonly graphCode?: number
  readonly graphSubcode?: number
  readonly fbTraceId?: string

  constructor(
    message: string,
    statusCode: number,
    graphCode?: number,
    details?: {
      graphSubcode?: number
      fbTraceId?: string
    },
  ) {
    super(message, graphCode ?? "metaCatalogError", statusCode)
    this.statusCode = statusCode
    this.graphCode = graphCode
    this.graphSubcode = details?.graphSubcode
    this.fbTraceId = details?.fbTraceId
  }
}

export const isInvalidMetaTokenError = (error: unknown): boolean =>
  error instanceof MetaCatalogException && error.graphCode === 190

/**
 * Only Graph's parameter-validation response proves that no batch was queued.
 * Transport failures and systemic Graph errors may happen after acceptance.
 */
export const isDefiniteMetaRequestRejection = (error: unknown): boolean =>
  error instanceof MetaCatalogException &&
  error.statusCode === 400 &&
  error.graphCode === 100
