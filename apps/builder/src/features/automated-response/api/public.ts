import { automatedResponseService } from "@chatbotx.io/business"
import { automatedResponseTypes } from "@chatbotx.io/database/partials"
import { keywordConditionsSchema } from "@chatbotx.io/database/partials/keyword-condition-schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { publicKeywordResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")
const keywordDirectionDescription =
  "Keyword direction: inbound matches messages from contacts; outbound matches messages sent by the Page/agent. Defaults to inbound. Keep the same type when reading, updating, disabling, or deleting a rule. This is not post/comment automation; use the channel's comment-automation tools for comments."

const keywordConditionsDescription =
  'Contact (inbound) match conditions, ManyChat-style. Every condition must match (AND); inside one condition any value may match (OR), except `notContains`, which matches when the message contains none of its values. Text matching ignores case and Vietnamese accents ("tu van" matches "tư vấn"). Operators that take values: is (whole message equals), similarTo (whole message is close to the value, small typos allowed), contains, containsWholeWord, beginsWith, endsWith, notContains, matchesRegex (RE2 syntax, case-insensitive, max 200 chars). Operators that take no values (send `values: []`): containsPhone, containsEmail, containsLink, containsImage, containsVideo, isThumbsUp (message is only 👍). Max 10 conditions, 50 values each. Send either `conditions` or `keywords`, never both; inbound `keywords` alone are stored as one `contains` condition. Not allowed for outbound rules, which match exact `keywords`.'

const keywordMatchInputRefinement = (
  data: { keywords?: string[]; conditions?: unknown[] },
  ctx: z.RefinementCtx,
) => {
  if (data.keywords && data.conditions) {
    ctx.addIssue({
      code: "custom",
      path: ["conditions"],
      message: "Send either keywords or conditions, not both",
    })
  }
}

export const keywordsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/keywords",
      summary: "List keywords (automated responses)",
      description:
        "Find keyword-triggered automations by direction before inspecting one with `keywords.get` or adding one with `keywords.create`. Keyword direction: inbound matches messages from contacts; outbound matches messages sent by the Page/agent. This is not post/comment automation; use the channel's comment-automation tools for comments.",
      tags: ["Keywords"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      publicListRequest.extend({
        type: automatedResponseTypes
          .default("inbound")
          .describe(keywordDirectionDescription),
      }),
    )
    .output(publicListResponse(publicKeywordResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { type, ...pagination } = input
      return await automatedResponseService.list({
        workspaceId: context.workspace.id,
        type,
        ...pagination,
        sort: [{ id: "createdAt", desc: true }],
        keyword: null,
        folderId: null,
      })
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/keywords/{id}",
      summary: "Get keyword automation",
      description:
        "Returns one keyword automation. Use `keywords.list` to find its id first and keep the same inbound or outbound type. This is not post/comment automation; use the channel's comment-automation tools for comments.",
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Keyword automation id. Get it from `keywords.list`.",
        ),
        type: automatedResponseTypes
          .default("inbound")
          .describe(keywordDirectionDescription),
      }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await automatedResponseService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
          type: input.type,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/keywords",
      summary: "Create keyword automation",
      description:
        'Use this for "when a contact says <keyword/trigger phrase>, run flow X" automations. Adds a keyword automation that sends text or starts a flow. Inbound matches messages from contacts (send `keywords`, or `conditions` for richer matching: exact, similar, whole word, begins/ends with, does not contain, regex, phone, email, link, image, video, thumbs up); outbound matches messages sent by the Page/agent exactly. Use `keywords.list` first to inspect existing rules and `flows.list` to resolve a flow. This is not post/comment automation; use the channel\'s comment-automation tools for comments.',
      successStatus: 201,
      tags: ["Keywords"],
    })
    .input(
      z
        .object({
          type: automatedResponseTypes
            .default("inbound")
            .describe(keywordDirectionDescription),
          keywords: z
            .array(z.string().min(1).max(255))
            .min(1)
            .optional()
            .describe(
              "Keyword phrases that trigger this automation. Required for outbound rules; for inbound rules send this or `conditions`.",
            ),
          conditions: keywordConditionsSchema
            .optional()
            .describe(keywordConditionsDescription),
          text: z
            .string()
            .min(1)
            .nullish()
            .describe(
              "Reply text to send when matched. Mutually exclusive with flowId in practice.",
            ),
          flowId: zodBigintAsString()
            .nullish()
            .describe(
              "Flow id (numeric string) to start when matched instead of sending text.",
            ),
          folderId: zodBigintAsString()
            .nullish()
            .describe(
              "Folder id (numeric string) to organize this automation under.",
            ),
        })
        .superRefine((data, ctx) => {
          keywordMatchInputRefinement(data, ctx)
          if (!(data.keywords || data.conditions)) {
            ctx.addIssue({
              code: "custom",
              path: ["keywords"],
              message: "Send keywords or conditions",
            })
          }
        }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await automatedResponseService.create(context.workspace.id, input),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/keywords/{id}",
      summary: "Update keyword automation",
      description:
        "Overwrites the given fields on an existing keyword automation. Use `keywords.get` to inspect current values first and keep the same inbound or outbound type. This is not post/comment automation; use the channel's comment-automation tools for comments.",
      tags: ["Keywords"],
    })
    .input(
      z
        .object({
          id: zodBigintAsString().describe(
            "Keyword automation id. Get it from `keywords.list`.",
          ),
          type: automatedResponseTypes
            .default("inbound")
            .describe(keywordDirectionDescription),
          keywords: z
            .array(z.string().min(1).max(255))
            .min(1)
            .optional()
            .describe(
              "Keyword phrases that trigger this automation. On an inbound rule this replaces its conditions with one `contains` condition.",
            ),
          conditions: keywordConditionsSchema
            .optional()
            .describe(keywordConditionsDescription),
          text: z
            .string()
            .min(1)
            .nullish()
            .describe("Reply text to send when matched."),
          flowId: zodBigintAsString()
            .nullish()
            .describe(
              "Flow id (numeric string) to start when matched instead of sending text.",
            ),
          folderId: zodBigintAsString()
            .nullish()
            .describe(
              "Folder id (numeric string) to organize this automation under.",
            ),
        })
        .superRefine(keywordMatchInputRefinement),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, type, keywords, ...rest } = input
      return await automatedResponseService.update(
        { workspaceId: context.workspace.id, id, type },
        {
          ...rest,
          keywords: keywords?.map((value) => ({ value })),
        },
      )
    }),

  updateStatus: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/keywords/{id}/status",
      summary: "Enable or disable keyword automation",
      description:
        "Toggles whether a keyword automation is active without changing its other fields. Keep the same inbound or outbound type. This is not post/comment automation; use the channel's comment-automation tools for comments.",
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Keyword automation id. Get it from `keywords.list`.",
        ),
        status: z
          .boolean()
          .describe("Whether the automation should be active."),
        type: automatedResponseTypes
          .default("inbound")
          .describe(keywordDirectionDescription),
      }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await automatedResponseService.findOrFail({
        workspaceId: context.workspace.id,
        id: input.id,
        type: input.type,
      })
      return await automatedResponseService.setStatus(
        { workspaceId: context.workspace.id, id: input.id, type: input.type },
        input.status,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/keywords/{id}",
      summary: "Delete keyword automation",
      description:
        "Permanently deletes one keyword automation. Use `keywords.list` to find its id first and keep the same inbound or outbound type. This is not post/comment automation; use the channel's comment-automation tools for comments.",
      successStatus: 204,
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Keyword automation id. Get it from `keywords.list`.",
        ),
        type: automatedResponseTypes
          .default("inbound")
          .describe(keywordDirectionDescription),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await automatedResponseService.deleteMany(
        context.workspace.id,
        [input.id],
        input.type,
      )
    }),
}
