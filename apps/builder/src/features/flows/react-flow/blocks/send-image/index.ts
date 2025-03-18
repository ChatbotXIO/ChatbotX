import type { BlockDefinition } from "..";
import { SendImageBlockEditor } from "./editor";
import { sendImageBlockSchema, sendImageBlockDefaultFn } from "./schema";
import { SendImageBlockViewer } from "./viewer";

export const sendImageBlock: BlockDefinition = {
  editor: SendImageBlockEditor,
  viewer: SendImageBlockViewer,
  schema: sendImageBlockSchema,
  defaultValue: sendImageBlockDefaultFn,
}
