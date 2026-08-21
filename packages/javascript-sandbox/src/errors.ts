export const javascriptSandboxErrorCodes = [
  "javascriptTimeout",
  "javascriptMemoryLimit",
  "javascriptExecutionFailed",
  "javascriptNoReturnValue",
  "javascriptOutputTooLarge",
] as const

export type JavascriptSandboxErrorCode =
  (typeof javascriptSandboxErrorCodes)[number]

export class JavascriptSandboxError extends Error {
  readonly code: JavascriptSandboxErrorCode

  constructor(message: string, code: JavascriptSandboxErrorCode) {
    super(message)
    this.name = "JavascriptSandboxError"
    this.code = code
  }
}
