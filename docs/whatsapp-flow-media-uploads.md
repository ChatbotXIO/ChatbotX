# WhatsApp Flow media uploads

Customers can attach photos and documents inside a WhatsApp Flow (`PhotoPicker` / `DocumentPicker`,
Flow JSON >= 4.0). This covers Flows **without** a data endpoint; Flows with an endpoint
(`data_exchange`, encrypted payloads) are not supported.

## What arrives

`nfm_reply.response_json` carries, per picker, a list of `{ id, file_name, mime_type, sha256 }`, and Meta says to
download it "following the same steps as for regular image and document messages". Meta does not say how long it
keeps these files, so the worker fetches them as soon as the response is received:

1. Reads the media metadata and the file from Meta with the channel's token. The metadata request carries
   `phone_number_id` (the receiving number), so Meta only answers for media uploaded on that number.
2. Checks Meta's limits (10 files and 100 MiB per response, 25 MiB per file) and the type: the list Meta documents
   for DocumentPicker's `allowed-mime-types`, applied to photos as well (Meta lists none for PhotoPicker; that part
   is this app's policy). The `sha256` Meta sends is not checked: its encoding and what it hashes are not documented.
3. Stores it like any inbound media (`getMediaStoragePrefix`, public-read) and returns an `Attachment` row on the
   message (`sourceId` = Meta media id), so inbox, retention and workspace purge treat it as normal media.
4. Records the outcome per file on the message: `contentAttributes.files[<response key>]` is a list of
   `FlowResponseFile` (`packages/sdk/src/lib/shared/flow-response-file.ts`). The raw `flowResponse` is left as Meta sent it.
5. Keeps the reply's `context.id` (the id of the message that sent the Flow, i.e. its `sourceId`) as
   `contextMessageId`, absent when Meta sends none. It is stored only, for later use; nothing reads it yet.

A file that cannot be kept never loses the response: it is recorded as `failed` with a `reason`
(`too_large`, `unsupported_type`, `download_failed`). A media URL lasts 5 minutes, so a 404 on the file is
retried with a fresh URL, as Meta's download steps say. Meta's next step, renewing the access token, is not
automatic: a file still failing then stays `download_failed` (reconnect the number for later ones). Any other Graph
error is not read as "the file is gone" (Meta does not document one), so it is `download_failed` too. Each file is stored under a
key with a random UUID (`crypto.randomUUID()`), so its public link cannot be derived or guessed from the media id,
the name or the time. A redelivery
of the webhook downloads again; the saved message keeps its first attachments (the ones its links point to), and
the redelivery's copy is left unreferenced under the channel prefix.

The files are answers to the form's fields, not something the contact sent: keyword and media automations, the AI
agent's image/document input and `{{last_user_input}}` treat the reply exactly as before, by its text
(`getContactInputAttachments`, `packages/business/src/contact-inbox/input-attachments.ts`).

Only the WhatsApp integration knows Meta's shape (`integrations/whatsapp/src/handlers/message/incoming-flow-media.ts`).
Everything after it (queue jobs, business service, API, inbox) reads the channel-agnostic `FlowResponseFile`,
so another channel with form uploads only has to produce the same value and attachments.

## Saving files to custom fields

A Flow step's (and a template FLOW button's) field mapping can map a file answer to a text custom field.
`fileFormat` chooses what is written: `allUrls` (default, links separated by `, `) or `firstUrl`. The links are
public storage URLs resolved from the message's own attachments when the job is enqueued. If no file was kept,
the field is left as it was.

## Saving other answers to custom fields

Other answers are saved as before (text as is, numbers and booleans as text, a multi-select list as JSON), with
two shapes Meta documents put in the form a field accepts:

- Dates. DatePicker sends `"YYYY-MM-DD"` from Flow JSON 5.0, before that "a string that shows the timestamp in
  milliseconds" (UTC). In a `date` field a timestamp (any whole number: the mapping does not say which
  component answered, and no other answer meant for a date is all digits) becomes the business's (workspace's) local day, as Meta says; in a `datetime` field it is the exact instant, and a `YYYY-MM-DD` becomes local midnight. A text field keeps the value
  as it came.
- Date ranges. CalendarPicker in range mode sends `{ "start-date", "end-date" }`; it is saved (and shown in the
  inbox) as `start - end`, as for Mini Apps.

The field's type is looked up, in one query, only for values it can change (files, whole numbers, a `YYYY-MM-DD`).

## API

`GET /v1/conversations/{conversationId}/messages/{messageId}/flow-response` returns file answers as
`kind: "files"` with one entry per file: `status` is `stored` (with `url`, `size`), `failed` (with
`failureReason`) or `unprocessed` (no stored copy to open: a response received before files were kept, or a kept file
whose stored copy is gone; nothing more will arrive for it). `GET /v1/whatsapp/flows/{flowId}/screens`
marks each output `kind: "file"` or `"value"`.

## Mini Apps

A Mini App published as a WhatsApp Flow may have up to 10 files in total over the pickers a completing screen's
payload references (every screen that can lead to it, branches included, since Meta does not say what an unvisited
screen's reference holds). A picker without a maximum counts as 30, so it must be set to publish. The public web link
keeps its own limit of 30 per input.
