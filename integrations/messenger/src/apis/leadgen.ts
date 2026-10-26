import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"

export type LeadgenFormQuestion = {
  key: string
  label: string
  type: string
  id: string
}

export type LeadgenForm = {
  id: string
  name: string
  status: string
  questions?: LeadgenFormQuestion[]
}

/**
 * List a page's instant (lead) forms with their questions. Requires a page
 * token carrying `leads_retrieval` / `pages_show_list`. Single request with a
 * generous limit — a page rarely has more than a handful of forms.
 */
export function getLeadgenForms(
  pageId: string,
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<LeadgenForm[]> {
  const endpoint = `${version}/${pageId}/leadgen_forms`

  return rescue(endpoint, async () => {
    const res: { data?: LeadgenForm[] } = await facebookGraphClient.get(
      endpoint,
      {
        searchParams: {
          fields: "id,name,status,questions",
          limit: "100",
          access_token: accessToken,
        },
      },
    )
    return res.data ?? []
  })
}

type LeadgenFormNamePage = {
  data?: { id: string; name: string }[]
  paging?: { cursors?: { after?: string }; next?: string }
}

const FORM_NAME_PAGE_SIZE = "100"
const FORM_NAME_MAX_PAGES = 5

/**
 * Name of one lead form of a page, or `undefined` when the page has no such
 * form. Reads the documented `leadgen_forms` edge with only `id,name` (the
 * list call above also pulls every question) and stops after a few pages so a
 * page with a very long form list cannot turn one lead into an unbounded walk.
 */
export function getLeadgenFormName(
  pageId: string,
  formId: string,
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<string | undefined> {
  const endpoint = `${version}/${pageId}/leadgen_forms`

  return rescue(endpoint, async () => {
    let after: string | undefined
    for (let page = 0; page < FORM_NAME_MAX_PAGES; page++) {
      const res: LeadgenFormNamePage = await facebookGraphClient.get(endpoint, {
        searchParams: {
          fields: "id,name",
          limit: FORM_NAME_PAGE_SIZE,
          access_token: accessToken,
          ...(after ? { after } : {}),
        },
      })
      const form = res.data?.find((candidate) => candidate.id === formId)
      if (form) {
        return form.name
      }
      after = res.paging?.next ? res.paging.cursors?.after : undefined
      if (!after) {
        return
      }
    }
  })
}

export type LeadFieldDatum = { name: string; values: string[] }
export type Lead = {
  id: string
  created_time: string
  field_data: LeadFieldDatum[]
}

/**
 * Fetch a single lead's answers by its `leadgen_id`. Requires a page token with
 * `leads_retrieval`.
 */
export function getLead(
  leadgenId: string,
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<Lead> {
  const endpoint = `${version}/${leadgenId}`

  return rescue(endpoint, () =>
    facebookGraphClient.get<Lead>(endpoint, {
      searchParams: {
        fields: "id,created_time,field_data",
        access_token: accessToken,
      },
    }),
  )
}
