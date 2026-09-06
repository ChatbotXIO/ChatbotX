import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listWhatsappMessageTemplatesInternalAPI: vi.fn(),
  listMessengerMessageTemplatesInternalAPI: vi.fn(),
  listMessengerPersonasAuthenticatedAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    whatsappMessageTemplateAPIs: {
      listWhatsappMessageTemplatesInternalAPI:
        mocks.listWhatsappMessageTemplatesInternalAPI,
    },
    messengerMessageTemplateAPIs: {
      listMessengerMessageTemplatesInternalAPI:
        mocks.listMessengerMessageTemplatesInternalAPI,
    },
    personasAPIs: {
      listMessengerPersonasAuthenticatedAPI:
        mocks.listMessengerPersonasAuthenticatedAPI,
    },
  },
}))

const { createFlowTemplateStore } = await import("../flow-template-store")

/**
 * A deferred, abortable WA-templates fetch. Mirrors real `fetch`-like
 * behavior: rejects with a real AbortError as soon as its `signal` fires,
 * independent of whether/when its own resolve/reject is later called.
 */
function deferredAbortableFetch() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return {
    promise,
    resolve,
    reject,
    implementation: (
      _input: unknown,
      options: { signal: AbortSignal },
    ): Promise<unknown> => {
      options.signal.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"))
      })
      return promise
    },
  }
}

beforeEach(() => {
  mocks.listWhatsappMessageTemplatesInternalAPI.mockReset()
  mocks.listMessengerMessageTemplatesInternalAPI.mockReset()
  mocks.listMessengerPersonasAuthenticatedAPI.mockReset()
})

describe("fetchWhatsappTemplates — abort-and-supersede", () => {
  test("a superseded (aborted) fetch sets no error and leaves loading false once the newer fetch settles", async () => {
    const first = deferredAbortableFetch()
    const second = deferredAbortableFetch()
    mocks.listWhatsappMessageTemplatesInternalAPI
      .mockImplementationOnce(first.implementation)
      .mockImplementationOnce(second.implementation)

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    const firstCall = store.getState().fetchWhatsappTemplates()
    expect(store.getState().loadingWhatsappTemplates).toBe(true)

    // Starting the second fetch aborts the first's signal (real abort
    // listener path — see deferredAbortableFetch).
    const secondCall = store.getState().fetchWhatsappTemplates()

    second.resolve([{ id: "tpl-1" }])
    await Promise.all([firstCall, secondCall])

    expect(store.getState().whatsappTemplates).toEqual([{ id: "tpl-1" }])
    expect(store.getState().loadingWhatsappTemplates).toBe(false)
    expect(store.getState().error).toBeNull()
  })

  test("the superseded fetch's own cleanup does not clobber loading:false set by the newer fetch, when the older one settles last", async () => {
    const first = deferredAbortableFetch()
    const second = deferredAbortableFetch()
    mocks.listWhatsappMessageTemplatesInternalAPI
      .mockImplementationOnce(first.implementation)
      .mockImplementationOnce(second.implementation)

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    const firstCall = store.getState().fetchWhatsappTemplates()
    const secondCall = store.getState().fetchWhatsappTemplates()

    // Newer fetch settles first.
    second.resolve([{ id: "tpl-2" }])
    await secondCall
    expect(store.getState().loadingWhatsappTemplates).toBe(false)
    expect(store.getState().whatsappTemplates).toEqual([{ id: "tpl-2" }])

    // The older, already-aborted fetch's rejection is now processed — its
    // cleanup must recognize `waFetchController !== controller` and skip
    // resetting `loadingWhatsappTemplates`, so the newer fetch's result
    // stays intact.
    await firstCall

    expect(store.getState().loadingWhatsappTemplates).toBe(false)
    expect(store.getState().whatsappTemplates).toEqual([{ id: "tpl-2" }])
    expect(store.getState().error).toBeNull()
  })

  test("a genuine (non-abort) rejection sets error, clears whatsappTemplates, and clears loading", async () => {
    mocks.listWhatsappMessageTemplatesInternalAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createFlowTemplateStore({
      workspaceId: "workspace-1",
      whatsappTemplates: [{ id: "stale" }] as never,
    })

    await store.getState().fetchWhatsappTemplates()

    expect(store.getState().error).toBe("Failed to fetch WA templates")
    expect(store.getState().whatsappTemplates).toEqual([])
    expect(store.getState().loadingWhatsappTemplates).toBe(false)
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createFlowTemplateStore({ workspaceId: "" })

    await store.getState().fetchWhatsappTemplates()

    expect(mocks.listWhatsappMessageTemplatesInternalAPI).not.toHaveBeenCalled()
  })
})

describe("setIntegrationWhatsappId", () => {
  test("sets the id, clears whatsappTemplates, and triggers a new fetch with the id", async () => {
    mocks.listWhatsappMessageTemplatesInternalAPI.mockResolvedValueOnce([
      { id: "tpl-1" },
    ])

    const store = createFlowTemplateStore({
      workspaceId: "workspace-1",
      whatsappTemplates: [{ id: "stale" }] as never,
    })

    store.getState().setIntegrationWhatsappId("integration-1")

    expect(store.getState().integrationWhatsappId).toBe("integration-1")
    expect(store.getState().whatsappTemplates).toEqual([])

    await vi.waitFor(() => {
      expect(
        mocks.listWhatsappMessageTemplatesInternalAPI,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ integrationWhatsappId: "integration-1" }),
        expect.anything(),
      )
    })
  })
})

describe("fetchMessengerTemplates", () => {
  test("fetches messenger templates for the workspace", async () => {
    mocks.listMessengerMessageTemplatesInternalAPI.mockResolvedValueOnce([
      { id: "m-1" },
    ])

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().fetchMessengerTemplates()

    expect(mocks.listMessengerMessageTemplatesInternalAPI).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(store.getState().messengerTemplates).toEqual([{ id: "m-1" }])
  })

  test("dedupes overlapping concurrent calls", async () => {
    let resolveFetch!: (value: unknown[]) => void
    const pending = new Promise<unknown[]>((resolve) => {
      resolveFetch = resolve
    })
    mocks.listMessengerMessageTemplatesInternalAPI.mockReturnValueOnce(pending)

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    const first = store.getState().fetchMessengerTemplates()
    await store.getState().fetchMessengerTemplates()

    expect(
      mocks.listMessengerMessageTemplatesInternalAPI,
    ).toHaveBeenCalledTimes(1)

    resolveFetch([])
    await first
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createFlowTemplateStore({ workspaceId: "" })

    await store.getState().fetchMessengerTemplates()

    expect(
      mocks.listMessengerMessageTemplatesInternalAPI,
    ).not.toHaveBeenCalled()
  })

  test("sets error on a rejected request", async () => {
    mocks.listMessengerMessageTemplatesInternalAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().fetchMessengerTemplates()

    expect(store.getState().error).toBe("Failed to fetch Messenger templates")
  })
})

describe("fetchMessengerPersonas", () => {
  test("fetches messenger personas for the workspace", async () => {
    mocks.listMessengerPersonasAuthenticatedAPI.mockResolvedValueOnce({
      data: [{ id: "persona-1" }],
    })

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().fetchMessengerPersonas()

    expect(mocks.listMessengerPersonasAuthenticatedAPI).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(store.getState().messengerPersonas).toEqual([{ id: "persona-1" }])
  })

  test("dedupes overlapping concurrent calls", async () => {
    let resolveFetch!: (value: { data: unknown[] }) => void
    const pending = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFetch = resolve
    })
    mocks.listMessengerPersonasAuthenticatedAPI.mockReturnValueOnce(pending)

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    const first = store.getState().fetchMessengerPersonas()
    await store.getState().fetchMessengerPersonas()

    expect(mocks.listMessengerPersonasAuthenticatedAPI).toHaveBeenCalledTimes(1)

    resolveFetch({ data: [] })
    await first
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createFlowTemplateStore({ workspaceId: "" })

    await store.getState().fetchMessengerPersonas()

    expect(mocks.listMessengerPersonasAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test("sets error on a rejected request", async () => {
    mocks.listMessengerPersonasAuthenticatedAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().fetchMessengerPersonas()

    expect(store.getState().error).toBe("Failed to fetch Messenger personas")
  })
})

describe("initialize", () => {
  test("fetches WA templates, Messenger templates, and Messenger personas in parallel and marks initialized", async () => {
    mocks.listWhatsappMessageTemplatesInternalAPI.mockResolvedValueOnce([])
    mocks.listMessengerMessageTemplatesInternalAPI.mockResolvedValueOnce([])
    mocks.listMessengerPersonasAuthenticatedAPI.mockResolvedValueOnce({
      data: [],
    })

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(mocks.listWhatsappMessageTemplatesInternalAPI).toHaveBeenCalledTimes(
      1,
    )
    expect(
      mocks.listMessengerMessageTemplatesInternalAPI,
    ).toHaveBeenCalledTimes(1)
    expect(mocks.listMessengerPersonasAuthenticatedAPI).toHaveBeenCalledTimes(1)
    expect(store.getState().initialized).toBe(true)
  })

  test("still marks initialized:true when one of the three fetchers fails (each catches its own error internally)", async () => {
    mocks.listWhatsappMessageTemplatesInternalAPI.mockRejectedValueOnce(
      new Error("wa down"),
    )
    mocks.listMessengerMessageTemplatesInternalAPI.mockResolvedValueOnce([])
    mocks.listMessengerPersonasAuthenticatedAPI.mockResolvedValueOnce({
      data: [],
    })

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(store.getState().initialized).toBe(true)
    expect(store.getState().error).toBe("Failed to fetch WA templates")
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createFlowTemplateStore({ workspaceId: "" })

    await store.getState().initialize()

    expect(store.getState().initialized).toBe(false)
    expect(mocks.listWhatsappMessageTemplatesInternalAPI).not.toHaveBeenCalled()
  })

  test("does not fetch again once already initialized", async () => {
    mocks.listWhatsappMessageTemplatesInternalAPI.mockResolvedValue([])
    mocks.listMessengerMessageTemplatesInternalAPI.mockResolvedValue([])
    mocks.listMessengerPersonasAuthenticatedAPI.mockResolvedValue({ data: [] })

    const store = createFlowTemplateStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mocks.listWhatsappMessageTemplatesInternalAPI).toHaveBeenCalledTimes(
      1,
    )
  })
})
