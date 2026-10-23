---
'pouchbase': minor
---

Add **Backups** under System: back up the databases, and optionally the uploaded files, to S3-compatible buckets right away or on a cron schedule that keeps a set number of backups, and restore a backup. Scheduled backups run from a Cron Trigger on the Worker or a timer on the Node server, **Find backups** lists the backups already in a bucket, and backups can be downloaded as a `.tar` file and uploaded again, for example to restore into a new installation.
