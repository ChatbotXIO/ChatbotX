import type { BlockDefinition } from "..";
import { OptOutEmailBlockEditor } from "./editor";
import { optOutEmailBlockDefaultFn, optOutEmailBlockSchema } from "./schema";
import { OptOutEmailBlockViewer } from "./viewer";

export const optOutEmailBlock: BlockDefinition = {
  editor: OptOutEmailBlockEditor,
  viewer: OptOutEmailBlockViewer,
  schema: optOutEmailBlockSchema,
  defaultValue: optOutEmailBlockDefaultFn,
}
