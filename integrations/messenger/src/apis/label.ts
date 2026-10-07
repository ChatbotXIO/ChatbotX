import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schema"

export interface MessengerLabel {
  id: string
  page_label_name: string
}

export const createCustomLabel = (props: {
  ctx: Context<MessengerAuthValue>
  pageId: string
  name: string
}): Promise<{ id: string }> => {
  const { ctx, pageId, name } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${pageId}/custom_labels?page_label_name=${encodeURIComponent(name)}`

  return rescue(endpoint, async () => {
    const response: { id: string } = await facebookGraphClient.post(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
    })
    return { id: response.id }
  })
}

export const deleteCustomLabel = (props: {
  ctx: Context<MessengerAuthValue>
  labelId: string
}): Promise<{ success: boolean }> => {
  const { ctx, labelId } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${labelId}`

  return rescue(endpoint, async () => {
    const response: { success: boolean } = await facebookGraphClient.delete(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
      },
    )
    return { success: response.success ?? true }
  })
}

export const assignLabelToUser = (props: {
  ctx: Context<MessengerAuthValue>
  labelId: string
  psid: string
}): Promise<{ success: boolean }> => {
  const { ctx, labelId, psid } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${labelId}/label?user=${encodeURIComponent(psid)}`

  return rescue(endpoint, async () => {
    const response: { success: boolean } = await facebookGraphClient.post(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
      },
    )
    return { success: response.success ?? true }
  })
}

export const removeLabelFromUser = (props: {
  ctx: Context<MessengerAuthValue>
  labelId: string
  psid: string
}): Promise<{ success: boolean }> => {
  const { ctx, labelId, psid } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${labelId}/label`

  return rescue(endpoint, async () => {
    const response: { success: boolean } = await facebookGraphClient.delete(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
        searchParams: {
          user: psid,
        },
      },
    )
    return { success: response.success ?? true }
  })
}

const USER_LABELS_MAX_PAGES = 5

type UserLabelsResponse = {
  data?: MessengerLabel[]
  paging?: { cursors?: { before?: string; after?: string }; next?: string }
}

export const getUserLabels = (props: {
  ctx: Context<MessengerAuthValue>
  psid: string
  /** Fail fast: this per-page timeout and no retries. */
  requestTimeoutMs?: number
}): Promise<MessengerLabel[]> => {
  const { ctx, psid, requestTimeoutMs } = props
  const failFast = requestTimeoutMs
    ? { timeout: requestTimeoutMs, retry: 0 }
    : {}
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${psid}/custom_labels`

  return rescue(endpoint, async () => {
    const labels: MessengerLabel[] = []
    let after: string | undefined
    let pageCount = 0

    // A page that uses many labels can exceed one Graph page; follow
    // `paging.cursors.after` (relative — `paging.next` is absolute and would
    // double the client's prefixUrl) up to a bounded number of pages.
    while (pageCount < USER_LABELS_MAX_PAGES) {
      const response: UserLabelsResponse = await facebookGraphClient.get(
        endpoint,
        {
          headers: {
            Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
          },
          searchParams: {
            fields: "id,page_label_name",
            ...(after ? { after } : {}),
          },
          ...failFast,
        },
      )
      labels.push(...(response.data ?? []))
      pageCount++

      after = response.paging?.next ? response.paging.cursors?.after : undefined
      if (!after) {
        return labels
      }
    }

    logger.warn(
      { psid, maxPages: USER_LABELS_MAX_PAGES, fetched: labels.length },
      "Messenger user labels truncated at the page limit",
    )
    return labels
  })
}
