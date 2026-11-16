// „Was ist neu“: Dialog nach einem Update (nur über die App-Adresse) und die Mini-Darstellung für Änderungstexte.
import { $, ctx, el, fmtDay, toast } from './ui.js';

// ---------- Mini-Darstellung für Änderungstexte (Listen mit „- “, **fett**, `Code`, Überschriften) ----------
// Nur DOM-Knoten mit textContent – fremder Text wird nie als HTML eingefügt.
function inlineMd(text) {
  const t = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]/g, '$1'); // Links/Klammern → nur Text
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) =>
    /^\*\*[^*]+\*\*$/.test(part) ? el('strong', {}, part.slice(2, -2)) : /^`[^`]+`$/.test(part) ? el('code', {}, part.slice(1, -1)) : part);
}
export function markdown(text) {
  const blocks = [];
  let list = null;
  let para = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      list = para = null;
      continue;
    }
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (head) {
      list = para = null;
      blocks.push(el('p', { class: 'md-h' }, inlineMd(head[1])));
    } else if (item) {
      para = null;
      if (!list) blocks.push((list = el('ul')));
      list.append(el('li', {}, inlineMd(item[1])));
    } else if (list && /^\s/.test(raw)) {
      list.lastChild.append(' ', ...inlineMd(line)); // eingerückte Fortsetzung eines Listenpunkts
    } else {
      list = null;
      if (para) para.append(' ', ...inlineMd(line));
      else blocks.push((para = el('p', {}, inlineMd(line))));
    }
  }
  return blocks.length ? blocks : [el('p', { class: 'muted' }, 'Keine Beschreibung.')];
}
// ---------- Was ist neu (über die App-Adresse; die App merkt sich „gelesen“ je Konto) ----------
let newsChecked = false;
const appHeaders = { 'X-Requested-With': 'mosaik3lab' };
export async function loadNews() {
  if (!ctx.remote || newsChecked) return; // direkt am Server gibt es keine App-Anmeldung → keine Neuigkeiten
  newsChecked = true;
  const res = await fetch(`${ctx.appBase}/api/neuigkeiten`, { credentials: 'same-origin', headers: appHeaders, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return; // Endpunkt fehlt (ältere App) oder nicht erreichbar → still nichts anzeigen
  const n = await res.json().catch(() => null);
  const parts = Array.isArray(n?.abschnitte) ? n.abschnitte.filter((a) => a && (a.text || a.version)) : [];
  if (!n?.anzeigen || !parts.length) return;
  $('#news-title-text').textContent = n.version ? `Neu in Version ${n.version}` : 'Was ist neu';
  $('#news-body').replaceChildren(...parts.map((a) => el('section', { class: 'news-part' },
    parts.length > 1 || a.datum ? el('h3', {}, a.version ? `Version ${a.version}` : '', a.datum ? el('span', { class: 'muted small' }, ` · ${fmtDay(a.datum)}`) : null) : null,
    el('div', { class: 'md' }, markdown(a.text)))));
  if (document.querySelector('dialog[open]')) return; // nicht über eine andere Rückfrage legen (kommt beim nächsten Öffnen)
  $('#dlg-news').showModal();
  $('#news-title').focus();
}
$('#news-read').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch(`${ctx.appBase}/api/neuigkeiten/gelesen`, { method: 'POST', credentials: 'same-origin', headers: { ...appHeaders, 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) throw new Error();
    $('#dlg-news').close();
  } catch {
    $('#dlg-news').close();
    toast('Konnte nicht gespeichert werden – die Neuigkeiten erscheinen beim nächsten Mal noch einmal.', true);
  } finally {
    btn.disabled = false;
  }
});
