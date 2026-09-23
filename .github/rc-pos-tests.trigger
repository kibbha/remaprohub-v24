RC POS validation trigger
Previous run passed resilience checks and found a stale failure-matrix assertion for pre-modular idempotency code.
Retry base: 19d7114ce8522babc9f6a2d4bf72feded6b782ec
Fix: failure matrix validates queuedPayload(item), the current centralized stable clientEventId path.
