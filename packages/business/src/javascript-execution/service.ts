import {
  createJavascriptExecutorClient,
  JavascriptSandboxError,
} from "@chatbotx.io/javascript-sandbox"
import { getProperty } from "dot-prop"
import { BaseService } from "../base.service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { ChatbotXException } from "../errors"
import { javascriptExecutionEnv } from "./keys"

const MAX_OUTPUT_BYTES = 64 * 1024

export type JavascriptExecutionMapping = {
  jsonPath: string
  outputFieldId: string
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mappedValue = (value: unknown, jsonPath: string): unknown => {
  if (jsonPath === "") {
    return value
  }
  return isPlainObject(value) ? getProperty(value, jsonPath) : undefined
}

const toCustomFieldValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null
  }

  const encoded = typeof value === "string" ? value : JSON.stringify(value)
  if (encoded === undefined) {
    return null
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_OUTPUT_BYTES) {
    throw new ChatbotXException(
      "JavaScript output is too large to save",
      "javascriptOutputTooLarge",
      400,
    )
  }
  return encoded
}

class JavascriptExecutionService extends BaseService {
  async execute(props: {
    code: string
    input: Record<string, unknown>
  }): Promise<{ value: unknown }> {
    try {
      const env = javascriptExecutionEnv()
      const client = createJavascriptExecutorClient({
        url: env.JAVASCRIPT_EXECUTOR_URL,
        token: env.JAVASCRIPT_EXECUTOR_TOKEN,
      })
      return await client.execute(props)
    } catch (error) {
      if (error instanceof JavascriptSandboxError) {
        throw new ChatbotXException(error.message, error.code, 400)
      }
      throw error
    }
  }

  async executeAndMap(props: {
    workspaceId: string
    contactId: string
    code: string
    input: Record<string, unknown>
    mapping: JavascriptExecutionMapping[]
  }): Promise<{ value: unknown }> {
    const result = await this.execute({ code: props.code, input: props.input })
    const fields = props.mapping.flatMap(({ jsonPath, outputFieldId }) => {
      const value = mappedValue(result.value, jsonPath)
      const encodedValue = toCustomFieldValue(value)
      return encodedValue === null
        ? []
        : [{ customFieldId: outputFieldId, value: encodedValue }]
    })

    if (fields.length > 0) {
      await contactCustomFieldService.setValues({
        workspaceId: props.workspaceId,
        contactId: props.contactId,
        fields,
      })
    }

    return result
  }
}

export const javascriptExecutionService = new JavascriptExecutionService()
