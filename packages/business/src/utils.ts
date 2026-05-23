export * from "./inbox/utils"

export const getPublicFileUrl = (path: string, baseUrl: string) =>
  new URL(path, baseUrl).toString()
