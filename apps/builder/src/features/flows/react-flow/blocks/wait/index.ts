import type { BlockDefinition } from "..";
import { WaitBlockEditor } from "./editor";
import { waitBlockDefaultFn, waitBlockSchema } from "./schema";
import { WaitBlockViewer } from "./viewer";

export const waitBlock: BlockDefinition = {
  editor: WaitBlockEditor,
  viewer: WaitBlockViewer,
  schema: waitBlockSchema,
  defaultValue: waitBlockDefaultFn
}
