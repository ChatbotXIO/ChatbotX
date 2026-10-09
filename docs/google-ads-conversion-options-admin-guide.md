# Google Ads conversions: dedup, conversion time and consent (admin guide)

For workspace admins who send conversions to Google Ads from a flow step or trigger
action. It explains the options on the **Send Google Ads conversion** step and the
**Conversion data consent** section of Settings → Integrations → Google Ads. How it
works internally: `docs/google-ads-conversion-tracking.md`.

## 1. What "Avoid duplicate conversions" does

Retries, duplicate webhooks and flow reruns can run a step more than once. ChatbotX
gives every conversion a stable identity, so repeats of the same thing are counted
once, and a different thing is counted separately. You choose what "the same thing"
means:

- **Once per ad click:** one conversion per conversion action for each ad click.
- **Once per order or event ID:** one conversion per distinct ID you supply, for each
  conversion action.
- **Every time it runs:** a new conversion each time the step or trigger action runs,
  even for the same ad click. A retry of the same run is still counted once.

Identity is per conversion action, so the same click can still produce one "Qualified
lead" and one "Purchase".

## 2. Choose "Once per ad click" for leads, sign-ups and bookings

Use it when the conversion can only meaningfully happen once for a click: submitting
a lead form, signing up, booking an appointment. Repeats from the same click are not
counted. This is the default when you pick a lead-type conversion action.

If one click can genuinely produce several leads (for example several form
submissions), switch that action to "Once per order or event ID" and give each lead
its own ID. Each different ID then counts as a new lead from the same click.

## 2b. Choose "Every time it runs" when each run is its own conversion

Use it when you do not have an order or event ID and every run should count, for
example a step placed after a "Qualified" tag that can be applied again. ChatbotX
identifies the run itself, so it needs no ID field. Two things to know:

- Each run counts once, even if ChatbotX retries it. A loop that comes back to the step,
  or a flow that starts again, counts as a new run.
- If the conversion action is set to count "One" conversion per click in Google Ads,
  Google keeps only the first conversion of a click whatever ChatbotX sends.

## 3. Choose "Once per order or event ID" for purchases and repeatable events

Use it for purchases and anything that can happen more than once from the same click.
The default for non-lead actions.

A good ID is:

- **stable across retries and reruns** (the same purchase always produces the same ID);
- **unique per purchase or event** (two different purchases never share it);
- **64 characters or fewer.**

Examples: the order number, the CRM deal id, a payment id. If your chat sales have no
order number, combine the contact with a field you set once per sale, for example
`{{user_id}}-{{order_number}}`, where `order_number` is a contact field the agent or
flow sets for each sale.

Never use:

- the current time, or any value that changes every time the step runs;
- random values;
- anything that is empty for some contacts.

Using the same ID again is how you tell ChatbotX "this is the same purchase": it is
counted once, even from a different step, trigger or rerun.

## 4. Funnels: one conversion action per stage

Create one conversion action per stage in Google Ads (for example Submit lead form,
Qualified lead, Purchase). Send each stage with its own step. A click then produces at
most one conversion per stage, and the stages never collide. Typical setup: lead and
qualified stages "Once per ad click", purchase "Once per order or event ID".

## 5. Imports and back-dating with Conversion time

By default the conversion time is the moment the step runs. To record when something
really happened (a CRM close date, an import), open **Additional options** and fill
**Conversion time** with a date and timezone, for example `2026-10-08T14:30:00+07:00`
(templates such as `{{deal_closed_at}}` are fine). It cannot be in the future. The
event history marks these rows with "Provided time".

Things to know:

- The conversion time **never changes identity**. Re-importing the same deal with the
  same ID is still one conversion, whatever time you give it.
- Give each order **its own time.** Google drops a second conversion with the same
  click and the same time, so two orders from one click with an identical timestamp (for example every
  order at `T00:00:00`) can collapse into one. With the Data Manager upload method the
  second shows as Processed in the history (ChatbotX keeps an internal
  `duplicateRecovery` flag for diagnostics but does not display it). With the legacy
  upload method Google answers the first attempt with a duplicate error, so the second
  shows as Failed at the delivery stage; only a replay of an event that was already
  sent is finished as Processed.
- Google, not ChatbotX, decides whether a conversion is too old. ChatbotX only skips
  an upload when the click is older than 90 days when it would be sent, or the
  conversion is later than the action's click-through window allows after the click.
  Back-dated conversions Google refuses show as failed with Google's reason.
- A conversion time before the click is rejected by Google.

## 6. What happens when the ID is missing

In "Once per order or event ID" mode, an ID that is empty, still shows `{{...}}` after
the contact's data is filled in, or is longer than 64 characters stops the step:
nothing is sent and nothing is recorded. A flow step writes the failure to **Error Log** and also follows its error branch;
a trigger action only writes to **Error Log** (Google Ads, with the reason in plain
language and the values that were resolved). ChatbotX never invents an ID in its place, so fix
the field or the contact data and run it again.

## 7. Consent settings

Settings → Integrations → Google Ads → **Conversion data consent** tells Google whether
your contacts agreed to share their data for advertising. It applies to every
conversion this workspace sends, and stays saved if you disconnect and reconnect.
Each setting (**Ad user data** and **Ad personalization**) can be:

- **Not provided** (default): ChatbotX leaves the field out, so Google applies the
  default consent setting of your Google Ads account or data connection. If that
  default is "not consented", Google will not record the conversions.
- **Always granted:** every conversion says the contact agreed. Only use it if you
  collect consent before the chat; it is your statement, not ChatbotX's.
- **Always denied:** every conversion says the contact did not agree. Google does not
  record conversions whose ad user data consent is denied.
- **From a contact field:** read per contact. The field must hold `granted` or
  `denied` (any case). An empty field is not sent; any other value fails the step so
  you notice bad data. This source cannot be tried with "Validate request".

Why "denied" conversions are not recorded: Google requires ad user data consent to use
a conversion for ads. A denied (or defaulted-to-denied) value makes Google reject it.

Each conversion keeps the consent it was sent with. Changing the setting only affects
later conversions; the history's **Consent snapshot** column shows what each one carried.

## 8. Reading the dashboard

Dashboard → Ads → **Google Ads** (super admins) shows the conversions ChatbotX sent, with a
date range, channel and conversion action filter. It appears once the workspace has
connected Google Ads or has any conversion history, and Settings → Integrations → Google
Ads links to it ("View statistics").

- **Confirmed**: Google confirmed it recorded the conversion.
- **Awaiting Google**: sent, and Google has not finished processing it. This is not a
  success yet; it becomes Confirmed or Failed when Google answers.
- **Queued**: waiting to be sent.
- **Failed**: Google did not accept or process it. Open the event history on the settings
  page for the reason, the stage it failed at and Retry; the Error Log also records
  delivery and processing failures (not timeouts or long deferrals).
- **Skipped**: not sent, because no ready account was connected or the conversion was too
  old.
- **Delivery rate**: Confirmed ÷ (Confirmed + Failed). Queued, Awaiting and Skipped are
  left out because their outcome is not final, so the tile shows "—" until something is
  confirmed or failed.
- **Confirmed value** is listed per currency and never added across currencies.

A conversion is counted on the day it **happened** (its Conversion time), not the day it
was recorded. A deal you import today with last week's close date therefore appears last
week, and is not in a "today" view. Google Ads' own "Conversions" columns follow the click
date; compare with its "by conv. time" columns. The event history on the settings page
lists every event regardless of the date.

## 9. Legacy upload method differences

If your connection uses Google's legacy upload API (not the recommended Data Manager):

- **Ad personalization is not sent.** Google's legacy API only accepts ad user data
  consent. Your choice is saved and shown as "Not supported (legacy upload)" in the
  history, but Google does not receive it until the workspace is reconnected with
  Data Manager.
- **Google never receives your ID as-is, with either method.** Data Manager gets a
  hashed derivative (`gads-v2-{action id}-i-{hash}`); the legacy method hashes that
  again into its own order identifier. Dedup works the same way.
- Results are final immediately (no later "Google is processing" step).

## 10. Customer matching (optional)

"Customer matching" lets Google match a conversion to a person, using the contact's e-mail
and phone number. It is **off** until you fill the two inputs under **Customer matching**:

- Each input takes **one variable**, for example `{{email}}` and `{{phone}}`, or a custom
  field of the contact. Use the variable picker like in Value.
- A fixed address or number is refused, and so is text around the variable.

Rules to know:

- It is sent **only when Ad user data consent is granted** (Conversion data consent: "Always
  granted", or a contact field that says `granted`). With "Not provided" or "denied" nothing
  is sent, and the history shows "Withheld (no consent)".
- Values are hashed on ChatbotX's servers before they leave. Phone numbers need the country
  code (`+84...`, or the digits `84...` as WhatsApp stores them).
  A number written without `+` is read as if it began with its country code (this is how
  WhatsApp stores it), so a national number such as `3612345678` in a custom field would be
  read as another country's number: store custom-field phones with the `+`.
- It works with the **Data Manager API** only. On a legacy connection the section says so
  and the history shows "Not sent (legacy)".
- The value is read from the contact **at the moment of sending**: if you edit or delete the
  contact before a retry, the retry carries the new value, or none (the conversion is still
  sent by click). The history says "Configured": it does not record whether a value was
  found at that moment.
- Turning it on does not change how duplicates are avoided.

## 11. Customer type and value (optional)

Right below Value and Currency you can tell Google what kind of customer converted:

- **Customer type**: `NEW` or `RETURNING`.
- **Customer value**: `LOW`, `MEDIUM` or `HIGH`.

Type a fixed value or a variable (for example a custom field that holds `RETURNING`). Blank,
or a variable that has no value for the contact, simply sends nothing. A value that is not
one of the list (for example `VIP`) stops the conversion from being recorded and shows
`google_ads_invalid_customer_property` in the Error Log with the value it received (a value that looks like personal data is hidden).

Like customer matching, they are sent **only when Ad user data consent is granted** and only
with the **Data Manager API**; the history's **Properties** column shows what was sent, or
"Withheld (no consent)" / "Not sent (legacy)".
