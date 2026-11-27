# Data flow and referral loop

## Data flow in one line

`create/edit minigame (builder) → {{minigame_play_token}} resolved into a shared link at message-send time → public /minigames?minigameId&token page → verify token → resolvePlayState → <type>PlayScreen → playMinigameAction → recordPlayAndDispatch (draw prize, decrement stock, send outcome message)`.

Referral loop: `player taps Share (copies a ref link for the channel they are playing on, e.g. m.me/<pageId>?ref=mg_<minigameId>_<contactId>) → friend taps it, messages that channel → webhook extracts the ref → runRef's minigame-share branch reads playerSettings.sharingNodeId and enqueues sendFlow{flowId,nodeId} → creditSharedLinkReferral creates the invitee's MinigameContact with referrerContactId stamped; only if THAT call created the row does grantReferralBonus credit the referrer (+1 sharesCount, +1 remaining, capped)`.
