import type { BlockDefinition } from "..";
import { MarkEmailVerifiedBlockEditor } from "./editor";
import { markEmailVerifiedBlockDefaultFn, markEmailVerifiedBlockSchema } from "./schema";
import { MarkEmailVerifiedBlockViewer } from "./viewer";

export const markEmailVerifiedBlock: BlockDefinition = {
  editor: MarkEmailVerifiedBlockEditor,
  viewer: MarkEmailVerifiedBlockViewer,
  schema: markEmailVerifiedBlockSchema,
  defaultValue: markEmailVerifiedBlockDefaultFn,
};

