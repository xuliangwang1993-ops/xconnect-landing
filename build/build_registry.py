#!/usr/bin/env python3
"""Build the single MCP registry data file from source evidence."""
import json, re, sys
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
INVENTORY=ROOT/'build/registry-sources/inventory.json'
MARKET=ROOT/'build/registry-sources/market_industry_tools.json'

DOMAIN_ZH={'Content & Media':'内容与媒体','Development':'开发','Data & AI':'数据与 AI','Research':'研究','Documentation':'文档','Business':'商业','Tools':'工具','DevOps':'DevOps','Databases':'数据库','Testing & Security':'测试与安全','Blockchain':'区块链','Lifestyle':'生活方式'}
CATEGORY_ZH={
'debugging':'调试','system-admin':'系统管理','productivity-tools':'生产力与集成','automation-tools':'自动化工具','ide-plugins':'IDE 插件','cli-tools':'命令行工具','domain-utilities':'域名与 DNS','sales-marketing':'销售与营销','project-management':'项目管理','finance-investment':'金融与投资','real-estate-legal':'房地产与法务','ecommerce':'电子商务','payment':'支付','health-fitness':'健康与健身','business-apps':'商业应用','architecture-patterns':'架构模式','backend':'后端','frontend':'前端','gaming':'游戏开发','mobile':'移动开发','scripting':'脚本开发','package-distribution':'包与分发','framework-internals':'框架 internals','cms-platforms':'CMS 与平台','full-stack':'全栈开发','ecommerce-development':'电商开发','code-quality':'代码质量','testing':'测试','security':'安全','git-workflows':'Git 工作流','cicd':'持续集成与交付','cloud':'云计算','containers':'容器','monitoring':'监控','llm-ai':'大模型与 AI','machine-learning':'机器学习','data-engineering':'数据工程','data-analysis':'数据分析','knowledge-base':'知识库','technical-docs':'技术文档','education':'教育','documents':'文档处理','content-creation':'内容创作','design':'设计','media':'媒体','academic':'学术研究','lab-tools':'实验室工具','bioinformatics':'生物信息','computational-chemistry':'计算化学','astronomy-physics':'天文与物理','scientific-computing':'科学计算','literature-writing':'文学与写作','philosophy-ethics':'哲学与伦理','arts-crafts':'艺术与手工艺','wellness-health':'身心健康','divination-mysticism':'占卜与神秘学','culinary-arts':'烹饪艺术','database-tools':'数据库工具','sql-databases':'SQL 数据库','nosql-databases':'NoSQL 数据库','smart-contracts':'智能合约','web3-tools':'Web3 工具','defi':'去中心化金融'}
ALIASES={'mlt/melt':'mlt','pyscenedetect':'pyscenedetect','tectonic/latex':'tectonic','whisper':'whisper','opencv':'opencv','imagemagick':'imagemagick','ffmpeg':'ffmpeg','docker':'docker','postgresql':'postgresql','jq':'jq','ripgrep':'ripgrep','duckdb':'duckdb','blender':'blender','graphviz':'graphviz','playwright':'playwright','yt-dlp':'yt-dlp','libvips':'libvips','sox':'sox','demucs':'demucs','librosa':'librosa','cosyvoice':'cosyvoice','real-esrgan':'real-esrgan','robust-video-matting':'robust-video-matting','rembg':'rembg','crawl4ai':'crawl4ai','searxng':'searxng','qdrant':'qdrant','pandoc':'pandoc','python-pptx':'python-pptx','openpyxl':'openpyxl','python-docx':'python-docx','pymupdf':'pymupdf','qpdf':'qpdf','ocrmypdf':'ocrmypdf','paddleocr':'paddleocr','zbar':'zbar'}
# These are supplemental libraries/runtimes, not standalone registry slots.
NON_INVENTORY={'pillow','pandas','numpy/scipy','matplotlib','tesseract'}

def deployment(location,status,evidence,date='2026-10-26'):
    return {'location':location,'status':status,'evidence':evidence,'date':date}

VERIFIED_CLI=['ffmpeg','mlt','audiowaveform','rubberband','sox','ffmpeg-normalize']
VERIFIED_GPU=['real-esrgan','whisperx','cosyvoice']
INSTALLED=['yt-dlp','demucs','pyscenedetect','opencv','qpdf','ocrmypdf','pymupdf','openpyxl','python-pptx','zbar']
DEPLOY_EVIDENCE={
'ffmpeg':'RunPod 验收：7.0.2 static 命令可执行；持久卷 /workspace/bin',
'mlt':'RunPod 验收：MLT 7.42.0，无界面最小模块编译并执行版本检查',
'audiowaveform':'RunPod 验收：1.10.3 源码编译并执行版本检查',
'rubberband':'RunPod 验收：2.0.0 命令可执行',
'sox':'RunPod 验收：SoX 14.4.2 命令可执行',
'ffmpeg-normalize':'RunPod 验收：1.43.0 命令可执行',
'real-esrgan':'GPU 小样 PASS：32×32×3 → 128×128×3',
'whisperx':'GPU 小样 PASS：tiny 模型，1 秒静音返回 0 段',
'cosyvoice':'CosyVoice2-0.5B 模型加载 PASS，24kHz；尚未生成中文语音；WeText 资源遇 403',
'yt-dlp':'已安装 2026.10.21；未做真实下载验收',
'demucs':'htdemucs 权重下载成功；未做人声分离小样',
'pyscenedetect':'scenedetect 0.7.2 导入通过；未做切镜小样',
'opencv':'OpenCV 4.10 导入通过；未做完整画质验收',
'qpdf':'命令已安装；属于案例 C 预装，未做文档小样',
'ocrmypdf':'已安装；属于案例 C 预装，未做文档小样',
'pymupdf':'PyMuPDF 导入通过；属于案例 C 预装，未做文档小样',
'openpyxl':'openpyxl 3.1.5 导入通过；属于案例 C 预装，未做文档小样',
'python-pptx':'python-pptx 1.0.2 导入通过；属于案例 C 预装，未做文档小样',
'zbar':'zbarimg 命令已安装；属于案例 C 预装，未做扫码小样'}

def main():
    data=json.loads(INVENTORY.read_text())
    source=data['tools'] if isinstance(data,dict) and 'tools' in data else data
    if isinstance(source,dict): source=list(source.values())
    tools=[]
    for x in source:
        t=dict(x)
        t['id']=t.get('id') or t.get('name')
        t['name']=t.get('name') or t['id']
        t['layer']=t.get('layer') or ('craft' if t['id'].endswith('craft') else 'base')
        t['zh']=t.get('zh') or t.get('name_zh') or t['name']
        t['summary']=t.get('summary') or t.get('description') or ''
        t['mcp_declared']=bool(t.get('mcp_declared') or t.get('mcp'))
        t.setdefault('inputs',[]);t.setdefault('outputs',[]);t.setdefault('deployments',[])
        tools.append(t)
    assert len(tools)==96, f'expected 96 source tools, got {len(tools)}'
    assert len({t['id'] for t in tools})==96
    assert sum(t['layer']=='craft' for t in tools)==13
    assert sum(t['layer']=='base' for t in tools)==83
    byid={t['id']:t for t in tools}
    byname={t['name']:t for t in tools}
    market=json.loads(MARKET.read_text())
    assert sum(len(d['categories']) for d in market['domains'])==63
    assert sum(c['skills_read'] for d in market['domains'] for c in d['categories'])==504
    mentions=Counter(); industries={}
    domains=[]
    for d in market['domains']:
        dd={'domain':d['domain'],'domain_zh':DOMAIN_ZH[d['domain']],'categories':[]}
        for c in d['categories']:
            cc={'slug':c['slug'],'label':c['label'],'label_zh':CATEGORY_ZH[c['slug']], 'skills_read':c['skills_read'],'tools':[]}
            for name,count in sorted(c['tools'].items(),key=lambda x:-x[1]):
                tid=ALIASES.get(name)
                if tid and tid not in byname: tid=None
                mentions[name]+=count
                if tid:
                    industries.setdefault(byname[tid]['id'],set()).add(d['domain'])
                cc['tools'].append({'name':name,'count':count,'coverage_id':tid,'coverage_label':('库内 TTS 候选组' if name=='tts' else '运行时 / 外部依赖' if name in {'shell','python','node/npm','git','gh-cli','curl/wget','sql','sqlite','pandas','numpy/scipy','llm-api','huggingface','spreadsheet'} else '')})
            dd['categories'].append(cc)
        domains.append(dd)
    for t in tools:
        name=t['name']
        t['market_mentions']=sum(n for key,n in mentions.items() if ALIASES.get(key)==name)
        t['market_industries']=sorted(industries.get(t['id'],[]))
        if name in VERIFIED_CLI+VERIFIED_GPU:
            status='verified'
        elif name in INSTALLED:
            status='deployed'
        else: status=None
        if status:
            t['deployments'].append(deployment('RunPod 持久卷 · 已关机',status,DEPLOY_EVIDENCE[name]))
        if name=='animatediff':
            t['deployments'].append(deployment('RunPod 持久卷 · 已关机','deployed','发现原有 /workspace/venvs/animatediff；本次未运行视频生成；这是同一技能的部署资产，不另立工具'))
        if t['layer']=='craft':
            t['deployments'].append(deployment('PC · 历史登记','reported','2026-10-16 历史记录：Craft CLI 位于 Program Files；本轮未重连 PC 复验；不等于已接入本站 MCP','2026-10-16'))
        relpath=t.get('source_relpath')
        t['source_url']='https://github.com/xuliangwang1993-ops/craft-skills/blob/main/'+relpath if relpath else None
        t['source_path']=relpath or t.get('source_path','')
    tools.extend([
      {'id':'qwen3tts','name':'Qwen3-TTS','zh':'Qwen3-TTS 语音合成','layer':'asset','category':'audio','summary':'网络卷原有 TTS 环境；与 CosyVoice 同职责，下一次必须先比选再新增。','inputs':['text'],'outputs':['wav'],'install_command':'','license':'待核','source_path':'/workspace/venvs/qwen3tts（RunPod 持久卷）','source_url':None,'mcp_declared':False,'market_mentions':0,'market_industries':[],'deployments':[deployment('RunPod 持久卷 · 已关机','deployed','原有 venv 与约 4.3GB 模型；本次未验收生成语音，不得据此判定不可用') ]}
    ])
    groups={
      'tts':['coqui-tts','cosyvoice','f5-tts','fish-speech','gpt-sovits','piper','sherpa-onnx','Qwen3-TTS'],
      'video-generation':['animatediff','cogvideox','framepack','hunyuanvideo','ltx-video','wan2'],
      'speech-alignment':['aeneas','stable-ts','whisperx'],
      'speech-recognition':['funasr','whisper','whisperx','sherpa-onnx'],
      'document-conversion':['pandoc','pymupdf','ocrmypdf']
    }
    byname.update({t['name']:t for t in tools})
    for t in tools:
        t['capability_groups']=[g for g,names in groups.items() if t['name'] in names]
        t['alternative_ids']=[byname[n]['id'] for g,names in groups.items() if t['name'] in names for n in names if n in byname and byname[n]['id']!=t['id']]
    raw_handoffs=data.get('handoffs',[]) if isinstance(data,dict) else []
    handoffs=[]
    for h in raw_handoffs:
        f=h.get('from') or h.get('upstream');to=h.get('to') or h.get('downstream')
        if f not in byid or to not in byid: continue
        handoffs.append({'from':f,'to':to,'from_zh':byid[f]['zh'],'to_zh':byid[to]['zh'],'format':h.get('format') or h.get('via') or '见源文档','compatibility':h.get('compatibility','inferred')})
    # Only the three actually exercised model/CLI boundaries are evidence, not a full D chain.
    handoffs.extend([
      {'from':byname['whisperx']['id'],'to':byname['cosyvoice']['id'],'from_zh':byname['whisperx']['zh'],'to_zh':byname['cosyvoice']['zh'],'format':'转写文本 → 配音文稿；尚未端到端跑通','compatibility':'inferred'},
      {'from':byname['demucs']['id'],'to':byname['whisperx']['id'],'from_zh':byname['demucs']['zh'],'to_zh':byname['whisperx']['zh'],'format':'vocals.wav → 逐词时间戳','compatibility':'inferred'},
      {'from':byname['cosyvoice']['id'],'to':byname['rubberband']['id'],'from_zh':byname['cosyvoice']['zh'],'to_zh':byname['rubberband']['zh'],'format':'逐句 wav → 时间槽内 wav','compatibility':'inferred'}
    ])
    # De-duplicate preserving richer explicit entries.
    uniq={}
    for h in handoffs: uniq[(h['from'],h['to'],h['format'])]=h
    craft_ids=['wordcraft','gridcraft','designcraft','deckcraft','photocraft','lightcraft','vectorcraft','cadcraft','pdfcraft','filmcraft','effectcraft','soundcraft','figcraft']
    roles=['文稿与事实','表格与数据','版面组合','演示交付','位图与素材','照片调色','矢量图形','工程图纸','卷宗与发布','时间线剪辑','动效合成','声音交付','界面设计']
    craft_chain=[{'id':byname[x]['id'],'zh':byname[x]['zh'],'role':r} for x,r in zip(craft_ids,roles)]
    out={'meta':{'generated_at':'2026-10-26','inventory_count':96,'craft_count':13,'base_count':83,'supplemental_assets':1,'market_categories':63,'market_samples':504,'market_scope_note':'约 350 万为用户所述市场总盘；本页统计不从中外推。','source_commit':'craft-skills main'},'tools':tools,'domains':domains,'handoffs':list(uniq.values()),'craftChain':craft_chain}
    text='window.MCP_REGISTRY = '+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n'
    dest=ROOT/'site/data/registry.js';dest.write_text(text)
    (ROOT/'site/data/registry.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(f'PASS inventory={len(tools)-1} assets=1 domains={len(domains)} categories=63 samples=504 handoffs={len(uniq)} bytes={len(text)}')
    print('RunPod verified',sum(any(d['status']=='verified' for d in t['deployments']) for t in tools))
    print('Market total mentions',sum(mentions.values()))

if __name__=='__main__': main()
