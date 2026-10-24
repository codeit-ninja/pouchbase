---
'@pouchbasejs/js-sdk': minor
---

`OAuthProvider` accepts any provider id, since sign-in providers now come from plugins, and `pb.auth.providers()` returns each provider's `iconUrl`. The built-in ids are `KNOWN_OAUTH_PROVIDERS` (`OAUTH_PROVIDERS` is deprecated).
