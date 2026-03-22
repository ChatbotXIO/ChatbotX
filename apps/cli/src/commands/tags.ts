import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  createTag as createTagApi,
  deleteTag as deleteTagApi,
  listTags as listTagsApi,
  showTag as showTagApi,
  showTagByName as showTagByNameApi,
  updateTag as updateTagApi,
} from "@chatbotx/public-apis"
import { createApiClient } from "../config"
import { type CommandArg, printResult, validateCommandArgs } from "./utils"

type TagCommandParams = Partial<
  Parameters<typeof createTagApi>[1] &
    Parameters<typeof showTagApi>[1] &
    Parameters<typeof showTagByNameApi>[1] &
    Parameters<typeof updateTagApi>[1] &
    Parameters<typeof deleteTagApi>[1]
>

type TagParamKey = keyof Required<TagCommandParams>

type TagCommandArg = CommandArg<TagParamKey>

type TagCommand = {
  name: string
  args: TagCommandArg[]
  execute: (api: ChatbotXAPI, params: TagCommandParams) => Promise<unknown>
}

export type TagCommandName = keyof typeof tagCommands

export const executeTagCommand = async (
  commandName: TagCommandName,
  params: TagCommandParams = {},
): Promise<void> => {
  validateCommandArgs(commandName, params, tagCommands)
  const api = createApiClient()
  const result = await tagCommands[commandName].execute(api, params)
  printResult(result)
}

export const tagCommands = {
  "tags:list": {
    name: "List all tags",
    args: [],
    execute: (api: ChatbotXAPI) => listTagsApi(api),
  },
  "tags:create": {
    name: "Create a new tag",
    args: [
      {
        key: "name",
        description: "Tag name",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      createTagApi(api, { name: params.name ?? "" }),
  },
  "tags:show": {
    name: "Get tag by ID",
    args: [
      {
        key: "id",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      showTagApi(api, { id: params.id ?? "" }),
  },
  "tags:show-by-name": {
    name: "Get tag by name",
    args: [
      {
        key: "name",
        description: "Tag name",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      showTagByNameApi(api, { name: params.name ?? "" }),
  },
  "tags:update": {
    name: "Update a tag",
    args: [
      {
        key: "id",
        description: "Tag ID",
        required: true,
      },
      {
        key: "name",
        description: "New tag name",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      updateTagApi(api, { id: params.id ?? "", name: params.name ?? "" }),
  },
  "tags:delete": {
    name: "Delete a tag",
    args: [
      {
        key: "id",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      deleteTagApi(api, { id: params.id ?? "" }),
  },
} satisfies Record<string, TagCommand>
