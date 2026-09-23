RC Hub validation trigger
Previous run reached the seed-sync guard. The runtime intentionally clears key-level dirty markers while keeping cloudDirty=true so a missing remote workspace is seeded with the full writable workspace.
Retry base: ed6a5e1a0a6e246dd28aeb8f06afcc364d7b3aa9
Fix: test the current full-seed contract explicitly.
