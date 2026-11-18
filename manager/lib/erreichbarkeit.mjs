// Sind die Links in den Mails nur im Schulnetz erreichbar? – EINE Quelle für App und Server-Manager.
// Die App (server/src/kern/mail/erreichbarkeit.ts) importiert diese Datei; esbuild bündelt sie in server/dist.
// Hier liegt sie, weil manager/ als Dateien ins Paket kommt und nichts aus server/ oder shared/ importieren kann.
// Reine Funktionen ohne Betriebssystem-Abhängigkeit (nur Zeichenketten/URL-Parsing) → gleiche Ergebnisse auf
// Windows, Linux und Raspberry Pi. Keine Prüfung über externe Dienste (Datenschutz, hinter NAT/Firewall unzuverlässig).
// Typen: erreichbarkeit.d.mts. Tests: server/test/erreichbarkeit.test.ts.

/** Einstellung „Links in den Mails sind erreichbar“: automatisch erkennen · nur im Schulnetz · auch von außerhalb. */
export const ERREICHBARKEIT = ['auto', 'schulnetz', 'oeffentlich'];

export const HTTPS_EMPFOHLEN = 'Für den Zugriff von außen wird HTTPS empfohlen.';

const INTERNE_ENDUNGEN = ['.local', '.lan', '.intern', '.internal', '.home', '.home.arpa', '.corp', '.localhost'];

function ipv4Privat(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 127) return 'nur auf diesem Rechner erreichbar';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'eine Adresse im lokalen Netz';
  if (a === 169 && b === 254) return 'eine automatisch vergebene lokale Adresse';
  if (a === 0) return 'keine erreichbare Adresse';
  return '';
}

const ipv4 = (ip) => {
  const privat = ipv4Privat(ip);
  return privat ? { schulnetz: true, grund: `${ip} ist ${privat}.` } : { schulnetz: false, grund: `${ip} ist eine öffentliche IP-Adresse.` };
};

/** Automatische Einschätzung aus dem Rechnernamen bzw. der IP-Adresse einer Adresse (http/https, mit oder ohne Port). */
export function erkenneErreichbarkeit(url) {
  let host;
  try {
    host = new URL(String(url ?? '').trim()).hostname.toLowerCase();
  } catch {
    return { schulnetz: false, grund: 'Keine gültige Adresse eingetragen.' };
  }
  if (!host) return { schulnetz: false, grund: 'Keine gültige Adresse eingetragen.' };
  const schulnetz = (grund) => ({ schulnetz: true, grund });
  if (host.startsWith('[')) {
    const ip = host.slice(1, -1);
    // IPv4 in IPv6 (::ffff:192.168.1.5) – die URL schreibt das als ::ffff:c0a8:105
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
    if (mapped) {
      const n = (parseInt(mapped[1], 16) << 16) | parseInt(mapped[2], 16);
      return ipv4([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    if (ip === '::1') return schulnetz('::1 ist nur auf diesem Rechner erreichbar.');
    if (ip === '::') return schulnetz(':: ist keine erreichbare Adresse.');
    if (/^f[cd][0-9a-f]{0,2}:/.test(ip)) return schulnetz(`${ip} ist eine Adresse im lokalen Netz.`);
    if (/^fe[89ab][0-9a-f]?:/.test(ip)) return schulnetz(`${ip} ist eine lokale Adresse (nur im selben Netz).`);
    return { schulnetz: false, grund: `${ip} ist eine öffentliche IP-Adresse.` };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return ipv4(host);
  if (host === 'localhost') return schulnetz('localhost ist nur auf diesem Rechner erreichbar.');
  if (!host.includes('.')) return schulnetz(`„${host}“ ist ein Rechnername ohne Domain – nur im lokalen Netz bekannt.`);
  const endung = INTERNE_ENDUNGEN.find((e) => host.endsWith(e));
  if (endung) return schulnetz(`„${endung}“ ist eine Endung für lokale Netze.`);
  return { schulnetz: false, grund: `${host} ist ein öffentlicher Name.` };
}

/**
 * Entscheidung für Mails und Server-Manager aus Link-Adresse und Einstellung:
 *  - hinweis: „Der Link funktioniert nur im Schulnetz“ unter dem Knopf. Entfällt nur, wenn die Adresse nicht als
 *    Schulnetz erkannt wird und die Einstellung nicht „Nur im Schulnetz“ ist – bei einem Widerspruch bleibt er stehen.
 *  - warnung: „Auch von außerhalb“ gewählt, die Adresse ist aber eine Schulnetz-Adresse (Text mit Lösungsweg).
 *  - httpsHinweis: „Auch von außerhalb“ mit http:// statt https://.
 * Ohne Adresse (keine Links in den Mails) nichts davon.
 */
export function pruefeLinks({ appBaseUrl, erreichbarkeit } = {}) {
  const url = String(appBaseUrl ?? '').trim();
  const wahl = ERREICHBARKEIT.includes(erreichbarkeit) ? erreichbarkeit : 'auto';
  if (!url) return { wahl, erkennung: null, hinweis: false, warnung: '', httpsHinweis: '' };
  const erkennung = erkenneErreichbarkeit(url);
  const hinweis = wahl === 'schulnetz' || erkennung.schulnetz;
  const warnung =
    wahl === 'oeffentlich' && erkennung.schulnetz
      ? `Sie haben „Auch von außerhalb“ gewählt, aber die Links in den Mails zeigen auf eine Adresse im Schulnetz (${erkennung.grund.replace(/\.$/, '')}). ` +
        'Bitte unter „Adresse in den Mails“ die öffentliche Adresse eintragen (z. B. https://mosaik3lab.meine-schule.example). ' +
        'Bis dahin steht in den Mails weiter der Hinweis „nur im Schulnetz“.'
      : '';
  const httpsHinweis = wahl === 'oeffentlich' && !erkennung.schulnetz && /^http:/i.test(url) ? HTTPS_EMPFOHLEN : '';
  return { wahl, erkennung, hinweis, warnung, httpsHinweis };
}

// Virtuelle Schnittstellen: Docker, Bridges, VMs, WSL/Hyper-V, VPNs, Loopback – nie als Adresse für Links.
const VIRTUELL = /^(lo|docker|br-|virbr|veth|vmnet|vboxnet|tailscale|zt|wg|tun|tap|utun|cni|flannel|podman|lxc|lxd)|vEthernet|VirtualBox|Hyper-V|VMware|WSL|Loopback|Pseudo|Tailscale|ZeroTier|WireGuard|OpenVPN|Bluetooth/i;
const KABEL = /^(eth|en|Ethernet)/i;

/**
 * Beste Adresse dieses Rechners im Schulnetz für Links (wenn „Adresse in den Mails“ leer ist) – aus einer Liste wie
 * os.networkInterfaces(): nur IPv4, keine internen, Link-Local- oder virtuellen Schnittstellen; private Netze vor
 * anderen (192.168 > 10 > 172.16–31), Kabel vor WLAN. null = keine passende Adresse.
 */
export function waehleNetzAdresse(interfaces) {
  const rang = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const kandidaten = Object.entries(interfaces ?? {}).flatMap(([name, list]) =>
    VIRTUELL.test(name)
      ? []
      : (list ?? [])
          .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal && !i.address.startsWith('169.254.') && !i.address.startsWith('127.'))
          .map((i) => ({ ip: i.address, wert: rang(i.address) * 2 + (KABEL.test(name) ? 0 : 1) })),
  );
  kandidaten.sort((a, b) => a.wert - b.wert);
  return kandidaten[0]?.ip ?? null;
}
