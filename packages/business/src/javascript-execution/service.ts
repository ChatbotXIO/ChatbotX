import {
  createJavascriptExecutorClient,
  JavascriptSandboxError,
} from "@chatbotx.io/javascript-sandbox"
import { BaseService } from "../base.service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { ChatbotXException } from "../errors"
import { javascriptExecutionEnv } from "./keys"

const MAX_OUTPUT_BYTES = 64 * 1024

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
    customFieldId: string
  }): Promise<{ value: unknown }> {
    const result = await this.execute({ code: props.code, input: props.input })
    const encodedValue = toCustomFieldValue(result.value)

    if (encodedValue !== null) {
      await contactCustomFieldService.setValues({
        workspaceId: props.workspaceId,
        contactId: props.contactId,
        fields: [{ customFieldId: props.customFieldId, value: encodedValue }],
      })
    }

    return result
  }
}

export const javascriptExecutionService = new JavascriptExecutionService()
