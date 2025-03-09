import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import {
  createPresignedPost,
  type PresignedPostOptions,
} from "@aws-sdk/s3-presigned-post"
import type { Readable } from "node:stream"

class Uploader {
  #client: S3Client
  #bucketName: string

  private static instance: Uploader

  constructor() {
    this.#client = new S3Client({
      endpoint: process.env.AWS_URL ?? "",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
      region: process.env.AWS_DEFAULT_REGION,
      forcePathStyle: true,
    })
    this.#bucketName = process.env.AWS_BUCKET ?? ""
  }

  public static getInstance(): Uploader {
    if (!Uploader.instance) {
      Uploader.instance = new Uploader()
    }
    return Uploader.instance
  }

  async putObject(path: string, body: string | Uint8Array | Buffer | Readable) {
    const command = new PutObjectCommand({
      Bucket: this.#bucketName,
      Key: path,
      ACL: "private",
      Body: body,
    })

    return await this.#client.send(command)
  }

  async putFile(
    newPath: string,
    oldPath: string,
    metadata?: Record<string, string | number>,
  ) {
    await this.#client.fPutObject(this.#bucketName, newPath, oldPath, metadata)
  }

  async getPresignedUpload(path: string, contentType: string) {
    const command: PresignedPostOptions = {
      Bucket: this.#bucketName,
      Key: path,
      Expires: 5 * 60, // 5 minutes
      Conditions: [
        ["content-length-range", 0, 5242880], // 5 MB
        {
          bucket: this.#bucketName,
          acl: "private",
          key: path,
          "Content-Type": contentType,
        },
        // ["starts-with", "$Content-Type", contentType],
      ],
    }
    return await createPresignedPost(this.#client, command)
  }
}

export const uploader = Uploader.getInstance()
