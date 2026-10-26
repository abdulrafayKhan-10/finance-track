# What I need from you

Everything below needs your own accounts or your devices, so I can't do it from the development container. None of it costs money. Each item says when it's needed.

## 1. Supabase: needed now (before Phase 5 is tested for real)

Supabase hosts the database and the sign-in system. Use **two** free projects: one for development and testing, and one for your real data (production). The production one can wait until Phase 8.

1. Sign up at <https://supabase.com> (a GitHub login is fine).
2. **New project** → name it `finance-track-dev`, choose a strong database password (save it in your password manager), and choose the region closest to you (for Pakistan: Mumbai `ap-south-1`, or Singapore).
3. **Apply the database migrations**, using either option:
   - **Supabase CLI** (recommended; run in the repository folder on your PC):
     ```bash
     npx supabase login
     npx supabase init            # only once; creates supabase/config.toml, answer "N" to the IDE questions
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
     The project ref is the `xxxx` in `https://xxxx.supabase.co`.
   - **No CLI:** open _SQL Editor_ in the Supabase dashboard, then paste and run each file from `supabase/migrations/` **in filename order** (0001 first).
4. **Authentication → Sign In / Providers → Email:** keep Email on, and turn **"Allow new users to sign up" OFF**.
5. **Authentication → Users → Add user → Create new user:** your email, a strong password (12+ characters), with **Auto Confirm User** ticked.
6. **Authentication → URL Configuration:** Site URL `http://localhost:3000`; add `http://localhost:3000/auth/confirm` to Redirect URLs.
7. **Project Settings → API Keys:** copy the **Project URL** and the **Publishable key** (`sb_publishable_…`; the legacy "anon" key also works).
8. **Send me nothing secret.** Put the values in a file named `.env.local` in the repository folder on your PC (see `.env.example`). Git ignores this file. If you want me to test against the dev project from here, you can add them as environment variables in the Claude Code environment settings instead. Either way, **never paste the secret / service-role key into chat**.

Then run the app on your PC (`pnpm install`, then `pnpm dev`), open <http://localhost:3000>, sign in, and go to _Settings → Security_ to set up two-factor authentication. Tell me whether sign-in, adding an account and adding a transaction work. That is the first test against real Supabase.

## 2. Your computer: needed now, for running the app yourself

- **Node.js 22 LTS** from <https://nodejs.org>, then `corepack enable` (this installs the pinned pnpm).
- **Git**, and a clone of the repository (`git clone https://github.com/abdulrafayKhan-10/finance-track`), on branch `claude/ecstatic-gauss-goezna` until it's merged.
- Optional: **Docker Desktop**, only if you want the full Supabase stack running locally instead of the cloud dev project.

## 3. GitHub: needed when you want the work merged

- Open (or let me open) a pull request from `claude/ecstatic-gauss-goezna` into `main`, so CI runs the checks on GitHub.
- Keep the repository **private** if you prefer. It contains no financial data or secrets either way.

## 4. Vercel (hosting): Phase 8

1. Sign up at <https://vercel.com> with GitHub (the Hobby plan is free for personal, non-commercial use).
2. Import the `finance-track` repository.
3. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` (your Vercel URL) **for the production Supabase project**, then deploy.
4. In the **production** Supabase project, set the Site URL and Redirect URL to the Vercel address.

## 5. Your phone and PC: Phase 8

Open the deployed site on both, sign in, install it ("Add to Home screen" on Android; "Install app" in Edge or Chrome on Windows), and confirm you see the same records on both.

## 6. Decisions only you can make (answer whenever)

- **Phase 5 asset list:** which investments you hold or plan to track (e.g. PSX stocks, mutual funds such as Meezan or Al Meezan, gold in tola or grams, crypto, NSS or Behbood certificates, T-bills, prize bonds). This lets me set sensible units and fields. Defaults exist for all seven categories either way.
- **Gold unit:** tola (11.6638 g) or grams as the default unit label.
- **Number grouping:** international `1,250,000` (current default) or lakh/crore `12,50,000`.

## Things I will never need

Your bank or card login details, card numbers, CVV codes, banking PINs, or the Supabase secret / service-role key in chat.
