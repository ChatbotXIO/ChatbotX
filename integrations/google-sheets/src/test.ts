// getToken({
//   clientId: "647565337038-ddbsp6qohk5s4l2cdfpl50p2g1mnr14h.apps.googleusercontent.com",
//   clientSecret: "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",
//   redirectUri: "http://localhost:3000/api/integrations/callback/google"
// }, "4/0ASVgi3I5-QXPUJ9tWdHvaxTG2i6MnNAg7NWU5qpTfeyv9UmlZ75kuPc95du-wwjyDDP8GA").then(console.log)

import { google } from "googleapis"
import { getClient } from "./client"

// console.log(generateAuthUrl({
//   clientId: "647565337038-ddbsp6qohk5s4l2cdfpl50p2g1mnr14h.apps.googleusercontent.com",
//   clientSecret: "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",
//   redirectUri: "http://localhost:3000/api/integrations/callback/google"
// }))

const client = getClient({
  clientId:
    "647565337038-ddbsp6qohk5s4l2cdfpl50p2g1mnr14h.apps.googleusercontent.com",
  clientSecret: "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",
  redirectUri: "http://localhost:3000/api/integrations/callback/google",
})

client.setCredentials({
  access_token:
    "ya29.a0AXeO80SKs2SjYn9bgyuCDQhjbNLVCAJ6AbiAwy-oqhbFd0eXg2qxNdEU-Fev3_AROrQv5igsFocXbXoahbtoo5M1MwpaXfTB-ByhptQZQGTxXrqqUG250bXmTrthLbKAgQbMgzBvexMzKkinIe49T8WAq9XbP-MSvqIpaybyaCgYKAYMSARMSFQHGX2MiTCvmDHKUDzChSAwayWVnGA0175",
})

const sheets = google.sheets({
  auth: client,
  version: "v4",
})
