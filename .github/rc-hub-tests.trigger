RC Hub validation trigger
Previous run progressed through architecture and found a stale developer boot assertion.
Retry base: c3df20bb8a598cab86850d94ab29a7078b54ad47
Fix: developer security gate now asserts session init + developer access + state mirror recovery, matching the hardened boot path.
