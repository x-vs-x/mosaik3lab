Mosaik³LAB – Installer für WINDOWS
Version {{version}} (Stand {{commit}})
==================================

Für: Windows 10/11, 64 Bit. Alles Nötige ist im Paket (auch Node.js und die Datenbank).
Man braucht Administratorrechte und beim ersten Mal Internet.

INSTALLIEREN (Schritt für Schritt)
1. Die ZIP-Datei mit der rechten Maustaste anklicken -> "Alle extrahieren ..." -> "Extrahieren".
2. Im entpackten Ordner "Installieren.cmd" doppelklicken.
3. Bei der Frage nach Administratorrechten "Ja" anklicken.
4. Bei "Jetzt starten?" J eingeben und Enter drücken. Die Einrichtung dauert einige Minuten.
5. Am Ende stehen im Fenster:
   - einmalig ein BACKUP-PASSWORT. Aufschreiben und sicher aufbewahren!
     Ohne dieses Passwort lassen sich die Sicherungen nicht wiederherstellen.
   - die Adresse der App im Schulnetz, z. B. http://<Rechnername>/mosaik3lab/
   Es öffnet sich kein Browser – die App ist ab jetzt einfach im Netz erreichbar.
6. Fenster mit einer Taste schließen.

ERSTER ADMINISTRATOR (von jedem Gerät im Schulnetz)
1. Im Browser die Adresse der App öffnen: http://<Rechnername>/mosaik3lab/
   (oder die IP-Adresse des Rechners statt des Namens; auf dem Rechner selbst: http://localhost/mosaik3lab/)
2. Solange es noch keinen Administrator gibt, erscheint sofort die Seite "Willkommen".
3. E-Mail, Name und Passwort (mindestens 8 Zeichen, zweimal) eingeben -> "Anlegen und anmelden".
   Bitte gleich nach der Installation erledigen: Bis dahin kann jeder im Schulnetz dieses Konto anlegen.
4. Fertig: Man ist angemeldet und im Server-Manager. Mit derselben E-Mail und demselben Passwort
   meldet man sich ab jetzt in der App an. Administratoren finden den Server-Manager in der App
   immer im Menü "Verwaltung" -> "Server-Manager" (Adresse: .../mosaik3lab/manager/).
   Andere Konten (Druck-Team, Lehrkräfte) sehen den Server-Manager nicht.

Die App ist im Netz nicht erreichbar? Meist ist das Netzwerk in Windows als "Öffentlich" eingestuft –
dann blockiert die Firewall. Einstellungen -> Netzwerk und Internet -> Eigenschaften -> "Privat"
(im Schulnetz meist "Domäne"). Der Installer weist am Ende darauf hin.

Danach kann der entpackte Ordner gelöscht werden.

WO LIEGT WAS
  Programm:  C:\Program Files\Mosaik3LAB
  Daten:     C:\Mosaik3LAB  (daten, ablage, backups, logs)
  App im Schulnetz:      http://<Rechnername>/mosaik3lab/
  App auf dem Rechner:   http://localhost/mosaik3lab/  (oder Desktop-Verknüpfung "Mosaik³LAB öffnen")

NEUE VERSION
  Neues Paket entpacken und wieder "Installieren.cmd" doppelklicken. Vorher nichts deinstallieren.
  Daten, Konten und Einstellungen bleiben erhalten; ein vorhandener Administrator bleibt.
  Ein älteres Paket über einer neueren Version wird abgelehnt (es wird nichts verändert).

DATEN VON EINEM ANDEREN RECHNER ÜBERNEHMEN
  Nicht Installieren.cmd starten, sondern "manager\mosaik3lab.cmd" -> Einrichten ->
  "Aus Sicherung einrichten" -> Sicherungsdatei (.m3lbackup) und Backup-Passwort angeben.

ENTFERNEN
  Startmenü -> Mosaik³LAB -> "Mosaik³LAB deinstallieren".

Ausführliche Anleitung: docs\INSTALLATION.md
Dieses Paket ist NICHT für Linux oder den Raspberry Pi. Dafür gibt es eigene Pakete (.tar.gz).
