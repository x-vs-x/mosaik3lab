// Wartet im Installer-Test auf eine neue Mail beim SMTP-Fänger (smtp-faenger.mjs) und prüft sie (nur auf dem GitHub-Runner).
//   node mail-pruefen.mjs <ordner> <seit-nummer> <empfänger> <smtp-benutzer> <smtp-passwort> [muss-enthalten …]
// Prüft: Mail an <empfänger> nach Nummer <seit-nummer> kommt an (bis 90 s), Anmeldung am SMTP mit Benutzer + Passwort,
// gültiges MIME (multipart/alternative mit text/plain + text/html, UTF-8), neues Layout (Kopf, Knopf), Umlaute und Texte.
// ALTES_LAYOUT=1 (Umgebung): Mail der alten Version vor dem Update – ohne Prüfung des Layouts.
// Ausgabe: OK/FEHLER-Zeilen, Exit-Code 1 bei Fehlern.
import fs from 'node:fs';
import path from 'node:path';

const [dir, seit, an, user, pass, ...muss] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fehler = 0;
const pruefe = (bed, text) => {
  console.log(`${bed ? 'OK  ' : 'FEHLER'} ${text}`);
  if (!bed) fehler++;
};

let datei;
for (const ende = Date.now() + 90_000; !datei && Date.now() < ende; ) {
  datei = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && Number.parseInt(f, 10) > Number(seit))
    .sort()
    .find((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).to.includes(an));
  if (!datei) await sleep(1000);
}
if (!datei) {
  console.log(`FEHLER keine Mail an ${an} angekommen`);
  process.exit(1);
}
const info = JSON.parse(fs.readFileSync(path.join(dir, datei), 'utf8'));
const raw = fs.readFileSync(path.join(dir, datei.replace('.json', '.eml')), 'utf8');
pruefe(true, `Mail ${datei.replace('.json', '')} an ${an} angekommen`);
pruefe(info.user === user && info.pass === pass, `SMTP-Anmeldung mit gespeichertem Benutzer und Passwort (${info.user || 'ohne'})`);

const decodeQP = (s) => {
  const bytes = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) {
      bytes.push(parseInt(t.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(t[i], 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
};
const [head, ...rest] = raw.split('\r\n\r\n');
const headers = head.replace(/\r\n[ \t]+/g, ' ');
const ct = /^Content-Type: (.*)$/im.exec(headers)?.[1] ?? '';
pruefe(/^multipart\/alternative;/.test(ct), `multipart/alternative (${ct.split(';')[0]})`);
const boundary = /boundary="?([^";]+)"?/.exec(ct)?.[1] ?? '---';
const teile = rest
  .join('\r\n\r\n')
  .split(`--${boundary}`)
  .slice(1, -1)
  .map((p) => {
    const [h, ...b] = p.replace(/^\r\n/, '').split('\r\n\r\n');
    const body = b.join('\r\n\r\n');
    const enc = /Content-Transfer-Encoding: (\S+)/i.exec(h)?.[1]?.toLowerCase() ?? '7bit';
    return {
      type: /Content-Type: ([^;\r\n]+)/i.exec(h)?.[1] ?? '',
      charset: (/charset=([^;\r\n]+)/i.exec(h)?.[1] ?? '').toLowerCase(),
      text: enc === 'base64' ? Buffer.from(body, 'base64').toString('utf8') : enc === 'quoted-printable' ? decodeQP(body) : body,
    };
  });
pruefe(teile.map((t) => t.type).join(',') === 'text/plain,text/html', `Teile: ${teile.map((t) => t.type).join(', ')}`);
pruefe(teile.every((t) => t.charset === 'utf-8'), 'beide Teile in UTF-8');
const [text = '', html = ''] = teile.map((t) => t.text);
// ALTES_LAYOUT=1: Mail der Version vor dem Update (nur Ankunft, MIME und Anmeldung prüfen)
if (!process.env.ALTES_LAYOUT) {
  pruefe(html.includes('MOSAIK') && html.includes('class="btn"') && html.includes('<html lang="de"'), 'HTML im neuen Layout (Kopf, Knopf)');
  pruefe(text.includes('Mosaik³LAB') && html.includes('Mosaik³LAB'), 'Umlaute/Hochzahl korrekt (Mosaik³LAB)');
}
for (const s of muss) pruefe(text.includes(s) && html.includes(s), `enthält „${s}“`);
process.exit(fehler ? 1 : 0);
