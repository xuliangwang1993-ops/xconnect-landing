#!/usr/bin/env python3
import json,subprocess,sys

def browser(action,**kw):
    p=subprocess.run(['minis-browser-use',action,'--json',json.dumps(dict(kw,action=action),ensure_ascii=False)],capture_output=True,text=True,timeout=60)
    if p.returncode: raise RuntimeError(p.stderr+p.stdout)
    try:return json.loads(p.stdout)
    except:return {'raw':p.stdout}

def js(script):
    r=browser('execute_js',script=script).get('data',{})
    if isinstance(r.get('text'),str):
        try:return json.loads(r['text'].splitlines()[0])
        except json.JSONDecodeError:pass
    return r.get('result',r.get('data',r))

url='minis://workspace/mcp-registry-site/site/registry/index.html'
browser('set_viewport',viewport_width=390,viewport_height=844)
browser('navigate',url=url)
r=js("return {rows:document.querySelectorAll('#tool-rows tr').length,doc:document.documentElement.scrollWidth,vw:innerWidth,domains:window.MCP_REGISTRY.domains.length,assets:window.MCP_REGISTRY.tools.filter(x=>x.layer==='asset').length}")
print('mobile inventory',r);assert r['rows']==97 and r['doc']==r['vw']==390 and r['domains']==12 and r['assets']==1
r=js("const q=document.querySelector('#q');q.value='TTS';q.dispatchEvent(new Event('input'));return {n:document.querySelectorAll('#tool-rows tr').length,qwen:[...document.querySelectorAll('#tool-rows .tool-summary')].some(x=>x.textContent.includes('qwen3tts'))}")
print('TTS search',r);assert r['n']==8 and r['qwen']
r=js("document.querySelector('#tool-rows .tool-name').click();return {open:document.querySelector('#detail').open,hasCandidates:document.querySelector('#detail-content').textContent.includes('同职责候选'),hasContract:document.querySelector('#detail-content').textContent.includes('交接合同')}")
print('detail',r);assert all(r.values())
r=js("document.querySelector('#detail').close();document.querySelector('#reset').click();document.querySelector('[data-view=industries]').click();return {cards:document.querySelectorAll('.category').length,domains:document.querySelectorAll('.domain-btn').length}")
print('industry',r);assert r=={'cards':7,'domains':12}
r=js("document.querySelector('[data-view=chains]').click();return {craft:document.querySelectorAll('.craft-node').length,handoffs:document.querySelectorAll('.handoff').length}")
print('chains',r);assert r['craft']==13 and r['handoffs']>=50
browser('set_viewport',viewport_width=1440,viewport_height=1000)
browser('navigate',url=url)
r=js("return {doc:document.documentElement.scrollWidth,vw:innerWidth,rows:document.querySelectorAll('#tool-rows tr').length}")
print('desktop',r);assert r['doc']==r['vw']==1440 and r['rows']==97
print('BROWSER REGISTRY PASS')
