import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  createTag as createTagApi,
  deleteTag as deleteTagApi,
  listTags as listTagsApi,
  showTag as showTagApi,
  showTagByName as showTagByNameApi,
  updateTag as updateTagApi,
} from "@chatbotx/public-apis/tags"
import { createApiClient } from "../config"
import { type CommandArg, printResult, validateCommandArgs } from "./utils"

type TagParamKey = "id" | "name"

type TagCommandArg = CommandArg<TagParamKey>

export type TagCommandParams = Partial<Record<TagParamKey, string>>

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
      createTagApi(api, params.name ?? ""),
  },
  "tags:show": {
    name: "Show tag details",
    args: [
      {
        key: "id",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      showTagApi(api, params.id ?? ""),
  },
  "tags:show-by-name": {
    name: "Show tag details by name",
    args: [
      {
        key: "name",
        description: "Tag name",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: TagCommandParams) =>
      showTagByNameApi(api, params.name ?? ""),
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
      updateTagApi(api, params.id ?? "", params.name ?? ""),
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
      deleteTagApi(api, params.id ?? ""),
  },
} satisfies Record<string, TagCommand>
