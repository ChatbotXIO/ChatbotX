import type { BlockDefinition } from "..";
import { OpenAITextToSpeechEditor } from "./editor";
import { openAITextToSpeechSchema, openAITextToSpeechDefaultFn } from "./schema";
import { OpenAITextToSpeechViewer } from "./viewer";

export const openAITextToSpeechBlock: BlockDefinition = {
  editor: OpenAITextToSpeechEditor,
  viewer: OpenAITextToSpeechViewer,
  schema: openAITextToSpeechSchema,
  defaultValue: openAITextToSpeechDefaultFn,
}
