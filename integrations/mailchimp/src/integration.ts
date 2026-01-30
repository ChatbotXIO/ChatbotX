import crypto from "node:crypto"
import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { z } from "zod"
import { generateAuthUrl, getMailchimpClient } from "./client"
import {
  MAILCHIMP_DEFAULT_PAGE_SIZE,
  MAILCHIMP_INTEGRATION_NAME,
} from "./constants"
import { callbackHandler } from "./handlers/callback"
import {
  type MailchimpActions,
  type MailchimpAudienceResource,
  type MailchimpAuthValue,
  type MailchimpConfig,
  type MailchimpMemberResource,
  type MailchimpMergeFieldResource,
  type MailchimpTagResource,
  mailchimpAudienceResourceSchema,
  mailchimpMemberResourceSchema,
  mailchimpMergeFieldResourceSchema,
  mailchimpTagResourceSchema,
} from "./schemas"

const config: IntegrationDefinition<
  MailchimpConfig,
  MailchimpAuthValue,
  MailchimpActions
> = {
  name: MAILCHIMP_INTEGRATION_NAME,
  actions: {
    addMember: async ({ ctx, props }): Promise<MailchimpMemberResource> => {
      const client = getMailchimpClient(ctx.auth)
      const subscriberHash = crypto
        .createHash("md5")
        .update(props.email.toLowerCase())
        .digest("hex")

      const response = await client.lists.setListMember(
        props.listId,
        subscriberHash,
        {
          email_address: props.email,
          status_if_new: props.status ?? "subscribed",
          merge_fields: props.mergeFields,
        },
        {
          skipMergeValidation: props.skipMergeValidation,
        },
      )

      const result = mailchimpMemberResourceSchema.parse(response)

      if (props.tags && props.tags.length > 0) {
        await client.lists.updateListMemberTags(props.listId, subscriberHash, {
          tags: props.tags.map((tag) => ({ name: tag, status: "active" })),
        })
      }

      return result
    },
    listAudiences: async ({ ctx }): Promise<MailchimpAudienceResource[]> => {
      const client = getMailchimpClient(ctx.auth)
      const response = await client.lists.getAllLists()
      const { lists } = z
        .object({
          lists: z.array(mailchimpAudienceResourceSchema).optional(),
        })
        .parse(response)

      return lists || []
    },
    listTags: async ({ ctx, props }): Promise<MailchimpTagResource[]> => {
      const client = getMailchimpClient(ctx.auth)
      // biome-ignore lint/suspicious/noExplicitAny: Mailchimp SDK type is incomplete
      const listsClient = client.lists as any
      const response = await listsClient.listSegments(props.listId, {
        type: "static",
        count: MAILCHIMP_DEFAULT_PAGE_SIZE,
      })
      const { segments } = z
        .object({
          segments: z.array(mailchimpTagResourceSchema).optional(),
        })
        .parse(response)

      return segments || []
    },
    listMergeFields: async ({
      ctx,
      props,
    }): Promise<MailchimpMergeFieldResource[]> => {
      const client = getMailchimpClient(ctx.auth)
      const response = await client.lists.getListMergeFields(props.listId, {
        count: MAILCHIMP_DEFAULT_PAGE_SIZE,
      })
      const { merge_fields } = z
        .object({
          merge_fields: z.array(mailchimpMergeFieldResourceSchema).optional(),
        })
        .parse(response)

      return merge_fields || []
    },
  },
  disconnect: async (_props: MailchimpAuthValue): Promise<void> => {
    // No-op for Mailchimp
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.callback:
        return await callbackHandler(props)
      case HandleRequestType.generateAuthUrl:
        return await generateAuthUrl(props.config)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
}

export const integration = new Integration(config)
