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
# Ohne root: einmal mit sudo neu starten. Fehlt sudo oder schlägt die Anmeldung fehl, klar abbrechen statt mit einer
# Meldung von sudo bzw. der Shell („sudo: not found“) zu enden.
ohne_rechte() {
  echo
  echo "Abbruch: $1"
  echo "Mosaik3LAB braucht für die Einrichtung Administratorrechte (root). Bitte so starten:"
  echo "   sudo ./installieren.sh"
  echo "oder – auf Systemen ohne sudo – als root:"
  echo "   su -c 'sh $SELF'"
  echo "Es wurde nichts verändert."
  exit 1
}
if [ -z "$DRY" ] && [ -z "$MOSAIK3LAB_SYSTEM_DRY_RUN" ] && [ "$(id -u)" != 0 ]; then
  command -v sudo >/dev/null 2>&1 || ohne_rechte "sudo ist auf diesem Rechner nicht installiert."
  if [ -n "$STILL" ]; then
    sudo -n true 2>/dev/null || ohne_rechte "sudo verlangt ein Passwort (bei --still gibt es keine Rückfrage)."
  else
    echo "Für die Einrichtung werden Administratorrechte gebraucht – bitte das eigene Passwort eingeben (sudo)."
    sudo -v || ohne_rechte "sudo hat die Anmeldung abgelehnt (falsches Passwort oder dieses Konto darf kein sudo)."
    exec sudo sh "$SELF" "$@"
  fi
  exec sudo -n sh "$SELF" "$@"
fi
# Sicherheitsnetz: Ab hier muss es root sein (z. B. falls sudo auf einen anderen Benutzer eingestellt ist).
if [ -z "$DRY" ] && [ -z "$MOSAIK3LAB_SYSTEM_DRY_RUN" ] && [ "$(id -u)" != 0 ]; then
  ohne_rechte "das Skript läuft nicht als root."
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
  # Der Manager aus dem entpackten Paket liefe ohne root und könnte nichts einrichten – deshalb hier der Befehl
  echo " Vorhandenen Datenbestand von einem anderen Rechner (auch Windows) übernehmen? Dann hier abbrechen und stattdessen:"
  echo "   sudo ./node/node manager/cli.mjs setup --config Installieren.json --from-backup <datei.m3lbackup> --backup-password <passwort>"
  echo " (Ordner, die es hier nicht gibt, ersetzt Mosaik3LAB durch die Standardordner dieses Rechners.)"
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
echo "  Adresse der App (von jedem Gerät im Schulnetz):"
echo "    http://$NAME/mosaik3lab/"
echo "  Solange es noch keinen Administrator gibt, führt die Adresse direkt"
echo "  zur Einrichtung: E-Mail, Name, Passwort festlegen – damit meldet man"
echo "  sich danach in der App und im Server-Manager an."
echo "  Admins erreichen den Server-Manager immer unter …/mosaik3lab/manager/"
echo
echo "  Dieser entpackte Ordner wird nicht mehr gebraucht und kann"
echo "  gelöscht werden (auch die .tar.gz-Datei)."
echo " ================================================================"
echo
[ -n "$MOSAIK3LAB_SYSTEM_DRY_RUN" ] && exit 0
# Gibt es noch keinen Administrator: Adressen anzeigen, unter denen man ihn anlegt
"$NODE" manager/cli.mjs erstzugang || true
echo
exit 0
