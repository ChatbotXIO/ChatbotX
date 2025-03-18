import type { BlockDefinition } from "..";
import { OptInEmailBlockEditor } from "./editor";
import { optInEmailBlockDefaultFn, optInEmailBlockSchema } from "./schema";
import { OptInEmailBlockViewer } from "./viewer";

export const optInEmailBlock: BlockDefinition = {
  editor: OptInEmailBlockEditor,
  viewer: OptInEmailBlockViewer,
  schema: optInEmailBlockSchema,
  defaultValue: optInEmailBlockDefaultFn,
}
