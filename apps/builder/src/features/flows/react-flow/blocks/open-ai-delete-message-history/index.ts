import type { BlockDefinition } from "..";
import { OpenAIDeleteMessageHistoryEditor } from "./editor";
import { openAIDeleteMessageHistoryDefaultFn, openAIDeleteMessageHistorySchema } from "./schema";
import { OpenAIDeleteMessageHistoryViewer } from "./viewer";

export const openAIDeleteMessageHistoryBlock: BlockDefinition = {
  editor: OpenAIDeleteMessageHistoryEditor,
  viewer: OpenAIDeleteMessageHistoryViewer,
  schema: openAIDeleteMessageHistorySchema,
  defaultValue: openAIDeleteMessageHistoryDefaultFn
}
