import { contactCustomFieldService } from "@chatbotx.io/business"
import {
  type SpreadsheetSendDataSchema,
  type SpreadsheetStepVersion,
  type SpreadsheetUpdateRowSchema,
  spreadsheetStepVersions,
  toSpreadsheetStepVersion,
} from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"
import type { ExecuteStepProps } from "./flow"

type SpreadsheetWriteStepSchema =
  | SpreadsheetSendDataSchema
  | SpreadsheetUpdateRowSchema

export type WriteValueResolver = (
  props: ExecuteStepProps<SpreadsheetWriteStepSchema>,
) => Promise<string[]>

const resolveFromCustomFields: WriteValueResolver = async ({
  conversation,
  step,
}) => {
  const storedValues = await contactCustomFieldService.listValues({
    contactId: conversation.contactId,
  })
  const valueByCustomFieldId = new Map(
    storedValues.map((field) => [field.customFieldId, field.value]),
  )

  return step.map.map((item) =>
    item.customFieldId
      ? (valueByCustomFieldId.get(item.customFieldId) ?? "")
      : "",
  )
}

const resolveFromVariableTemplates: WriteValueResolver = async (props) => {
  const variables = await contactVariableService.getAll({
    contactId: props.conversation.contactId,
    contactInbox: props.contactInbox,
    conversation: props.conversation,
  })

  return await Promise.all(
    props.step.map.map((mapItem) =>
      contactVariableService.replaceAll({
        text: mapItem.value ?? "",
        variables,
      }),
    ),
  )
}

const writeValueResolvers = {
  [spreadsheetStepVersions.enum.v1]: resolveFromCustomFields,
  [spreadsheetStepVersions.enum.v2]: resolveFromVariableTemplates,
} satisfies Record<SpreadsheetStepVersion, WriteValueResolver>

export const buildSpreadsheetWriteData: WriteValueResolver = (props) =>
  writeValueResolvers[toSpreadsheetStepVersion(props.step.version)](props)
