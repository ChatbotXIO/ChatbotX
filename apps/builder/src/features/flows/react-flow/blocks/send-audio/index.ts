import type { BlockDefinition } from "..";
import { SendAudioBlockEditor } from "./editor";
import { sendAudioBlockSchema, sendAudioBlockDefaultFn } from "./schema";
import { SendAudioBlockViewer } from "./viewer";

export const sendAudioBlock: BlockDefinition = {
  editor: SendAudioBlockEditor,
  viewer: SendAudioBlockViewer,
  schema: sendAudioBlockSchema,
  defaultValue: sendAudioBlockDefaultFn,
}
