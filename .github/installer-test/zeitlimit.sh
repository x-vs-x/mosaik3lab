#!/bin/bash
# Befehl mit Zeitlimit für den Installer-Test (Linux): hängt er, wird er abgebrochen und der Zustand gezeigt – statt dass
# der ganze Job bis zu seinem Zeitlimit wartet und dann ohne Protokolle abgebrochen wird.
#   zeitlimit.sh <minuten> <befehl …>     Exit-Code des Befehls; 124 = Zeit abgelaufen
min="${1:?Minuten angeben}"
shift
timeout --kill-after=30s "${min}m" "$@"
rc=$?
if [ "$rc" = 124 ] || [ "$rc" = 137 ]; then
  echo
  echo "FEHLER: „$*“ nach $min Minuten abgebrochen – hängt. Zustand zu diesem Zeitpunkt:"
  echo "---- Prozesse (Baum) ----"
  ps -eo pid,ppid,user,etimes,stat,args --forest | grep -Ev '\[[^]]+\]$' | tail -80
  echo "---- Dienste ----"
  systemctl list-units 'mosaik3lab-*' --all --no-pager 2>&1 | head -20
  echo "---- Sperre der Einrichtung ----"
  sudo cat /opt/mosaik3lab/.einrichtung.lock 2>&1
  for f in /var/log/mosaik3lab/manager.log /var/log/mosaik3lab/app.log /opt/mosaik3lab/update-helfer.log; do
    echo "---- $f (Ende) ----"
    sudo tail -n 30 "$f" 2>&1
  done
  # Hängende Reste beenden, damit die folgenden Schritte (Logs sammeln) sauber laufen
  sudo pkill -f 'manager/cli.mjs setup' 2>/dev/null || true
  exit 124
fi
exit "$rc"
