import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3"
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

  async putObject(
    path: string,
    body: string | Uint8Array | Buffer | Readable,
    options?: Partial<PutObjectCommandInput>,
  ) {
    const command = new PutObjectCommand({
      Bucket: this.#bucketName,
      Key: path,
      Body: body,
      ...options,
    })

    return await this.#client.send(command)
  }

  async getPresignedUpload(path: string, fileName: string, fileType: string) {
    const command: PresignedPostOptions = {
      Bucket: this.#bucketName,
      Key: path,
      Expires: 5 * 60, // 5 minutes
      Conditions: [
        // ['starts-with', '$Content-Type', 'image/'], // Only allow image files
        ["content-length-range", 1024, 5242880], // 1KB to 5MB file size
      ],
      Fields: {
        "Content-Type": fileType, // MIME type of the file
        "x-amz-meta-uploaded-by": "web-app",
        "x-amz-meta-original-filename": fileName,
      },
    }
    return await createPresignedPost(this.#client, command)
  }
}

export const uploader = Uploader.getInstance()
