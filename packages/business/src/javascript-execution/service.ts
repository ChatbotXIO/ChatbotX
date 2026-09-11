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
import {
  collectJavascriptOutputWrites,
  completeJavascriptMapping,
  type JavascriptJsonPathMapping,
  type JavascriptOutputField,
} from "./output-value"

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
    mapping?: JavascriptJsonPathMapping[]
  }): Promise<{ value: unknown }> {
    const customFieldId = props.customFieldId.trim()
    const mapping = completeJavascriptMapping(props.mapping)
    // Resolved before running the code so a step pointing at a deleted field
    // fails fast instead of burning a sandbox execution, and so a stale id
    // is a visible error rather than writeValues' silent no-op. An empty id
    // is allowed when JSON-path mapping writes individual fields.
    const primaryField = customFieldId
      ? await customFieldService.findBy({
          where: { id: customFieldId, workspaceId: props.workspaceId },
        })
      : null
    if (customFieldId && !primaryField) {
      throw notFoundException(
        "The output custom field for this step no longer exists.",
      )
    }

    const mappedRows =
      mapping.length > 0
        ? await customFieldService.findManyByIds({
            workspaceId: props.workspaceId,
            ids: mapping.map((entry) => entry.outputFieldId),
          })
        : []
    const mappedFields = new Map<string, JavascriptOutputField>(
      mappedRows.map((field) => [
        field.id,
        { id: field.id, name: field.name, type: field.type },
      ]),
    )

    const result = await this.execute({ code: props.code, input: props.input })

    const fields = collectJavascriptOutputWrites({
      value: result.value,
      primaryField: primaryField ?? null,
      mappedFields,
      mapping,
    })

    if (fields.length > 0) {
      await contactCustomFieldService.setValues({
        workspaceId: props.workspaceId,
        contactId: props.contactId,
        fields,
        // date/datetime were only pre-flighted for parseability in
        // collectJavascriptOutputWrites; the authoritative, timezone-aware
        // normalization happens here, where the contact/workspace zone is
        // resolvable.
        temporalInputParsing: TemporalInputParsing.Lenient,
      })
    }

    return result
  }
}

export const javascriptExecutionService = new JavascriptExecutionService()
