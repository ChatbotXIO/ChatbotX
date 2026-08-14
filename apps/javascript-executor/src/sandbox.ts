import {
  JavascriptSandboxError,
  type JavascriptSandboxErrorCode,
  MAX_CODE_LENGTH,
} from "@chatbotx.io/javascript-sandbox"
import ivm from "isolated-vm"

export { MAX_CODE_LENGTH } from "@chatbotx.io/javascript-sandbox"

const MEMORY_LIMIT_MB = 8
const TIMEOUT_MS = 500
const timeoutErrorPattern = /timed out/i
const memoryErrorPattern = /memory limit|heap/i

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
    let clientMessage = "JavaScript execution failed"
    if (timeoutErrorPattern.test(message)) {
      code = "javascriptTimeout"
      clientMessage = "JavaScript execution timed out"
    } else if (memoryErrorPattern.test(message)) {
      code = "javascriptMemoryLimit"
      clientMessage = "JavaScript execution exceeded the memory limit"
    }
    throw new JavascriptSandboxError(clientMessage, code)
  } finally {
    input?.release()
    context?.release()
    isolate.dispose()
  }
}
