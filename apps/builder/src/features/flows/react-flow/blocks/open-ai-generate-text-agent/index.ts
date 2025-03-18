import type { BlockDefinition } from "..";
import { OpenAIGenerateTextAgentEditor } from "./editor";
import { openAIGenerateTextAgentSchema, openAIGenerateTextAgentDefaultFn } from "./schema";
import { OpenAIGenerateTextAgentViewer } from "./viewer";

export const openAIGenerateTextAgentBlock: BlockDefinition = {
  editor: OpenAIGenerateTextAgentEditor,
  viewer: OpenAIGenerateTextAgentViewer,
  schema: openAIGenerateTextAgentSchema,
  defaultValue: openAIGenerateTextAgentDefaultFn,
}
