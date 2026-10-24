import {
  ecommerceSettingsService,
  hasWorkspacePermission,
  orderService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { formatMoney } from "@chatbotx.io/utils/money"
import type { NotificationJobNotifyNewOrder } from "@chatbotx.io/worker-config"
import { deliverPushToUsers } from "../lib/deliver-push"
import { getExpoClient } from "../lib/expo"
import { t } from "../lib/strings"

/**
 * The members who turned on "New order" in their notification settings AND
 * may see orders: the push carries the customer name and total, so a member
 * without the ecommerce permission (super admins have every permission) gets none.
 */
const resolveOrderRecipientUserIds = async (workspaceId: string) => {
  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return members
    .filter(
      (member) =>
        member.notificationTypes?.newOrder &&
        hasWorkspacePermission(member.permissions ?? {}, "ecommerce"),
    )
    .map((member) => member.userId)
}

/** An order deleted before its push went out has nothing to announce. */
const findOrder = async (input: { workspaceId: string; orderId: string }) => {
  try {
    return await orderService.getDetail(input)
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  }
}

/**
 * Pushes "New order #N" with the customer and total to the members who want
 * new orders. The job id is the order's, so a retried placement pushes once.
 */
export const notifyNewOrder = async (
  job: NotificationJobNotifyNewOrder,
): Promise<void> => {
  const expo = getExpoClient()
  if (!expo) {
    return
  }
  const { workspaceId, orderId } = job.data
  const order = await findOrder({ workspaceId, orderId })
  if (!order) {
    return
  }

  await deliverPushToUsers({
    expo,
    userIds: await resolveOrderRecipientUserIds(workspaceId),
    content: async () => {
      const [settings, workspace] = await Promise.all([
        ecommerceSettingsService.get(workspaceId),
        workspaceService.find({ where: { id: workspaceId } }),
      ])
      const isStoreCurrency =
        order.currency.toUpperCase() === settings.payments.currency
      const total = formatMoney(order.total, {
        currency: order.currency,
        symbol: isStoreCurrency ? settings.payments.currencySymbol : null,
        position: isStoreCurrency ? settings.payments.currencyPosition : "left",
      })
      return {
        title: t(workspace?.language).newOrder(order.number),
        body: [order.customerName, total].filter(Boolean).join(" · "),
        data: { workspaceId, orderId },
      }
    },
  })
}
