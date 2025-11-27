import type { Readable } from "node:stream"
import {
  DeleteObjectCommand,
  GetObjectCommand,
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

  static instance: Uploader

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
  }

  async headObject(path: string) {
    const command = new HeadObjectCommand({
      Bucket: env.AWS_BUCKET,
      Key: path,
    })

    return await this.#client.send(command)
  }

  async getObject(path: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: env.AWS_BUCKET,
      Key: path,
    })

    const response = await this.#client.send(command)

    if (!response.Body) {
      throw new Error(`No body found for object: ${path}`)
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = []
    const stream = response.Body as Readable

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(chunk))
      stream.on("error", reject)
      stream.on("end", () => resolve(Buffer.concat(chunks)))
    })
  }

  async getObjectStream(path: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: env.AWS_BUCKET,
      Key: path,
    })

    const response = await this.#client.send(command)
    if (!response.Body) {
      throw new Error(`No body found for object: ${path}`)
    }
    return response.Body as Readable
  }

  async deleteObject(path: string) {
    const command = new DeleteObjectCommand({
      Bucket: env.AWS_BUCKET,
      Key: path,
    })
    return await this.#client.send(command)
  }
}

export const uploader = Uploader.getInstance()
