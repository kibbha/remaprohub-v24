RC Hub validation trigger
Previous run reached workspace sync guards. The implementation now supports non-conflicting stale-key merges, so the legacy test incorrectly required locking on baseRevision.
Retry base: 21cc385845de2aaf2c7e20791bba61dc7b49144c
Fix: validate conflict evaluation against baseRevision and final CAS against currentRevision.
