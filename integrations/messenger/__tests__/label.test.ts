import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  assignLabelToUser,
  createCustomLabel,
  deleteCustomLabel,
  getUserLabels,
  removeLabelFromUser,
} from "../src/apis/label"
import { DEFAULT_API_VERSION } from "../src/constants"
import type { MessengerAuthValue } from "../src/schema"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_TOKEN = "PAGE_TOKEN"
const VERSION = "v21.0"
const PAGE_ID = "111222333"
const LABEL_ID = "444555666"
const PSID = "123456789"

/** Full ctx with explicit version */
const makeCtx = (version?: string): Context<MessengerAuthValue> =>
  ({
    auth: {
      tokens: { accessToken: PAGE_TOKEN },
      ...(version === undefined ? {} : { version }),
    },
  }) as unknown as Context<MessengerAuthValue>

const BASE = "https://graph.facebook.com"

// ---------------------------------------------------------------------------
// Helpers: capture the last intercepted request
// ---------------------------------------------------------------------------

function _captureRequest(): { captured: Request | null } {
  const ref: { captured: Request | null } = { captured: null }
  return ref
}

// ---------------------------------------------------------------------------
// createCustomLabel
// ---------------------------------------------------------------------------

describe("createCustomLabel", () => {
  test("POSTs to correct versioned endpoint with page_label_name query param", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.post(
        `${BASE}/${VERSION}/${PAGE_ID}/custom_labels`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ id: "new-label-id" })
        },
      ),
    )

    // Act
    const result = await createCustomLabel({
      ctx: makeCtx(VERSION),
      pageId: PAGE_ID,
      name: "VIP",
    })

    // Assert
    expect(result).toEqual({ id: "new-label-id" })
    expect(captured).not.toBeNull()
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/${PAGE_ID}/custom_labels`)
    expect(url.searchParams.get("page_label_name")).toBe("VIP")
  })

  test("URL-encodes page_label_name containing spaces and special characters", async () => {
    // Arrange
    const specialName = "VIP & Côn"
    let captured: Request | null = null
    server.use(
      http.post(
        `${BASE}/${VERSION}/${PAGE_ID}/custom_labels`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ id: "encoded-label-id" })
        },
      ),
    )

    // Act
    await createCustomLabel({
      ctx: makeCtx(VERSION),
      pageId: PAGE_ID,
      name: specialName,
    })

    // Assert — URL class automatically percent-decodes searchParams
    const url = new URL((captured as Request).url)
    expect(url.searchParams.get("page_label_name")).toBe(specialName)
    // Confirm the raw URL string contains the encoded form (space → %20, & → %26)
    expect((captured as Request).url).toContain(encodeURIComponent(specialName))
  })

  test("sends Authorization: Bearer header", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.post(
        `${BASE}/${VERSION}/${PAGE_ID}/custom_labels`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ id: "label-id" })
        },
      ),
    )

    // Act
    await createCustomLabel({
      ctx: makeCtx(VERSION),
      pageId: PAGE_ID,
      name: "Standard",
    })

    // Assert
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
  })

  test("uses DEFAULT_API_VERSION when ctx.auth.version is omitted", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/${PAGE_ID}/custom_labels`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ id: "default-version-id" })
        },
      ),
    )

    // Act
    const result = await createCustomLabel({
      ctx: makeCtx(), // no version → falls back to DEFAULT_API_VERSION
      pageId: PAGE_ID,
      name: "NoVersionLabel",
    })

    // Assert
    expect(result).toEqual({ id: "default-version-id" })
    const url = new URL((captured as Request).url)
    expect(url.pathname).toContain(DEFAULT_API_VERSION)
  })

  test("passes through the id returned by the API", async () => {
    // Arrange
    const returnedId = "returned-label-777"
    server.use(
      http.post(`${BASE}/${VERSION}/${PAGE_ID}/custom_labels`, () =>
        HttpResponse.json({ id: returnedId }),
      ),
    )

    // Act
    const result = await createCustomLabel({
      ctx: makeCtx(VERSION),
      pageId: PAGE_ID,
      name: "SomeLabel",
    })

    // Assert
    expect(result.id).toBe(returnedId)
  })
})

// ---------------------------------------------------------------------------
// deleteCustomLabel
// ---------------------------------------------------------------------------

describe("deleteCustomLabel", () => {
  test("DELETEs to correct versioned endpoint", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await deleteCustomLabel({ ctx: makeCtx(VERSION), labelId: LABEL_ID })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/${LABEL_ID}`)
  })

  test("sends Authorization: Bearer header", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await deleteCustomLabel({ ctx: makeCtx(VERSION), labelId: LABEL_ID })

    // Assert
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
  })

  test("returns success:true when API response omits success field (our default)", async () => {
    // Arrange — API body has no `success` key
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}`, () =>
        HttpResponse.json({}),
      ),
    )

    // Act
    const result = await deleteCustomLabel({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
    })

    // Assert — our `response.success ?? true` branch
    expect(result).toEqual({ success: true })
  })

  test("uses DEFAULT_API_VERSION when ctx.auth.version is omitted", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(
        `${BASE}/${DEFAULT_API_VERSION}/${LABEL_ID}`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ success: true })
        },
      ),
    )

    // Act
    await deleteCustomLabel({ ctx: makeCtx(), labelId: LABEL_ID })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toContain(DEFAULT_API_VERSION)
  })
})

// ---------------------------------------------------------------------------
// assignLabelToUser
// ---------------------------------------------------------------------------

describe("assignLabelToUser", () => {
  test("POSTs to correct versioned endpoint with user query param", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.post(`${BASE}/${VERSION}/${LABEL_ID}/label`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await assignLabelToUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/${LABEL_ID}/label`)
    expect(url.searchParams.get("user")).toBe(PSID)
  })

  test("URL-encodes psid when it contains characters needing encoding", async () => {
    // Arrange
    const specialPsid = "123+456=789"
    let captured: Request | null = null
    server.use(
      http.post(`${BASE}/${VERSION}/${LABEL_ID}/label`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await assignLabelToUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: specialPsid,
    })

    // Assert — URL.searchParams.get decodes automatically
    const url = new URL((captured as Request).url)
    expect(url.searchParams.get("user")).toBe(specialPsid)
    // Raw URL must contain encoded form
    expect((captured as Request).url).toContain(encodeURIComponent(specialPsid))
  })

  test("sends Authorization: Bearer header", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.post(`${BASE}/${VERSION}/${LABEL_ID}/label`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await assignLabelToUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
  })

  test("returns success:true when API response omits success field (our default)", async () => {
    // Arrange — API body has no `success` key
    server.use(
      http.post(`${BASE}/${VERSION}/${LABEL_ID}/label`, () =>
        HttpResponse.json({}),
      ),
    )

    // Act
    const result = await assignLabelToUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert — our `response.success ?? true` branch
    expect(result).toEqual({ success: true })
  })

  test("uses DEFAULT_API_VERSION when ctx.auth.version is omitted", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/${LABEL_ID}/label`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ success: true })
        },
      ),
    )

    // Act
    await assignLabelToUser({
      ctx: makeCtx(),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toContain(DEFAULT_API_VERSION)
  })
})

// ---------------------------------------------------------------------------
// removeLabelFromUser
// ---------------------------------------------------------------------------

describe("removeLabelFromUser", () => {
  test("DELETEs to correct versioned endpoint", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}/label`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await removeLabelFromUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/${LABEL_ID}/label`)
  })

  test("sends user as a searchParam (not in path or body)", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}/label`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await removeLabelFromUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert — psid sent as ?user= query param on a DELETE
    const url = new URL((captured as Request).url)
    expect(url.searchParams.get("user")).toBe(PSID)
  })

  test("sends Authorization: Bearer header", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}/label`, ({ request }) => {
        captured = request
        return HttpResponse.json({ success: true })
      }),
    )

    // Act
    await removeLabelFromUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
  })

  test("returns success:true when API response omits success field (our default)", async () => {
    // Arrange — API body has no `success` key
    server.use(
      http.delete(`${BASE}/${VERSION}/${LABEL_ID}/label`, () =>
        HttpResponse.json({}),
      ),
    )

    // Act
    const result = await removeLabelFromUser({
      ctx: makeCtx(VERSION),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert — our `response.success ?? true` branch
    expect(result).toEqual({ success: true })
  })

  test("uses DEFAULT_API_VERSION when ctx.auth.version is omitted", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.delete(
        `${BASE}/${DEFAULT_API_VERSION}/${LABEL_ID}/label`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ success: true })
        },
      ),
    )

    // Act
    await removeLabelFromUser({
      ctx: makeCtx(),
      labelId: LABEL_ID,
      psid: PSID,
    })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toContain(DEFAULT_API_VERSION)
  })
})

// ---------------------------------------------------------------------------
// getUserLabels
// ---------------------------------------------------------------------------

describe("getUserLabels", () => {
  test("GETs to correct versioned endpoint", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, ({ request }) => {
        captured = request
        return HttpResponse.json({ data: [] })
      }),
    )

    // Act
    await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/${PSID}/custom_labels`)
  })

  test("sends fields=id,page_label_name as search param", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, ({ request }) => {
        captured = request
        return HttpResponse.json({ data: [] })
      }),
    )

    // Act
    await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.searchParams.get("fields")).toBe("id,page_label_name")
  })

  test("fails fast without retries when requestTimeoutMs is set", async () => {
    // Arrange — a retryable 503; the default client would retry it
    let calls = 0
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, () => {
        calls++
        return HttpResponse.json(
          { error: { message: "busy" } },
          { status: 503 },
        )
      }),
    )

    // Act / Assert
    await expect(
      getUserLabels({
        ctx: makeCtx(VERSION),
        psid: PSID,
        requestTimeoutMs: 5000,
      }),
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })

  test("keeps the client's default retries when requestTimeoutMs is omitted", async () => {
    // Arrange — fail once with a retryable 503, then succeed
    let calls = 0
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, () => {
        calls++
        return calls === 1
          ? HttpResponse.json({ error: { message: "busy" } }, { status: 503 })
          : HttpResponse.json({ data: [] })
      }),
    )

    // Act
    await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    expect(calls).toBe(2)
  })

  test("stops at the page limit instead of following cursors forever", async () => {
    // Arrange — every page claims there is another one
    let calls = 0
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, () => {
        calls++
        return HttpResponse.json({
          data: [{ id: String(calls), page_label_name: `label-${calls}` }],
          paging: {
            cursors: { after: `CURSOR-${calls + 1}` },
            next: `${BASE}/${VERSION}/${PSID}/custom_labels?after=x`,
          },
        })
      }),
    )

    // Act
    const labels = await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    expect(calls).toBe(5)
    expect(labels).toHaveLength(5)
  })

  test("follows paging cursors and concatenates every page", async () => {
    // Arrange — Meta returns a second page via paging.next + cursors.after
    const seenAfter: (string | null)[] = []
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after")
        seenAfter.push(after)
        if (after === "CURSOR-2") {
          return HttpResponse.json({
            data: [{ id: "3", page_label_name: "ad_id.1111111111" }],
            paging: { cursors: { before: "x", after: "CURSOR-3" } },
          })
        }
        return HttpResponse.json({
          data: [
            { id: "1", page_label_name: "Intake" },
            { id: "2", page_label_name: "messenger_ads" },
          ],
          paging: {
            cursors: { before: "x", after: "CURSOR-2" },
            next: `${BASE}/${VERSION}/${PSID}/custom_labels?after=CURSOR-2`,
          },
        })
      }),
    )

    // Act
    const labels = await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    expect(seenAfter).toEqual([null, "CURSOR-2"])
    expect(labels.map((label) => label.page_label_name)).toEqual([
      "Intake",
      "messenger_ads",
      "ad_id.1111111111",
    ])
  })

  test("sends Authorization: Bearer header", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, ({ request }) => {
        captured = request
        return HttpResponse.json({ data: [] })
      }),
    )

    // Act
    await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    expect((captured as Request).headers.get("authorization")).toBe(
      `Bearer ${PAGE_TOKEN}`,
    )
  })

  test("returns empty array when API response omits data field (our default)", async () => {
    // Arrange — API body has no `data` key
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, () =>
        HttpResponse.json({}),
      ),
    )

    // Act
    const result = await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert — our `response.data ?? []` branch
    expect(result).toEqual([])
  })

  test("returns the label array when API provides data", async () => {
    // Arrange
    const labels = [
      { id: "l1", page_label_name: "VIP" },
      { id: "l2", page_label_name: "Premium" },
    ]
    server.use(
      http.get(`${BASE}/${VERSION}/${PSID}/custom_labels`, () =>
        HttpResponse.json({ data: labels }),
      ),
    )

    // Act
    const result = await getUserLabels({ ctx: makeCtx(VERSION), psid: PSID })

    // Assert
    expect(result).toEqual(labels)
  })

  test("uses DEFAULT_API_VERSION when ctx.auth.version is omitted", async () => {
    // Arrange
    let captured: Request | null = null
    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/${PSID}/custom_labels`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ data: [] })
        },
      ),
    )

    // Act
    await getUserLabels({ ctx: makeCtx(), psid: PSID })

    // Assert
    const url = new URL((captured as Request).url)
    expect(url.pathname).toContain(DEFAULT_API_VERSION)
  })
})
