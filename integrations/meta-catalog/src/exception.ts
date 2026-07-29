export class MetaCatalogException extends Error {
  readonly statusCode: number
  readonly graphCode?: number

  constructor(message: string, statusCode: number, graphCode?: number) {
    super(message)
    this.name = "MetaCatalogException"
    this.statusCode = statusCode
    this.graphCode = graphCode
  }
}

export const isInvalidMetaTokenError = (error: unknown): boolean =>
  error instanceof MetaCatalogException && error.graphCode === 190
