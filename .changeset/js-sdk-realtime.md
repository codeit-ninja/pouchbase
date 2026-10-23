---
'@pouchbasejs/js-sdk': minor
---

Add realtime: `pb.db.<name>.subscribe()` and `pb.realtime.subscribe()` call you with every change to records you may see, with `where`, `select` and `id`, over one WebSocket per collection that reconnects by itself and follows sign-ins.
