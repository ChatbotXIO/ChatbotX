import {
  type ChatbotXAPI,
  createTag,
  createTagInputSchema,
  deleteTag,
  deleteTagInputSchema,
  listTags,
  showTag,
  showTagByName,
  showTagByNameInputSchema,
  showTagInputSchema,
  updateTag,
  updateTagInputSchema,
} from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  list_tags: {
    description: "Get a list of all tags in the system.",
    execute: async (api: ChatbotXAPI) => {
      try {
        const result = await listTags(api)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag list:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch tag list: ${message}`,
            },
          ],
        }
      }
    },
  },
  create_tag: {
    description: "Create a new tag with the given name.",
    inputSchema: createTagInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = createTagInputSchema.parse(input)
        const result = await createTag(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag created successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to create tag: ${message}`,
            },
          ],
        }
      }
    },
  },
  get_tag: {
    description: "Get a tag by its ID.",
    inputSchema: showTagInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = showTagInputSchema.parse(input)
        const result = await showTag(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch tag: ${message}`,
            },
          ],
        }
      }
    },
  },
  get_tag_by_name: {
    description: "Get a tag by its name.",
    inputSchema: showTagByNameInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = showTagByNameInputSchema.parse(input)
        const result = await showTagByName(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch tag: ${message}`,
            },
          ],
        }
      }
    },
  },
  update_tag: {
    description: "Update the name of an existing tag.",
    inputSchema: updateTagInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = updateTagInputSchema.parse(input)
        const result = await updateTag(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag updated successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to update tag: ${message}`,
            },
          ],
        }
      }
    },
  },
  delete_tag: {
    description: "Delete a tag by its ID.",
    inputSchema: deleteTagInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = deleteTagInputSchema.parse(input)
        await deleteTag(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: "Tag deleted successfully.",
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to delete tag: ${message}`,
            },
          ],
        }
      }
    },
  },
}
