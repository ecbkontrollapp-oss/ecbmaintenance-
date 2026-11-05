# ECB Wartung: Admin, Passwortwechsel und Protokoll-E-Mails (STAGING)

**Nicht produktiv aktiviert.** Dies ist die serverseitige Erweiterung des Wartungssystems, nicht die ECB Kontroll-App.

## Funktionen
- Admin legt Mitarbeiter mit einmaligem zufälligem Startpasswort an; Rückgabe nur einmal an den Admin.
- Das Mitarbeiterkonto kann erst nach Änderung des Startpassworts Wartungen öffnen.
- Benutzername/Passwort-Maske bleibt unverändert; intern erfolgt Firebase Authentication.
- Administratoren dürfen Mitarbeiter sperren/entsperren, neue Startpasswörter ausstellen und Protokolle *reversibel* archivieren.
- Mitarbeiter dürfen vorhandene Protokolle manuell als vollständige PDF per Mail versenden.
- Neue Wartungsprotokolle aus `ecb_protocols` oder den bekannten `artifacts`-Sammlungen lösen automatisch den Versand mit PDF an **pb@ecb-system.de** aus.
- Das PDF enthält ECB-Original-Logo, Prüfpunkte, Originalfotos und Unterschrift. Falls eine notwendige Datei nicht verarbeitet werden kann, wird keine unvollständige PDF versendet.
- Firestore-Mailjobs verhindern automatisch erneute Zustellungen derselben Versandanforderung. Nach unsicherer Zustellung erfolgt **keine** automatische Wiederholung; Status muss geprüft werden.

## Vor Deployment – Voraussetzung
1. Vollständiges verifiziertes Firestore-/Storage-Backup **einschließlich aller Altsammlungen, Bilder und Unterschriften**.
2. Alle bisherigen Mitarbeiter im Firebase Authentication sicher übernehmen (keine Passwörter in GitHub oder Chat).
3. Die bereits vorhandene Admin-Identität `ECB_Wartung` mit `node tools/bootstrap-admin.mjs --apply` durch autorisierten Firebase-Administrator freischalten (vorher Dry-Run). Admin-Passwort bleibt unverändert.
4. Firebase-Projekt `ecb-maintenance` benötigt zum Deployen von Cloud Functions einen passenden Blaze-Abrechnungstarif. Auch ein SMTP-Dienst kann Kosten verursachen.
5. SMTP-Host, Port, Nutzer, verifizierte Absenderadresse als Umgebungsvariablen setzen (Vorlage `functions/.env.example`); SMTP-Passwort ausschließlich als Secret Manager Secret `ECB_SMTP_PASSWORD` über Firebase CLI speichern. **Nie** in HTML/Code oder Chat einfügen.
6. Domain `ecb-system.de` für den SMTP-Absender beim Mailanbieter verifizieren; `pb@ecb-system.de` als festen Autoempfänger prüfen.
7. `firebase init functions` bzw. projektbezogene Konfiguration auf Server `functions/` ausrichten und `firebase deploy --only functions` kontrolliert durchführen; **nicht** ungeprüft `firestore.rules.admin.staged` deployen. Die alten Clients könnten sonst ohne Migration ausfallen.
8. Auf mindestens zwei Geräten testen: Anmeldung, Passwortwechsel, Rechtematrix, Quellen, originales PDF mit Fotos+Unterschrift, automatische E-Mail **einmalig**, manuellen Versand, Mail-Fehlerstatus, Admin-Archivieren/Wiederherstellen.
9. Nach Abnahme sichere Firestore-Regeln und neue App gemeinsam umstellen. **Produktions-`main/index.html` wurde nicht geändert**.

## Berechtigungen
Firebase Auth Custom Claims `ecbStaff` / `ecbAdmin`. Cloud Functions überprüfen die Rolle serverseitig, und die gestagten Firestore Rules verweigern Zugriff während eines ausstehenden Passwortwechsels.

## Reversibles „Löschen“
Admin archiviert ein Protokoll über einen Tombstone in `ecb_archived_protocols`. **Keine Alt-Dokumente werden physisch gelöscht.** Wiederherstellung ist möglich. Ein permanentes Löschen erfordert separat geprüfte Backup-/Aufbewahrungsregeln.

## Grenzen
Automatischer Mailversand kann erst *nach* Deployment von Cloud Functions und Einrichtung des SMTP-Dienstes erfolgen. Die Testansicht unter `testansicht/index.html` bleibt bis dahin unverändert und ohne Schreibrechte.
