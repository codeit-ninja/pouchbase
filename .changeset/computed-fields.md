---
'pouchbase': minor
---

Add a **Computed** field type whose value is calculated whenever a record is saved: from another field as a slug, in lowercase or in uppercase, or with a **script**: JavaScript that returns the value, with the whole `record` and a `ctx` (`collection`, `isNew`, `previous`, `slugify`) available. Scripts are written in a code editor (Monaco) with autocomplete for the collection's fields, hovers and type errors. Scripts run in a QuickJS sandbox without network or database access, limited to 100 ms per record. Existing records get their value when the field is added, a calculation can be tried on recent records and changed later with **Edit computation**, renaming the source field keeps it linked, and a source field can't be deleted while a computed field uses it.
