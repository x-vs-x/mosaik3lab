# Prüfungen für den Installer-Test (.github/workflows/installer-test.yml) – nur auf dem GitHub-Runner ausführen.
#   pruefen.ps1 installiert    Dienste laufen mit dem mitgelieferten Node, Portal/App/Manager antworten, Ordner stimmen
#   pruefen.ps1 marker         Admin-Konto über den Manager anlegen + Markerdatei in der Ablage (Daten für den Update-Test)
#   pruefen.ps1 erhalten       nach dem Update: Admin-Konto meldet sich an, Markerdatei ist noch da, Sicherung vor dem Update da
#   pruefen.ps1 deinstalliert  Dienste, Firewall-Regel und Programmordner weg, Daten noch da
#   pruefen.ps1 zurueck        nach Rückfall/abgelehntem Downgrade: vorige Version ($env:ERWARTET) aktiv, Schema passt
param([Parameter(Mandatory)][ValidateSet('installiert', 'marker', 'erhalten', 'zurueck', 'deinstalliert')][string]$Phase)
$ErrorActionPreference = 'Stop'
$Programm = Join-Path $env:ProgramFiles 'Mosaik3LAB'
$Daten = 'C:\Mosaik3LAB'
$Dienste = 'mosaik3lab-webapp', 'mosaik3lab-backup', 'mosaik3lab-portal', 'mosaik3lab-manager'
$Admin = @{ email = 'ci-admin@schule.test'; name = 'CI Admin'; password = 'ci-nur-test-1234' } # nur für den Wegwerf-Runner
$Marker = Join-Path $Daten 'ablage\ci-marker.txt'
$script:Fehler = 0

function Ok($text) { Write-Host "OK   $text" }
function Fehler($text) { Write-Host "FEHLER $text"; $script:Fehler++ }
function Pruefe($bedingung, $text) { if ($bedingung) { Ok $text } else { Fehler $text } }

# Wer außer Administratoren/System darf diesen Pfad ändern? → „Konto: Rechte“ je erlaubendem Eintrag (leer = in Ordnung).
# Geprüft werden Dienstkonten und normale Benutzer: Lokaler Dienst, Netzwerkdienst, Benutzer, Authentifizierte Benutzer, Jeder, Interaktiv.
$FremdeKonten = 'S-1-5-19', 'S-1-5-20', 'S-1-5-32-545', 'S-1-5-11', 'S-1-1-0', 'S-1-5-4'
$SchreibBits = 0x500D0156 # WriteData, AppendData, WriteEA, DeleteChild, WriteAttributes, Delete, WRITE_DAC, WRITE_OWNER, GENERIC_ALL, GENERIC_WRITE
function FremdBeschreibbar($pfad) {
  foreach ($ace in (Get-Acl -LiteralPath $pfad).Access) {
    $sid = try { $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { "$($ace.IdentityReference)" }
    if ($ace.AccessControlType -eq 'Allow' -and $FremdeKonten -contains $sid -and (([long]$ace.FileSystemRights) -band $SchreibBits)) { "$($ace.IdentityReference): $($ace.FileSystemRights)" }
  }
}

# HTTP-Status holen (wiederholt, bis 200 kommt oder die Zeit um ist – Dienste brauchen nach dem Start etwas)
function Status($url, $sekunden = 90) {
  $ende = (Get-Date).AddSeconds($sekunden); $code = 0
  do {
    try { $code = (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 10).StatusCode } catch { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 200) { return 200 }
    Start-Sleep 3
  } while ((Get-Date) -lt $ende)
  return $code
}

# Schreibaktion am Manager: CSRF-Token steht in der Startseite (neu nach jedem Neustart des Dienstes)
function ManagerPost($pfad, $body) {
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $html = (Invoke-WebRequest 'http://127.0.0.1:5190/' -UseBasicParsing -WebSession $s).Content
  $token = [regex]::Match($html, 'name="csrf-token" content="([0-9a-f]+)"').Groups[1].Value
  Invoke-RestMethod "http://127.0.0.1:5190$pfad" -Method Post -WebSession $s -ContentType 'application/json' -Headers @{ 'x-manager-token' = $token } -Body ($body | ConvertTo-Json)
}

switch ($Phase) {
  'installiert' {
    $schreib = (Get-Acl $Programm).Access | Where-Object { $_.IdentityReference -match 'LOCAL SERVICE|Lokaler Dienst|S-1-5-19' -and $_.FileSystemRights -match 'Modify|Write|FullControl' }
    Pruefe (-not $schreib) 'Programmordner ist für den Manager-Dienst nicht beschreibbar (Update-Helfer läuft daraus als System)'
    $u = Get-CimInstance Win32_Service -Filter "Name='mosaik3lab-updater'"
    Pruefe ($null -ne $u) 'Update-Helfer eingerichtet'
    Pruefe ($u.StartName -eq 'LocalSystem') "Update-Helfer läuft als System ($($u.StartName))"
    Pruefe ($u.StartMode -eq 'Auto') "Update-Helfer prüft beim Hochfahren ($($u.StartMode))"
    Pruefe ((& sc.exe sdshow mosaik3lab-updater) -join '' -like '*;;;LS)*') 'Manager darf den Update-Helfer starten'
    # Alles, was System (Update-Helfer) oder die Dienste starten, darf nur für Administratoren/System beschreibbar sein:
    # Programmordner, Dienstdateien (WinSW-.exe/.xml), WinSW, node.exe, Helfer-Skript, Programmdateien aller Dienste
    $dateien = @($Programm, "$Programm\releases", "$Programm\dienste", "$Programm\werkzeuge", "$Programm\current\node\node.exe", "$Programm\current\manager\runners\aktualisieren.mjs")
    $dateien += @(Get-ChildItem "$Programm\dienste", "$Programm\werkzeuge" -File -ErrorAction SilentlyContinue | ForEach-Object FullName)
    $exes = @(Get-CimInstance Win32_Service -Filter "Name LIKE 'mosaik3lab-%'" | ForEach-Object { ($_.PathName -replace '^"([^"]+)".*$', '$1') })
    $dateien += $exes
    $offen = @($dateien | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique | ForEach-Object { $p = $_; FremdBeschreibbar $p | ForEach-Object { "$p → $_" } })
    Pruefe ($offen.Count -eq 0) "Programm, Dienstdateien und WinSW nur für Administratoren/System beschreibbar ($($dateien.Count) Pfade geprüft)$(if ($offen) { ' – beschreibbar: ' + ($offen -join '; ') })"
    $fremdOrt = @($exes | Where-Object { -not $_.StartsWith("$Programm\", 'OrdinalIgnoreCase') })
    Pruefe ($fremdOrt.Count -eq 0) "alle Dienste starten aus dem Programmordner ($($exes -join ', '))"
    foreach ($d in $Dienste) {
      $svc = Get-CimInstance Win32_Service -Filter "Name='$d'"
      Pruefe ($svc -and $svc.State -eq 'Running') "Dienst $d läuft ($($svc.State), $($svc.StartMode))"
      Pruefe ($svc -and $svc.StartMode -eq 'Auto') "Dienst $d startet automatisch"
      $node = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($svc.ProcessId) AND Name='node.exe'" | Select-Object -First 1
      $pfad = if ($node) { $node.ExecutablePath } else { '' }
      Pruefe ($pfad -and $pfad.StartsWith("$Programm\", 'OrdinalIgnoreCase')) "Dienst $d nutzt Node aus dem Programmordner ($pfad)"
    }
    $xml = Get-ChildItem $Programm -Recurse -Filter 'mosaik3lab-webapp.xml' -ErrorAction SilentlyContinue | Select-Object -First 1
    Pruefe ($xml -and (Get-Content $xml.FullName -Raw) -match [regex]::Escape("$Programm\current\node\node.exe")) "Dienstdatei zeigt auf current\node\node.exe ($($xml.FullName))"
    Pruefe ((Status 'http://127.0.0.1/mosaik3lab/api/health') -eq 200) 'Portal: http://127.0.0.1/mosaik3lab/api/health → 200'
    Pruefe ((Status 'http://127.0.0.1:3001/mosaik3lab/api/health') -eq 200) 'App: http://127.0.0.1:3001/mosaik3lab/api/health → 200'
    $soll = (Get-Content (Join-Path $Programm 'current\package.json') -Raw | ConvertFrom-Json).version
    $ist = try { (Invoke-RestMethod 'http://127.0.0.1:3001/mosaik3lab/api/health' -TimeoutSec 10).version } catch { '?' }
    Pruefe ($ist -eq $soll) "App meldet ihre Version ($ist, erwartet $soll) – Grundlage für „Was ist neu“"
    Pruefe ((Status 'http://127.0.0.1:5190/api/auth') -eq 200) 'Manager: http://127.0.0.1:5190/api/auth → 200'
    Pruefe (Test-Path "$Programm\current\node\node.exe") 'Programm mit node.exe unter Program Files'
    Pruefe (Test-Path "$Programm\install.json") 'install.json im Programmordner'
    foreach ($o in 'daten', 'ablage', 'backups', 'logs') { Pruefe (Test-Path "$Daten\$o") "Datenordner $Daten\$o" }
    Pruefe (-not (Test-Path "$Daten\programm") -and -not (Test-Path "$Daten\releases") -and -not (Test-Path "$Daten\manager")) "kein Programmordner in $Daten"
    Pruefe (@(Get-NetFirewallRule -DisplayName 'Mosaik3LAB*' -ErrorAction SilentlyContinue).Count -gt 0) 'Firewall-Regel angelegt'
  }
  'marker' {
    $vorher = Invoke-RestMethod 'http://127.0.0.1:5190/api/auth'
    Pruefe $vorher.needsAdmin 'frische Einrichtung: noch kein Administrator'
    ManagerPost '/api/auth/first' $Admin | Out-Null
    Pruefe (-not (Invoke-RestMethod 'http://127.0.0.1:5190/api/auth').needsAdmin) 'Admin-Konto angelegt'
    Set-Content $Marker 'Mosaik3LAB Installer-Test' -Encoding utf8
    Pruefe (Test-Path $Marker) "Markerdatei $Marker"
  }
  'erhalten' {
    Pruefe ((Status 'http://127.0.0.1:5190/api/auth') -eq 200) 'Manager antwortet nach dem Update'
    Pruefe (-not (Invoke-RestMethod 'http://127.0.0.1:5190/api/auth').needsAdmin) 'Admin-Konto nach dem Update noch da'
    $login = ManagerPost '/api/auth/login' @{ email = $Admin.email; password = $Admin.password }
    Pruefe ($null -ne $login) 'Anmeldung mit dem Admin-Konto nach dem Update'
    Pruefe (Test-Path $Marker) 'Markerdatei nach dem Update noch da'
    Pruefe (@(Get-ChildItem "$Daten\backups" -ErrorAction SilentlyContinue).Count -gt 0) 'Sicherung vor dem Update angelegt'
    $releases = @(Get-ChildItem "$Programm\releases" -Directory)
    Pruefe ($releases.Count -eq 2) "zwei Versionen in releases ($($releases.Name -join ', '))"
  }
  'zurueck' {
    $id = (Get-Content "$Programm\current\.release.json" -Raw | ConvertFrom-Json).id
    Pruefe ($id -eq $env:ERWARTET) "aktive Version ist wieder die vorige ($id, erwartet $env:ERWARTET)"
    $fremd = @(Get-ChildItem "$Programm\releases" -Directory | Where-Object { $_.Name -match 'kaputt|alt' })
    Pruefe ($fremd.Count -eq 0) "kaputtes bzw. abgelehntes Paket nicht in releases ($($fremd.Name -join ', '))"
    & "$Programm\current\node\node.exe" "$PSScriptRoot\schema-pruefen.mjs" "$Programm\current" "$Daten\daten\mosaik3lab.db"
    Pruefe ($LASTEXITCODE -eq 0) 'Datenbank-Schema passt zur aktiven Version (Datenbank zurückgespielt)'
    Pruefe ((Status 'http://127.0.0.1/mosaik3lab/api/health') -eq 200) 'App antwortet über das Portal'
  }
  'deinstalliert' {
    foreach ($d in $Dienste + 'mosaik3lab-updater') { Pruefe (-not (Get-Service $d -ErrorAction SilentlyContinue)) "Dienst $d entfernt" }
    Pruefe (@(Get-NetFirewallRule -DisplayName 'Mosaik3LAB*' -ErrorAction SilentlyContinue).Count -eq 0) 'Firewall-Regel entfernt'
    # Der Programmordner wird von einem eigenen Prozess nach Programmende gelöscht (alle 3 s neuer Versuch)
    $ende = (Get-Date).AddSeconds(120)
    while ((Test-Path $Programm) -and (Get-Date) -lt $ende) { Start-Sleep 3 }
    Pruefe (-not (Test-Path $Programm)) "Programmordner $Programm entfernt"
    Pruefe (Test-Path "$Daten\daten") "$Daten\daten behalten"
    Pruefe (@(Get-ChildItem "$Daten\daten" -Recurse -Filter '*.db').Count -gt 0) 'Datenbank behalten'
    Pruefe (Test-Path $Marker) 'Markerdatei behalten'
  }
}
if ($script:Fehler) { Write-Host "$script:Fehler Prüfung(en) fehlgeschlagen"; exit 1 }
