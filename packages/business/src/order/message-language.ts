import { workspaceService } from "../workspace/service"
import {
  type CustomerMessageLanguage,
  customerMessageLanguage,
} from "./customer-messages"

/**
 * The language the bot's store messages go out in: the workspace's own, so a
 * store set to Vietnamese answers every customer in Vietnamese. A language
 * the messages are not written in falls back to English.
 */
export const resolveCustomerMessageLanguage = async (input: {
  workspaceId: string
}): Promise<CustomerMessageLanguage> => {
  const workspace = await workspaceService.findById({ id: input.workspaceId })
  return customerMessageLanguage(workspace.language)
}
