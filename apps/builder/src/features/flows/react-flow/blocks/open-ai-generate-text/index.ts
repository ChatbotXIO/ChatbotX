import type { BlockDefinition } from "..";
import { OpenAIGenerateTextEditor } from "./editor";
import { openAIGenerateTextSchema, openAIGenerateTextDefaultFn } from "./schema";
import { OpenAIGenerateTextViewer } from "./viewer";

export const sendAIGenerateTextBlock: BlockDefinition = {
  editor: OpenAIGenerateTextEditor,
  viewer: OpenAIGenerateTextViewer,
  schema: openAIGenerateTextSchema,
  defaultValue: openAIGenerateTextDefaultFn,
}
