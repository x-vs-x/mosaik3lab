// SMTP-Fänger für den Installer-Test (nur auf dem GitHub-Runner): nimmt jede Mail an und legt sie ab, nichts wird zugestellt.
//   node smtp-faenger.mjs <port> <ordner>
// Je Mail <ordner>/NNN.eml (Rohtext) und NNN.json { from, to[], user, pass } – Anmeldedaten mitgeschrieben, damit der
// Test prüfen kann, dass das SMTP-Passwort ein Update überstanden hat. Reines Node, nur 127.0.0.1, kein TLS.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [port, dir] = [Number(process.argv[2]), process.argv[3]];
if (!port || !dir) {
  console.error('Aufruf: node smtp-faenger.mjs <port> <ordner>');
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });
let n = fs.readdirSync(dir).filter((f) => f.endsWith('.eml')).length;
const b64 = (s) => Buffer.from(s, 'base64').toString('utf8');

net
  .createServer((socket) => {
    let buf = '';
    let modus = 'befehl'; // befehl | daten | login-user | login-pass
    let cur = { from: '', to: [], user: '', pass: '' };
    const say = (s) => socket.write(`${s}\r\n`);
    say('220 ci-faenger ESMTP');
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      for (;;) {
        if (modus === 'daten') {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          const raw = Buffer.from(buf.slice(0, end).replace(/\r\n\.\./g, '\r\n.'), 'latin1');
          buf = buf.slice(end + 5);
          modus = 'befehl';
          const name = String(++n).padStart(3, '0');
          fs.writeFileSync(path.join(dir, `${name}.eml`), raw);
          fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(cur));
          console.log(`Mail ${name} an ${cur.to.join(', ')}`);
          cur = { from: '', to: [], user: cur.user, pass: cur.pass };
          say('250 OK');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        if (modus === 'login-user') {
          cur.user = b64(line);
          modus = 'login-pass';
          say('334 UGFzc3dvcmQ6');
          continue;
        }
        if (modus === 'login-pass') {
          cur.pass = b64(line);
          modus = 'befehl';
          say('235 OK');
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') say('250-ci-faenger\r\n250-8BITMIME\r\n250 AUTH PLAIN LOGIN');
        else if (cmd === 'AUTH') {
          const [, art, wert] = line.split(' ');
          if (art.toUpperCase() === 'PLAIN' && wert) {
            [, cur.user, cur.pass] = b64(wert).split('\0');
            say('235 OK');
          } else if (art.toUpperCase() === 'LOGIN') {
            modus = 'login-user';
            say('334 VXNlcm5hbWU6');
          } else say('504 nicht unterstützt');
        } else if (cmd === 'MAIL') {
          cur.from = line;
          say('250 OK');
        } else if (cmd === 'RCPT') {
          cur.to.push(/<([^>]*)>/.exec(line)?.[1] ?? '');
          say('250 OK');
        } else if (cmd === 'DATA') {
          modus = 'daten';
          say('354 weiter');
        } else if (cmd === 'QUIT') {
          say('221 Tschuess');
          socket.end();
        } else say('250 OK');
      }
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`SMTP-Fänger auf 127.0.0.1:${port}, Ablage ${dir}`));
