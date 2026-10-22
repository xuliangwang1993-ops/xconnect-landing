// Bot 对话服务 —— Render 版
// 支持自定义 OpenAI-compatible API 地址
import http from 'http';
import { readFileSync, writeFileSync } from 'fs';

const PORT = process.env.PORT || 8789;
const HISTORY_FILE = './history.json';
let sseClients = [];

function loadHistory() {
  try { return JSON.parse(readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}
function saveHistory(msgs) {
  try { writeFileSync(HISTORY_FILE, JSON.stringify(msgs.slice(-100), null, 2)); } catch {}
}

function getLLMConfig() {
  const key = process.env.LLM_API_KEY || process.env.SUBROUTER_API_KEY;
  const model = process.env.LLM_MODEL || process.env.SUBROUTER_MODEL || 'gpt-6-astra';
  let base = process.env.LLM_BASE_URL || 'https://subrouter.ai/v1';
  base = base.replace(/\/$/, '');
  const endpoint = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
  return { key, model, endpoint };
}

const PC_LOCAL_EXEC = process.env.PC_BRIDGE_URL || '';
async function callPCLocal(task, model) {
  if (!PC_LOCAL_EXEC) return null;
  try {
    const r = await fetch(PC_LOCAL_EXEC + '/task', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ task, model }) });
    const j = await r.json();
    if (!r.ok) return '本地执行失败: ' + (j.error || r.status);
    let out = String(j.output || '').replace(/[[0-9;]*m/g, '').trim();
    return out.slice(-2000);
  } catch(e) { return '本地执行连接失败: ' + e.message; }
}

async function askLLM(userMsg, history) {
  const { key, model, endpoint } = getLLMConfig();
  if (!key) {
    return '（演示模式）收到：' + userMsg + '\n\n请在 Render 环境变量里填写 LLM_BASE_URL、LLM_API_KEY 和 LLM_MODEL。';
  }
  const messages = history.slice(-10).map(m => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: userMsg });
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages, max_tokens: 800 })
    });
    if (!res.ok) return '模型调用失败: HTTP ' + res.status;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '（空回复）';
  } catch (error) {
    return '模型连接失败: ' + error.message;
  }
}

function broadcast(data) {
  const payload = 'data: ' + JSON.stringify(data) + '\n\n';
  sseClients.forEach(res => { try { res.write(payload); } catch {} });
}

const indexHTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bot 对话</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0B0E14;color:#F8FAFC;height:100vh;display:flex;flex-direction:column}.header{padding:16px 20px;border-bottom:1px solid #1E293B;background:#111827;display:flex;align-items:center;gap:10px}.header h1{font-size:18px;font-weight:600}.dot{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 8px #22C55E}.messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}.msg{padding:12px 16px;border-radius:12px;max-width:80%;line-height:1.6;white-space:pre-wrap;font-size:15px}.msg.user{background:#1D4ED8;align-self:flex-end}.msg.assistant{background:#1E293B;align-self:flex-start;border:1px solid #334155}.msg.notification{background:rgba(34,211,238,.1);align-self:center;border:1px solid #22D3EE;color:#22D3EE;font-size:13px}.input-area{padding:16px 20px;border-top:1px solid #1E293B;background:#111827;display:flex;gap:12px}#msgInput{flex:1;padding:12px 16px;border:1px solid #334155;border-radius:10px;background:#0F172A;color:#F8FAFC;font-size:15px;outline:none}#msgInput:focus{border-color:#38BDF8}#sendBtn{padding:12px 24px;background:#F97316;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}#sendBtn:hover{background:#EA580C}#sendBtn:disabled{background:#334155;color:#94A3B8;cursor:wait}
</style></head><body>
<div class="header"><span class="dot"></span><h1>Bot 对话</h1></div><div class="messages" id="messages"></div><div class="input-area"><input type="text" id="msgInput" placeholder="输入消息，回车发送…" autocomplete="off"><button id="sendBtn">发送</button></div>
<script>
const msgs=document.getElementById('messages'),input=document.getElementById('msgInput'),btn=document.getElementById('sendBtn');function addMsg(role,content){const d=document.createElement('div');d.className='msg '+role;d.textContent=content;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}fetch('/history').then(r=>r.json()).then(d=>(d.messages||[]).forEach(m=>addMsg(m.role,m.content)));const es=new EventSource('/events');es.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==='assistant'||d.type==='notification')addMsg(d.type,d.content)};async function send(){const t=input.value.trim();if(!t)return;input.value='';btn.disabled=true;addMsg('user',t);try{await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t})})}catch(e){addMsg('notification','发送失败: '+e.message)}btn.disabled=false;input.focus()}btn.onclick=send;input.onkeydown=e=>{if(e.key==='Enter')send()};
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(indexHTML); }
  else if (req.method === 'GET' && req.url === '/history') { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({messages:loadHistory()})); }
  else if (req.method === 'GET' && req.url === '/healthz') { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true})); }
  else if (req.method === 'GET' && req.url === '/pc/health') {
    if (!PC_LOCAL_EXEC) { res.writeHead(503,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'PC_BRIDGE_URL not configured'})); }
    try { const r = await fetch(PC_LOCAL_EXEC + '/health'); const j = await r.json(); res.writeHead(r.status,{'Content-Type':'application/json'}); res.end(JSON.stringify(j)); }
    catch(e) { res.writeHead(502,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); }
  }
  else if (req.method === 'POST' && req.url === '/pc/task') {
    let b=''; req.on('data', d => b += d); req.on('end', async () => {
      try {
        if (!PC_LOCAL_EXEC) throw new Error('PC_BRIDGE_URL not configured');
        const {task, model} = JSON.parse(b || '{}');
        if (!task) { res.writeHead(400,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'task required'})); }
        const r = await fetch(PC_LOCAL_EXEC + '/task', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,model})});
        const j = await r.json();
        let out = String(j.output||'').replace(/[[0-9;]*m/g,'').trim();
        res.writeHead(r.status,{'Content-Type':'application/json'});
        res.end(JSON.stringify({id:j.id, task:j.task, ok:r.ok, result:out.slice(-3000), error:j.error||null, timestamp:j.timestamp}));
      } catch(e) { res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); }
    });
  }
  else if (req.method === 'POST' && req.url === '/chat') {
    let body=''; req.on('data', d => body += d); req.on('end', async () => { try { const {message}=JSON.parse(body); const history=loadHistory(); history.push({role:'user',content:message,ts:Date.now()}); const reply=await askLLM(message,history); history.push({role:'assistant',content:reply,ts:Date.now()}); saveHistory(history); broadcast({type:'assistant',content:reply}); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({role:'assistant',content:reply})); } catch(e) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); } });
  } else if (req.method === 'GET' && req.url === '/events') { res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}); res.write('data: {"type":"connected"}\n\n'); sseClients.push(res); req.on('close',()=>{sseClients=sseClients.filter(c=>c!==res)}); }
  else { res.writeHead(404); res.end('Not Found'); }
});
server.listen(PORT,'0.0.0.0',()=>console.log('bot listening on '+PORT));
