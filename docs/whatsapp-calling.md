# WhatsApp Business Calling

WhatsApp calling in ChatbotX runs entirely over **VoIP (browser WebRTC ↔ Meta
Cloud API)**. There is no self-hosted media server: agents place and answer
calls in the inbox, and Meta records/transcribes server-side.

> This document is the overview; the detailed architecture lives in
> [`whatsapp-calling-voip.md`](./whatsapp-calling-voip.md).

## Transports & modes

- **VoIP (WebRTC)** — the only transport. Inbound calls ring the browser
  inbox; the agent answers with a WebRTC SDP answer (`POST /calls` `accept`).
  Outbound calls are placed from the inbox (`POST /calls` `connect`).
- **Recording / transcription mode** (per number, `IntegrationWhatsapp.callRecordingMode` /
  `callTranscriptionMode`):
  - `metaNative` (default) — Meta records and transcribes on its servers; we
    attach the `recording`/`transcription` opt-in objects on `connect`/`accept`
    (never `pre_accept`). Delivered via the `call_recording_available` /
    `call_transcription_available` webhook events. See Meta's
    [call recording](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-recording)
    and [call transcription](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-transcription) docs.
  - `browserWhisper` — the browser records the call audio (MediaRecorder) and
    it is transcribed with Whisper via a connected OpenAI integration.

## Requirements to actually record/transcribe

Meta only records a call the business handles **through the Cloud API** — i.e.
answered/placed in the inbox (VoIP). A call answered on a phone's WhatsApp app
never reaches our `accept`, so no recording is produced. The number's `calls`
webhook must also be subscribed for the recording/transcription events to
arrive (surfaced as the `webhookNotSubscribed` outbound-call reason).

## TURN / ICE

Browser WebRTC uses STUN plus, in production, a **coturn** TURN relay
(`TURN_URL` / `TURN_STATIC_SECRET`), minted into short-lived per-call
credentials by `voipTurnCredentialService`. Local dev falls back to host/STUN
candidates. The relay itself is deployed from the deployment repo, not from this
repo's compose file.

## Settings

Settings → Channels → WhatsApp → Calls: enable calling, show the call icon,
callback permission requests, record calls, recording retention, transcribe
calls. Enabling calling and the icon calls Meta's calling-settings API; the
recording/transcription toggles are stored locally on `IntegrationWhatsapp`.
