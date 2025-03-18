import type { BlockDefinition } from "..";
import { OpenAIAnalyzeImageEditor } from "./editor";
import { openAIAnalyzeImageDefaultFn, openAIAnalyzeImageSchema } from "./schema";
import { OpenAIAnalyzeImageViewer } from "./viewer";

export const openAIAnalyzeImageBlock: BlockDefinition = {
  editor: OpenAIAnalyzeImageEditor,
  viewer: OpenAIAnalyzeImageViewer,
  schema: openAIAnalyzeImageSchema,
  defaultValue: openAIAnalyzeImageDefaultFn,
};
