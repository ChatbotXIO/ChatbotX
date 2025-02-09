import type { IAuth } from "@ahachat.ai/sdk"

export const getAccessToken = async (auth: IAuth): Promise<string> => {
  return Promise.resolve(auth.accessToken)
}
