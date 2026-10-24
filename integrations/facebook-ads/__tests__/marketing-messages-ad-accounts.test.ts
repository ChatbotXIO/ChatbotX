import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getMarketingMessagesAdAccounts } from "../src/apis/ad-accounts"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "MM_TOKEN"

describe("getMarketingMessagesAdAccounts", () => {
  test("requests the fields the create form needs", async () => {
    let requestedFields: string | null = null

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/me/adaccounts`,
        ({ request }) => {
          requestedFields = new URL(request.url).searchParams.get("fields")
          return HttpResponse.json({ data: [] })
        },
      ),
    )

    await getMarketingMessagesAdAccounts(ACCESS_TOKEN)

    expect(requestedFields).toBe(
      "name,account_id,currency,timezone_name,tos_accepted",
    )
  })

  test("maps the Graph response, keeping act_ id and bare account id apart", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/me/adaccounts`, () =>
        HttpResponse.json({
          data: [
            {
              id: "act_123",
              account_id: "123",
              name: "Main",
              currency: "USD",
              timezone_name: "Asia/Ho_Chi_Minh",
              tos_accepted: { custom_audience_tos: 1 },
            },
          ],
        }),
      ),
    )

    const accounts = await getMarketingMessagesAdAccounts(ACCESS_TOKEN)

    expect(accounts).toEqual([
      {
        id: "act_123",
        accountId: "123",
        name: "Main",
        currency: "USD",
        timezoneName: "Asia/Ho_Chi_Minh",
        tosAccepted: { custom_audience_tos: 1 },
      },
    ])
  })

  test("defaults tosAccepted to an empty map when Graph omits it", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/me/adaccounts`, () =>
        HttpResponse.json({
          data: [{ id: "act_9", account_id: "9", currency: "JPY" }],
        }),
      ),
    )

    const accounts = await getMarketingMessagesAdAccounts(ACCESS_TOKEN)

    expect(accounts[0]?.tosAccepted).toEqual({})
    expect(accounts[0]?.name).toBeUndefined()
    expect(accounts[0]?.timezoneName).toBeNull()
  })

  test("follows paging cursors", async () => {
    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/me/adaccounts`,
        ({ request }) => {
          const after = new URL(request.url).searchParams.get("after")
          if (!after) {
            return HttpResponse.json({
              data: [{ id: "act_1", account_id: "1", currency: "USD" }],
              paging: { cursors: { after: "c1" }, next: "https://next" },
            })
          }
          return HttpResponse.json({
            data: [{ id: "act_2", account_id: "2", currency: "USD" }],
            paging: { cursors: { after: "c2" } },
          })
        },
      ),
    )

    const accounts = await getMarketingMessagesAdAccounts(ACCESS_TOKEN)

    expect(accounts.map((account) => account.id)).toEqual(["act_1", "act_2"])
  })
})
