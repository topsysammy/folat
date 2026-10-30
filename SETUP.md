# Savings Bot — Setup Guide

This guide takes you from nothing to a working bot. You don't need any backend experience. Copy the commands exactly. Wherever you see `<like-this>`, replace it, including the `< >`, with your own value.

Expect about 1–2 hours, most of it spent clicking through Meta's screens.

---

## 0. What you need

- A Mac with Terminal. These steps also work on Windows or Linux with small changes.
- A free **Supabase** account: https://supabase.com
- A free **Meta for Developers** account: https://developers.facebook.com. Log in with a Facebook account.
- Your mum's WhatsApp number. This is the **admin**, the only person the bot talks to.
- Later: a **spare SIM or line** to be the bot's number. Use Meta's free test number until then.

Install the Supabase command-line tool:

```bash
brew install supabase/tap/supabase
supabase --version
```

Optional: Deno, which runs the automated tests (`brew install deno`, then `deno task test`).

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and click **New project**.
2. Name it `savings-bot`. Pick a strong database password and save it in your password manager.
3. Region: choose **West EU (London)** or the closest one offered.
4. Plan: **Free**.
5. When it's ready, open **Project Settings → General** and copy the **Reference ID**. It looks like `abcdxyzqwerty`.

## 2. Create the database tables

In Terminal, inside this project folder:

```bash
supabase login
supabase link --project-ref <your-reference-id>
supabase db push
```

`db push` runs `supabase/migrations/20261028000000_init.sql`. It creates every table and locks them so only the bot can read them.

## 3. Fill in the settings

In the Supabase dashboard, open **SQL Editor → New query**, paste this, change the two values, and click **Run**:

```sql
update settings
set admin_phone       = '2348012345678',  -- your mum's number: 234 + number without the first 0
    distribution_date = '2026-12-20'      -- the real December distribution date
where id = 1;
```

You can change other values any time in **Table Editor → settings**:

| Column | Default | Meaning |
|---|---|---|
| `target` | 150000 | Savings target per customer (₦) |
| `daily_amount` / `weekly_amount` / `monthly_amount` | 500 / 3500 / 15000 | Plan amounts (₦) |
| `distribution_date` | 2026-12-20 | Used for "on track for December" |
| `admin_phone` | — | The only number the bot replies to |
| `customers_enabled` | false | Phase 2 switch. **Leave it false.** |

## 4. Create the Meta app and WhatsApp

1. Go to https://developers.facebook.com/apps and click **Create app**.
2. Use case: **Connect with customers through WhatsApp**. When asked, create or select a **Business portfolio**; your mum's business name is fine.
3. In the app, open **WhatsApp → API Setup**. You'll see:
   - a free **test phone number**,
   - its **Phone number ID**. Copy it.
4. Under **To**, click **Manage phone number list** and add **your mum's number**. She'll get a code on WhatsApp to confirm. The test number can only talk to numbers on this list.
5. Open **App settings → Basic** and copy the **App secret** (click *Show*).

## 5. Make a permanent access token

The token on the API Setup page expires after 24 hours. Make one that doesn't:

1. Go to https://business.facebook.com/settings and open **Users → System users**.
2. Click **Add**, name it `savings-bot`, and choose role **Admin**.
3. Click **Assign assets**:
   - **Apps**: pick your app and turn on **Full control**.
   - **WhatsApp accounts**: pick your WhatsApp account and turn on **Full control**.
4. Click **Generate new token**. Choose your app, set expiry to **Never**, tick
   `whatsapp_business_messaging` and `whatsapp_business_management`, then click **Generate**.
5. Copy the token now. Meta won't show it again.

## 6. Choose a verify token

This is a password you make up. Meta uses it once to confirm the webhook is yours. Generate one:

```bash
openssl rand -hex 16
```

## 7. Save the secrets in Supabase

Secrets live in Supabase, never in the code:

```bash
supabase secrets set \
  WHATSAPP_TOKEN=<permanent-token-from-step-5> \
  PHONE_NUMBER_ID=<phone-number-id-from-step-4> \
  VERIFY_TOKEN=<random-string-from-step-6> \
  APP_SECRET=<app-secret-from-step-4> \
  ADMIN_PHONE=2348012345678
```

`ADMIN_PHONE` must be the **same number** you put in `settings.admin_phone`. The bot only replies when both match.

## 8. Deploy the bot

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt --use-api
```

Your webhook URL is:

```
https://<your-reference-id>.supabase.co/functions/v1/whatsapp-webhook
```

`--no-verify-jwt` is required because Meta can't send a Supabase login token. Every request is checked against Meta's signature (`APP_SECRET`) instead, and anything unsigned is rejected.

## 9. Connect the webhook in Meta

1. In your Meta app, open **WhatsApp → Configuration**.
2. Under **Webhook**, click **Edit**:
   - **Callback URL**: the URL from step 8
   - **Verify token**: the string from step 6
   - Click **Verify and save**. If it fails, see Troubleshooting.
3. Under **Webhook fields**, click **Manage** and **Subscribe** to **messages**. Only `messages` is needed.

## 10. First-run checklist

On your mum's phone, send each message to the bot's number and check the reply.

- [ ] `help` → the list of commands
- [ ] `add Test Person weekly 08012345678` → "Add Test Person …? Reply YES or NO" → `yes` → "Saved ✅"
- [ ] `paid test 3500` → "Log ₦3,500 for Test Person (weekly)? …" → `yes` → "Saved ✅ Test Person has paid ₦3,500 …"
- [ ] `test` → the balance card
- [ ] `undo` → "Undo ₦3,500 for Test Person (…)?" → `yes` → "Undone ✅ … has now paid ₦0."
- [ ] `export` → a CSV file arrives in the chat
- [ ] `report` → shows "Free replies used this month: N of 950"
- [ ] `remove test` → `yes` to remove the test customer
- [ ] From **a different phone**, send `help`. It must get **no reply**.

In Supabase **Table Editor** you should now see rows in `customers`, `payments` (one +3500 and one −3500), `bot_log` and `usage`.

## 11. Move to the real bot number (week 2)

1. Get the spare SIM. If WhatsApp is installed on that number, **delete that WhatsApp account** first: WhatsApp → Settings → Account → Delete account. A number can't be on the WhatsApp app and the Cloud API at the same time.
2. In **WhatsApp → API Setup**, click **Add phone number**. Enter the business display name and verify by SMS or voice call.
3. Register the number with the Cloud API. In Terminal, pick any 6-digit PIN and keep it safe:

   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/<NEW_PHONE_NUMBER_ID>/register" \
     -H "Authorization: Bearer <permanent-token>" \
     -H "Content-Type: application/json" \
     -d '{"messaging_product":"whatsapp","pin":"<6-digit-pin>"}'
   ```

4. Point the bot at the new number:

   ```bash
   supabase secrets set PHONE_NUMBER_ID=<NEW_PHONE_NUMBER_ID>
   supabase functions deploy whatsapp-webhook --no-verify-jwt --use-api
   ```

5. **Publish the app.** In the app dashboard, switch it from Development to **Live** so real messages reach the webhook. Meta asks for a **privacy policy URL**. A free public Google Doc that says what you store (names, phone numbers, plans, payments, used only for this savings scheme) is enough.
6. Meta may ask you to add a **payment method** to the WhatsApp account. This costs nothing on its own; see "How this stays free".
7. Run the first-run checklist again on the real number.

Then your mum enters every customer (`add … from <start date>`) and every past payment (`paid … on <date>`), and checks each total against her notebook before relying on the bot.

---

## How this stays free

| Thing | Cost | Why |
|---|---|---|
| Supabase database + Edge Function | ₦0 | Free tier. The bot uses a tiny fraction of it. |
| WhatsApp replies to your mum | ₦0 | Meta gives each number **1,000 free service replies a month**. The bot stops at **950**. |
| Reminders to customers | ₦0 | `owing` gives wa.me links. Your mum taps them and sends from **her own WhatsApp**, so it's not a business message. |
| Bot's number | One SIM | Or nothing, if you use a spare line. |

The code enforces the rules:

1. **No template messages.** Templates are always billed. The bot has no code that can send one (see `whatsapp.ts`).
2. **Replies only.** The bot only replies to a message your mum just sent. It never messages first.
3. **One reply per message.** Never two.
4. **One send gate** (`sendGate.ts`). Every message passes through it. It refuses to send if:
   - your mum hasn't messaged in the last 24 hours, or
   - 950 replies have already been sent this month (Lagos time).
   It counts each reply **before** sending, so a crash can never push the count over the limit.
5. **Warnings.** From reply 700, every reply ends with "⚠️ 7xx of 950 free replies used this month". Reply 950 says it's the last one until the 1st. `report` always shows the count.
6. **Nobody else gets replies.** Messages from any other number are ignored and not stored.

Typical use is 10–30 commands a day, which is 300–900 replies a month. If she reaches 950, the bot goes quiet until the 1st. Nothing is lost: she can keep notes and enter them with `paid … on <date>` when it's back.

**Supabase pausing.** Free projects pause after about a week with **no** activity. Daily use prevents that. Run `report` at least weekly. If it does pause, open the dashboard and click **Restore project**.

---

## Weekly habit

Send `export` once a week and save the CSV (forward it to yourself or keep it in Google Drive). It's the backup.

---

## Troubleshooting

**"Verify and save" fails in Meta**
- The `VERIFY_TOKEN` secret must match what you typed, exactly.
- The function must have been deployed with `--no-verify-jwt`.
- Test it yourself. This should print `ok123`:
  `curl "https://<ref>.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=ok123"`

**Your mum gets no reply**
1. Supabase dashboard → **Edge Functions → whatsapp-webhook → Logs**.
   - `Invalid signature` → `APP_SECRET` is wrong.
   - `Missing secret …` → set that secret (step 7).
   - `reply not sent: window_closed / limit / not_admin` → the send gate blocked it. `not_admin` means the numbers don't match.
   - `WhatsApp send failed: 401` → the token is wrong or expired. Redo step 5.
2. `ADMIN_PHONE` and `settings.admin_phone` must both be `234…` plus 10 digits, with no `+`, spaces or leading 0.
3. On the test number, her number must be on the **Manage phone number list** (step 4).
4. In Meta, **Webhook fields → messages** must be subscribed.

**"Something went wrong, nothing was saved"**
Nothing was written. Check the function logs for the error, then send the command again.

**Changing plan amounts or the target**
Edit the `settings` row (step 3). Changes apply straight away. A customer's "expected so far" uses their current plan for their whole history.

---

## For developers

```bash
deno task test     # unit + conversation tests (in-memory DB, fake WhatsApp)
deno task check    # type-check
```

- `supabase/migrations/…_init.sql`: tables, RLS, `apply_action` (all writes, atomic) and `reserve_reply` (the budget counter)
- `supabase/functions/whatsapp-webhook/index.ts`: entry point
- `supabase/functions/_shared/webhook.ts`: signature, admin check, duplicate guard, then router, then send gate
- `supabase/functions/_shared/sendGate.ts`: the only path to Meta
- `supabase/functions/_shared/admin/`: commands
- `supabase/functions/_shared/customer/`: Phase 2 stub (not built)
