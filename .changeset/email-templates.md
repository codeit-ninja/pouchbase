---
'pouchbase': minor
---

Add email templates: design emails with variables (`{{name}}`, fallbacks, `#if` and `#each`) on the new Mail page, in a visual editor with styled buttons, images, sections, columns, spacers and dividers or as HTML, preview them with sample data, and send them from functions or your back-end through `POST /api/mail/send` with an API key. API keys are managed on the new API keys page (keys with the service scope also use the records API without API rules), every function gets its own as `env.POUCHBASE_API_KEY`, and the verification and password-reset emails can now be customized.
