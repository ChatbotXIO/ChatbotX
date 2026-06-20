import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  deleteUserPersistentMenu,
  setUserPersistentMenu,
} from "../src/apis/user"
import {
  messengerMenusToCallToActions,
  type PersistentMenuItem,
} from "../src/lib/persistent-menu"
import type { MessengerAuthValue } from "../src/schema"

const PAGE_TOKEN = "PAGE_TOKEN"
const VERSION = "v21.0"
const PSID = "123456789"
const BASE = "https://graph.facebook.com"

const makeCtx = (version?: string): Context<MessengerAuthValue> =>
  ({
    auth: {
      tokens: { accessToken: PAGE_TOKEN },
      ...(version === undefined ? {} : { version }),
    },
  }) as unknown as Context<MessengerAuthValue>

describe("messengerMenusToCallToActions", () => {
  test("maps url items to web_url buttons", () => {
    const menus: PersistentMenuItem[] = [
      { label: "Shop", type: "url", url: "https://example.com" },
    ]

    expect(messengerMenusToCallToActions(menus)).toEqual([
      { type: "web_url", title: "Shop", url: "https://example.com" },
    ])
  })

  test("maps flow items to postback buttons with an encoded payload", () => {
    const menus: PersistentMenuItem[] = [
      { label: "Talk to agent", type: "flow", flowId: "42" },
    ]

    const [button] = messengerMenusToCallToActions(menus)

    expect(button.type).toBe("postback")
    expect(button.title).toBe("Talk to agent")
    expect(typeof button.payload).toBe("string")
    expect(button.payload?.length).toBeGreaterThan(0)
  })

  test("returns an empty array for no menus", () => {
    expect(messengerMenusToCallToActions([])).toEqual([])
  })
})

describe("setUserPersistentMenu", () => {
  test("POSTs psid + persistent_menu to me/custom_user_settings", async () => {
    let captured: Request | null = null
    let body: unknown = null
    server.use(
      http.post(
        `${BASE}/${VERSION}/me/custom_user_settings`,
        async ({ request }) => {
          captured = request
          body = await request.json()
          return HttpResponse.json({ result: "success" })
        },
      ),
    )

    const persistentMenu = [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: [
          { type: "web_url" as const, title: "Shop", url: "https://x.com" },
        ],
      },
    ]

    await setUserPersistentMenu({
      ctx: makeCtx(VERSION),
      psid: PSID,
      persistentMenu,
    })

    expect(captured).not.toBeNull()
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/me/custom_user_settings`)
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
    expect(body).toEqual({ psid: PSID, persistent_menu: persistentMenu })
  })
})

describe("deleteUserPersistentMenu", () => {
  test("DELETEs with psid + params query for persistent_menu", async () => {
    let captured: Request | null = null
    server.use(
      http.delete(
        `${BASE}/${VERSION}/me/custom_user_settings`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ result: "success" })
        },
      ),
    )

    await deleteUserPersistentMenu({ ctx: makeCtx(VERSION), psid: PSID })

    expect(captured).not.toBeNull()
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/me/custom_user_settings`)
    expect(url.searchParams.get("psid")).toBe(PSID)
    expect(url.searchParams.get("params")).toBe(
      JSON.stringify(["persistent_menu"]),
    )
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
  })
})
