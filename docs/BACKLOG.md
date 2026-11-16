# Für später

Bewusst zurückgestellte Ideen. Neueste oben. Wird etwas umgesetzt: hier streichen, im Protokoll eintragen.

## Sicherheit – bewusst zurückgestellt (Entscheidung Nutzer, 2026-10-31)
Begründung: nur schulintern, keine personenbezogenen Daten. Wieder aufgreifen, sobald sich das ändert.
- **K1** Lehrkraft-Anmeldung nur mit E-Mail ohne Nachweis (`docs/BEWERTUNG-2026-10-31.md`). Später: Einmal-Link oder
  Code per Mail; bis dahin: in Anfragen keine sensiblen Inhalte.
- **K2** HTTPS: wird als **optionale** Funktion gebaut (Umbauplan Schritt 0b) – Zertifikat hinterlegen, wer möchte.
  Ohne Zertifikat läuft die App weiter über `http://<IP>` im LAN (W1 beheben).

## Server-Manager (zurückgestellt am 2026-10-31, „Manager viel einfacher“)
- HTTPS im Schulnetz (Zertifikat, Hostname, Port 443) – Server braucht dafür `trust proxy` + `secure`-Cookie.
- Dienstkonto je Dienst wählbar + Ordnerrechte per Knopf setzen.
- macOS-Unterstützung (launchd).
- Update-Quellen „Zip-Paket“ (Rechner ohne Internet) und „Download-URL / GitHub-Releases“.
- Port-Übersicht aller Prozesse, sortierbare Tabellen, Hell/Dunkel-Umschalter.
- Seite „Laufzeit & Updates“ (Node-LTS-Vergleich, `npm outdated`).
- Deinstallation über Windows „Apps & Features“.

## Betrieb
- Server für den Produktivbetrieb vorkompilieren (JS statt `tsx`) – schneller/stabiler, wichtig für Raspberry Pi.
- Update-Quelle festlegen (z. B. privates GitHub-Repository).
- Backup-Ziel außerhalb des Rechners (USB/NAS).
