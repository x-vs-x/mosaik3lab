#!/bin/bash
# Prüfungen für den Installer-Test unter Linux (.github/workflows/installer-test.yml) – nur auf dem GitHub-Runner ausführen.
#   pruefen.sh installiert    Dienste laufen (Autostart, Benutzer mosaik3lab, mitgeliefertes Node), Portal/App/Manager antworten, Ordner stimmen
#   pruefen.sh marker         Admin-Konto über den Manager anlegen + Markerdatei in der Ablage (Daten für den Update-Test)
#   pruefen.sh erhalten       nach dem Update: Admin-Konto meldet sich an, Markerdatei ist noch da, Sicherung vor dem Update da
#   pruefen.sh zurueck        nach Rückfall/abgelehntem Downgrade: vorige Version ($ERWARTET) aktiv, Schema passt
#   pruefen.sh deinstalliert  Dienste, Firewall-Regel und Programmordner weg, Daten noch da
# Gegenstück zu pruefen.ps1 (Windows).
set -u
PHASE="${1:?Phase angeben: installiert | marker | erhalten | zurueck | deinstalliert}"
PROGRAMM=/opt/mosaik3lab
DATEN=/var/lib/mosaik3lab
BACKUPS=/var/backups/mosaik3lab
LOGS=/var/log/mosaik3lab
DIENSTE="mosaik3lab-webapp mosaik3lab-backup mosaik3lab-portal mosaik3lab-manager"
ADMIN='{"email":"ci-admin@schule.test","name":"CI Admin","password":"ci-nur-test-1234"}' # nur für den Wegwerf-Runner
LOGIN='{"email":"ci-admin@schule.test","password":"ci-nur-test-1234"}'
MARKER="$DATEN/ablage/ci-marker.txt"
FEHLER=0

ok() { echo "OK   $1"; }
fehler() { echo "FEHLER $1"; FEHLER=$((FEHLER + 1)); }
pruefe() { if eval "$1"; then ok "$2"; else fehler "$2"; fi }

# HTTP-Status holen (wiederholt, bis 200 kommt oder die Zeit um ist – Dienste brauchen nach dem Start etwas)
status() {
  local ende=$((SECONDS + ${2:-90})) code=0
  while :; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1")
    [ "$code" = 200 ] && break
    [ $SECONDS -ge $ende ] && break
    sleep 3
  done
  echo "$code"
}

# Schreibaktion am Manager: CSRF-Token steht in der Startseite (neu nach jedem Neustart des Dienstes), Sitzung per Cookie
manager_post() {
  local jar token
  jar=$(mktemp)
  token=$(curl -s -c "$jar" -b "$jar" http://127.0.0.1:5190/ | grep -o 'name="csrf-token" content="[0-9a-f]*"' | grep -o '[0-9a-f]\{16,\}')
  curl -s -f -c "$jar" -b "$jar" -H 'Content-Type: application/json' -H "x-manager-token: $token" -d "$2" "http://127.0.0.1:5190$1"
  local rc=$?
  rm -f "$jar"
  return $rc
}
needs_admin() { curl -s http://127.0.0.1:5190/api/auth | grep -q '"needsAdmin":true'; }

case "$PHASE" in
  installiert)
    for d in $DIENSTE; do
      pruefe "systemctl is-active --quiet $d" "Dienst $d läuft ($(systemctl is-active $d))"
      pruefe "systemctl is-enabled --quiet $d" "Dienst $d startet automatisch ($(systemctl is-enabled $d))"
      pruefe "[ \"\$(systemctl show -p User --value $d)\" = mosaik3lab ]" "Dienst $d läuft als Benutzer mosaik3lab"
      pid=$(systemctl show -p MainPID --value "$d")
      exe=$(sudo readlink "/proc/$pid/exe" 2>/dev/null)
      pruefe "[[ \"$exe\" == $PROGRAMM/* ]]" "Dienst $d nutzt Node aus dem Programmordner ($exe)"
    done
    pruefe "systemctl cat mosaik3lab-webapp | grep -q 'ExecStart=$PROGRAMM/current/node/node '" "Dienstdatei zeigt auf current/node/node"
    if [ -f "$PROGRAMM/current/manager/runners/aktualisieren.mjs" ]; then # ältere Versionen haben keinen Update-Helfer
    beschreibbar=""
    for d in "$PROGRAMM" "$PROGRAMM/releases" "$(readlink -f "$PROGRAMM/current")" "$PROGRAMM/current/manager" "$PROGRAMM/current/manager/runners"; do
      if sudo -u mosaik3lab test -w "$d"; then beschreibbar="$beschreibbar $d"; sudo stat -c '  %A %U:%G %n' "$d"; fi
    done
    pruefe "[ -z \"$beschreibbar\" ]" "Programmordner ist für den Dienstbenutzer nicht beschreibbar (Update-Helfer läuft daraus als root)${beschreibbar:+ – beschreibbar:$beschreibbar}"
    [ -n "$beschreibbar" ] && { id mosaik3lab; sudo getfacl -p "$PROGRAMM" 2>/dev/null | head -12; } || true
    pruefe "systemctl cat mosaik3lab-updater | grep -q 'runners/aktualisieren.mjs'" "Update-Helfer eingerichtet"
    pruefe "systemctl is-enabled --quiet mosaik3lab-updater" "Update-Helfer prüft beim Hochfahren ($(systemctl is-enabled mosaik3lab-updater 2>&1))"
    pruefe "[ -z \"\$(systemctl show -p User --value mosaik3lab-updater)\" ]" "Update-Helfer läuft als root"
    pruefe "sudo grep -q 'updater' /etc/polkit-1/rules.d/50-mosaik3lab.rules" "Manager darf den Update-Helfer starten (polkit)"
    fi
    pruefe "systemctl cat mosaik3lab-portal | grep -q 'AmbientCapabilities=CAP_NET_BIND_SERVICE'" "Portal darf Port 80 ohne root"
    pruefe "[ \"\$(status http://127.0.0.1/mosaik3lab/api/health)\" = 200 ]" 'Portal: http://127.0.0.1/mosaik3lab/api/health → 200'
    pruefe "[ \"\$(status http://127.0.0.1:3001/mosaik3lab/api/health)\" = 200 ]" 'App: http://127.0.0.1:3001/mosaik3lab/api/health → 200'
    soll=$(node -p "require('$PROGRAMM/current/package.json').version" 2>/dev/null)
    ist=$(curl -s --max-time 10 http://127.0.0.1:3001/mosaik3lab/api/health | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch{console.log('?')}})")
    case "$soll" in
      0.*) ;; # Versionen vor 1.0.0 melden keine Version
      *) pruefe "[ -n \"$soll\" ] && [ \"$ist\" = \"$soll\" ]" "App meldet ihre Version ($ist, erwartet $soll) – Grundlage für „Was ist neu“" ;;
    esac
    pruefe "[ \"\$(status http://127.0.0.1:5190/api/auth)\" = 200 ]" 'Manager: http://127.0.0.1:5190/api/auth → 200'
    pruefe "! sudo ss -ltnH 'sport = :3001' | grep -qv '127.0.0.1'" 'App hört nur auf 127.0.0.1:3001'
    pruefe "[ -x $PROGRAMM/current/node/node ]" "Programm mit node unter $PROGRAMM"
    pruefe "[ -f $PROGRAMM/install.json ]" 'install.json im Programmordner'
    for o in "$DATEN/daten" "$DATEN/ablage" "$BACKUPS" "$LOGS"; do
      pruefe "[ -d $o ] && [ \"\$(stat -c %U $o)\" = mosaik3lab ]" "Ordner $o gehört mosaik3lab"
    done
    pruefe "[ -z \"\$(sudo find $DATEN $BACKUPS $LOGS -user root)\" ]" 'keine Dateien von root in Daten, Sicherungen, Protokollen'
    pruefe "sudo ufw show added | grep -q '80/tcp'" 'Firewall-Regel (ufw) für Port 80'
    pruefe "[ -f /usr/share/applications/mosaik3lab/Server-Manager.desktop ]" 'Menüeintrag angelegt'
    ;;
  marker)
    pruefe "needs_admin" 'frische Einrichtung: noch kein Administrator'
    pruefe "manager_post /api/auth/first '$ADMIN' >/dev/null" 'Admin-Konto über den Manager angelegt'
    pruefe "! needs_admin" 'Manager meldet: Administrator vorhanden'
    echo 'Mosaik3LAB Installer-Test' | sudo -u mosaik3lab tee "$MARKER" >/dev/null
    pruefe "[ -f $MARKER ]" "Markerdatei $MARKER"
    ;;
  erhalten)
    pruefe "[ \"\$(status http://127.0.0.1:5190/api/auth)\" = 200 ]" 'Manager antwortet nach dem Update'
    pruefe "! needs_admin" 'Admin-Konto nach dem Update noch da'
    pruefe "manager_post /api/auth/login '$LOGIN' >/dev/null" 'Anmeldung mit dem Admin-Konto nach dem Update'
    pruefe "[ -f $MARKER ]" 'Markerdatei nach dem Update noch da'
    pruefe "[ -n \"\$(ls -A $BACKUPS)\" ]" "Sicherung vor dem Update angelegt ($(ls $BACKUPS | tr '\n' ' '))"
    n=$(find "$PROGRAMM/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)
    pruefe "[ $n = 2 ]" "zwei Versionen in releases ($(ls $PROGRAMM/releases | tr '\n' ' '))"
    ;;
  zurueck)
    id=$(node -p "require('$PROGRAMM/current/.release.json').id")
    pruefe "[ \"$id\" = \"${ERWARTET:-}\" ]" "aktive Version ist wieder die vorige ($id, erwartet ${ERWARTET:-?})"
    fremd=$(ls "$PROGRAMM/releases" | grep -E 'kaputt|alt' | tr '\n' ' ')
    pruefe "[ -z \"$fremd\" ]" "kaputtes bzw. abgelehntes Paket nicht in releases ($fremd)"
    pruefe "sudo $PROGRAMM/current/node/node $(dirname "$0")/schema-pruefen.mjs $PROGRAMM/current $DATEN/daten/mosaik3lab.db" 'Datenbank-Schema passt zur aktiven Version (Datenbank zurückgespielt)'
    pruefe "[ \"\$(status http://127.0.0.1/mosaik3lab/api/health)\" = 200 ]" 'App antwortet über das Portal'
    ;;
  deinstalliert)
    for d in $DIENSTE mosaik3lab-updater; do pruefe "[ ! -f /etc/systemd/system/$d.service ] && ! systemctl is-active --quiet $d" "Dienst $d entfernt"; done
    pruefe "! sudo ufw show added | grep -q '80/tcp'" 'Firewall-Regel entfernt'
    pruefe "[ ! -e /usr/share/applications/mosaik3lab/Server-Manager.desktop ]" 'Menüeintrag entfernt'
    # Der Programmordner wird von einem eigenen Prozess nach Programmende gelöscht (alle 3 s neuer Versuch)
    ende=$((SECONDS + 120))
    while [ -e $PROGRAMM ] && [ $SECONDS -lt $ende ]; do sleep 3; done
    pruefe "[ ! -e $PROGRAMM ]" "Programmordner $PROGRAMM entfernt"
    pruefe "[ -d $DATEN/daten ]" "$DATEN/daten behalten"
    pruefe "[ -n \"\$(sudo find $DATEN/daten -name '*.db')\" ]" 'Datenbank behalten'
    pruefe "[ -f $MARKER ]" 'Markerdatei behalten'
    ;;
  *) echo "unbekannte Phase: $PHASE"; exit 2 ;;
esac
if [ $FEHLER -gt 0 ]; then echo "$FEHLER Prüfung(en) fehlgeschlagen"; exit 1; fi
