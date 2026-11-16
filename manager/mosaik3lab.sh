#!/bin/sh
# Mosaik³LAB Server-Manager starten (Linux, Raspberry Pi OS): prüft Node.js, startet den Manager.
#   sh mosaik3lab.sh            Manager starten
#   sh mosaik3lab.sh uninstall  deinstallieren (fragt, ob Daten behalten werden)
cd "$(dirname "$0")/.." || exit 1

# Installer-Paket: Node.js liegt bei (node/node), sonst das installierte
NODE=node
[ -x node/node ] && NODE="$PWD/node/node"
node_ok() { command -v "$NODE" >/dev/null 2>&1 && "$NODE" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24?0:1)"; }
if ! node_ok; then
  echo "Node.js LTS (mindestens 24) wird benötigt. Installieren mit:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
  printf 'Jetzt ausführen? [j/N] '
  read -r a
  [ "$a" = "j" ] || exit 1
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs || exit 1
  NODE=node
fi

# Deinstallieren braucht root (Dienste, Programmordner unter /opt)
if [ "$1" = "uninstall" ]; then
  if [ "$(id -u)" != 0 ]; then exec sudo "$NODE" manager/cli.mjs uninstall; fi
  exec "$NODE" manager/cli.mjs uninstall
fi
echo "Ohne Bildschirm: ssh -L 5190:127.0.0.1:5190 <benutzer>@<server>, dann http://127.0.0.1:5190 im eigenen Browser."
exec "$NODE" manager/server.mjs --open
