import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addBulk: vi.fn(async () => []),
}))

// Mock bullmq's `Queue` so importing the real heavy queue module never opens a
// socket — only `addBulk()` calls are observed.
vi.mock("bullmq", () => ({
  Queue: class {
    addBulk = mocks.addBulk
  },
}))

vi.mock("../src/lib/connection", () => ({
  defaultJobOptions: {},
  fakeQueue: { add: vi.fn(), addBulk: vi.fn() },
  getRedisConnection: () => ({}),
  getQueueConnection: () => ({}),
  isNoRedisEnv: () => false,
}))

const {
  enqueueStoredImageOptimizations,
  HeavyJobAction,
  heavyJobDataSchema,
  isOptimizableStorageKey,
} = await import("../src/queues/heavy")

const attachmentJob = {
  kind: "attachment" as const,
  workspaceId: "ws-1",
  objectKey: "public/messenger/ws-1/int-1/2026/10/13/att-key",
  attachmentId: "att-1",
  attachmentCreatedAt: "2026-10-13T01:00:00.000Z",
  messageCreatedAt: "2026-10-13T01:00:00.000Z",
}

const avatarJob = {
  kind: "avatar" as const,
  workspaceId: "ws-1",
  objectKey: "public/space/public/ws/ws-1/2026/10/13/avatars/av-key",
  contactId: "contact-1",
}

describe("isOptimizableStorageKey", () => {
  test.each([
    "public/messenger/ws-1/int-1/2026/10/13/abc",
    "public/space/ws-1/contacts/c-1/avatar/abc",
    "workspace/whatsapp/ws-1/int-1/2026/10/13/abc",
  ])("accepts an extension-less key we own: %s", (key) => {
    expect(isOptimizableStorageKey(key, "ws-1")).toBe(true)
  })

  test.each([
    null,
    undefined,
    "",
    "https://scontent.xx.fbcdn.net/v/photo.jpg",
    "wa-media:1379511273954485//",
    "failed:too-large",
    "public/img/no_avatar.jpg?time=1760000000000",
    "public/space/ws-1/logos/abc.jpg",
    "workspace/messenger/ws-1/int-1/2026/10/13/abc.png",
    "public/messenger/ws-1/",
  ])("rejects %s", (key) => {
    expect(isOptimizableStorageKey(key, "ws-1")).toBe(false)
  })

  // `Contact.avatar` can be set to an arbitrary string through the public API,
  // so a key is only ours when the owning workspace id is one of its segments —
  // otherwise a crafted avatar would make the job overwrite another tenant's
  // object in place.
  test.each([
    "public/messenger/ws-2/int-1/2026/10/13/abc",
    "public/img/no_avatar",
    "public/space/ws-10/contacts/c-1/avatar/abc",
    "public/space/xws-1/contacts/c-1/avatar/abc",
    // The workspace id must sit where our key layouts put it, not anywhere:
    // a member of ws-2 can upload `public/space/ws-2/<anything>` and could
    // otherwise name a victim's segment inside their own suffix.
    "public/space/ws-2/ws-1/image",
    "public/messenger/ws-2/ws-1/2026/10/13/abc",
    "workspace/whatsapp/ws-2/int-1/ws-1/abc",
    "ws-1/abc",
    "public/ws-1/abc",
  ])("rejects a key outside the workspace: %s", (key) => {
    expect(isOptimizableStorageKey(key, "ws-1")).toBe(false)
  })

  // The guard reads the key as literal segments; a storage layer or proxy
  // that normalises `..`, `.` or `//` would resolve a key that passed the
  // position check onto another tenant's object. Every key we generate is
  // plain `[A-Za-z0-9._-]` segments, so anything else is not ours.
  test.each([
    "public/space/ws-1/../../messenger/ws-2/int-1/2026/10/13/abc",
    "public/space/ws-1/./abc",
    "public//ws-1/abc",
    "/public/space/ws-1/abc",
    "public/space/ws-1//abc",
    "public\\space\\ws-1\\abc",
    "public/space/ws-1/%2e%2e/abc",
    "public/space/ws-1/a b",
  ])("rejects a key with traversal or non-literal segments: %s", (key) => {
    expect(isOptimizableStorageKey(key, "ws-1")).toBe(false)
  })

  test.each([
    // public/ws/<ws>/…, public/space/<ws>/…, public/<channel>/<ws>/…
    "public/ws/ws-1/2026/10/13/avatars/abc",
    "public/space/ws-1/avatars/abc",
    "public/instagram/ws-1/int-1/2026/10/13/abc",
    // workspace/<channel>/<ws>/…
    "workspace/messenger/ws-1/int-1/2026/10/13/abc",
    // Legacy Messenger avatars: public/space/public/ws/<ws>/…
    "public/space/public/ws/ws-1/2026/10/13/avatars/abc",
  ])("accepts the workspace id in a known layout position: %s", (key) => {
    expect(isOptimizableStorageKey(key, "ws-1")).toBe(true)
  })
})

describe("enqueueStoredImageOptimizations", () => {
  beforeEach(() => {
    mocks.addBulk.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("queues low-priority jobs with deterministic, colon-free ids", async () => {
    await enqueueStoredImageOptimizations([attachmentJob, avatarJob])

    const [jobs] = mocks.addBulk.mock.calls[0] as unknown as [
      { name: string; data: unknown; opts: Record<string, unknown> }[],
    ]
    expect(jobs.map((job) => job.opts.jobId)).toEqual([
      "optimize-image-attachment-att-1",
      "optimize-image-avatar-contact-1-av-key",
    ])
    for (const job of jobs) {
      expect(job.opts.jobId).not.toContain(":")
      expect(job.opts.priority).toBeGreaterThan(0)
      expect(job.name).toBe(HeavyJobAction.optimizeStoredImage)
      expect(heavyJobDataSchema.safeParse(job.data).success).toBe(true)
    }
  })

  test("skips keys that are not stored objects", async () => {
    await enqueueStoredImageOptimizations([
      { ...avatarJob, objectKey: "https://cdn.example.com/a.jpg" },
    ])

    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  // `Contact.avatar` is settable through the public API, so an avatar job must
  // only ever rewrite an object stored as an avatar — never a logo, a webchat
  // upload or a media-library file of the same workspace, which it would
  // otherwise shrink to a 256px WebP in place.
  test.each([
    "public/space/ws-1/logos/brand",
    "public/space/ws-1/uploads/contract-scan",
    "public/ws/ws-1/2026/10/13/media-library-file",
    "public/messenger/ws-1/int-1/2026/10/13/att-key",
  ])("skips an avatar job whose key is not an avatar object: %s", async (key) => {
    await enqueueStoredImageOptimizations([{ ...avatarJob, objectKey: key }])

    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test.each([
    "public/space/ws-1/avatars/abc",
    "public/space/ws-1/contacts/c-1/avatar/abc",
    "public/ws/ws-1/2026/10/13/avatars/abc",
    "public/space/public/ws/ws-1/2026/10/13/avatars/abc",
  ])("queues an avatar job for an avatar object: %s", async (key) => {
    await enqueueStoredImageOptimizations([{ ...avatarJob, objectKey: key }])

    expect(mocks.addBulk).toHaveBeenCalledTimes(1)
  })

  test("skips a key that belongs to another workspace", async () => {
    await enqueueStoredImageOptimizations([
      {
        ...avatarJob,
        objectKey: "public/space/ws-2/contacts/c-9/avatar/stolen",
      },
    ])

    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test("enqueues nothing when STORED_IMAGE_OPTIMIZATION=off", async () => {
    vi.stubEnv("STORED_IMAGE_OPTIMIZATION", "off")

    await enqueueStoredImageOptimizations([attachmentJob, avatarJob])

    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test("delays each job so a caller-owned transaction can commit first", async () => {
    await enqueueStoredImageOptimizations([avatarJob])

    const [jobs] = mocks.addBulk.mock.calls[0] as unknown as [
      { opts: Record<string, unknown> }[],
    ]
    expect(jobs[0]?.opts.delay).toBe(5000)
  })

  test("never throws when the queue is unavailable", async () => {
    mocks.addBulk.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      enqueueStoredImageOptimizations([attachmentJob]),
    ).resolves.toBeUndefined()
  })
})
