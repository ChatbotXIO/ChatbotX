import ivm from "isolated-vm"

const MEMORY_LIMIT_MB = 8
const TIMEOUT_MS = 500
export const MAX_CODE_LENGTH = 10_000
const timeoutErrorPattern = /timed out/i
const memoryErrorPattern = /memory limit|heap/i

export type JavascriptSandboxErrorCode =
  | "javascriptTimeout"
  | "javascriptMemoryLimit"
  | "javascriptExecutionFailed"
  | "javascriptNoReturnValue"

export class JavascriptSandboxError extends Error {
  readonly code: JavascriptSandboxErrorCode

  constructor(message: string, code: JavascriptSandboxErrorCode) {
    super(message)
    this.name = "JavascriptSandboxError"
    this.code = code
  }
}

export const executeJavascript = async (props: {
  code: string
  input: Record<string, unknown>
}): Promise<{ value: unknown }> => {
  if (props.code.length > MAX_CODE_LENGTH) {
    throw new JavascriptSandboxError(
      `JavaScript code must not exceed ${MAX_CODE_LENGTH} characters`,
      "javascriptExecutionFailed",
    )
  }

  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB })
  let context: ivm.Context | undefined
  let input: ivm.ExternalCopy<Record<string, unknown>> | undefined

  try {
    context = await isolate.createContext()
    input = new ivm.ExternalCopy(props.input)
    const value = await context.evalClosure(
      `"use strict"; const input = $0;\n${props.code}`,
      [input.copyInto()],
      {
        timeout: TIMEOUT_MS,
        arguments: { copy: true },
        result: { copy: true },
      },
    )
    if (value === undefined) {
      throw new JavascriptSandboxError(
        "JavaScript code must return a value",
        "javascriptNoReturnValue",
      )
    }

    return { value }
  } catch (error) {
    if (error instanceof JavascriptSandboxError) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    let code: JavascriptSandboxErrorCode = "javascriptExecutionFailed"
    if (timeoutErrorPattern.test(message)) {
      code = "javascriptTimeout"
    } else if (memoryErrorPattern.test(message)) {
      code = "javascriptMemoryLimit"
    }
    throw new JavascriptSandboxError(
      `JavaScript execution failed: ${message}`,
      code,
    )
  } finally {
    input?.release()
    context?.release()
    isolate.dispose()
  }
}
