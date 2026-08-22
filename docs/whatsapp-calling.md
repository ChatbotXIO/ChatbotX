# WhatsApp Business Calling

ChatbotX supports Meta's WhatsApp Business Calling API end to end: call
logging, calling settings, call-permission management, a "Call on WhatsApp"
flow step, and (beta) in-app calling with recording and transcription.

## Feature map

| Capability | Where | Requires |
|---|---|---|
| Call log + inbox activity messages | automatic once the `calls` webhook field is subscribed | Meta app subscribed to `calls` |
| Calls settings (enable, icon, callback permission) | Settings → WhatsApp → Calls | connected number |
| Call permission requests + grant tracking | inbox composer 📞 button | calling enabled |
| "Call on WhatsApp" flow step (`voice_call` interactive) | flow builder → Send Message (WhatsApp) | calling enabled |
| Call triggers (`incomingCall`, `missedAudioCall`, `callEnded`, `callRecorded`, `callTranscribed`) | Triggers / Webhooks | — |
| System fields `{{last_call_recorded}}`, `{{last_call_transcript}}` | flows/broadcasts | recording/transcription |
| In-app calling (answer in browser), recording, transcription | inbox call dock | LiveKit deployment (below) |

## Meta setup

1. Subscribe the Meta app to the **`calls`** webhook field (App Dashboard →
   WhatsApp → Configuration), alongside `messages`.
2. Enable calling per number in **Settings → WhatsApp → Calls** (requires a
   messaging limit of ≥ 2,000 unique customers/24h on Meta's side).
3. Business-initiated calling is unavailable in some countries (at the time
   of writing: US, Canada, Turkey, Egypt, Vietnam, Nigeria) and is billed by
   Meta per minute in 6-second increments. Customer-initiated calls are free.

## In-app calling (beta) — LiveKit deployment

Architecture: Meta SIP mode → LiveKit SIP ingress → agents join the LiveKit
room from the inbox (browser, audio only). Recording uses LiveKit Egress
(audio-only room composite) uploading straight into the app's S3 bucket;
transcription reuses the OpenAI (Whisper) integration of the workspace.

### Environment

```bash
LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_SIP_DOMAIN=sip.example.com        # TLS on :5061, cert must match
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=ST_...      # optional, business-initiated calls
# S3_* is shared with packages/filesystem — egress writes into the same bucket
```

When these are unset the beta features simply don't render; everything else
in the feature map keeps working.

### LiveKit server configuration

1. Deploy LiveKit server + the SIP service. The SIP service must terminate
   **TLS on port 5061** with a certificate valid for `LIVEKIT_SIP_DOMAIN`
   (Meta requires TLS and does not support mTLS), and support SRTP (DTLS by
   default — matches Meta's `srtp_key_exchange_protocol: DTLS`).
2. Create an **inbound trunk** accepting calls from Meta (`wa.meta.vc`
   presents Meta's certs). Map Meta's correlation header onto a participant
   attribute — this is how ChatbotX links the SIP leg to its call row:

   ```yaml
   headers_to_attributes:
     X-WA-Meta-WACID: wacid
   ```

3. Create a **dispatch rule** (individual rooms) for the inbound trunk.
4. Point LiveKit's **webhooks** at the builder:
   `https://<builder-host>/api/livekit/webhook` (signed with the same API
   key/secret; the route verifies the signature).
5. For business-initiated calls, create an **outbound trunk** towards Meta's
   SIP endpoint (digest auth — retrieve the SIP password via
   `GET /{phone-number-id}/settings?include_sip_credentials=true`) and set
   `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`. Map the same header on the outbound
   trunk so recordings correlate.

### Enabling per number

Settings → WhatsApp → Calls → **In-app calling (beta)**. This POSTs Meta's
calling settings with `sip.status: ENABLED`, `sip.webhook_delivery: ENABLED`
(so the call log keeps working — SIP mode silences the `calls` webhooks by
default) and the platform's SIP hostname. **Record calls** toggles automatic
egress recording per number (stored on `IntegrationWhatsapp.callRecordingEnabled`).

### Call lifecycle (inbound)

1. Meta `calls` webhook `connect` → `WhatsappCall` row + `incomingCall`
   trigger event (existing pipeline, works with or without LiveKit).
2. Meta sends the SIP INVITE to LiveKit → SIP participant joins a room →
   LiveKit webhook `participant_joined` → the room is stamped on the call
   row, recording egress starts (if enabled), and a `whatsappCallRinging`
   realtime event shows the incoming-call dock in the inbox.
3. An agent answers: the builder issues a scoped LiveKit token and the
   browser joins the room (mic + remote audio).
4. Hang up (either side) → room closes → `room_finished` dismisses the dock;
   Meta's `terminate` webhook finalizes the call row and activity message.
5. `egress_ended` → worker stamps `recordingPath`, drops an audio message
   into the conversation, fires `callRecorded`, and chains transcription
   (`callTranscribed`) through the workspace's OpenAI integration.

## Local development

Meta's SIP leg cannot reach a laptop (it requires a public hostname with a
valid TLS cert on :5061), so local dev covers everything **except** the real
Meta audio leg: room lifecycle, the LiveKit webhook route, the incoming-call
dock, browser audio, recording egress into local RustFS, the worker
pipeline, and transcription. The caller is simulated with the `lk` CLI.

### 1. Start the stack

```bash
docker compose up -d    # shared infra + livekit + egress (default)
```

Make sure your `.env` carries the LiveKit block from `.env.example` — dev
credentials `devkey` / `devsecret_devsecret_devsecret_dev` match
`docker/livekit/livekit.yaml`, and `LIVEKIT_EGRESS_S3_ENDPOINT` must be
`http://filesystem:9000` (the egress container cannot resolve `localhost`).
Restart `pnpm dev` so the builder/worker pick the env up. LiveKit's webhooks
are preconfigured to `http://host.docker.internal:3123/api/livekit/webhook`.

### 2. Simulate an incoming call

The pipeline is driven by two events that are easy to fake locally:

1. **Meta's `connect` webhook** creates the `WhatsappCall` row. With any
   connected WhatsApp integration in your dev workspace, POST a synthetic
   payload to its webhook (the dev middleware does not verify HMAC):

   ```bash
   curl -X POST http://localhost:3123/integrations/whatsapp/webhook \
     -H 'Content-Type: application/json' \
     -d '{"object":"whatsapp_business_account","entry":[{"id":"<WABA_ID>","changes":[{"field":"calls","value":{"metadata":{"phone_number_id":"<PHONE_NUMBER_ID>"},"contacts":[{"wa_id":"<CUSTOMER_PHONE>","profile":{"name":"Local Test"}}],"calls":[{"id":"wacid.LOCALTEST1","from":"<CUSTOMER_PHONE>","to":"<BUSINESS_PHONE>","event":"connect","direction":"USER_INITIATED","timestamp":"'$(date +%s)'"}]}}]}]}'
   ```

2. **The SIP participant joining a room** triggers the ringing dock. Join as
   a fake caller carrying the correlation attribute
   ([`lk` CLI](https://github.com/livekit/livekit-cli)):

   ```bash
   lk room join --url ws://localhost:7880 \
     --api-key devkey --api-secret devsecret_devsecret_devsecret_dev \
     --identity fake-caller --attribute wacid=wacid.LOCALTEST1 \
     --publish-mic local-test-call
   ```

The inbox now shows the incoming-call dock; answering joins the same room
and you talk to your own microphone loop. With **Record calls** enabled on
the number, hanging up produces the egress file in RustFS, the audio message
in the conversation, and (with an OpenAI integration) the transcript.

To close the loop, fire the matching `terminate` webhook (same curl with
`"event":"terminate","status":"COMPLETED","duration":30`).

## Notes & limitations (beta)

- Transcription requires an OpenAI integration on the workspace; without it
  the recording is still saved and playable.
- Outbound (business-initiated) calls require a granted, unexpired call
  permission from the contact (see the permission request composer action).
- The 20-second no-audio and 30-second silence auto-termination behaviors
  (and their billing implications) are Meta-side and apply unchanged.
