import { db } from "@aha.chat/database/client"
import { inboxTeamPlanSubscriptionModel } from "@aha.chat/database/schema"
import { eq } from "drizzle-orm"
import Stripe from "stripe"

/**
 * Handles Stripe webhook events for inbox team plan subscriptions
 */
export async function handleInboxTeamPlanWebhook(event: Stripe.Event) {
  const { type, data } = event

  switch (type) {
    case "customer.subscription.updated": {
      const subscription = data.object as Stripe.Subscription
      return await updateSubscriptionStatus(subscription)
    }

    case "customer.subscription.deleted": {
      const subscription = data.object as Stripe.Subscription
      return await cancelSubscription(subscription)
    }

    case "customer.subscription.trial_will_end": {
      const subscription = data.object as Stripe.Subscription
      console.log(
        "Trial will end soon for subscription:",
        subscription.id,
      )
      // You can add logic here to send a notification to the user
      return true
    }

    default:
      console.log(`Unhandled event type: ${type}`)
      return false
  }
}

async function updateSubscriptionStatus(subscription: Stripe.Subscription) {
  try {
    const updatedAt = subscription.updated
      ? new Date(subscription.updated * 1000)
      : new Date()

    await db
      .update(inboxTeamPlanSubscriptionModel)
      .set({
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : null,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
        trialStart: subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
        updatedAt,
      })
      .where(
        eq(inboxTeamPlanSubscriptionModel.stripeSubscriptionId, subscription.id),
      )

    return true
  } catch (error) {
    console.error("Failed to update subscription status:", error)
    throw error
  }
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  try {
    const canceledAt = subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : new Date()
    const endedAt = subscription.ended_at
      ? new Date(subscription.ended_at * 1000)
      : null

    await db
      .update(inboxTeamPlanSubscriptionModel)
      .set({
        status: subscription.status,
        canceledAt,
        endedAt,
        updatedAt: new Date(),
      })
      .where(
        eq(inboxTeamPlanSubscriptionModel.stripeSubscriptionId, subscription.id),
      )

    return true
  } catch (error) {
    console.error("Failed to cancel subscription:", error)
    throw error
  }
}
