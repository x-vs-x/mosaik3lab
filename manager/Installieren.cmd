@echo off
rem Mosaik3LAB installieren oder aktualisieren (Windows) - liegt im Installer-Paket ganz oben (npm run paket).
rem   Installieren.cmd             einrichten bzw. aktualisieren: Programm nach "C:\Program Files\Mosaik3LAB",
rem                                Daten nach C:\Mosaik3LAB, Dienste mit Autostart (Werte: Installieren.json)
rem   Installieren.cmd probelauf   nur anzeigen, was passieren wuerde (aendert nichts)
rem   Installieren.cmd /still      ohne Rueckfragen, Pause und Browser (automatischer Test, schon als Administrator)
rem Die eigentliche Arbeit macht "manager\cli.mjs setup" mit der mitgelieferten node\node.exe.
setlocal
title Mosaik3LAB installieren
chcp 65001 >nul
cd /d "%~dp0"
set "DRY="
if /i "%~1"=="probelauf" set "DRY=--dry-run"
set "STILL="
if /i "%~1"=="/still" set "STILL=1"

if exist "manager\cli.mjs" if exist "Installieren.json" goto :node
echo Bitte das ZIP-Paket zuerst entpacken: Rechtsklick auf die ZIP-Datei, "Alle extrahieren ...",
echo danach im entpackten Ordner "Installieren.cmd" doppelklicken.
if not defined STILL pause
exit /b 1

rem ---------- Node.js: kommt mit dem Paket (node\node.exe) ----------
:node
set "NODE=%CD%\node\node.exe"
if exist "%NODE%" goto :admin
set "NODE=node"
where node >nul 2>nul || goto :nodefehlt
node -e "process.exit(Number(process.versions.node.split('.')[0])>=24?0:1)" || goto :nodefehlt
goto :admin

:nodefehlt
echo Im Paket fehlt node\node.exe und Node.js (mindestens 24) ist nicht installiert.
echo Bitte ein vollstaendiges Paket verwenden.
if not defined STILL pause
exit /b 1

rem ---------- Einmal Adminrechte holen (Programme, Dienste, Firewall) ----------
:admin
if defined DRY goto :start
if defined MOSAIK3LAB_SYSTEM_DRY_RUN goto :start
net session >nul 2>nul && goto :start
if defined STILL goto :keinadmin
echo Windows fragt jetzt nach Administratorrechten - bitte mit "Ja" bestaetigen.
powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -Verb RunAs -ErrorAction Stop } catch { exit 1 }" && exit /b 0
echo.
:keinadmin
echo Ohne Administratorrechte kann Mosaik3LAB nicht eingerichtet werden.
if not defined STILL pause
exit /b 1

rem ---------- Einrichten bzw. aktualisieren ----------
:start
echo.
set "UPDATE="
if defined DRY goto :text
if defined MOSAIK3LAB_SYSTEM_DRY_RUN goto :text
sc.exe query mosaik3lab-webapp >nul 2>nul || goto :text
if not exist "%ProgramFiles%\Mosaik3LAB\install.json" goto :altinstall
set "UPDATE=1"

:text
if defined UPDATE (
  echo  Mosaik3LAB ist schon eingerichtet und wird jetzt auf diese Version aktualisiert.
  echo  Daten, Konten und Einstellungen bleiben erhalten. Die App ist dabei kurz nicht erreichbar.
) else (
  echo  Mosaik3LAB wird eingerichtet: Programm unter "%ProgramFiles%\Mosaik3LAB",
  echo  Daten, Bilder und Sicherungen unter C:\Mosaik3LAB, Dienste mit Autostart,
  echo  im Schulnetz erreichbar.
  echo.
  echo  Vorhandenen Datenbestand von einem anderen Rechner uebernehmen? Dann hier abbrechen
  echo  und stattdessen "manager\mosaik3lab.cmd" starten: Einrichten - "Aus Backup einrichten".
)
echo.
if defined DRY goto :setup
set "ANTWORT=j"
if not defined STILL set /p "ANTWORT=Jetzt starten? [J/n] "
if /i "%ANTWORT%"=="n" exit /b 1

rem Update: Sicherung direkt vor dem Umschalten, aelteres Paket wird abgelehnt, bei Fehlschlag automatisch
rem zurueck auf die vorige Version - das macht alles "cli.mjs setup" (manager\lib\paketupdate.mjs).
:setup
"%NODE%" manager\cli.mjs setup --config Installieren.json %DRY%
if errorlevel 1 goto :fehler
if defined DRY goto :ende

echo.
echo  ================================================================
if defined UPDATE (echo   Mosaik3LAB ist aktualisiert.) else (echo   Mosaik3LAB ist eingerichtet.)
echo.
echo   Steht oben ein BACKUP-PASSWORT? Bitte jetzt aufschreiben und
echo   sicher aufbewahren - ohne es lassen sich Sicherungen nicht
echo   wiederherstellen. Es wird nicht noch einmal angezeigt.
echo.
echo   Adresse der App (von jedem Geraet im Schulnetz):
echo     http://%COMPUTERNAME%/mosaik3lab/
echo   (auf diesem Rechner: http://localhost/mosaik3lab/)
echo   Solange es noch keinen Administrator gibt, fuehrt die Adresse
echo   direkt zur Einrichtung: E-Mail, Name, Passwort festlegen -
echo   damit meldet man sich danach in der App und im Server-Manager an.
echo   Admins erreichen den Server-Manager immer unter .../mosaik3lab/manager/
echo.
echo   Dieser entpackte Ordner wird nicht mehr gebraucht und kann
echo   geloescht werden (auch die ZIP-Datei).
echo  ================================================================
echo.
if defined MOSAIK3LAB_SYSTEM_DRY_RUN goto :ende
rem Kein Browser wird geoeffnet - die App ist einfach im Netz erreichbar. Gibt es noch keinen Administrator,
rem zeigt "erstzugang" die Adressen, unter denen man ihn anlegt.
"%NODE%" manager\cli.mjs erstzugang
echo.
goto :ende

:altinstall
echo Auf diesem Rechner ist Mosaik3LAB schon an einem anderen Ort eingerichtet (aeltere Version).
echo Bitte zuerst: Startmenue - Mosaik3LAB - "Mosaik3LAB deinstallieren" (Daten BEHALTEN),
echo danach "Installieren.cmd" erneut starten. Daten und Einstellungen bleiben erhalten.
if not defined STILL pause
exit /b 1

:fehler
echo.
echo Die Einrichtung ist NICHT fertig geworden (siehe Meldung oben).
if defined UPDATE echo Steht oben "zurueckgeschaltet", laeuft die bisherige Version wieder - mit unveraenderten Daten.
echo Ursache beheben und "Installieren.cmd" erneut starten - fertige Schritte werden uebersprungen.
if not defined STILL pause
exit /b 1

:ende
if not defined STILL pause
exit /b 0
