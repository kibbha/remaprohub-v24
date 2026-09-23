RC Hub validation trigger
Previous run reached screen rendering and the Academy style injector assumed a full browser DOM.
Retry base: 89484824acd4141794e0ef8f92fff11173ac1876
Fix: make style injection a safe no-op in headless/static test environments.
