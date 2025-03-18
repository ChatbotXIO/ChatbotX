import type { BlockDefinition } from "..";
import { sendMessageNodeSchema } from "../../nodes/send-message/schema";
import { SendTextBlockEditor } from "./editor";
import { sendTextBlockDefaultFn } from "./schema";
import { SendTextBlockViewer } from "./viewer";

export const sendTextBlock: BlockDefinition = {
  editor: SendTextBlockEditor,
  viewer: SendTextBlockViewer,
  schema: sendMessageNodeSchema,
  defaultValue: sendTextBlockDefaultFn,
}
