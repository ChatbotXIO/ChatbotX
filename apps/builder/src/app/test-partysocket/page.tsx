"use client"

import usePartySocket from "partysocket/react"

export default function SamplePartysocketPage() {
  const ws = usePartySocket({
    // usePartySocket takes the same arguments as PartySocket.
    host: "http://localhost:1999", // or localhost:1999 in dev
    room: "123",
    party: "conversations",

    // in addition, you can provide socket lifecycle event handlers
    // (equivalent to using ws.addEventListener in an effect hook)
    onOpen() {
      console.log("connected")
      ws.send("hello!1111")
    },
    onMessage(e: WebSocketEventMap["message"]) {
      console.log("message", e.data)
    },
    onClose() {
      console.log("closed")
    },
    onError(e: WebSocketEventMap["error"]) {
      console.log("error", e)
    },
  })

  return <div>socket ne</div>
}
