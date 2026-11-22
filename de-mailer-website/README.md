# De Mailer — The Post Office

A plain HTML/CSS/JavaScript artist website with Supabase-powered newsletter signups, fan messages, a simple email-checked member locker and a private admin dashboard.

## Files
- `index.html` — public artist website
- `style.css` — design and responsive layout
- `script.js` — music/social links, Supabase forms, letters and member locker
- `admin.html`, `admin.css`, `admin.js` — private Postmaster dashboard
- `supabase-setup.sql` — database tables and security policies
- `assets/` — put your artist portrait, song artwork and audio snippets here

## 1. Create a separate Supabase project
Create a new project at https://supabase.com. Open SQL Editor, create a new query, paste all of `supabase-setup.sql`, and run it.

In Project Settings > API, copy:
- Project URL
- anon / publishable public key

Paste both into `script.js` and `admin.js`. Use the anon/publishable key only. **Never use the service_role or secret key in browser code.**

## 2. Create your Postmaster login
1. Run the website locally using VS Code Live Server, or deploy it to your host.
2. Create your own admin user through Supabase Authentication > Users (or the Supabase sign-up flow).
3. In Supabase Dashboard > Authentication > Users, copy your account's User UID.
4. In SQL Editor, run this query with your actual UUID: `insert into public.admin_users (user_id) values ('YOUR-AUTH-USER-UUID');`
5. Open `admin.html` and use the admin email sign-in link. Only the UUID you inserted is authorized.

Set your deployed website URL in Supabase Authentication > URL Configuration (Site URL and allowed Redirect URLs). For local testing, add your local development URL too. These settings are for the Postmaster admin only.

## Member locker — no accounts or authentication
Fans join through the newsletter form using their name and email. To enter the Locker, they type the same email address and click **Open my locker**. The site checks the email against the subscriber list using a database function. Fans do not create accounts, receive sign-in links, set passwords or use OTP.

**Important limitation:** because there is no identity verification, this is a lightweight convenience gate, not strong security. Anyone who knows or guesses a member's email could pass the check, and locker deliveries are readable through the public website data endpoint. Use it for general fan extras, not private or sensitive messages. The Postmaster admin remains protected separately.

## 3. Add your images and music
- Replace `assets/artist-photo.jpg` with your hero photo (keep the filename, or update the CSS background URL).
- Add artwork and MP3 preview files in `assets/music/`.
- Edit the `tracks` array near the top of `script.js`. For each song update `title`, `year`, `tag`, `artwork`, `snippet`, `spotify`, `apple`, and `youtube`.
- Replace `#` in the `socials` object with your real social profile links.
- You can add more track objects by copying one object and changing its details.

Use short preview clips you have permission to share. Full streaming links should point to the official song pages.

## 4. Email notifications
Newsletter signups and fan letters are saved to Supabase. This starter does **not** automatically send an email notification to your inbox. To receive instant email alerts, connect an email provider (for example Brevo or Resend) through a Supabase Edge Function and store its API key as a Supabase secret. Never put an email provider secret in `script.js`. You can still see all fan messages in `admin.html`.

## 5. Deploy
Upload the whole project folder to your static host (for example Vercel or Netlify). Keep the folder structure intact. No build command is required for this plain HTML project. Add both `index.html` and `admin.html` to the deployed site.

## Important security notes
- The admin dashboard is protected by Supabase Auth and an `admin_users` allow-list, plus database Row Level Security.
- Do not remove the RLS policies or expose your service_role key.
- The public newsletter form is intentionally insert-only. Visitors cannot read/export the email list.
- The Postmaster dashboard currently shows up to the latest 5,000 newsletter signups and exports the rows it has loaded. If your list grows beyond that, pagination can be added.
- The member locker is gated by an email-list check only; it does not authenticate the visitor. Admin sign-in remains protected by Supabase Auth.
