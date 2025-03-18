import type { BlockDefinition } from "..";
import { OpenAISpeechToTextEditor } from "./editor";
import { openAISpeechToTextDefaultFn, openAISpeechToTextSchema } from "./schema";
import { OpenAISpeechToTextViewer } from "./viewer";

export const openAISpeechToTextBlock: BlockDefinition = {
  editor: OpenAISpeechToTextEditor,
  viewer: OpenAISpeechToTextViewer,
  schema: openAISpeechToTextSchema,
  defaultValue: openAISpeechToTextDefaultFn,
}
