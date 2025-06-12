import type { PresignedPost } from "@aws-sdk/s3-presigned-post"
import ky from "ky"

export type FileWithPreview = File & {
  preview: string
}

export async function browserUpload(
  file: File,
  handleUploadUrl: string,
): Promise<string> {
  const formJSON = await ky
    .post<PresignedPost>(handleUploadUrl, {
      json: {
        name: file.name,
        mimeType: file.type,
      },
    })
    .json()

  const formData = new FormData()
  formData.append("file", file)
  formData.append("name", file.name)
  for (const key in formJSON.fields) {
    formData.append(key, formJSON.fields[key] as string)
  }

  await ky.post(formJSON.url, {
    body: formData,
  })

  return formJSON.fields.key ?? ""
}
