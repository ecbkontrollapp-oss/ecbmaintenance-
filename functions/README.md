# ECB Wartung – Admin- und Nutzerverwaltung (STAGING)

**Nicht produktiv aktiviert.** Diese Firebase Cloud Functions sind ausschließlich für die serverseitig geschützten Verwaltungsfunktionen vorgesehen:

- Neuen Mitarbeiter mit sicherem einmaligem Startpasswort anlegen.
- Passwortwechsel beim ersten Login durchsetzen; Mitarbeiter können ihr Passwort später selbst ändern.
- Benutzerkonten sperren/freigeben und Startpasswörter zurücksetzen.
- Adminarchiv für Protokolle mit Wiederherstellung ohne physisches Löschen der Alt-Dokumente.

Benötigt Firebase Authentication und geprüfte Rollen `ecbStaff` / `ecbAdmin`. Der bestehende Admin `ECB_Wartung` wird erst nach erfolgreichem Backup mit `tools/bootstrap-admin.mjs` freigeschaltet. Keine Credentials im Chat oder GitHub.

## E-Mail-Versand erfolgt NICHT über Firebase Functions

Für E-Mails wird in diesem Entwicklungsbranch ausschließlich **Cloudflare Workers Free + D1 Free + Resend Free** verwendet: [Anleitung](../free-mail-worker/README.md).

Diese Firebase Functions enthalten bewusst **keine SMTP-Zugangsdaten, keinen SMTP-Versand und keine Firestore-E-Mail-Trigger**. Damit kann bei einem späteren Admin-Deployment kein zweiter E-Mail-Versand parallel entstehen.

## Vor der Aktivierung

1. Vollständigen und überprüften Firebase-/Storage-Export aller alten Protokolle inklusive Bilder und Unterschriften sichern.
2. Die bisherigen Benutzer mit der Firebase-Benutzerverwaltung abgleichen; Startpasswörter nur sicher übermitteln.
3. Den Admin mit separatem autorisiertem Zugriff gemäß `tools/bootstrap-admin.mjs` freischalten; zuerst Dry Run.
4. **Wichtig:** Auch ausschließlich für diese Admin-Funktionen ist für ein Firebase Functions-Deployment der **Blaze-Tarif mit einem Abrechnungskonto** erforderlich. Dass innerhalb einer Freigrenze zunächst keine Gebühren anfallen können, garantiert keine dauerhaft kostenfreie Nutzung. Mailversand allein braucht Blaze dank Cloudflare nicht.
5. Firestore Rules erst nach Abgleich mit dem alten System freischalten. `firestore.rules.admin.staged` ist nur ein Entwurf und nicht deployed.
6. Mit Admin und Mitarbeiter auf iPhone und PC Anmeldung, Passwortwechsel, Rechte und Archivieren/Wiederherstellen testen.

**Unverändert:** `main/index.html`, Firebase-Protokolle, Firebase-Regeln, vorhandene Benutzer und produktiver E-Mail-Versand.
