#!/usr/bin/env python3
"""Static contract checks for the v1 legal/download pages (no network)."""
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'portal' / 'www'
PAGES = ['privacy', 'terms', 'source', 'pricing', 'redeem', 'download']

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.h1 = 0; self.title = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'h1': self.h1 += 1
        if tag == 'title': self.title += 1
    def handle_data(self, data):
        self.parts.append(data)

home = (ROOT / 'index.html').read_text()
assert '/privacy' in home and '/terms' in home and '/source' in home
assert 'checkout.xconnect.au' not in home
for page in PAGES:
    path = ROOT / page / 'index.html'
    assert path.is_file(), f'{page}: missing real index.html'
    text = path.read_text()
    assert text.strip() != home.strip(), f'{page}: soft 404 (homepage clone)'
    parser = Text(); parser.feed(text)
    assert parser.h1 == 1, f'{page}: expected one h1'
    assert parser.title == 1, f'{page}: expected title'
    assert 'legal.css' in text and 'legal.js' in text, f'{page}: missing shell'
    assert 'data-l="zh"' in text, f'{page}: missing Chinese version'
    assert len(' '.join(parser.parts)) > 1000, f'{page}: not enough real content'
    for banned in ['Lorem ipsum', 'example.com', 'checkout.xconnect.au']:
        assert banned not in text, f'{page}: forbidden placeholder {banned}'
    print(f'PAGE_OK {page} bytes={len(text.encode())}')
price = (ROOT / 'pricing' / 'index.html').read_text()
for amount in ['A$5', 'A$10', 'A$20', 'A$50', 'A$100']:
    assert amount in price, f'pricing: missing {amount}'
assert 'PayPal is not part of v1' in price
source = (ROOT / 'source' / 'index.html').read_text()
assert 'dl.x-connect.ai' in source and 'AGPL' in source
assert 'LAUNCH GATE' in source, 'source archive is not live yet; keep the gate'
print('FACTS_OK pricing tiers, PayPal exclusion, source-package decision')
print(f'PASS {len(PAGES)} real pages; unresolved legal/contact facts remain marked for Martin review')
