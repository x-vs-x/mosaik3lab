import os from 'node:os';

// Inhalt der Sperrdatei: "<PID> <Systemstart in Sekunden>". Nach einem Neustart des Rechners ist der Systemstart
// ein anderer – eine alte Sperre mit zufällig wiederverwendeter PID gilt dann als veraltet.
// (Der Server-Manager prüft dieselbe Datei, siehe manager/lib/backup.mjs.)
const BOOT_TOLERANCE_S = 120;

export const currentBootTime = () => Math.round(Date.now() / 1000 - os.uptime());

export const lockContent = (pid = process.pid) => `${pid} ${currentBootTime()}`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** PID des Prozesses, der die Sperre wirklich hält – sonst `null` (leer, ungültig, Prozess weg oder Rechner neu gestartet). */
export function lockHolder(content: string, ownPid = process.pid): number | null {
  const [pidText, bootText] = content.trim().split(/\s+/);
  const pid = Number(pidText);
  if (!pid || pid === ownPid) return null;
  const boot = Number(bootText);
  if (boot && Math.abs(boot - currentBootTime()) > BOOT_TOLERANCE_S) return null; // älter als der letzte Systemstart
  return isAlive(pid) ? pid : null;
}
