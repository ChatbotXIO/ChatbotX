import type { ObjectCannedACL } from "@aws-sdk/client-s3"
import { createId } from "@paralleldrive/cuid2"
import { getImageDimensions, pathJoin } from "./helper"
import type { UploadedFile } from "./schema"
import { uploader } from "./uploader"

export async function uploadFile(
  file: File,
  path: string,
  acl = "public-read",
): Promise<UploadedFile> {
  const buffer = (await file.arrayBuffer()) as unknown as Buffer
  await uploader.putObject(path, buffer, {
    ACL: acl as ObjectCannedACL,
    ContentLength: file.size,
    ContentType: file.type,
  })

  const imageDimensions = await getImageDimensions(file.type, buffer)

  return {
    name: file.name,
    originPath: path,
    size: file.size,
    ...imageDimensions,
  }
}

export async function uploadMultipleFiles(
  files: File[],
  prefix: string,
  acl = "public-read",
): Promise<UploadedFile[]> {
  return await Promise.all(
    files.map((file) => uploadFile(file, pathJoin(prefix, createId()), acl)),
  )
}
