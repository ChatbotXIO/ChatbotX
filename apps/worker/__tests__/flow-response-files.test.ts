import { describe, expect, test, vi } from "vitest"
import {
  resolveFlowFiles,
  resolveMessageFlowFiles,
} from "../src/integration/handlers/flow-response-files"

describe("resolveFlowFiles", () => {
  const STORAGE_URL = "https://storage.example.com"
  const stored = (mediaId: string, fileName = `${mediaId}.pdf`) =>
    ({
      status: "stored" as const,
      mediaId,
      fileName,
      mimeType: "application/pdf",
      size: 10,
    }) satisfies import("@chatbotx.io/sdk").FlowResponseFile
  const failed = (mediaId: string) =>
    ({
      status: "failed" as const,
      mediaId,
      fileName: `${mediaId}.pdf`,
      mimeType: "application/pdf",
      reason: "download_failed" as const,
    }) satisfies import("@chatbotx.io/sdk").FlowResponseFile

  test("is undefined for a response without files", () => {
    expect(
      resolveFlowFiles({
        response: undefined,
        attachments: [],
        storageUrl: STORAGE_URL,
      }),
    ).toBeUndefined()
    expect(
      resolveFlowFiles({
        response: {},
        attachments: [],
        storageUrl: STORAGE_URL,
      }),
    ).toBeUndefined()
  })

  test("pairs each stored file with its attachment's public URL", () => {
    expect(
      resolveFlowFiles({
        response: { files: { docs: [stored("1", "Pass.pdf"), stored("2")] } },
        attachments: [
          { sourceId: "2", originPath: "public/whatsapp/ws/int/2-2.pdf" },
          { sourceId: "1", originPath: "public/whatsapp/ws/int/1-pass.pdf" },
        ],
        storageUrl: STORAGE_URL,
      }),
    ).toEqual({
      docs: [
        {
          mediaId: "1",
          fileName: "Pass.pdf",
          mimeType: "application/pdf",
          size: 10,
          url: "https://storage.example.com/public/whatsapp/ws/int/1-pass.pdf",
        },
        {
          mediaId: "2",
          fileName: "2.pdf",
          mimeType: "application/pdf",
          size: 10,
          url: "https://storage.example.com/public/whatsapp/ws/int/2-2.pdf",
        },
      ],
    })
  })

  test("leaves out failed files and stored files with no attachment row", () => {
    expect(
      resolveFlowFiles({
        response: { files: { docs: [stored("1"), failed("2"), stored("3")] } },
        attachments: [
          { sourceId: "1", originPath: "p/1.pdf" },
          { sourceId: null, originPath: "p/other.pdf" },
        ],
        storageUrl: STORAGE_URL,
      })?.docs?.map((file) => file.mediaId),
    ).toEqual(["1"])
  })

  test("keeps an answer whose files all failed, empty", () => {
    expect(
      resolveFlowFiles({
        response: { files: { docs: [failed("1")] } },
        attachments: [],
        storageUrl: STORAGE_URL,
      }),
    ).toEqual({ docs: [] })
  })

  test("keeps a response key named __proto__ as an entry", () => {
    // `JSON.parse` yields an own "__proto__" key, as a customer's response can.
    const files = JSON.parse(
      '{"__proto__":[{"status":"failed","mediaId":"1","fileName":"a.pdf","mimeType":null,"reason":"download_failed"}]}',
    ) as Record<string, import("@chatbotx.io/sdk").FlowResponseFile[]>

    const resolved = resolveFlowFiles({
      response: { files },
      attachments: [],
      storageUrl: STORAGE_URL,
    })

    expect(Object.keys(resolved ?? {})).toEqual(["__proto__"])
  })
})

describe("resolveMessageFlowFiles", () => {
  const STORAGE_URL = "https://storage.example.com"
  const storedFile = {
    status: "stored",
    mediaId: "1",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    size: 10,
  }
  const message = (files: unknown, attachments: unknown[] = []) => ({
    contentAttributes: {
      type: "whatsapp_flow_response",
      name: "flow",
      flowResponse: {},
      flowToken: null,
      decoded: null,
      ...(files ? { files } : {}),
    },
    attachments: attachments as { sourceId: string; originPath: string }[],
  })
  const expected = {
    docs: [
      {
        mediaId: "1",
        fileName: "a.pdf",
        mimeType: "application/pdf",
        size: 10,
        url: "https://storage.example.com/p/1.pdf",
      },
    ],
  }

  test("uses the saved message's own attachments", async () => {
    const loadAttachments = vi.fn(async () => [])

    const files = await resolveMessageFlowFiles({
      message: message({ docs: [storedFile] }, [
        { sourceId: "1", originPath: "p/1.pdf" },
      ]),
      storageUrl: STORAGE_URL,
      loadAttachments,
    })

    expect(files).toEqual(expected)
    expect(loadAttachments).not.toHaveBeenCalled()
  })

  test("loads the attachments when the saved row came back without them", async () => {
    const loadAttachments = vi.fn(async () => [
      { sourceId: "1", originPath: "p/1.pdf" },
    ])

    const files = await resolveMessageFlowFiles({
      message: message({ docs: [storedFile] }),
      storageUrl: STORAGE_URL,
      loadAttachments,
    })

    expect(files).toEqual(expected)
    expect(loadAttachments).toHaveBeenCalledOnce()
  })

  test.each([
    ["a response without files", undefined],
    [
      "a response whose files all failed",
      {
        docs: [{ ...storedFile, status: "failed", reason: "download_failed" }],
      },
    ],
  ])("%s needs no lookup", async (_label, files) => {
    const loadAttachments = vi.fn(async () => [])

    await resolveMessageFlowFiles({
      message: message(files),
      storageUrl: STORAGE_URL,
      loadAttachments,
    })

    expect(loadAttachments).not.toHaveBeenCalled()
  })

  test("is undefined for a message that is not a Flow response", async () => {
    expect(
      await resolveMessageFlowFiles({
        message: { contentAttributes: {}, attachments: [] },
        storageUrl: STORAGE_URL,
        loadAttachments: async () => [],
      }),
    ).toBeUndefined()
  })
})
