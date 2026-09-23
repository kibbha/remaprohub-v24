RC Hub validation trigger
Previous run reached CRM V28 and showed completed reservations were still counted in future table load.
Retry base: d4818d3b3e30e1c3ffbdb826e4294d4a7099c64a
Fix: reservation load excludes completed/no-show/cancelled records while retaining waitlist visibility.
