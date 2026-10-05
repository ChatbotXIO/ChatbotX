import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createMagicLinkRequest, updateMagicLinkRequest } from "./action"
import { magicLinkResource } from "./resource"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

const magicLinkIdSchema = zodBigintAsString().describe(
  "Magic link id. Get it from `magicLinks.list`.",
)

export const listMagicLinksPublicRequest = publicListRequest.extend({
  sort: sortSchema.optional().describe("Sort order."),
  keyword: z
    .string()
    .nullish()
    .describe("Case-insensitive substring match against the name or URL."),
})

export const magicLinkPublicResource = magicLinkResource
  .omit({
    workspaceId: true,
  })
  .extend({
    url: z
      .string()
      .describe(
        "Full shareable link (the dashboard's Copy URL), e.g. `https://app.example.com/r/<workspaceId>/<name>`. Query parameters added to it fill the destination's `{{variable}}` placeholders.",
      ),
  })

export const listMagicLinksPublicResponse = publicListResponse(
  magicLinkPublicResource,
)

export const createMagicLinkPublicRequest = createMagicLinkRequest

export const updateMagicLinkPublicRequest = updateMagicLinkRequest.extend({
  id: magicLinkIdSchema,
})

export const getMagicLinkPublicRequest = z.object({ id: magicLinkIdSchema })

export const deleteMagicLinkPublicRequest = z.object({ id: magicLinkIdSchema })
