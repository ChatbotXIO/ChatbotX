import type { BlockDefinition } from "..";
import { SendCardBlockEditor } from "./editor";
import { sendCardBlockSchema, sendCardBlockDefaultFn } from "./schema";
import { SendCardBlockViewer } from "./viewer";

export const sendCardBlock: BlockDefinition = {
  editor: SendCardBlockEditor,
  viewer: SendCardBlockViewer,
  schema: sendCardBlockSchema,
  defaultValue: sendCardBlockDefaultFn,
}
