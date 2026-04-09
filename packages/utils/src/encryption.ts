import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto"
import { promisify } from "node:util"
import { z } from "zod"
import { env } from "./keys"

const encryptedDataSchema = z.object({
  iv: z.string().min(1),
  data: z.string().min(1),
})
export type EncryptedData = z.infer<typeof encryptedDataSchema>

export const encryptUtils = {
  createKey: async () => {
    const password = env.ENCRYPTION_KEY

    return (await promisify(scrypt)(password, "salt", 32)) as Buffer
  },
  encryptText: async (text: string): Promise<EncryptedData> => {
    const iv = randomBytes(16)
    const key = await encryptUtils.createKey()
    const cipher = createCipheriv("aes-256-ctr", key, iv)
    const encryptedText = Buffer.concat([cipher.update(text), cipher.final()])

    return {
      iv: iv.toString("hex"),
      data: encryptedText.toString("hex"),
    }
  },

  decryptText: async (encryptedData: EncryptedData): Promise<string> => {
    const key = await encryptUtils.createKey()
    const decipher = createDecipheriv("aes-256-ctr", key, encryptedData.iv)
    const result = Buffer.concat([
      decipher.update(encryptedData.data, "hex"),
      decipher.final(),
    ])

    return result.toString("utf-8")
  },

  encryptObject: async (object: unknown): Promise<EncryptedData> => {
    const text = JSON.stringify(object)
    return await encryptUtils.encryptText(text)
  },

  decryptObject: async (encryptedData: EncryptedData): Promise<unknown> => {
    const text = await encryptUtils.decryptText(encryptedData)
    return JSON.parse(text)
  },
}
