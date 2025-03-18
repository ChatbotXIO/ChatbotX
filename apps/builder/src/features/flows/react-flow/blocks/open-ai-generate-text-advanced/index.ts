import type { BlockDefinition } from "..";
import { OpenAIGenerateTextAdvancedEditor } from "./editor";
import { openAIGenerateTextAdvancedDefaultFn, openAIGenerateTextAdvancedSchema } from "./schema";
import { OpenAIGenerateTextAdvancedViewer } from "./viewer";

export const openAIGenerateTextAdvancedBlock: BlockDefinition = {
    editor: OpenAIGenerateTextAdvancedEditor,
    viewer: OpenAIGenerateTextAdvancedViewer,
    schema: openAIGenerateTextAdvancedSchema,
    defaultValue: openAIGenerateTextAdvancedDefaultFn,
  }
