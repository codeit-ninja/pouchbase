# @repo/pocketbase

Lokale PocketBase-backend voor de SaaS. De binary (versie vastgezet in `package.json` onder
`pocketbase.version`) wordt bij de eerste start automatisch gedownload naar `bin/`.

```bash
pnpm pb:dev                                  # vanuit de root: start op http://127.0.0.1:8090
pnpm --filter @repo/pocketbase pb superuser upsert admin@example.com wachtwoord123
```

- Admin-dashboard: http://127.0.0.1:8090/_/
- `pb_migrations/` – migraties (in git); `--dev` schrijft automatisch migraties bij schemawijzigingen in het dashboard
- `pb_hooks/` – JS-hooks (`*.pb.js`)
- `pb_data/` – lokale database en uploads (niet in git)

Updaten: pas `pocketbase.version` aan; de nieuwe binary wordt bij de volgende start opgehaald.
