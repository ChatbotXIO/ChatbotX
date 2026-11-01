# SAM 3.1 live captures

Response bodies recorded by ChatbotX from the Meta Model API
(`POST /v1/responses`, model `sam-3.1`, `stream: true`,
`metadata = { include_confidence: "true", mask_encoding: "one_bit" }`) on
2026-11-01 by a local end-to-end script against a real workspace.

Only response bodies are written; the request, its image and the API key are
never recorded. The source image (1920×1280, three red apples and a pear) was
generated with `muse-image-1.0` by the same script.

- `live-success.sse` — target `"apple"`: three objects, finalized by both
  `response.output_text.done` and `response.content_part.done`.
- `live-no-match.sse` — target `"giraffe"`: an empty output-text lane.
- `live-invalid-key.sse` — the JSON body of the 401 for an invalid key.

Mask tokens in these captures are left as returned; the client skips them and
never decodes them.
