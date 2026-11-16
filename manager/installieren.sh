#!/bin/sh
# Mosaik3LAB installieren oder aktualisieren (Linux x64, Raspberry Pi OS 64 Bit) – liegt im Installer-Paket ganz oben (npm run paket).
#   sudo ./installieren.sh            einrichten bzw. aktualisieren: Programm nach /opt/mosaik3lab, Daten nach /var/lib/mosaik3lab,
#                                     Sicherungen /var/backups/mosaik3lab, Protokolle /var/log/mosaik3lab, Dienste mit Autostart
#   ./installieren.sh probelauf       nur anzeigen, was passieren würde (ändert nichts)
#   sudo ./installieren.sh --still    ohne Rückfragen (automatischer Test)
# Die eigentliche Arbeit macht "manager/cli.mjs setup" mit dem mitgelieferten node/node.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")" || exit 1
DRY=
STILL=
case "$1" in
  probelauf) DRY=--dry-run ;;
  --still) STILL=1 ;;
esac
PROGRAMM=/opt/mosaik3lab

if [ ! -f manager/cli.mjs ] || [ ! -f Installieren.json ]; then
  echo "Bitte das Paket zuerst entpacken (tar xzf Mosaik3LAB-Installer-….tar.gz) und im entpackten Ordner starten."
  exit 1
fi

# ---------- Node.js: kommt mit dem Paket (node/node) ----------
NODE="$PWD/node/node"
if ! "$NODE" --version >/dev/null 2>&1; then
  echo "Das mitgelieferte Node.js startet auf diesem Rechner nicht ($(uname -m))."
  echo "Bitte das passende Paket nehmen: linux-x64 für PCs/Server, linux-arm64 für Raspberry Pi OS 64 Bit."
  exit 1
fi

# ---------- Einmal Administratorrechte holen (Programm, Benutzer, Dienste, Firewall) ----------
if [ -z "$DRY" ] && [ -z "$MOSAIK3LAB_SYSTEM_DRY_RUN" ] && [ "$(id -u)" != 0 ]; then
  if [ -n "$STILL" ]; then exec sudo -n sh "$SELF" "$@"; fi
  echo "Für die Einrichtung werden Administratorrechte gebraucht – bitte das eigene Passwort eingeben (sudo)."
  exec sudo sh "$SELF" "$@"
fi

# ---------- Einrichten bzw. aktualisieren ----------
UPDATE=
if [ -z "$DRY" ] && [ -z "$MOSAIK3LAB_SYSTEM_DRY_RUN" ] && [ -f "$PROGRAMM/install.json" ] && systemctl cat mosaik3lab-webapp >/dev/null 2>&1; then UPDATE=1; fi
echo
if [ -n "$UPDATE" ]; then
  echo " Mosaik3LAB ist schon eingerichtet und wird jetzt auf diese Version aktualisiert."
  echo " Daten, Konten und Einstellungen bleiben erhalten. Die App ist dabei kurz nicht erreichbar."
else
  echo " Mosaik3LAB wird eingerichtet: Programm unter $PROGRAMM, Daten und Bilder unter /var/lib/mosaik3lab,"
  echo " Sicherungen unter /var/backups/mosaik3lab, Dienste mit Autostart, im Schulnetz erreichbar."
  echo
  echo " Vorhandenen Datenbestand von einem anderen Rechner übernehmen? Dann hier abbrechen und stattdessen"
  echo " \"sh manager/mosaik3lab.sh\" starten: Einrichten – \"Aus Backup einrichten\"."
fi
echo
if [ -z "$DRY" ]; then
  ANTWORT=j
  if [ -z "$STILL" ]; then
    printf 'Jetzt starten? [J/n] '
    read -r ANTWORT
  fi
  [ "$ANTWORT" = "n" ] || [ "$ANTWORT" = "N" ] && exit 1
fi
# Update: Sicherung direkt vor dem Umschalten, älteres Paket wird abgelehnt, bei Fehlschlag automatisch zurück auf die
# vorige Version – das macht alles "cli.mjs setup" (manager/lib/paketupdate.mjs).
if ! "$NODE" manager/cli.mjs setup --config Installieren.json $DRY; then
  echo
  echo "Die Einrichtung ist NICHT fertig geworden (siehe Meldung oben)."
  [ -n "$UPDATE" ] && echo "Steht oben \"zurückgeschaltet\", läuft die bisherige Version wieder – mit unveränderten Daten."
  echo "Ursache beheben und \"sudo ./installieren.sh\" erneut starten – fertige Schritte werden übersprungen."
  exit 1
fi
[ -n "$DRY" ] && exit 0

NAME="$(hostname -f 2>/dev/null || hostname)"
echo
echo " ================================================================"
if [ -n "$UPDATE" ]; then echo "  Mosaik3LAB ist aktualisiert."; else echo "  Mosaik3LAB ist eingerichtet."; fi
echo
echo "  Steht oben ein BACKUP-PASSWORT? Bitte jetzt aufschreiben und"
echo "  sicher aufbewahren – ohne es lassen sich Sicherungen nicht"
echo "  wiederherstellen. Es wird nicht noch einmal angezeigt."
echo
echo "  Server-Manager: http://127.0.0.1:5190 (nur auf diesem Rechner;"
echo "  von einem anderen Rechner: ssh -L 5190:127.0.0.1:5190 <benutzer>@$NAME,"
echo "  dann dort http://127.0.0.1:5190 öffnen). Beim ersten Mal dort das"
echo "  Administrator-Konto anlegen (E-Mail, Name, Passwort)."
echo
echo "  Adresse der App:  http://$NAME/mosaik3lab/"
echo
echo "  Dieser entpackte Ordner wird nicht mehr gebraucht und kann"
echo "  gelöscht werden (auch die .tar.gz-Datei)."
echo " ================================================================"
echo
[ -n "$MOSAIK3LAB_SYSTEM_DRY_RUN" ] && exit 0
"$NODE" -e "(async()=>{for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:5190/api/auth')).ok)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,2000))}process.exit(1)})()" || echo "Der Server-Manager antwortet noch nicht – bitte in einer Minute http://127.0.0.1:5190 öffnen."
exit 0
