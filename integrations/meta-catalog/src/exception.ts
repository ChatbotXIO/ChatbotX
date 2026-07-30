import { SdkException } from "@chatbotx.io/sdk"

export class MetaCatalogException extends SdkException {
  readonly statusCode: number
  readonly graphCode?: number

  constructor(message: string, statusCode: number, graphCode?: number) {
    super(message, graphCode ?? "metaCatalogError", statusCode)
    this.statusCode = statusCode
    this.graphCode = graphCode
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
