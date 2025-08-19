import type { Readable } from "node:stream"
import {
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3"
import {
  createPresignedPost,
  type PresignedPostOptions,
} from "@aws-sdk/s3-presigned-post"
import { keys } from "../keys"

const env = keys()

class Uploader {
  readonly #client: S3Client
  readonly #bucketName: string

  private static instance: Uploader

  constructor() {
    this.#client = new S3Client({
      endpoint: env.AWS_URL,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
      region: env.AWS_REGION,
      forcePathStyle: Boolean(env.AWS_URL),
    })
    this.#bucketName = env.AWS_BUCKET
  }

  static getInstance(): Uploader {
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
        ["content-length-range", 1024, 5_242_880], // 1KB to 5MB file size
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
