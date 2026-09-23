RC Hub validation trigger
Previous run reached PWA packaging and exposed cache drift after new runtime modules were added.
Retry base: 727ea4cb3470bf223757a824a5088d3985cb1d65
Fix: accounting/integrations are now offline-cached and cache hashing/tests include the complete packaged runtime, including workspace storage.
