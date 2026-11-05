# ECB Wartungssystem: gesicherte Umstellung auf den produktiven Firebase-Bestand

**Status: STAGING, NICHT PRODUKTIV.** Diese Dateien sind Vorbereitung für eine Umstellung ohne Ausfall der derzeit genutzten Wartungs-App.

## Wo die historischen Daten liegen

Projekt: `ecb-maintenance`, Datenbank: `(default)`. In der Firebase-Konsole wurden die Stamm-Sammlungen `ecb_protocols`, `ecb_dguv_devices`, `dguv_devices`, `ecb_users` und `artifacts` gezeigt.

Ein Altprotokoll mit der Protokollnummer `ECB-500392` zeigte die Felder `category`, `date`, `employee`, `id`, `machine`, `photos[]` (Data-URL), `points[]` (mit `pointNumber`, `status`, `title`), `remarks`, `runtime` und `signature` (Data-URL). Die Gesamtanzahl ist noch nicht durch direkten Datenbankzugriff bestätigt.

Der Staging-Code liest automatisch und **nur lesend** aus:
- `ecb_protocols`
- `artifacts/ecb-maintenance/public/data/protocols`
- `artifacts/ecb-maintenance-live/public/data/protocols`

DGUV-Bestände werden aus den zwei Stamm-Sammlungen und den beiden `artifacts`-Varianten gelesen. Alle beteiligten Sammlungen werden mit Firestore `onSnapshot` auf Änderungen überwacht. Doppelte Protokollnummern mit gleicher Anlage und gleichem Datum werden nur in der Darstellung zusammengeführt, ohne Daten in Firebase zurückzuschreiben. Bei fehlendem Zugriff meldet die App einen **Teilbestand**, nicht `alles synchronisiert`.

## Benutzeranmeldung

Die Oberfläche hat weiterhin nur **Benutzername** und **Passwort**. Eine separate Firebase-Anmeldemaske gibt es nicht.

Im Hintergrund verwendet der Staging-Code Firebase Authentication. Benutzername wird deterministisch in einen technischen E-Mail-Alias abgebildet, der Nutzer bekommt ihn nicht zu sehen. Das **ursprüngliche Passwort** kann bei der einmaligen Administrator-Migration unverändert in Firebase Authentication übernommen werden, wenn es verfügbar ist und die Firebase-Mindestlänge erfüllt. Der bisherige Authentifizierungsdatensatz bleibt zunächst unverändert.

Es wird **kein Passwort** in das veröffentlichte GitHub-HTML eingefügt. Der Zugang zu Firestore wird nach der Umstellung über ein von Firebase Auth signiertes Token und den vom Administrator vergebenen `ecbStaff`-Claim geregelt. Das alte `ecb_users` bleibt dann für Webclients gesperrt.

## Vorhandene Hilfsprogramme

- `tools/backup-firestore.mjs`: gesicherter, lokaler, lesender Export der bekannten Firestore-Sammlungen. Enthält sämtliche gespeicherten Data-URLs in den Dokumenten; bei gesetztem `ECB_FIREBASE_STORAGE_BUCKET` werden zusätzlich Storage-Dateien gesichert.
- `tools/migrate-legacy-users.mjs`: **Standard ist nur DRY RUN**. Echte Migration nur mit `--apply --approved=/secure/approved-users.json`; bewilligte Nutzernamen müssen zuvor unabhängig von der derzeit öffentlich beschreibbaren Firestore-Benutzerliste bestätigt werden. Passwortinhalt wird nie ausgegeben.
- `firestore.rules.staged`: sichere Firestore-Regeln, **NICHT aktiviert**.
- `tools/test-staged.mjs`: automatisierte Offline-Tests mit künstlichen Datensätzen.
- `.github/workflows/validate-staged.yml`: prüft Staging auf GitHub ohne Firebase-Schreibzugriff.

## Unbedingte Reihenfolge

1. **Nichts an den derzeitigen Firestore-Regeln oder der alten produktiven Webseite ändern.** Die Mitarbeiter nutzen die alte App noch täglich.
2. Mit einem autorisierten Firebase-Administrator die bisherige Datenbank und ggf. Storage auslesen, vollständig lokal sichern, die Dokumentanzahlen und SHA-256-Hashes im Backup-Manifest prüfen. Lokale Browser-Daten auf den verwendeten Geräten separat abgleichen; solche Daten sind nicht im serverseitigen Backup.
3. Vorhandene Benutzerliste und Passwörter im alten System fachlich freigeben. Die Authentifizierungs-Accounts sicher als Benutzer mit dem bisherigen Passwort anlegen, ohne Credentials im Browsercode, Chat oder GitHub zu speichern. Wenn das Passwort nicht migrierbar ist, den betreffenden Account vor der Produktivfreigabe gesondert klären.
4. Den neuen Branch als **nichtöffentliche Testinstallation** auf mindestens zwei Endgeräten prüfen. Benutzername/Passwort, bestätigte Cloud-Snapshots aus allen verfügbaren Sammlungen, Fotos, Unterschriften und tatsächliche PDF-Dateien mit realen Altprotokollen kontrollieren.
5. Ein neues Testprotokoll in `ecb_protocols` erzeugen und über Firestore-Serverrücklesen bestätigen; prüfen, dass es automatisch auf dem zweiten Gerät **und in der alten App** erscheint. Bei zweifelhaftem Serverergebnis **nicht automatisch erneut senden**, um Duplikate zu verhindern.
6. Zuerst die alte produktive App samt Backend-Zugang für den Parallelbetrieb sichern und Zugriffsregeln abgestimmt einführen. Die bisherige Regel `allow read, write: if true` ist unsicher; sie darf wegen der laufenden Nutzung **nicht unkoordiniert** durch `false` ersetzt werden.
7. Erst nach dokumentierter Abnahme die neue App aus dem Entwicklungsbranch auf `main` schalten. Historische Firestore-Dokumente werden nicht gelöscht, überschrieben oder verschoben.

## Noch offene technische Blocker

- Das Firebase-Plugin ist installiert, aber stellt in diesem Chat weiterhin **keine Firestore-Admin-Aktionen** bereit. Dadurch sind echte Export- und Auth-Migration noch nicht ausgeführt.
- Die tatsächliche `ecb_users`-Struktur und Verfügbarkeit der bisherigen Passwörter sind unbekannt. Ein nur lokal im alten HTML hinterlegtes Passwort kann nicht automatisch aus Firestore migriert werden.
- Die Firestore-Regeln sind nach den gezeigten Screenshots offen. Ein sicherer produktiver Rollout muss den unbeschränkten Zugriff beenden, ohne die alte App vorzeitig stillzulegen.
- Es fehlen End-to-End-Tests mit echten PDFs, echten Fotos und echten Unterschriften auf iPhone und PC.

**Keine Aktivierung, keine Annahme kompletter Datensicherung und kein Erfolgsetikett, solange diese Punkte offen sind.**
