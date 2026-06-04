"use client"

import { nodeTypeSchema } from "@chatbotx.io/flow-config"
import ButtonEdge from "./edges/button-edge"
import { NodeAnalyticsViewer } from "./nodes/analytics-viewer"

export const analyticsNodeTypes = {
  [nodeTypeSchema.enum.sendMessage]: NodeAnalyticsViewer,
  [nodeTypeSchema.enum.sendMail]: NodeAnalyticsViewer,
  [nodeTypeSchema.enum.landingPage]: NodeAnalyticsViewer,
  [nodeTypeSchema.enum.performAction]: NodeAnalyticsViewer,
  [nodeTypeSchema.enum.addNotes]: NodeAnalyticsViewer,
  [nodeTypeSchema.enum.wait]: NodeAnalyticsViewer,
  [nodeTypeSchema.enum.startFlow]: NodeAnalyticsViewer,
}

export const edgeTypes = {
  buttonedge: ButtonEdge,
}
