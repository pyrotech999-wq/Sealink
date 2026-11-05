<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cloud Agent

- Install with `npm ci`. Start the app with `npm run dev -- --hostname 0.0.0.0 --port 3000` and open `http://127.0.0.1:3000`.
- Supabase, Stripe, PayPal, and OpenAI are optional. With those unset, accounts and listings stay in `data/*.json`. Leave `COOKIE_DOMAIN` unset on this machine.
- Signed-in HTML routes redirect to `/payment` until the account has subscription access. A local grant lives in `data/admin-grants.json` (gitignored). API routes only require a session.
- `npm run build` is the production check. `npm run lint` currently reports existing project errors.
