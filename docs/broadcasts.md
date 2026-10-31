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
