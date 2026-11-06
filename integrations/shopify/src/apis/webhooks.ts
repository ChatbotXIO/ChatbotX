import { z } from "zod"
import {
  assertNoUserErrors,
  type ShopifyCredentials,
  shopifyGraphql,
} from "../client"
import { userErrorsSchema } from "../schemas"

/** Subscribes `uri` to one topic and returns the subscription's GID. */
export async function createShopifyWebhookSubscription(
  credentials: ShopifyCredentials,
  input: { topic: string; uri: string },
) {
  const data = await shopifyGraphql(
    credentials,
    `mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription { id }
        userErrors { field message }
      }
    }`,
    {
      topic: input.topic,
      webhookSubscription: { uri: input.uri, format: "JSON" },
    },
    z.object({
      webhookSubscriptionCreate: z.object({
        webhookSubscription: z.object({ id: z.string() }).nullable(),
        userErrors: userErrorsSchema,
      }),
    }),
  )
  assertNoUserErrors(data.webhookSubscriptionCreate.userErrors)
  const subscription = data.webhookSubscriptionCreate.webhookSubscription
  if (!subscription) {
    throw new Error(`Shopify created no subscription for ${input.topic}.`)
  }
  return subscription.id
}

/**
 * The app's subscriptions delivering to `uri`. Read before subscribing, so a
 * connect that stopped half way (or a reconnect) does not trip Shopify's
 * "address already taken" on the subscriptions it left.
 */
export async function listShopifyWebhookSubscriptionIds(
  credentials: ShopifyCredentials,
  uri: string,
) {
  const ids: string[] = []
  let after: string | null = null
  do {
    const data: {
      webhookSubscriptions: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: Array<{ id: string; uri: string }>
      }
    } = await shopifyGraphql(
      credentials,
      `query WebhookSubscriptions($after: String) {
        webhookSubscriptions(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id uri }
        }
      }`,
      { after },
      z.object({
        webhookSubscriptions: z.object({
          pageInfo: z.object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable(),
          }),
          nodes: z.array(z.object({ id: z.string(), uri: z.string() })),
        }),
      }),
    )
    for (const node of data.webhookSubscriptions.nodes) {
      if (node.uri === uri) {
        ids.push(node.id)
      }
    }
    after = data.webhookSubscriptions.pageInfo.hasNextPage
      ? data.webhookSubscriptions.pageInfo.endCursor
      : null
  } while (after)
  return ids
}

const SUBSCRIPTION_GONE_PATTERN = /not exist|not found/i

/** Removes a subscription; one that is already gone counts as removed. */
export async function deleteShopifyWebhookSubscription(
  credentials: ShopifyCredentials,
  subscriptionId: string,
) {
  const data = await shopifyGraphql(
    credentials,
    `mutation WebhookDelete($id: ID!) {
      webhookSubscriptionDelete(id: $id) {
        deletedWebhookSubscriptionId
        userErrors { field message }
      }
    }`,
    { id: subscriptionId },
    z.object({
      webhookSubscriptionDelete: z.object({
        deletedWebhookSubscriptionId: z.string().nullable(),
        userErrors: userErrorsSchema,
      }),
    }),
  )
  const notFound = data.webhookSubscriptionDelete.userErrors.every((error) =>
    SUBSCRIPTION_GONE_PATTERN.test(error.message),
  )
  if (!notFound) {
    assertNoUserErrors(data.webhookSubscriptionDelete.userErrors)
  }
}
