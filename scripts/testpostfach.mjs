// Testpostfach für die Entwicklung: fängt alle Mails der App ab, nichts wird wirklich zugestellt.
// Aufruf: npm run testpostfach   → SMTP auf 127.0.0.1:2525, Ansicht auf http://127.0.0.1:2580
// Mails liegen als .eml in <Wurzel>\testpostfach (Wurzel wie dataRoot(): MOSAIK3LAB_ROOT oder C:\Mosaik3LAB).
// Reines Node ohne Abhängigkeiten. Kein STARTTLS, kein AUTH angeboten; kommt AUTH trotzdem, wird alles angenommen.
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SMTP_PORT = 2525;
const WEB_PORT = 2580;
const HOST = '127.0.0.1';
const root = process.env.MOSAIK3LAB_ROOT
  ? path.resolve(process.env.MOSAIK3LAB_ROOT)
  : process.platform === 'win32' ? path.join(`${process.env.SystemDrive ?? 'C:'}\\`, 'Mosaik3LAB') : '/var/lib/mosaik3lab';
const dir = path.join(root, 'testpostfach');
fs.mkdirSync(dir, { recursive: true });

// ---------- SMTP ----------
const smtp = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  let data = null; // Buffer-Teile während DATA
  let auth = 0; // noch erwartete AUTH-Antwortzeilen
  let from = '';
  let to = [];
  const say = (line) => sock.write(`${line}\r\n`);
  say('220 mosaik3lab-testpostfach ESMTP');
  sock.on('error', () => {});
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let i;
    while ((i = buf.indexOf('\r\n')) !== -1) {
      const raw = buf.subarray(0, i);
      buf = buf.subarray(i + 2);
      if (data) {
        if (raw.length === 1 && raw[0] === 0x2e) {
          const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}.eml`;
          fs.writeFileSync(path.join(dir, file), Buffer.concat(data));
          console.log(`✉ ${file}  von ${from} an ${to.join(', ')}`);
          data = null; from = ''; to = [];
          say('250 OK gespeichert');
        } else {
          data.push(raw[0] === 0x2e ? raw.subarray(1) : raw, Buffer.from('\r\n'));
        }
        continue;
      }
      const line = raw.toString('latin1');
      if (auth > 0) { auth--; say(auth ? '334 UGFzc3dvcmQ6' : '235 OK'); continue; }
      const cmd = line.slice(0, 4).toUpperCase();
      const arg = line.slice(5).trim();
      if (cmd === 'EHLO') { say('250-mosaik3lab-testpostfach'); say('250 SIZE 52428800'); }
      else if (cmd === 'HELO') say('250 mosaik3lab-testpostfach');
      else if (cmd === 'MAIL') { from = arg.replace(/^FROM:\s*/i, ''); say('250 OK'); }
      else if (cmd === 'RCPT') { to.push(arg.replace(/^TO:\s*/i, '')); say('250 OK'); }
      else if (cmd === 'DATA') { data = []; say('354 Ende mit <CRLF>.<CRLF>'); }
      else if (cmd === 'RSET') { from = ''; to = []; say('250 OK'); }
      else if (cmd === 'NOOP') say('250 OK');
      else if (cmd === 'QUIT') { say('221 Tschüss'); sock.end(); }
      else if (cmd === 'AUTH') {
        // LOGIN: Benutzer- und Passwortzeile abwarten, PLAIN ohne Daten: eine Zeile, sonst sofort ok.
        const [method = '', initial] = arg.split(/\s+/);
        const login = method.toUpperCase() === 'LOGIN';
        auth = login ? (initial ? 1 : 2) : initial ? 0 : 1;
        say(auth === 0 ? '235 OK' : !login ? '334 ' : auth === 2 ? '334 VXNlcm5hbWU6' : '334 UGFzc3dvcmQ6');
      }
      else say('502 Befehl nicht unterstützt');
    }
  });
});

// ---------- Mail lesen (genug für nodemailer: Header, multipart, quoted-printable, base64, Umlaute) ----------
function bytes(s) { return Buffer.from(s, 'latin1'); }
function charsetDecode(b, cs) {
  try { return new TextDecoder(cs || 'utf-8').decode(b); } catch { return new TextDecoder('utf-8').decode(b); }
}
function qp(s) { return bytes(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))); }
function words(v) { // RFC 2047: =?UTF-8?Q?...?= / =?UTF-8?B?...?=
  return v.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_, cs, enc, t) =>
    charsetDecode(enc.toUpperCase() === 'B' ? Buffer.from(t, 'base64') : qp(t.replace(/_/g, ' ')), cs));
}
function split(raw) { // → { headers, body }
  const i = raw.search(/\r?\n\r?\n/);
  const head = i === -1 ? raw : raw.slice(0, i);
  const body = i === -1 ? '' : raw.slice(i).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const l of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const c = l.indexOf(':');
    if (c > 0) headers[l.slice(0, c).trim().toLowerCase()] ??= l.slice(c + 1).trim();
  }
  return { headers, body };
}
function param(h, name) { return (h ?? '').match(new RegExp(`${name}="?([^";]+)"?`, 'i'))?.[1]; }
function walk(part, out) {
  const type = (part.headers['content-type'] ?? 'text/plain').split(';')[0].trim().toLowerCase();
  if (type.startsWith('multipart/')) {
    const b = param(part.headers['content-type'], 'boundary');
    if (!b) return;
    for (const p of part.body.split(`--${b}`).slice(1)) {
      if (p.startsWith('--')) break;
      walk(split(p.replace(/^\r?\n/, '')), out);
    }
    return;
  }
  if (type !== 'text/html' && type !== 'text/plain') { out.files.push(param(part.headers['content-disposition'], 'filename') ?? type); return; }
  const enc = (part.headers['content-transfer-encoding'] ?? '').toLowerCase();
  const b = enc === 'base64' ? Buffer.from(part.body, 'base64') : enc === 'quoted-printable' ? qp(part.body) : bytes(part.body);
  const key = type === 'text/html' ? 'html' : 'text';
  out[key] ??= charsetDecode(b, param(part.headers['content-type'], 'charset'));
}
function readMail(file) {
  const m = split(fs.readFileSync(path.join(dir, file), 'latin1'));
  const out = { id: file, files: [] };
  walk(m, out);
  for (const k of ['from', 'to', 'cc', 'subject', 'date']) out[k] = words(m.headers[k] ?? '');
  out.time = fs.statSync(path.join(dir, file)).mtime.toISOString();
  return out;
}
const list = () => fs.readdirSync(dir).filter((f) => f.endsWith('.eml')).sort().reverse();

// ---------- Web-Ansicht ----------
const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Testpostfach – Mosaik³LAB</title><style>
body{font:15px system-ui,sans-serif;margin:0;color:#1a1a1a;background:#f6f6f6}header{display:flex;gap:1rem;align-items:center;padding:.75rem 1rem;background:#fff;border-bottom:1px solid #ddd}
h1{font-size:1.1rem;margin:0;flex:1}button{font:inherit;padding:.4rem .8rem;cursor:pointer}main{display:grid;grid-template-columns:minmax(260px,1fr) 2fr;gap:1rem;padding:1rem}
ul{list-style:none;margin:0;padding:0}li button{display:block;width:100%;text-align:left;background:#fff;border:1px solid #ddd;margin-bottom:.4rem;border-radius:6px}
li button[aria-current]{border-color:#0057b8;outline:2px solid #0057b8}small{color:#555}#view{background:#fff;border:1px solid #ddd;border-radius:6px;padding:1rem;min-height:300px}
iframe{width:100%;height:65vh;border:1px solid #ddd}pre{white-space:pre-wrap}@media(max-width:700px){main{grid-template-columns:1fr}}</style></head><body>
<header><h1>Testpostfach – nichts wird wirklich verschickt</h1><button id="reload">Aktualisieren</button><button id="clear">Alle löschen</button></header>
<main><section aria-label="Mails"><ul id="list"></ul></section><section id="view" aria-live="polite">Mail auswählen.</section></main>
<script>
const el=(t,txt)=>{const e=document.createElement(t);if(txt!=null)e.textContent=txt;return e};
async function load(){const mails=await (await fetch('api/mails')).json();const ul=document.getElementById('list');ul.replaceChildren();
if(!mails.length)ul.append(el('li','Noch keine Mails.'));
for(const m of mails){const b=el('button');b.append(el('strong',m.subject||'(ohne Betreff)'),el('br'),el('small',new Date(m.time).toLocaleString('de-DE')+' · von '+m.from+' an '+m.to));
b.onclick=()=>{ul.querySelectorAll('[aria-current]').forEach(x=>x.removeAttribute('aria-current'));b.setAttribute('aria-current','true');show(m.id)};const li=el('li');li.append(b);ul.append(li)}}
async function show(id){const m=await (await fetch('api/mails/'+encodeURIComponent(id))).json();const v=document.getElementById('view');v.replaceChildren();
v.append(el('h2',m.subject||'(ohne Betreff)'));for(const [k,l] of [['from','Von'],['to','An'],['cc','Cc'],['date','Datum']])if(m[k])v.append(el('div',l+': '+m[k]));
if(m.files.length)v.append(el('div','Anhänge: '+m.files.join(', ')));
if(m.html){const f=el('iframe');f.setAttribute('sandbox','');f.title='Mailinhalt';f.srcdoc=m.html;v.append(f)}else v.append(el('pre',m.text||''))}
document.getElementById('reload').onclick=load;
document.getElementById('clear').onclick=async()=>{if(!confirm('Alle Testmails löschen?'))return;await fetch('api/mails',{method:'DELETE'});document.getElementById('view').textContent='Mail auswählen.';load()};
load();</script></body></html>`;

const web = http.createServer((req, res) => {
  const send = (code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') return send(200, PAGE, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/mails') {
      return send(200, JSON.stringify(list().map((f) => { const { html, text, ...kopf } = readMail(f); return kopf; })));
    }
    const m = url.pathname.match(/^\/api\/mails\/([\w.-]+\.eml)$/);
    if (req.method === 'GET' && m && list().includes(m[1])) return send(200, JSON.stringify(readMail(m[1])));
    if (req.method === 'DELETE' && url.pathname === '/api/mails') {
      for (const f of list()) fs.unlinkSync(path.join(dir, f));
      return send(200, '{"ok":true}');
    }
    send(404, '{"fehler":"nicht gefunden"}');
  } catch (err) {
    send(500, JSON.stringify({ fehler: String(err?.message ?? err) }));
  }
});

function listen(server, port, name) {
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE'
      ? `✘ Port ${port} (${name}) ist schon belegt – läuft das Testpostfach schon? Sonst das andere Programm beenden.`
      : `✘ ${name}: ${err.message}`);
    process.exit(1);
  });
  return new Promise((ok) => server.listen(port, HOST, ok));
}
await listen(smtp, SMTP_PORT, 'SMTP');
await listen(web, WEB_PORT, 'Web-Ansicht');
console.log(`Testpostfach läuft. Mails ansehen: http://${HOST}:${WEB_PORT}   Ordner: ${dir}`);
console.log(`Im Server-Manager unter E-Mail eintragen: Server ${HOST}, Port ${SMTP_PORT}, kein SSL/TLS, kein Benutzer/Passwort.`);
console.log('Beenden mit Strg+C.');
