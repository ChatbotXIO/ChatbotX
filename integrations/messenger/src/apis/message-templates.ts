import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

export type MessengerMessageTemplateEntity = {
  id: string
  name: string
  status: "APPROVED" | "PENDING" | "REJECTED"
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  parameter_format?: string
  rejection_reason?: string
  specific_rejection_reason?: string
  // biome-ignore lint/suspicious/noExplicitAny: Meta API shape varies
  components: any[]
}

export type ListMessengerMessageTemplatesResponse = {
  data: MessengerMessageTemplateEntity[]
  paging?: {
    cursors?: {
      before?: string
      after?: string
    }
    next?: string
  }
}

export type ListMessengerMessageTemplatesProps = {
  name?: string
}

export type CreateMessengerTemplateProps = {
  name: string
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  parameter_format?: string
  // biome-ignore lint/suspicious/noExplicitAny: Meta API shape varies
  components: any[]
}

export const listPageMessageTemplates = (
  auth: MessengerAuthValue,
  props: ListMessengerMessageTemplatesProps = {},
): Promise<ListMessengerMessageTemplatesResponse> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  const accessToken = auth.tokens.accessToken

  const searchParams = new URLSearchParams({
    fields:
      "name,status,language,category,parameter_format,components,rejection_reason",
  })
  if (props.name) {
    searchParams.set("name", props.name)
  }
  const BASE_PATH = `/${version}/${pageId}/message_templates?${searchParams.toString()}`
  const MAX_PAGES = 50

  return rescue("message_templates", async () => {
    const allTemplates: MessengerMessageTemplateEntity[] = []
    let currentUrl: string | undefined = BASE_PATH
    let pageCount = 0

    while (currentUrl && pageCount < MAX_PAGES) {
      const response: ListMessengerMessageTemplatesResponse =
        await facebookGraphClient.get(currentUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

      allTemplates.push(...response.data)
      pageCount++

      // paging.next is only present when more pages exist.
      // Build relative URL from cursors.after — paging.next is absolute and
      // causes double-prefix error with ky's prefixUrl configuration.
      if (response.paging?.next && response.paging.cursors?.after) {
        currentUrl = `${BASE_PATH}&after=${response.paging.cursors.after}`
      } else {
        currentUrl = undefined
      }
    }

    return { data: allTemplates, paging: {} }
  })
}

export const createPageMessageTemplate = (
  auth: MessengerAuthValue,
  data: CreateMessengerTemplateProps,
): Promise<MessengerMessageTemplateEntity> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  const endpoint = `${version}/${pageId}/message_templates`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      json: data,
    }),
  )
}

export type CloneMessengerTemplateProps = {
  name: string
  category: "UTILITY"
  language: string
  library_template_name: string
  // Required by Meta when the library template has body/button placeholders —
  // counts must match the library template's components.
  // biome-ignore lint/suspicious/noExplicitAny: Meta library-input shape varies
  library_template_body_inputs?: any[]
  // biome-ignore lint/suspicious/noExplicitAny: Meta library-input shape varies
  library_template_button_inputs?: any[]
}

export const clonePageMessageTemplate = (
  auth: MessengerAuthValue,
  data: CloneMessengerTemplateProps,
): Promise<MessengerMessageTemplateEntity> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const pageId = auth.metadata.pageId
  const endpoint = `${version}/${pageId}/message_templates`

  return rescue(endpoint, () =>
    facebookGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      json: data,
    }),
  )
}
