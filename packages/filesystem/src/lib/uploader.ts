import type { Readable } from "node:stream"
import { Client } from "minio"

class Uploader {
  #client: Client
  #bucketName: string

  private static instance: Uploader

  constructor() {
    this.#client = new Client({
      endPoint: process.env.AWS_ENDPOINT ?? "",
      useSSL: false,
      port: 9000,
      accessKey: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
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
    newPath: string,
    body: string | Readable | Buffer<ArrayBufferLike>,
    size = 0,
    metadata?: Record<string, string | number>,
  ) {
    await this.#client.putObject(
      this.#bucketName,
      newPath,
      body,
      size,
      metadata,
    )
  }

  async putFile(
    newPath: string,
    oldPath: string,
    metadata?: Record<string, string | number>,
  ) {
    await this.#client.fPutObject(this.#bucketName, newPath, oldPath, metadata)
  }
}

export const uploader = Uploader.getInstance()
