Mosaik³LAB – Installer für LINUX (arm64)
Version {{version}} (Stand {{commit}})
==========================================

Für: Raspberry Pi 4/5 mit Raspberry Pi OS 64 Bit (oder anderes Linux auf ARM 64 Bit).
Raspberry Pi OS 32 Bit (uname -m zeigt armv7l) wird NICHT unterstützt – bitte 64 Bit installieren.
Dieses Paket ist NICHT für normale PCs (dafür: linux-x64) und nicht für Windows.
Prüfen: im Terminal "uname -m" eingeben. Es muss "aarch64" erscheinen.
Voraussetzung: systemd (bei allen üblichen Systemen dabei) und ein Benutzer mit sudo.
Alles Nötige ist im Paket (auch Node.js), kein apt nötig.

INSTALLIEREN (Schritt für Schritt)
  1. Paket auf den Rechner kopieren und im Terminal im selben Ordner:
  tar xzf {{name}}.tar.gz
  cd {{name}}
  sudo ./installieren.sh

  2. Bei "Jetzt starten?" Enter drücken. Die Einrichtung dauert einige Minuten.
  3. Am Ende stehen im Terminal:
     - einmalig ein BACKUP-PASSWORT. Aufschreiben und sicher aufbewahren!
     - die Adresse der App im Schulnetz, z. B. http://<rechnername>/mosaik3lab/
     Die App ist ab jetzt im Netz erreichbar (eine aktive Firewall ufw/firewalld wird freigegeben).

  Ausprobieren ohne Änderungen:  ./installieren.sh probelauf
  Danach kann der entpackte Ordner gelöscht werden.

ERSTER ADMINISTRATOR (von jedem Gerät im Schulnetz – kein Bildschirm am Server nötig)
  1. Im Browser die Adresse der App öffnen: http://<rechnername>/mosaik3lab/
     (oder die IP-Adresse: am Server "hostname -I")
  2. Solange es noch keinen Administrator gibt, erscheint sofort die Seite "Willkommen".
  3. E-Mail, Name und Passwort (mindestens 8 Zeichen, zweimal) eingeben -> "Anlegen und anmelden".
     Bitte gleich nach der Installation erledigen: Bis dahin kann jeder im Schulnetz dieses Konto anlegen.
  4. Fertig: Man ist angemeldet und im Server-Manager. Mit derselben E-Mail und demselben Passwort
     meldet man sich ab jetzt in der App an. Administratoren finden den Server-Manager in der App
     immer im Menü "Verwaltung" -> "Server-Manager" (Adresse: .../mosaik3lab/manager/).
     Andere Konten (Druck-Team, Lehrkräfte) sehen den Server-Manager nicht.
  Notzugang, falls die App nicht läuft: Server-Manager direkt am Server unter http://127.0.0.1:5190
  (von einem anderen Rechner: ssh -L 5190:127.0.0.1:5190 <benutzer>@<rechnername>, dann dort öffnen).

WO LIEGT WAS
  Programm:      /opt/mosaik3lab
  Daten:         /var/lib/mosaik3lab
  Sicherungen:   /var/backups/mosaik3lab
  Protokolle:    /var/log/mosaik3lab
  Dienste:       mosaik3lab-webapp, -portal, -backup, -manager (systemd, starten automatisch)
  App im Schulnetz:  http://<rechnername>/mosaik3lab/   (IP-Adresse: hostname -I)

NEUE VERSION
  Neues Paket entpacken und wieder "sudo ./installieren.sh". Vorher nichts deinstallieren.
  Daten, Konten und Einstellungen bleiben erhalten; ein vorhandener Administrator bleibt.
  Ein älteres Paket über einer neueren Version wird abgelehnt (es wird nichts verändert).

ENTFERNEN
  sudo /opt/mosaik3lab/current/node/node /opt/mosaik3lab/current/manager/cli.mjs uninstall

Ausführliche Anleitung: docs/INSTALLATION.md (Abschnitt "Linux und Raspberry Pi")
