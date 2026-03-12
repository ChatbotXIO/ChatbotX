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
              text: `Tag list:\n${formatResult(result.data)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"

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
    execute: async (api: ChatbotXAPI, { name }: { name: string }) => {
      try {
        const result = await createTag(api, name)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag created successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"

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
    get_tag: {
      description: "Get a tag by its ID.",
      execute: async (api: ChatbotXAPI, { id }: { id: string }) => {
        try {
          const result = await showTag(api, id)

          return {
            content: [
              {
                type: "text" as const,
                text: `Tag details:\n${formatResult(result)}`,
              },
            ],
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error"

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
      execute: async (api: ChatbotXAPI, { name }: { name: string }) => {
        try {
          const result = await showTagByName(api, name)

          return {
            content: [
              {
                type: "text" as const,
                text: `Tag details:\n${formatResult(result)}`,
              },
            ],
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error"

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
        { id, name }: { id: string; name: string },
      ) => {
        try {
          const result = await updateTag(api, id, name)

          return {
            content: [
              {
                type: "text" as const,
                text: `Tag updated successfully:\n${formatResult(result)}`,
              },
            ],
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error"

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
      execute: async (api: ChatbotXAPI, { id }: { id: string }) => {
        try {
          await deleteTag(api, id)

          return {
            content: [
              {
                type: "text" as const,
                text: "Tag deleted successfully.",
              },
            ],
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error"

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
  },
}
