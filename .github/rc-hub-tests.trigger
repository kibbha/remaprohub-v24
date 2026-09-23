RC Hub validation trigger
Previous run reached the granular push guard. The old test expected every successful push to clear the whole dirty flag, which would be unsafe if edits occur during the request.
Retry base: b811e104177519274184f6473bf30437d896f4c9
Fix: assert that only persisted keys are cleared and concurrent local changes remain pending.
