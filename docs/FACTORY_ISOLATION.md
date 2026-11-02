# Factory page: per-user isolation

The factory page (`site/index.html`) is static and public, but it carries **no user data**. After login it reads the
signed-in user's own rows from Supabase (project `elecldbgysdbymkyucwf`, same auth users as www.x-connect.ai).

## What is public (site/)
`data/stations-def.js` (station names/notes/AoI/tools), `tools.*`, `recipes.*` (no run evidence), `skins.*`, `trees.js`, `aoi.json`.
`aoi-tree.html` is a static knowledge tree and stays public.

## What is private (never in site/, never in git)
Orders, Pods, run results, deliverable files. Local working copies live in `build/private/` (gitignored):
`orders.json`, `pod.json`, `stations.json`, `artifacts.json`, `build.js`, `i18n_en.json`.

## Tables (see `supabase/migrations/`)
`factory_orders`, `factory_pods`, `factory_runs` — `user_id uuid references auth.users`, RLS on, `select` only where
`user_id = auth.uid()`; no insert/update/delete for `anon`/`authenticated`. Writes: service role only.
Page counters: `POD · n RUNNING` = this user's `factory_pods` rows with `live_status = 'RUNNING'`.

## Writing data (owner machine / pod scripts)
```
export SUPABASE_SERVICE_ROLE_KEY=...        # or FACTORY_SECRET_FILE=/path/to/file-with-key ; never commit it
python3 tools/push_factory_data.py --email owner@example.com --all [--prune-pods]
```
`build/06_pod.py` calls `tools/push_factory_data.py --pods --orders` automatically after it writes `build/private/pod.json`
when `FACTORY_USER_EMAIL` (or `FACTORY_USER_ID`) and `SUPABASE_SERVICE_ROLE_KEY` are set; `build/run.sh` pushes `--all` at the end.
`i18n_en.json` ({中文: English}) carries English text for the user's own strings (stored in the `i18n_en` column).

## Login on the factory origin
`site/auth.js` + vendored `site/vendor/supabase.js` (supabase-js 2.109.0, MIT): email+password, or email code/link
(`shouldCreateUser: false`). No Google OAuth. Only the public publishable key is in the page.
