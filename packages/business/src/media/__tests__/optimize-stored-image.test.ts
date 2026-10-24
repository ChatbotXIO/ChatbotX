import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

const uploader = vi.hoisted(() => ({
  headObject: vi.fn(),
  getObject: vi.fn(),
  putObject: vi.fn(),
}))
const repository = vi.hoisted(() => ({
  findAttachmentById: vi.fn(),
  updateAttachment: vi.fn(),
}))
const findContactById = vi.hoisted(() => vi.fn())
const optimizeImageForStorage = vi.hoisted(() => vi.fn())
const readImageDimensions = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/filesystem", () => ({ uploader }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: async () => repository,
}))
vi.mock("../../contact/service", () => ({
  contactService: { findById: findContactById },
}))
vi.mock("@chatbotx.io/utils/image-optimize", () => ({
  optimizeImageForStorage,
  readImageDimensions,
}))

import { optimizeStoredImage } from "../optimize-stored-image"

const ATTACHMENT_KEY = "public/messenger/ws-1/int-1/2026/10/13/att-1"
const AVATAR_KEY = "public/messenger/ws-1/int-1/2026/10/13/avatars/av-1"
const SOURCE = Buffer.from("source-jpeg-bytes")
const ENCODED = Buffer.from("smaller")

const attachmentJob = {
  kind: "attachment",
  workspaceId: "ws-1",
  objectKey: ATTACHMENT_KEY,
  attachmentId: "att-1",
  attachmentCreatedAt: "2026-10-13T01:00:00.000Z",
  messageCreatedAt: "2026-10-13T01:00:00.000Z",
} as const

const avatarJob = {
  kind: "avatar",
  workspaceId: "ws-1",
  objectKey: AVATAR_KEY,
  contactId: "contact-1",
} as const

describe("optimizeStoredImage", () => {
  beforeEach(() => {
    repository.updateAttachment.mockResolvedValue(1)
    vi.clearAllMocks()
    // Well above the small-source floor; the buffer itself stays tiny.
    uploader.headObject.mockResolvedValue({
      ContentLength: 64 * 1024,
      ContentType: "image/jpeg",
    })
    uploader.getObject.mockResolvedValue(SOURCE)
    // A row that already describes the stored object.
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/jpeg",
      size: SOURCE.length,
    })
    findContactById.mockResolvedValue({ avatar: AVATAR_KEY })
    optimizeImageForStorage.mockResolvedValue({
      optimized: true,
      bytes: ENCODED,
      mimeType: "image/jpeg",
      width: 2048,
      height: 1024,
    })
  })

  it("returns disabled without touching storage when the switch is off", async () => {
    vi.stubEnv("STORED_IMAGE_OPTIMIZATION", "off")
    try {
      await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
        outcome: "disabled",
      })
    } finally {
      vi.unstubAllEnvs()
    }

    expect(uploader.headObject).not.toHaveBeenCalled()
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("refuses an avatar job pointed at a non-avatar object of the same workspace", async () => {
    const logoKey = "public/space/ws-1/logos/brand"
    findContactById.mockResolvedValue({ avatar: logoKey })

    await expect(
      optimizeStoredImage({ ...avatarJob, objectKey: logoKey }),
    ).resolves.toEqual({ outcome: "skipped-foreign" })

    expect(uploader.headObject).not.toHaveBeenCalled()
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("refuses a key outside the workspace before touching storage", async () => {
    // The enqueue already filters these; the job re-checks so a crafted
    // `Contact.avatar` can never overwrite another tenant's object.
    findContactById.mockResolvedValue({
      avatar: "public/space/ws-2/contacts/c-9/avatar/stolen",
    })

    await expect(
      optimizeStoredImage({
        ...avatarJob,
        objectKey: "public/space/ws-2/contacts/c-9/avatar/stolen",
      }),
    ).resolves.toEqual({ outcome: "skipped-foreign" })

    expect(uploader.headObject).not.toHaveBeenCalled()
    expect(uploader.getObject).not.toHaveBeenCalled()
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("skips an attachment whose sender sent the image as a file", async () => {
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      keepOriginal: true,
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-original",
    })

    expect(uploader.getObject).not.toHaveBeenCalled()
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("overwrites the attachment object in place and records the stored bytes", async () => {
    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "optimized",
      bytesBefore: SOURCE.length,
      bytesAfter: ENCODED.length,
    })

    expect(optimizeImageForStorage).toHaveBeenCalledWith({
      bytes: SOURCE,
      mimeType: "image/jpeg",
      profile: "media",
    })
    expect(uploader.putObject).toHaveBeenCalledWith(ATTACHMENT_KEY, ENCODED, {
      ACL: "public-read",
      ContentType: "image/jpeg",
      ContentLength: ENCODED.length,
    })
    expect(repository.updateAttachment).toHaveBeenCalledWith({
      id: "att-1",
      workspaceId: "ws-1",
      createdAt: new Date(attachmentJob.attachmentCreatedAt),
      fields: {
        originPath: ATTACHMENT_KEY,
        mimeType: "image/jpeg",
        size: ENCODED.length,
        width: 2048,
        height: 1024,
      },
    })
  })

  it("re-encodes an avatar with the avatar profile and touches no attachment", async () => {
    optimizeImageForStorage.mockResolvedValue({
      optimized: true,
      bytes: ENCODED,
      mimeType: "image/webp",
      width: 256,
      height: 256,
    })

    await expect(optimizeStoredImage(avatarJob)).resolves.toEqual({
      outcome: "optimized",
      bytesBefore: SOURCE.length,
      bytesAfter: ENCODED.length,
    })

    expect(optimizeImageForStorage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "avatar" }),
    )
    expect(uploader.putObject).toHaveBeenCalledWith(AVATAR_KEY, ENCODED, {
      ACL: "public-read",
      ContentType: "image/webp",
      ContentLength: ENCODED.length,
    })
    expect(repository.updateAttachment).not.toHaveBeenCalled()
  })

  it("does nothing when the attachment no longer points at the object", async () => {
    repository.findAttachmentById.mockResolvedValue({
      originPath: "public/messenger/ws-1/int-1/other",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-stale",
    })

    expect(uploader.getObject).not.toHaveBeenCalled()
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("does not write when the contact's avatar changed while encoding", async () => {
    findContactById
      .mockResolvedValueOnce({ avatar: AVATAR_KEY })
      .mockResolvedValueOnce({ avatar: "public/space/ws-1/avatars/newer" })

    await expect(optimizeStoredImage(avatarJob)).resolves.toEqual({
      outcome: "skipped-stale",
    })

    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("uses the configured source size limits", async () => {
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    vi.stubEnv("STORED_IMAGE_JOB_MAX_SOURCE_MB", "1")
    uploader.headObject.mockResolvedValue({
      ContentLength: 2 * 1024 * 1024,
      ContentType: "image/jpeg",
    })
    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-large",
    })

    vi.stubEnv("STORED_IMAGE_JOB_MAX_SOURCE_MB", "10")
    vi.stubEnv("STORED_IMAGE_JOB_MIN_SOURCE_KB", "128")
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/jpeg",
      size: 100 * 1024,
    })
    uploader.headObject.mockResolvedValue({
      ContentLength: 100 * 1024,
      ContentType: "image/jpeg",
    })
    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-small",
    })
    expect(uploader.getObject).not.toHaveBeenCalled()
  })

  it("skips a source too large to decode safely without downloading it", async () => {
    uploader.headObject.mockResolvedValue({
      ContentLength: 11 * 1024 * 1024,
      ContentType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-large",
    })

    expect(uploader.getObject).not.toHaveBeenCalled()
  })

  it("skips an attachment smaller than the floor without downloading it", async () => {
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/jpeg",
      size: 32 * 1024 - 1,
    })
    uploader.headObject.mockResolvedValue({
      ContentLength: 32 * 1024 - 1,
      ContentType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-small",
    })

    expect(uploader.getObject).not.toHaveBeenCalled()
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  it("optimizes an attachment exactly at the floor", async () => {
    uploader.headObject.mockResolvedValue({
      ContentLength: 32 * 1024,
      ContentType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toMatchObject({
      outcome: "optimized",
    })
  })

  it("optimizes a small avatar: a 256px WebP is always worth it", async () => {
    uploader.headObject.mockResolvedValue({
      ContentLength: 1000,
      ContentType: "image/jpeg",
    })

    await expect(optimizeStoredImage(avatarJob)).resolves.toMatchObject({
      outcome: "optimized",
    })
  })

  it("optimizes a source whose length the store did not report", async () => {
    uploader.headObject.mockResolvedValue({ ContentType: "image/jpeg" })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toMatchObject({
      outcome: "optimized",
    })
  })

  it("treats an object that no longer exists as stale", async () => {
    uploader.headObject.mockRejectedValue(
      Object.assign(new Error("not found"), { name: "NotFound" }),
    )

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "skipped-stale",
    })
  })

  it("leaves the object alone when re-encoding does not help", async () => {
    optimizeImageForStorage.mockResolvedValue({
      optimized: false,
      bytes: SOURCE,
      mimeType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "unchanged",
      bytesBefore: SOURCE.length,
      bytesAfter: SOURCE.length,
    })

    expect(uploader.putObject).not.toHaveBeenCalled()
    expect(repository.updateAttachment).not.toHaveBeenCalled()
  })

  it("still repairs the row when the overwritten object fell below the size floor", async () => {
    // Attempt 1 shrank a 900 KB PNG to a 20 KB JPEG and then lost the row
    // update. The object is now under the floor, but the row still describes
    // the PNG: skipping it as "small" would leave that wrong forever.
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/png",
      size: 900_000,
    })
    uploader.headObject.mockResolvedValue({
      ContentLength: 20 * 1024,
      ContentType: "image/jpeg",
    })
    optimizeImageForStorage.mockResolvedValue({
      optimized: false,
      bytes: SOURCE,
      mimeType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toMatchObject({
      outcome: "reconciled",
    })
    expect(repository.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ mimeType: "image/jpeg" }),
      }),
    )
  })

  it("fails instead of reporting success when the row update matched nothing", async () => {
    // The object was just overwritten; a row that still describes the old
    // bytes must surface as a failure so the retry reconciles it.
    repository.updateAttachment.mockResolvedValue(0)

    await expect(optimizeStoredImage(attachmentJob)).rejects.toThrow(
      "was not updated",
    )
  })

  it("repairs the dimensions too, read from the stored object", async () => {
    // An EXIF-rotated photo swaps its aspect ratio when re-encoded: a repaired
    // row that kept the original's width/height would render it wrong.
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/png",
      size: 900_000,
    })
    uploader.headObject.mockResolvedValue({
      ContentLength: 64 * 1024,
      ContentType: "image/jpeg",
    })
    optimizeImageForStorage.mockResolvedValue({
      optimized: false,
      bytes: SOURCE,
      mimeType: "image/jpeg",
    })
    readImageDimensions.mockResolvedValue({ width: 900, height: 1600 })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toMatchObject({
      outcome: "reconciled",
    })
    expect(repository.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ width: 900, height: 1600 }),
      }),
    )
  })

  it("repairs the row when a previous attempt overwrote the object but lost the update", async () => {
    // Attempt 1: PNG → JPEG PUT succeeded, then updateAttachment failed. On
    // retry the object is already JPEG, the encode cannot save 20% again, and
    // the row still describes the PNG — reconcile it from the stored object.
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/png",
      size: 900_000,
    })
    uploader.headObject.mockResolvedValue({
      ContentLength: 64 * 1024,
      ContentType: "image/jpeg",
    })
    optimizeImageForStorage.mockResolvedValue({
      optimized: false,
      bytes: SOURCE,
      mimeType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toEqual({
      outcome: "reconciled",
      bytesBefore: SOURCE.length,
      bytesAfter: SOURCE.length,
    })

    expect(uploader.putObject).not.toHaveBeenCalled()
    expect(repository.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "att-1",
        fields: expect.objectContaining({
          originPath: ATTACHMENT_KEY,
          mimeType: "image/jpeg",
          size: SOURCE.length,
        }),
      }),
    )
  })

  it("leaves a row alone when the stored object already matches it", async () => {
    repository.findAttachmentById.mockResolvedValue({
      originPath: ATTACHMENT_KEY,
      mimeType: "image/jpeg",
      size: SOURCE.length,
    })
    optimizeImageForStorage.mockResolvedValue({
      optimized: false,
      bytes: SOURCE,
      mimeType: "image/jpeg",
    })

    await expect(optimizeStoredImage(attachmentJob)).resolves.toMatchObject({
      outcome: "unchanged",
    })

    expect(repository.updateAttachment).not.toHaveBeenCalled()
  })

  it("does not make a private object public", async () => {
    const privateKey = "workspace/whatsapp/ws-1/int-1/2026/10/13/att-2"
    repository.findAttachmentById.mockResolvedValue({ originPath: privateKey })

    await optimizeStoredImage({ ...attachmentJob, objectKey: privateKey })

    expect(uploader.putObject).toHaveBeenCalledWith(privateKey, ENCODED, {
      ContentType: "image/jpeg",
      ContentLength: ENCODED.length,
    })
  })
})
