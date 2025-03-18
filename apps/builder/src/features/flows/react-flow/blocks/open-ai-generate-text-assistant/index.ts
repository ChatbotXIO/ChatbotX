import type { BlockDefinition } from "..";
import { OpenAIGenerateTextAssistantEditor } from "./editor";
import { openAIGenerateTextAssistantSchema, openAIGenerateTextAssistantDefaultFn } from "./schema";
import { OpenAIGenerateTextAssistantViewer } from "./viewer";

export const openAIGenerateTextAssistantBlock: BlockDefinition = {
  editor: OpenAIGenerateTextAssistantEditor,
  viewer: OpenAIGenerateTextAssistantViewer,
  schema: openAIGenerateTextAssistantSchema,
  defaultValue: openAIGenerateTextAssistantDefaultFn,
}
