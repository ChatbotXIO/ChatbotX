import { nodeTypeSchema } from "@chatbotx.io/flow-config"
import conditionNodeConfig from "./condition"
import followUpNodeConfig from "./follow-up"
import performActionNodeConfig from "./perform-action"
import sendMailNodeConfig from "./send-mail"
import sendMessageNodeConfig from "./send-message"
import splitTrafficNodeConfig from "./split-traffic"
import startFlowNodeConfig from "./start-flow"
import waitNodeConfig from "./wait"

export const allNodesConfig = {
  [nodeTypeSchema.enum.sendMessage]: sendMessageNodeConfig,
  [nodeTypeSchema.enum.startFlow]: startFlowNodeConfig,
  [nodeTypeSchema.enum.performAction]: performActionNodeConfig,
  [nodeTypeSchema.enum.condition]: conditionNodeConfig,
  [nodeTypeSchema.enum.sendMail]: sendMailNodeConfig,
  [nodeTypeSchema.enum.splitTraffic]: splitTrafficNodeConfig,
  [nodeTypeSchema.enum.wait]: waitNodeConfig,
  [nodeTypeSchema.enum.followUp]: followUpNodeConfig,
  [nodeTypeSchema.enum.landingPage]: undefined,
  [nodeTypeSchema.enum.addNotes]: undefined,
}
