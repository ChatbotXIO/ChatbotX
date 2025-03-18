import type { BlockDefinition } from "..";
import { SendCarouselBlockEditor } from "./editor";
import { sendCarouselBlockSchema, sendCarouselBlockDefaultFn } from "./schema";
import { SendCarouselBlockViewer } from "./viewer";

export const sendCarouselBlock: BlockDefinition = {
  editor: SendCarouselBlockEditor,
  viewer: SendCarouselBlockViewer,
  schema: sendCarouselBlockSchema,
  defaultValue: sendCarouselBlockDefaultFn,
}
