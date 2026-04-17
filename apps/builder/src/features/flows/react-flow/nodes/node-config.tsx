import { nodeTypeSchema } from "@chatbotx.io/flow-config"
import performActionNodeConfig from "./perform-action"
import sendMessageNodeConfig from "./send-message"
import startFlowNodeConfig from "./start-flow"

export const allNodesConfig = {
  [nodeTypeSchema.enum.sendMessage]: sendMessageNodeConfig,
  [nodeTypeSchema.enum.startFlow]: startFlowNodeConfig,
  [nodeTypeSchema.enum.performAction]: performActionNodeConfig,
  [nodeTypeSchema.enum.condition]: undefined,
  [nodeTypeSchema.enum.sendMail]: undefined,
  [nodeTypeSchema.enum.splitTraffic]: undefined,
  [nodeTypeSchema.enum.wait]: undefined,
  [nodeTypeSchema.enum.landingPage]: undefined,
  [nodeTypeSchema.enum.addNotes]: undefined,
}
