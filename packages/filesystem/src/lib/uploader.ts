import type { Readable } from "node:stream"
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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
      endpoint: env.S3_ENDPOINT,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      region: env.S3_REGION,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
    })
    this.#bucketName = env.S3_BUCKET
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
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    })

    return (
      await client.sign(
        new Request(
          `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${filePath}?X-Amz-Expires=${5 * 60}`,
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
      Bucket: env.S3_BUCKET,
      Key: path,
    })

    return await this.#client.send(command)
  }

  async getObject(path: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
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
      Bucket: env.S3_BUCKET,
      Key: path,
    })

    const response = await this.#client.send(command)
    if (!response.Body) {
      throw new Error(`No body found for object: ${path}`)
    }
    return response.Body as Readable
  }

  async copyObject(sourcePath: string, destinationPath: string) {
    const encodedSource = sourcePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")

    const command = new CopyObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: destinationPath,
      CopySource: `${env.S3_BUCKET}/${encodedSource}`,
    })

    return await this.#client.send(command)
  }

  async deleteObject(path: string) {
    const command = new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: path,
    })
    return await this.#client.send(command)
  }

  async listObjects(prefix: string) {
    const command = new ListObjectsV2Command({
      Bucket: env.S3_BUCKET,
      Prefix: prefix,
    })
    const response = await this.#client.send(command)
    return response.Contents ?? []
  }
}

export const uploader = Uploader.getInstance()
