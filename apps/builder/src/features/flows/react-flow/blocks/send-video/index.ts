import type { BlockDefinition } from "..";
import { SendVideoBlockEditor } from "./editor";
import { sendVideoBlockDefaultFn, sendVideoBlockSchema } from "./schema";
import { SendVideoBlockViewer } from "./viewer";

export const sendVideoBlock: BlockDefinition = {
  editor: SendVideoBlockEditor,
  viewer: SendVideoBlockViewer,
  schema: sendVideoBlockSchema,
  defaultValue: sendVideoBlockDefaultFn,
}
