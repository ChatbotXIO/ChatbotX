import { NodeType } from "@chatbotx.io/flow-config"
import performActionNodeConfig from "./perform-action"
import sendMessageNodeConfig from "./send-message"
import startFlowNodeConfig from "./start-flow"

export const allNodesConfig = {
  [NodeType.sendMessage]: sendMessageNodeConfig,
  [NodeType.startFlow]: startFlowNodeConfig,
  [NodeType.performAction]: performActionNodeConfig,
  [NodeType.condition]: undefined,
  [NodeType.sendMail]: undefined,
  [NodeType.splitTraffic]: undefined,
  [NodeType.wait]: undefined,
  [NodeType.landingPage]: undefined,
  [NodeType.addNotes]: undefined,
}
