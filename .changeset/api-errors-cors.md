---
'pouchbase': patch
---

API errors from before a route runs, such as "not installed yet", now carry the CORS headers, so apps on other origins see the message instead of a network error.
