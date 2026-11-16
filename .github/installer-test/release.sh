#!/usr/bin/env bash
# Getestetes Installer-Paket als Download ablegen (nur nach bestandenem Test aufgerufen; Windows über Git-Bash, Linux direkt).
#   Tag-Lauf (vX.Y.Z, angelegt mit „npm run release“): Release „vX.Y.Z“ – die freigegebene Version mit allen drei Paketen.
#   sonst: Release „installer-pakete“ (Vorabversion) – je System immer nur das neueste getestete Paket.
# Releases zählen nicht zum Artefakt-Speicher. Aufruf: release.sh <paketdatei>   (GH_TOKEN, GH_REPO gesetzt)
set -euo pipefail
paket="$1"
test -f "$paket"
if [ "${GITHUB_REF_TYPE:-}" = "tag" ]; then
  tag="$GITHUB_REF_NAME"
  titel="Mosaik³LAB ${tag#v}"
  vorab=""
  notiz="Freigegebene Version ${tag#v}. Getestet auf Windows, Linux x64 und Raspberry Pi OS 64 Bit (Neuinstallation, Update, Rückfall, Deinstallation). Pakete: windows-x64 = Windows 10/11, linux-x64 = PCs/Server, linux-arm64 = Raspberry Pi. Änderungen: CHANGELOG.md; Anleitung: README.txt im Paket."
else
  tag="installer-pakete"
  titel="Installer-Pakete (neuester getesteter Entwicklungsstand)"
  vorab="--prerelease"
  notiz="Entwicklungsstand, von „Installer-Test“ nach bestandenem Test abgelegt – für die Schule bitte eine freigegebene Version (vX.Y.Z) nehmen."
fi
# Release anlegen, falls es fehlt (die Jobs laufen gleichzeitig – wer zuerst kommt, legt an)
for versuch in 1 2 3; do
  gh release view "$tag" >/dev/null 2>&1 && break
  gh release create "$tag" $vorab --title "$titel" --notes "$notiz" >/dev/null 2>&1 || sleep 5
done
# Vorheriges Paket desselben Systems ersetzen (Name endet z. B. auf -linux-arm64.tar.gz)
system=$(basename "$paket" | sed -E 's/^Mosaik3LAB-Installer-.*-((windows|linux)-[a-z0-9]+)\..*$/\1/')
for alt in $(gh release view "$tag" --json assets -q '.assets[].name' | grep -E -- "-${system}\.(zip|tar\.gz)$" || true); do
  [ "$alt" = "$(basename "$paket")" ] || gh release delete-asset "$tag" "$alt" -y
done
gh release upload "$tag" "$paket" --clobber
echo "abgelegt in Release $tag: $(basename "$paket")"
