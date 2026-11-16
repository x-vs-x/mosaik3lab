import fs from 'node:fs';
import path from 'node:path';
import type { NeuigkeitAbschnitt, Neuigkeiten } from '@mosaik3lab/shared/neuigkeiten';
import { istVersion, vergleicheVersion } from '../../kern/version';
import type { NeuigkeitenRepository } from './neuigkeiten.repository';

/**
 * Beim Start: Versionswechsel merken. Neuinstallation (keine Daten) → nur die Version; Update von 1.0.0 (speichert noch
 * nichts) → vorherige Version 1.0.0. Muss vor dem Anlegen der Demo-Daten laufen.
 */
export function versionBeimStart(repo: NeuigkeitenRepository, appVersion: string) {
  if (!istVersion(appVersion)) return;
  const gespeichert = repo.gespeicherteVersion();
  if (gespeichert === appVersion) return;
  if (istVersion(gespeichert)) repo.merkeVersion(appVersion, gespeichert);
  else repo.merkeVersion(appVersion, repo.hatDaten() ? '1.0.0' : undefined);
}

/** Abschnitte „## [1.1.0] – 2026-11-20“ aus CHANGELOG.md; „Unveröffentlicht“ und andere Überschriften fallen weg. */
export function leseChangelog(text: string): NeuigkeitAbschnitt[] {
  const abschnitte: NeuigkeitAbschnitt[] = [];
  let aktuell: { version: string; datum: string; zeilen: string[] } | null = null;
  const abschliessen = () => {
    if (aktuell) abschnitte.push({ version: aktuell.version, datum: aktuell.datum, text: aktuell.zeilen.join('\n').trim() });
  };
  for (const zeile of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (zeile.startsWith('## ')) {
      abschliessen();
      const m = /^## \[(\d+\.\d+\.\d+)\]\s*(?:[–—-]\s*(\S+))?/.exec(zeile);
      aktuell = m ? { version: m[1], datum: m[2] ?? '', zeilen: [] } : null;
    } else aktuell?.zeilen.push(zeile);
  }
  abschliessen();
  return abschnitte;
}

function changelogAbschnitte(rootDir: string): NeuigkeitAbschnitt[] {
  try {
    return leseChangelog(fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8'));
  } catch {
    return []; // fehlt oder unlesbar → einfach nichts anzeigen
  }
}

/** Neuigkeiten für ein Administratorkonto: alles seit der zuletzt gelesenen (sonst der vorherigen) Version. */
export function neuigkeitenFuer(repo: NeuigkeitenRepository, benutzerId: string, opts: { appVersion: string; rootDir: string }): Neuigkeiten {
  const leer: Neuigkeiten = { anzeigen: false, version: opts.appVersion, abschnitte: [] };
  const seit = repo.gesehen(benutzerId) ?? repo.vorherigeVersion();
  if (!istVersion(seit) || !istVersion(opts.appVersion)) return leer;
  const abschnitte = changelogAbschnitte(opts.rootDir)
    .filter((a) => vergleicheVersion(a.version, seit) > 0 && vergleicheVersion(a.version, opts.appVersion) <= 0)
    .sort((a, b) => vergleicheVersion(b.version, a.version));
  return { ...leer, anzeigen: abschnitte.length > 0, abschnitte };
}
