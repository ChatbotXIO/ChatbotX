import { beforeEach, describe, expect, test, vi } from "vitest"

const { putObject, insertValues, selectRows, updateWhere } = vi.hoisted(() => ({
  putObject: vi.fn(),
  insertValues: vi.fn(),
  selectRows: vi.fn(),
  updateWhere: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  db: { insert: vi.fn(() => ({ values: insertValues })) },
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn(),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  miniAppUploadModel: { contactId: "contactId", id: "id" },
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploader: { putObject } }))
vi.mock("../src/contact/service", () => ({
  contactService: {
    findById: vi.fn(async ({ id }: { id: string }) =>
      id === "7" ? { id } : undefined,
    ),
  },
}))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: vi.fn(async () => ({
    storageUrl: "https://cdn.example.com/",
  })),
}))

const { miniAppUploadService, MiniAppUploadError } = await import(
  "../src/mini-app/upload-service"
)

const miniApp = {
  id: "9",
  workspaceId: "1",
  definition: {
    screens: [
      {
        key: "s1",
        id: "WELCOME",
        title: "",
        terminal: true,
        children: [
          {
            id: "p",
            type: "PhotoPicker" as const,
            props: { name: "photo", label: "Photo", "max-uploaded-photos": 2 },
          },
        ],
      },
    ],
  },
}
const CONTACT_PATH =
  /^public\/space\/1\/contacts\/7\/mini-apps\/[A-Za-z0-9_-]{22}\/cmnd-mat-truoc\.jpg$/
const UPLOAD_ID = /^[A-Za-z0-9_-]{22}$/
const ANONYMOUS_PATH = /^public\/space\/1\/mini-apps\/9\/anonymous\//
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const jpegFile = {
  name: "CMND mặt trước.JPG",
  type: "image/jpeg",
  size: JPEG.length,
  bytes: JPEG,
}

const tx = {
  select: vi.fn(() => ({ from: vi.fn(() => ({ where: selectRows })) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("miniAppUploadService.create", () => {
  test("stores a contact's photo in the contact folder with an unguessable key", async () => {
    const result = await miniAppUploadService.create({
      miniApp,
      contactId: "7",
      inputName: "photo",
      file: jpegFile,
    })
    const [path, , options] = putObject.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
    ]
    expect(path).toMatch(CONTACT_PATH)
    expect(options).toMatchObject({
      ACL: "public-read",
      ContentType: "image/jpeg",
    })
    expect(result).toMatchObject({
      name: "CMND mặt trước.JPG",
      mimeType: "image/jpeg",
    })
    expect(result.uploadId).toMatch(UPLOAD_ID)
    expect(result.url).toBe(`https://cdn.example.com/${path}`)
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "7",
        status: "pending",
        uploadToken: result.uploadId,
      }),
    )
  })

  test("stores an anonymous upload under the Mini App", async () => {
    await miniAppUploadService.create({
      miniApp,
      contactId: null,
      inputName: "photo",
      file: jpegFile,
    })
    expect(putObject.mock.calls[0]?.[0]).toMatch(ANONYMOUS_PATH)
  })

  test("rejects unknown inputs and files that are not what they claim", async () => {
    await expect(
      miniAppUploadService.create({
        miniApp,
        contactId: null,
        inputName: "nope",
        file: jpegFile,
      }),
    ).rejects.toMatchObject({ reason: "unknown_input" })
    const html = new TextEncoder().encode("<html><script>alert(1)</script>")
    await expect(
      miniAppUploadService.create({
        miniApp,
        contactId: null,
        inputName: "photo",
        file: {
          name: "x.png",
          type: "image/png",
          size: html.length,
          bytes: html,
        },
      }),
    ).rejects.toBeInstanceOf(MiniAppUploadError)
    expect(putObject).not.toHaveBeenCalled()
  })
})

describe("miniAppUploadService.claimForSubmission", () => {
  const row = (uploadToken: string) => ({
    id: `row-${uploadToken}`,
    uploadToken,
    path: `public/space/1/contacts/7/mini-apps/k/${uploadToken}.jpg`,
    fileName: `${uploadToken}.jpg`,
    mimeType: "image/jpeg",
    size: 10,
  })

  test("returns the files and marks them submitted", async () => {
    selectRows.mockResolvedValue([row("a"), row("b")])
    const files = await miniAppUploadService.claimForSubmission({
      tx: tx as never,
      miniApp,
      contactId: "7",
      submissionId: "s-1",
      inputName: "photo",
      uploadIds: ["a", "b"],
    })
    expect(files.map((file) => file.url)).toEqual([
      "https://cdn.example.com/public/space/1/contacts/7/mini-apps/k/a.jpg",
      "https://cdn.example.com/public/space/1/contacts/7/mini-apps/k/b.jpg",
    ])
    expect(updateWhere).toHaveBeenCalled()
  })

  test("rejects ids that are not this visitor's pending uploads, or too many files", async () => {
    selectRows.mockResolvedValue([row("a")])
    const claim = (uploadIds: string[]) =>
      miniAppUploadService.claimForSubmission({
        tx: tx as never,
        miniApp,
        contactId: "7",
        submissionId: "s-1",
        inputName: "photo",
        uploadIds,
      })
    await expect(claim(["a", "someone-else"])).rejects.toMatchObject({
      field: "answers",
    })
    await expect(claim(["a", "b", "c"])).rejects.toMatchObject({
      field: "answers",
    })
    expect(updateWhere).not.toHaveBeenCalled()
  })
})
