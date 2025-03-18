import type { BlockDefinition } from "..";
import { OpenAIGenerateImageEditor } from "./editor";
import { openAIGenerateImageDefaultFn, openAIGenerateImageSchema } from "./schema";
import { OpenAIGenerateImageViewer } from "./viewer";

export const openAIGenerateImageBlock: BlockDefinition = {
  editor: OpenAIGenerateImageEditor,
  viewer: OpenAIGenerateImageViewer,
  schema: openAIGenerateImageSchema,
  defaultValue: openAIGenerateImageDefaultFn,
};

