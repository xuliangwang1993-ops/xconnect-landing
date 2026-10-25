#!/usr/bin/env python3
"""Read-only audit of public-schema RLS and anon-readable sensitive tables."""
import json, os, re, urllib.request, urllib.error
from pathlib import Path
root = Path(__file__).resolve().parents[1]
text = (root / 'portal/www/auth.js').read_text()
url = re.search(r"SUPABASE_URL = '([^']+)'", text).group(1)
key = re.search(r"SUPABASE_KEY = '([^']+)'", text).group(1)
pat = os.environ.get('SUPABASE_PAT')
if not pat:
    raise SystemExit('SUPABASE_PAT not set')
ref = re.search(r'https://([^.]+)', url).group(1)
query = ("select tablename, rowsecurity from pg_tables where schemaname='public' "
         "order by tablename")
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query',
    data=json.dumps({'query': query}).encode(), method='POST',
    headers={'Authorization': f'Bearer {pat}', 'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=30) as response:
        tables = json.load(response)
except urllib.error.HTTPError as e:
    print('RLS_METADATA_QUERY', 'HTTP', e.code, '(metadata unavailable; continuing anon checks)')
    tables = []
print('RLS_DISABLED', [r['tablename'] for r in tables if not r['rowsecurity']])
print('RLS_ENABLED_COUNT', sum(bool(r['rowsecurity']) for r in tables))
print('PUBLIC_TABLE_COUNT', len(tables))
# Only reads, no writes or RPC that changes state. Do not print row contents.
for table in ['accounts', 'usage_ledger', 'topup_orders', 'profiles', 'conversations',
              'messages', 'email_verifications', 'xc_sync_conversations', 'xc_sync_messages']:
    req = urllib.request.Request(f'{url}/rest/v1/{table}?select=*&limit=1',
        headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
            print('ANON_READ', table, 'HTTP', r.status, 'sample_rows', len(data) if isinstance(data, list) else 'non-list')
    except urllib.error.HTTPError as e:
        print('ANON_READ', table, 'HTTP', e.code)
    except Exception as e:
        print('ANON_READ', table, 'ERROR', type(e).__name__)
