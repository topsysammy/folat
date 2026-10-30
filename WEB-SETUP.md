# Folat Savings web app: setup

The web app uses the same Supabase database as the WhatsApp bot. Nothing already saved is lost.
Only the account `folashasamuel150@gmail.com` can sign in and see the records.

## 1. Update the database

In the VS Code terminal, inside the project folder, run:

```bash
npx supabase db push
```

This runs `supabase/migrations/20261030000000_web_app.sql`. It lets that one signed-in account read and write the records, and adds the "undo payment" action.

## 2. Create the login

1. In the Supabase dashboard, open **Authentication → Users → Add user → Create new user**.
2. Fill in:
   - **Email:** `folashasamuel150@gmail.com`
   - **Password:** choose one and keep it safe
   - Tick **Auto Confirm User**.
3. Click **Create user**.
4. Open **Authentication → Sign In / Providers**.
5. Turn **off** "Allow new users to sign up" and click **Save**.

## 3. Add the public key

1. Open **Project Settings → API Keys** and copy the **anon public** key (it starts with `eyJ`) or the **Publishable key** (it starts with `sb_publishable_`). This key is public: it ends up inside the website anyway. The database rules are what keep the data private.
2. In the `web/` folder, copy `.env.example` to a new file called `.env`.
3. In `web/.env`, replace `paste-the-publishable-or-anon-key-here` with the key you copied.

## 4. Build

```bash
cd web
npm install
npm run build
```

The finished website is now in `web/dist`.

## 5. Put it online (free)

1. Go to https://app.netlify.com/drop and sign up for free. Without an account, the site is deleted after an hour.
2. Drag the **`web/dist`** folder onto the page.
3. Netlify gives you a link, such as `https://something.netlify.app`. Under **Site configuration → Change site name** you can rename it, e.g. `folat-savings`.

To publish changes later, run `npm run build` again, then go to **Deploys** and drag the new `dist` folder onto the page.

## 6. On your mum's phone

1. Open the link and sign in.
2. Add it to the home screen:
   - **iPhone (Safari):** Share → **Add to Home Screen**
   - **Android (Chrome):** ⋮ → **Add to Home screen** (or **Install app**)

It then opens like an app and stays signed in.

## Weekly habit

Once a week, open **Report → Export CSV** and keep the file somewhere safe (Google Drive, or email it to yourself).

## For developers

```bash
cd web
npm run dev     # local preview at http://localhost:5173
npm run check   # type-check
```

- Money, "behind by", "on track" and the CSV export come from `supabase/functions/_shared/`, the same code the bot uses.
- The rules for who can read and write are in `supabase/migrations/20261030000000_web_app.sql`.
