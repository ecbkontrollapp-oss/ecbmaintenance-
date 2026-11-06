# ECB Wartung – kostenloser automatischer E-Mail-Versand (STAGING)

**Status: vorbereitet, nicht aktiviert.** Hier wird ausschließlich der Mailversand ersetzt. Die bestehende Firebase-Datenbank und `main/index.html` bleiben unangetastet.

## Warum diese Lösung

- **Resend Free:** aktuell kostenlos bis 3.000 E-Mails pro Monat und 100 pro Tag (Kontingente sind vom Anbieter abhängig). PDF-Anhänge werden unterstützt.
- **Cloudflare Workers Free + D1 Free:** geschützter HTTP-Endpunkt mit gespeicherten Versandstatus und Schutz gegen Doppelversand. Kein Firebase Cloud-Functions-Deployment und damit keine Blaze-Abhängigkeit **für E-Mails**.
- **Null-Abonnementgebühren, solange die kostenlosen Tarife genutzt und nicht auf kostenpflichtige Dienste gewechselt werden.**
- Die App begrenzt den Versand vorsorglich auf 90 Aufträge je 24 Stunden und 2.700 je 31 Tage. Es gibt keine automatische Bezahl- oder Upgrade-Funktion.

## Verhalten

- Automatisch: **Nach bestätigtem Firebase-Speichern** wird das vollständige Protokoll einschließlich Logo, allen Fotos, Prüfpunkten und Unterschrift zu einer PDF zusammengestellt und an **pb@ecb-system.de** verschickt.
- Manuell: Mitarbeiter können in der Protokoll-Historie eine E-Mail-Adresse auswählen und das PDF einmalig senden.
- Der Cloudflare Worker prüft das signierte Firebase-ID-Token (Google Public JWKS), `ecbStaff`-Claim, das Mitarbeiterprofil, das bestehende Firestore-Dokument und den PDF-Header, bevor Resend angeschrieben wird.
- Der Resend API-Key liegt **nur** in einem Cloudflare-Secret, nicht in GitHub oder im Browser.
- D1 verwaltet Versandstatus und Idempotenzschlüssel; Resend erhält einen eigenen `Idempotency-Key`.
- Wenn die Mail nicht bestätigt wird, **ist die Wartung trotzdem bereits in Firestore gespeichert**. Die App meldet den Mailfehler ausdrücklich und speichert nicht erneut.
- Nach unklarem Versand erfolgt **keine automatische Wiederholung**, um Doppelversand zu verhindern.

## Was für die Aktivierung eingerichtet werden muss

1. Einen **Resend Free**-Account auf <https://resend.com> anlegen und die absendende Domain `ecb-system.de` über DNS-Einträge verifizieren. Es ist **nicht** nötig, das Empfangspostfach `pb@ecb-system.de` umzuziehen. Die ausgehende Absenderadresse kann `wartung@ecb-system.de` lauten.
2. Resend-API-Key generieren. **Nicht in Chat oder GitHub einfügen.**
3. Einen **Cloudflare Free**-Account auf <https://dash.cloudflare.com> anlegen. `wrangler d1 create ecb-wartung-mail` ausführen und die D1-Datenbank-ID in eine lokale Kopie von `wrangler.example.jsonc` als `wrangler.jsonc` eintragen.
4. Im Verzeichnis `free-mail-worker` das Datenbankschema anwenden: `npx wrangler d1 execute ecb-wartung-mail --remote --file=./schema.sql`.
5. Secret sicher hinterlegen: `npx wrangler secret put RESEND_API_KEY`.
6. Worker mit `npx wrangler deploy` bereitstellen; die Adresse endet auf `.workers.dev`.
7. Im Entwicklungsbranch **erst nach Freigabe** den Worker-Endpunkt als `window.ECB_FREE_MAIL_ENDPOINT='https://<worker>.workers.dev/send-protocol'` konfigurieren. Ein öffentlicher Endpunkt ist unkritisch, aber **keine Secrets** eintragen.
8. Mit einem freigegebenen Testnutzer, einem bestätigten Firebase-Dokument und einem echten Protokoll samt Fotos und Unterschrift einen vollständigen Versand an `pb@ecb-system.de` prüfen. Erst dann weitere Geräte und Mitarbeiter freischalten.

**Wichtige Begrenzung:** Diese kostenlose Variante sendet unmittelbar aus der geöffneten App nach erfolgreichem Speichern. Wird das iPhone exakt zwischen Firebase-Speicherung und Mailaufruf geschlossen oder ist die Verbindung unterbrochen, kann der automatische Versand ausfallen. Dann wird der Versandstatus manuell geprüft. Vollständig ausfallsichere Hintergrundzustellung würde eine zusätzliche geplante Serverabfrage/Warteschlange benötigen, die **noch nicht umgesetzt** ist.

## Unabhängige Admin-Funktionen

Die vorhandenen `functions/index.js` für Adminnutzer, Claims und Passwortwechsel sind weiterhin **separat im Staging-Branch** und erfordern für ein tatsächliches Firebase-Functions-Deployment den **Blaze**-Tarif (Zahlungskonto). Die vorliegende kostenlose Lösung ersetzt **nur den Mailversand**, nicht automatisch die Adminfunktionen.

## Sicherheit

- Keine SMTP-Passwörter, Resend-API-Keys, Firebase-Service-Account-Schlüssel oder echten Protokolle in diesem Repository.
- Der Worker ist ohne signierte Firebase-Anmeldung und gültige Mitarbeiterrechte nicht benutzbar.
- D1 speichert nur Versandmetadaten, keine PDF-Anhänge.
- Dieser Branch ist bewusst nicht in die produktive Wartungs-App gemergt.
