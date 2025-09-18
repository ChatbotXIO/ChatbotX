import type { ZaloConfig } from "@aha.chat/integration-zalo"

export function generateAuthUrl(props: ZaloConfig) {
  const { clientId, redirectUrl, version, stateParams } = props
  const baseUrl = `https://oauth.zaloapp.com/${version}/oa/permission`
  const params = new URLSearchParams({
    app_id: clientId,
    redirect_uri: redirectUrl,
    state: btoa(JSON.stringify(stateParams)),
  })
  return `${baseUrl}?${params.toString()}`
}
