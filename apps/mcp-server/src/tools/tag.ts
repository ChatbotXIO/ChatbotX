import {
  type ChatbotXAPI,
  createTag,
  deleteTag,
  listTags,
  showTag,
  showTagByName,
  updateTag,
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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof createTag>[1],
    ) => {
      try {
        const result = await createTag(api, input)

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
    execute: async (api: ChatbotXAPI, input: Parameters<typeof showTag>[1]) => {
      try {
        const result = await showTag(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof showTagByName>[1],
    ) => {
      try {
        const result = await showTagByName(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof updateTag>[1],
    ) => {
      try {
        const result = await updateTag(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof deleteTag>[1],
    ) => {
      try {
        await deleteTag(api, input)

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
