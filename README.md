# ECB Wartungssystem — separates Repository

Stand: 2026-11-05

Dieses Repository ist **unabhängig** von der ECB Kontroll-App (Repository `ecbkontrollapp-oss/index.html`).

## Aktueller Stand

- `index.html` ist die **interaktive Design-Demo** mit originalen Maschinenfotos und ECB-Logo.
- Die Demo verwendet **Beispieldaten**. Sie schreibt **nicht** in Firebase.
- Sicherheits-Snapshot: Branch `backup-demo-vor-firebase-anbindung-2026-11-05`.
- Die produktive Datenbank und ihre vorhandenen Dokumente wurden durch diese Repository-Einrichtung nicht verändert.

## Bisherige Cloud der Wartungs-App

- Firebase-Projekt: `ecb-maintenance`
- App-ID für die Firestore-Datenstruktur: `ecb-maintenance-live`
- Protokolle: `artifacts/ecb-maintenance-live/public/data/protocols`
- DGUV-Geräte: `artifacts/ecb-maintenance-live/public/data/dguv_devices`
- Alte Browser-Cache-Keys: `ecb_permanent_local_protocols_v3`, `ecb_permanent_local_protocols_v2`, `ecb_protocols_v118`, `ecb_dguv_v118`, `ecb_users_v118`.

## Voraussetzungen vor der produktiven Umstellung

1. **Firebase-Zugriff prüfen und vollständigen Datenbank-Export erstellen** (inkl. Protokolle, Prüfpunkte, Unterschriften, Fotos, DGUV-Dateien).
2. Prüfen, ob andere Dokumente/Dateien auch in **Firebase Storage** gespeichert sind und separat sichern.
3. Protokollanzahl und Dateiintegrität auf dem **alten** Stand dokumentieren. Dabei auch mögliche **nur lokal vorhandene** Protokolle erfassen.
4. Neue App startet mit **read-only** Cloud-Datenansicht. **Kein** Push von lokalen Daten in die Produktivdatenbank während des Abgleichs.
5. Erst nach erfolgreich überprüftem Abgleich Live-Synchronisierung und Schreiboperationen freigeben.
6. Firestore-Dokumente nicht überschreiben; Löschungen nicht durch alte lokale Caches rückgängig machen; fehlgeschlagene Cloud-Speicherung sichtbar melden.
7. Authentifizierung/Rollen auf serverseitig kontrollierte Firebase Authentication + Rules umstellen; **keine fest kodierten Passwörter im veröffentlichten Quellcode**.
8. Vollständige UI-Funktionen mit Smartphone-Signatur, PDF, Foto-Upload, Wartungskalender, Nachtragen und DGUV prüfen.

## Bestehende Wartungsversion

Der originale alte Wartungs-App-HTML-Code wurde in der Unterhaltung bereitgestellt, liegt aber hier **nicht** als separate Datei vor. Er enthält hart kodierte Zugangsdaten und darf deshalb nicht unverändert in diesem öffentlichen Repository abgelegt werden.

**Achtung:** GitHub sichert Quellcode, nicht automatisch Firebase-Daten. Erst ein geprüfter Datenexport ist eine wirkliche Cloud-Datensicherung.
