import { describe, expect, it } from "vitest"
import { sanitizeMiniAppAnswers } from "../src/answers"
import { formatAnswerForCustomField } from "../src/custom-fields"
import type { MiniAppDefinition } from "../src/types"
import {
  buildUploadPath,
  resolveUploadRules,
  sanitizeFileName,
  sniffMimeType,
  verifyUpload,
} from "../src/uploads"

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (text: string) => new TextEncoder().encode(text)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)
const PDF = ascii("%PDF-1.7\n")

const definition: MiniAppDefinition = {
  screens: [
    {
      key: "s1",
      id: "WELCOME",
      title: "",
      terminal: true,
      children: [
        {
          id: "p",
          type: "PhotoPicker",
          props: {
            name: "photo",
            label: "Photo",
            "max-file-size-kb": 100,
            "max-uploaded-photos": 2,
          },
        },
        {
          id: "d",
          type: "DocumentPicker",
          props: {
            name: "doc",
            label: "Doc",
            "allowed-mime-types": ["application/pdf"],
          },
        },
        {
          id: "t",
          type: "TextInput",
          props: { name: "full_name", label: "Name" },
        },
      ],
    },
  ],
}

describe("sniffMimeType", () => {
  it("identifies files from their first bytes", () => {
    expect(sniffMimeType(JPEG, "application/pdf")).toBe("image/jpeg")
    expect(sniffMimeType(PDF, "image/png")).toBe("application/pdf")
    expect(sniffMimeType(ascii("RIFF\0\0\0\0WEBPVP8 "), "")).toBe("image/webp")
  })

  it("trusts Office and text types only when the bytes agree", () => {
    const zip = bytes(0x50, 0x4b, 0x03, 0x04)
    const docx =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    expect(sniffMimeType(zip, docx)).toBe(docx)
    expect(sniffMimeType(zip, "application/zip")).toBeUndefined()
    expect(sniffMimeType(ascii("a,b\n1,2"), "text/csv")).toBe("text/csv")
    expect(
      sniffMimeType(ascii("<html><script>x</script>"), "text/plain"),
    ).toBeUndefined()
  })

  it("rejects HTML renamed to an image", () => {
    expect(
      sniffMimeType(ascii("<!doctype html><svg/>"), "image/png"),
    ).toBeUndefined()
  })
})

describe("verifyUpload", () => {
  const photo = resolveUploadRules(definition, "photo")
  const doc = resolveUploadRules(definition, "doc")

  it("applies the input's size and count limits", () => {
    expect(photo).toMatchObject({
      isPhoto: true,
      maxBytes: 100 * 1024,
      maxFiles: 2,
    })
    expect(resolveUploadRules(definition, "full_name")).toBeUndefined()
  })

  it("accepts allowed types and rejects the rest", () => {
    if (!(photo && doc)) {
      throw new Error("rules missing")
    }
    expect(
      verifyUpload({
        rules: photo,
        size: 10,
        head: JPEG,
        declaredMimeType: "image/jpeg",
      }),
    ).toEqual({
      ok: true,
      mimeType: "image/jpeg",
    })
    expect(
      verifyUpload({
        rules: photo,
        size: 10,
        head: PDF,
        declaredMimeType: "image/jpeg",
      }),
    ).toEqual({
      ok: false,
      reason: "type_not_allowed",
    })
    expect(
      verifyUpload({
        rules: doc,
        size: 10,
        head: JPEG,
        declaredMimeType: "image/jpeg",
      }),
    ).toEqual({
      ok: false,
      reason: "type_not_allowed",
    })
    expect(
      verifyUpload({
        rules: photo,
        size: 200 * 1024,
        head: JPEG,
        declaredMimeType: "",
      }),
    ).toEqual({
      ok: false,
      reason: "too_large",
    })
    expect(
      verifyUpload({ rules: photo, size: 0, head: JPEG, declaredMimeType: "" }),
    ).toEqual({
      ok: false,
      reason: "empty",
    })
  })
})

describe("file names and paths", () => {
  it("sanitizes names and keeps the extension", () => {
    expect(sanitizeFileName("CMND mặt trước.JPG")).toBe("cmnd-mat-truoc.jpg")
    expect(sanitizeFileName("Đơn đăng ký (1).pdf")).toBe("don-dang-ky-1.pdf")
    expect(sanitizeFileName("###.png")).toBe("file.png")
  })

  it("stores a contact's files in the contact folder, anonymous ones under the Mini App", () => {
    const base = {
      workspaceId: "1",
      miniAppId: "9",
      randomKey: "k",
      fileName: "a.jpg",
    }
    expect(buildUploadPath({ ...base, contactId: "7" })).toBe(
      "public/space/1/contacts/7/mini-apps/k/a.jpg",
    )
    expect(buildUploadPath({ ...base, contactId: null })).toBe(
      "public/space/1/mini-apps/9/anonymous/k/a.jpg",
    )
  })
})

describe("file answers", () => {
  it("accept only upload ids for file inputs", () => {
    const id = "AAAAAAAAAAAAAAAAAAAAAA"
    expect(
      sanitizeMiniAppAnswers(definition, {
        photo: [id],
        doc: ["https://evil.example/x.pdf"],
      }),
    ).toEqual({
      photo: [id],
    })
  })

  it("store public URLs comma-joined in a custom field", () => {
    const file = (url: string) => ({
      uploadId: "x",
      url,
      name: "a",
      mimeType: "image/jpeg",
      size: 1,
    })
    expect(
      formatAnswerForCustomField([
        file("https://a/1.jpg"),
        file("https://a/2.jpg"),
      ]),
    ).toBe("https://a/1.jpg, https://a/2.jpg")
  })
})
