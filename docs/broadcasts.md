# Broadcasts — who a broadcast reaches

How a broadcast's audience is built and how to reach contacts by whether they
have ever messaged you. Applies to every channel.

## The audience

By default a broadcast is sent to the contact inboxes on the selected pages
(or channels) that match its contact filter **and already have a direct chat**
with the page. Contacts with no direct chat yet — for example someone who only
commented on a post, or an imported contact — are left out, so a broadcast
opens no new conversations. The recipient count shown while creating it is
this audience; it is also what preparation sends to.

## Targeting by chat history

A condition on the **Last interaction** contact filter chooses the audience by
chat history instead, and then also covers contacts with no direct chat: one
is opened for each of them when the broadcast is prepared, and the message is
sent there. **Last interaction** reads the last time the contact sent the page
a message; comments do not count, and opening a direct chat does not change
it.

| To send to | Filter |
|---|---|
| Contacts who already have a direct chat (default) | No **Last interaction** condition |
| People who have never messaged the page, including those with no direct chat | **Last interaction** → **Has no value** |
| People who have messaged the page before | **Last interaction** → **Has any value** |
| Everyone | Both conditions above, matching **any** of them |

**Last interaction** looks at the contact as a whole: a contact who messaged
you on another channel counts as having messaged.

The channel decides whether a contact who never messaged the page can receive
the message; it may reject it. Those sends show up as **failed** in the
broadcast's statistics, not as delivered — the recipient count is who the
broadcast targets, not who received it.

## Moving a broadcast back to draft

A broadcast can be moved back to draft while it is still being prepared. The
preparation stops, and any recipients it already wrote are cleared in the
background. Until the preparation has stopped and the cleanup is done,
scheduling the draft again is refused with a message to try again shortly;
after that, scheduling goes through.

## Automatic stop when the channel account is blocked

When a **broadcast** message is refused because the channel account itself is
blocked from sending (not one recipient), every `sending` broadcast of that
page is stopped (`cancelled`) and the reason is recorded on the broadcast:
`statusReason` (`accountPolicyBlocked` or `accountSendRestricted`),
`statusErrorMessage` (the provider's text, at most 500 characters) and
`statusInboxId` (the page). The public API returns the three fields; the
builder shows a red line under the status.

- **Which errors:** each channel's error mapper assigns a neutral
  `ChannelError.reason` to the codes its provider documents for an
  account-level send block (Messenger `2022` and `10/1893063`, Instagram
  `100/2534029`, WhatsApp `368` and `131064`, Zalo ZNS `-1351`). The worker,
  the service and the UI read only the reason, so another channel takes part by
  assigning a reason in its own mapper. Codes with two meanings or no documented
  meaning (WhatsApp `131031`, Zalo `-248`, Messenger `368`) are deliberately not
  assigned.
- **Scope:** only a broadcast send triggers it. Sequences, flows and inbox sends
  are not stopped. One blocked page stops the whole broadcast, including a
  multi-page or omnichannel one; a repeating series is paused with the same
  reason (a run's series carries all three fields).
- **Only synchronous errors:** the stop reads the error the channel returns to
  the send call. A failure the provider reports later through a status webhook
  (WhatsApp delivery receipts) does not reach this path and does not stop
  broadcasts.
- **Resume:** resuming or moving the broadcast back to draft clears the reason
  fields. The resume dialog shows a warning (reason, page, provider error) with a
  "continue anyway" button; the public `resume` does not block. If the page is
  still blocked the first message fails and the broadcast stops again.
