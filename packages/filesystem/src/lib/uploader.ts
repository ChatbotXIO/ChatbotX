import type { Readable } from "node:stream"
import {
  HeadObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3"
import { AwsClient } from "aws4fetch"
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

  async getPresignedUpload(filePath: string): Promise<string> {
    const client = new AwsClient({
      service: "s3",
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
    })

    return (
      await client.sign(
        new Request(
          `${env.AWS_URL}/${env.AWS_BUCKET}/${filePath}?X-Amz-Expires=${5 * 60}`,
          {
            method: "PUT",
          },
        ),
        {
          aws: { signQuery: true },
        },
      )
    ).url.toString()
    // return await getSignedUrl(
    //   this.#client,
    //   new PutObjectCommand({
    //     Bucket: this.#bucketName,
    //     Key: filePath,
    //     ACL: "public-read",
    //     ContentType: contentType,
    //     ContentLength: maxSize,
    //     Metadata: {
    //       name: fileName,
    //     },
    //   }),
    //   {
    //     expiresIn: 5 * 60,
    //   },
    // )
    // const command: PresignedPostOptions = {
    //   Bucket: this.#bucketName,
    //   Key: filePath,
    //   Expires: 5 * 60, // 5 minutes
    //   Conditions: [
    //     // ['starts-with', '$Content-Type', 'image/'], // Only allow image files
    //     ["content-length-range", 1024, maxSize], // 1KB to 5MB file size
    //   ],
    //   Fields: {
    //     "Content-Type": contentType, // MIME type of the file
    //     "x-amz-meta-uploaded-by": "web-app",
    //     "x-amz-meta-original-filename": fileName,
    //   },
    // }
    // return await generatePresign(this.#client, command)
  }

  async headObject(path: string) {
    const command = new HeadObjectCommand({
      Bucket: env.AWS_BUCKET,
      Key: path,
    })

    return await this.#client.send(command)
  }
}

export const uploader = Uploader.getInstance()
