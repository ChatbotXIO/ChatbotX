"use client"

import type { AISegmentImageSchema } from "@chatbotx.io/flow-config"
import {
  aiSegmentImageDefaultFn,
  aiSegmentImageSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { AISegmentImageEditor } from "./editor"
import { AISegmentImageViewer } from "./viewer"

export const aiSegmentImageStep: StepDefinition<AISegmentImageSchema> = {
  editor: AISegmentImageEditor,
  viewer: AISegmentImageViewer,
  validator: aiSegmentImageSchema,
  defaultFn: aiSegmentImageDefaultFn,
}

export default aiSegmentImageStep
