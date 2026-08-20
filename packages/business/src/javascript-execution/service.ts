import {
  createJavascriptExecutorClient,
  JavascriptSandboxError,
} from "@chatbotx.io/javascript-sandbox"
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { BaseService } from "../base.service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { customFieldService } from "../custom-field/service"
import { ChatbotXException, notFoundException } from "../errors"
import { javascriptExecutionEnv } from "./keys"
import { toValidatedCustomFieldValue } from "./output-value"

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
    // Resolved before running the code so a step pointing at a deleted field
    // fails fast instead of burning a sandbox execution, and so a stale id
    // is a visible error rather than writeValues' silent no-op.
    const customField = await customFieldService.findBy({
      where: { id: props.customFieldId, workspaceId: props.workspaceId },
    })
    if (!customField) {
      throw notFoundException(
        "The output custom field for this step no longer exists.",
      )
    }

    const result = await this.execute({ code: props.code, input: props.input })

    const value = toValidatedCustomFieldValue({
      value: result.value,
      type: customField.type,
      fieldName: customField.name,
    })

    if (value !== null) {
      await contactCustomFieldService.setValues({
        workspaceId: props.workspaceId,
        contactId: props.contactId,
        fields: [{ customFieldId: props.customFieldId, value }],
        // date/datetime were only pre-flighted for parseability in
        // toValidatedCustomFieldValue; the authoritative, timezone-aware
        // normalization happens here, where the contact/workspace zone is
        // resolvable.
        temporalInputParsing: TemporalInputParsing.Lenient,
      })
    }

    return result
  }
}

export const javascriptExecutionService = new JavascriptExecutionService()
