#!/usr/bin/env python3
import json,re,sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]
d=json.loads((R/'site/data/registry.json').read_text())
market=json.loads((R/'build/registry-sources/market_industry_tools.json').read_text())
checks=[]
def check(name,cond,detail=''):
    checks.append((name,bool(cond),detail));print(('PASS' if cond else 'FAIL'),name,detail)
tools=d['tools']; inventory=[t for t in tools if t['layer']!='asset']
check('96 inventory skills',len(inventory)==96,str(len(inventory)))
check('13 Craft',sum(t['layer']=='craft' for t in inventory)==13)
check('83 base',sum(t['layer']=='base' for t in inventory)==83)
check('1 supplemental asset',sum(t['layer']=='asset' for t in tools)==1)
check('unique ids',len({t['id'] for t in tools})==len(tools))
check('12 domains',len(d['domains'])==12)
check('63 categories',sum(len(x['categories']) for x in d['domains'])==63)
check('504 samples',sum(c['skills_read'] for x in d['domains'] for c in x['categories'])==504)
check('all inventory has source',all(t.get('source_path','').startswith('skills/') for t in inventory))
check('source URLs relative to repo',all(not t.get('source_url') or t['source_url'].startswith('https://github.com/') for t in tools))
check('13 Craft declare MCP',sum(t['layer']=='craft' and t['mcp_declared'] for t in inventory)==13)
check('base not mislabeled as MCP',all(not t['mcp_declared'] for t in inventory if t['layer']=='base'))
check('verified has evidence',all(all(x.get('evidence') for x in t['deployments'] if x['status']=='verified') for t in tools))
check('Qwen3-TTS registered',any(t['id']=='qwen3tts' for t in tools))
check('AnimateDiff deployment attached to skill',any(d.get('evidence','').find('animatediff')>=0 for t in tools if t['name']=='animatediff' for d in t['deployments']))
check('TTS candidates include Qwen', 'qwen3tts' in next(t for t in tools if t['name']=='cosyvoice')['alternative_ids'])
check('CosyVoice partial scope explicit','尚未生成中文语音' in next(t for t in tools if t['name']=='cosyvoice')['deployments'][0]['evidence'])
check('handoff endpoints valid',all(h['from'] in {t['id'] for t in tools} and h['to'] in {t['id'] for t in tools} for h in d['handoffs']))
check('handoff states bounded',all(h['compatibility'] in {'inferred','documented','verified'} for h in d['handoffs']))
check('no handoff self-loop',all(h['from']!=h['to'] for h in d['handoffs']))
# Every market cell count must survive byte-for-byte numerically.
raw={(x['domain'],c['slug'],k):v for x in market['domains'] for c in x['categories'] for k,v in c['tools'].items()}
built={(x['domain'],c['slug'],t['name']):t['count'] for x in d['domains'] for c in x['categories'] for t in c['tools']}
check('all market counts exact',raw==built,f'{len(raw)} cells')
check('Craft exemplar has 13 apps',len(d['craftChain'])==13)
check('no credential literal',not re.search(r'rpa_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}',(R/'site/data/registry.js').read_text()))
for p in ['site/registry/index.html','site/registry/registry.css','site/registry/registry.js','site/data/registry.js']:
    check('artifact '+p,(R/p).is_file() and (R/p).stat().st_size>100)
failed=[x for x in checks if not x[1]]
print(f'RESULT {len(checks)-len(failed)}/{len(checks)} PASS')
sys.exit(1 if failed else 0)
