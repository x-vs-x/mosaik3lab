#!/bin/bash
# Prüfungen für den Installer-Test unter Linux (.github/workflows/installer-test.yml) – nur auf dem GitHub-Runner ausführen.
#   pruefen.sh installiert    Dienste laufen (Autostart, Benutzer mosaik3lab, mitgeliefertes Node), Portal/App/Manager antworten, Ordner stimmen
#   pruefen.sh marker         Admin-Konto über den Manager anlegen + Markerdatei in der Ablage (Daten für den Update-Test)
#   pruefen.sh kommandozeile  cli als root hinterlässt keine root-Dateien, ohne sudo klar abgelehnt
#   pruefen.sh erhalten      nach dem Update: Admin-Konto meldet sich an, Markerdatei ist noch da, Sicherung vor dem Update da
#   pruefen.sh zurueck        nach Rückfall/abgelehntem Downgrade: vorige Version ($ERWARTET) aktiv, Schema passt
#   pruefen.sh deinstalliert  Dienste, Firewall-Regel und Programmordner weg, Daten noch da
#   pruefen.sh mail-einrichten  SMTP-Fänger starten, Mailversand über den Manager der installierten (alten) Version einrichten, Testmail
#   pruefen.sh mail-erhalten    nach dem Update: Mail-Einstellungen unverändert (neue Einstellung „auto“), Testmail und echte
#                               App-Mail („Passwort vergessen“) kommen an – multipart/alternative, neues Layout, Passwort am SMTP
# Gegenstück zu pruefen.ps1 (Windows).
set -u
PHASE="${1:?Phase angeben: installiert | marker | kommandozeile | erhalten | zurueck | deinstalliert | mail-einrichten | mail-erhalten}"
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
# Mailversand-Test: lokaler SMTP-Fänger (smtp-faenger.mjs), Einstellungen wie bei einer Schule (mit SMTP-Anmeldung)
POSTFACH="${RUNNER_TEMP:-/tmp}/ci-postfach"
SMTP_PORT=2525
SMTP_USER=ci-smtp
SMTP_PASS=ci-smtp-Geheim-42 # nur für den Wegwerf-Runner
MAIL_URL=http://192.168.1.26/mosaik3lab
MAIL="{\"enabled\":true,\"host\":\"127.0.0.1\",\"port\":$SMTP_PORT,\"secure\":false,\"user\":\"$SMTP_USER\",\"password\":\"$SMTP_PASS\",\"from\":\"Mosaik3LAB <mosaik3lab@schule.test>\",\"recipients\":[\"werkstatt@schule.test\"],\"appBaseUrl\":\"$MAIL_URL\"}"
HIER=$(dirname "$0")
JAR=$(mktemp)
# Anmelden am Manager (Sitzung im Cookie-Glas $JAR), danach mgr_get/mgr_post mit derselben Sitzung
anmelden() {
  TOKEN=$(curl -s -c "$JAR" -b "$JAR" http://127.0.0.1:5190/ | grep -o 'name="csrf-token" content="[0-9a-f]*"' | grep -o '[0-9a-f]\{16,\}')
  curl -s -f -c "$JAR" -b "$JAR" -H 'Content-Type: application/json' -H "x-manager-token: $TOKEN" -d "$LOGIN" http://127.0.0.1:5190/api/auth/login >/dev/null
}
mgr_get() { curl -s -f -b "$JAR" -H "x-manager-token: $TOKEN" "http://127.0.0.1:5190$1"; }
mgr_post() { curl -s -f -c "$JAR" -b "$JAR" -H 'Content-Type: application/json' -H "x-manager-token: $TOKEN" -d "$2" "http://127.0.0.1:5190$1"; }
anzahl() { find "$POSTFACH" -name '*.eml' 2>/dev/null | wc -l; }

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
    pruefe "systemctl cat mosaik3lab-webapp | grep -Eq '^ExecStart=\"?$PROGRAMM/current/node/node\"? '" "Dienstdatei zeigt auf current/node/node" # neuere Versionen setzen Pfade in Anführungszeichen (Leerzeichen)
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
    # Unit-Dateien und polkit-Regel führt root aus: sie gehören root, 644, und mosaik3lab kann weder sie noch ihre Ordner ändern
    for f in $(sudo sh -c 'ls /etc/systemd/system/mosaik3lab-*.service /etc/polkit-1/rules.d/50-mosaik3lab.rules 2>/dev/null'); do
      art=$(sudo stat -c '%U:%G %a' "$f")
      pruefe "[ \"$art\" = 'root:root 644' ] && ! sudo -u mosaik3lab test -w '$f'" "$f gehört root, nur root schreibt ($art)"
    done
    for d in /etc/systemd/system /etc/polkit-1/rules.d; do
      pruefe "! sudo -u mosaik3lab test -w $d" "$d für mosaik3lab nicht beschreibbar ($(sudo stat -c '%U:%G %a' $d))"
    done
    rest=$(sudo find "$DATEN/manager" \( -name '*.service' -o -name '*.rules' \) 2>/dev/null)
    pruefe "[ -z \"$rest\" ]" "keine Unit-Dateien/polkit-Regel im Datenordner – root installiert nichts aus Ordnern von mosaik3lab${rest:+ ($rest)}"
    pruefe "systemctl cat mosaik3lab-updater | grep -q '^TimeoutStartSec=14400$'" "Update-Helfer: Gesamtlimit 4 Stunden ($(systemctl cat mosaik3lab-updater | grep TimeoutStartSec))"
    pruefe "systemctl cat mosaik3lab-portal | grep -q 'AmbientCapabilities=CAP_NET_BIND_SERVICE'" "Portal darf Port 80 ohne root"
    pruefe "[ \"\$(status http://127.0.0.1/mosaik3lab/api/health)\" = 200 ]" 'Portal: http://127.0.0.1/mosaik3lab/api/health → 200'
    pruefe "[ \"\$(status http://127.0.0.1:3001/mosaik3lab/api/health)\" = 200 ]" 'App: http://127.0.0.1:3001/mosaik3lab/api/health → 200'
    soll=$(node -p "require('$PROGRAMM/current/package.json').version" 2>/dev/null)
    ist=$(curl -s --max-time 10 http://127.0.0.1:3001/mosaik3lab/api/health | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch{console.log('?')}})")
    pruefe "[ -n \"$soll\" ] && [ \"$ist\" = \"$soll\" ]" "App meldet ihre Version ($ist, erwartet $soll) – Grundlage für „Was ist neu“"
    pruefe "[ \"\$(status http://127.0.0.1:5190/api/auth)\" = 200 ]" 'Manager: http://127.0.0.1:5190/api/auth → 200'
    pruefe "! sudo ss -ltnH 'sport = :3001' | grep -qv '127.0.0.1'" 'App hört nur auf 127.0.0.1:3001'
    pruefe "[ -x $PROGRAMM/current/node/node ]" "Programm mit node unter $PROGRAMM"
    pruefe "[ -f $PROGRAMM/install.json ]" 'install.json im Programmordner'
    # Der Manager-Dienst (mosaik3lab) muss die Installation erkennen – sonst hält er sich für eine Arbeitskopie
    pruefe "sudo -u mosaik3lab test -r $PROGRAMM/install.json" 'install.json für den Dienstbenutzer lesbar'
    pruefe "(cd /tmp && sudo -u mosaik3lab $PROGRAMM/current/node/node --input-type=module -e \"const m = await import('$PROGRAMM/current/manager/lib/config.mjs'); process.exit(m.INSTALL ? 0 : 1)\")" 'Manager erkennt als mosaik3lab die Installation'
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
  kommandozeile)
    # Kommandozeile als root (z. B. „sudo … cli.mjs backup run“): neue Dateien müssen danach wieder mosaik3lab gehören,
    # sonst kann die Web-App z. B. eine wiederhergestellte Datenbank nicht mehr schreiben. Ohne sudo: klar abgelehnt.
    cli="$PROGRAMM/current/manager/cli.mjs"
    pruefe "(cd /tmp && sudo $PROGRAMM/current/node/node $cli backup run --reason 'CI Kommandozeile' >/dev/null)" 'cli backup run als root'
    pruefe "[ -z \"\$(sudo find $DATEN $BACKUPS $LOGS -user root)\" ]" 'danach keine Dateien von root in Daten, Sicherungen, Protokollen'
    (cd /tmp && $PROGRAMM/current/node/node "$cli" backup run >/tmp/cli-ohne-sudo.txt 2>&1); rc=$?
    pruefe "[ $rc = 4 ] && grep -q 'mit sudo' /tmp/cli-ohne-sudo.txt" "ohne sudo klar abgelehnt (Exit $rc: $(head -1 /tmp/cli-ohne-sudo.txt))"
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
  mail-einrichten)
    mkdir -p "$POSTFACH"
    nohup node "$HIER/smtp-faenger.mjs" $SMTP_PORT "$POSTFACH" > "$POSTFACH/faenger.log" 2>&1 &
    sleep 1
    pruefe "grep -q 'SMTP-Fänger auf' '$POSTFACH/faenger.log'" "SMTP-Fänger läuft auf 127.0.0.1:$SMTP_PORT"
    pruefe "anmelden" 'Anmeldung am Manager (installierte Version vor dem Update)'
    pruefe "mgr_post /api/mail '$MAIL' >/dev/null" 'Mailversand über den Manager eingerichtet (SMTP mit Anmeldung, Empfänger, Adresse in den Mails)'
    pruefe "mgr_get /api/mail | grep -q '\"host\":\"127.0.0.1\"'" "Mail-Einstellungen gespeichert ($(mgr_get /api/mail | head -c 300))"
    seit=$(anzahl)
    mgr_post /api/mail/test '{"to":"vorher@schule.test"}'; echo
    pruefe "ALTES_LAYOUT=1 node '$HIER/mail-pruefen.mjs' '$POSTFACH' $seit vorher@schule.test $SMTP_USER $SMTP_PASS" 'Testmail der Version vor dem Update kommt an'
    ;;
  mail-erhalten)
    pruefe "anmelden" 'Anmeldung am Manager nach dem Update'
    nachher=$(mgr_get /api/mail)
    echo "$nachher" | head -c 600; echo
    soll="{\"enabled\":true,\"host\":\"127.0.0.1\",\"port\":$SMTP_PORT,\"secure\":false,\"user\":\"$SMTP_USER\",\"passwordSet\":true,\"from\":\"Mosaik3LAB <mosaik3lab@schule.test>\",\"recipients\":[\"werkstatt@schule.test\"],\"appBaseUrl\":\"$MAIL_URL\",\"erreichbarkeit\":\"auto\"}"
    abw=$(node -e 'const [m, soll] = process.argv.slice(1).map((x) => JSON.parse(x)); console.log(Object.keys(soll).filter((k) => JSON.stringify(m[k]) !== JSON.stringify(soll[k])).map((k) => k + "=" + JSON.stringify(m[k])).join(", "))' "$nachher" "$soll" 2>&1)
    if [ -z "$abw" ]; then ok 'Mail-Einstellungen nach dem Update unverändert, Passwort noch gesetzt, neue Einstellung = automatisch'; else fehler "Mail-Einstellungen nach dem Update verändert – abweichend: $abw"; fi
    seit=$(anzahl)
    mgr_post /api/mail/test '{"to":"pruefer@schule.test"}'; echo
    pruefe "node '$HIER/mail-pruefen.mjs' '$POSTFACH' $seit pruefer@schule.test $SMTP_USER $SMTP_PASS 'Der Mailversand funktioniert' 'nur im Schulnetz' '$MAIL_URL/verwaltung/bestellungen'" 'Testmail nach dem Update: kommt an, neues Layout, Hinweis „nur im Schulnetz“'
    seit=$(anzahl)
    curl -s -f -H 'Content-Type: application/json' -H 'X-Requested-With: mosaik3lab' -d '{"email":"ci-admin@schule.test"}' http://127.0.0.1/mosaik3lab/api/auth/passwort-vergessen; echo
    pruefe "node '$HIER/mail-pruefen.mjs' '$POSTFACH' $seit ci-admin@schule.test $SMTP_USER $SMTP_PASS 'Neues Passwort festlegen' '$MAIL_URL/passwort#'" 'Echte App-Mail („Passwort vergessen“) nach dem Update kommt an'
    ;;
  *) echo "unbekannte Phase: $PHASE"; exit 2 ;;
esac
if [ $FEHLER -gt 0 ]; then echo "$FEHLER Prüfung(en) fehlgeschlagen"; exit 1; fi
