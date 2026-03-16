import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  createCustomField as createCustomFieldApi,
  getCustomField as getCustomFieldApi,
  getCustomFieldByName as getCustomFieldByNameApi,
  listCustomFields as listCustomFieldsApi,
} from "@chatbotx/public-apis"
import { createApiClient } from "../config"
import { type CommandArg, printResult, validateCommandArgs } from "./utils"

const CUSTOM_FIELD_TYPES = [
  "shortText",
  "number",
  "date",
  "datetime",
  "boolean",
  "longText",
] as const

type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

type CustomFieldCommandParams = Partial<
  Parameters<typeof createCustomFieldApi>[1] &
    Parameters<typeof getCustomFieldApi>[1] &
    Parameters<typeof getCustomFieldByNameApi>[1]
>

type CustomFieldParamKey = keyof Required<CustomFieldCommandParams>

type CustomFieldCommandArg = CommandArg<CustomFieldParamKey>

type CustomFieldCommand = {
  name: string
  args: CustomFieldCommandArg[]
  execute: (
    api: ChatbotXAPI,
    params: CustomFieldCommandParams,
  ) => Promise<unknown>
}

export type CustomFieldCommandName = keyof typeof customFieldCommands

const isCustomFieldType = (value: string): value is CustomFieldType => {
  return CUSTOM_FIELD_TYPES.includes(value as CustomFieldType)
}

const ensureCustomFieldType = (value: string): CustomFieldType => {
  if (!isCustomFieldType(value)) {
    throw new Error(
      `Custom field type must be one of: ${CUSTOM_FIELD_TYPES.join(", ")}`,
    )
  }

  return value
}

export const executeCustomFieldCommand = async (
  commandName: CustomFieldCommandName,
  params: CustomFieldCommandParams = {},
): Promise<void> => {
  validateCommandArgs(commandName, params, customFieldCommands)
  const api = createApiClient()
  const result = await customFieldCommands[commandName].execute(api, params)
  printResult(result)
}

export const customFieldCommands = {
  "custom-fields:list": {
    name: "List all custom fields",
    args: [],
    execute: (api: ChatbotXAPI) => listCustomFieldsApi(api),
  },
  "custom-fields:create": {
    name: "Create a new custom field",
    args: [
      {
        key: "name",
        description: "Custom field name",
        required: true,
      },
      {
        key: "customFieldType",
        description: `Custom field type (${CUSTOM_FIELD_TYPES.join(", ")})`,
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: CustomFieldCommandParams) =>
      createCustomFieldApi(api, {
        name: params.name ?? "",
        customFieldType: ensureCustomFieldType(params.customFieldType ?? ""),
      }),
  },
  "custom-fields:show": {
    name: "Get custom field by ID",
    args: [
      {
        key: "id",
        description: "Custom field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: CustomFieldCommandParams) =>
      getCustomFieldApi(api, { id: params.id ?? "" }),
  },
  "custom-fields:show-by-name": {
    name: "Get custom field by name",
    args: [
      {
        key: "name",
        description: "Custom field name",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: CustomFieldCommandParams) =>
      getCustomFieldByNameApi(api, { name: params.name ?? "" }),
  },
} satisfies Record<string, CustomFieldCommand>
