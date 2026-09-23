RC Hub validation trigger
Previous run reached quantity guards; architecture test still targeted retired reservationForm/loyaltyForm paths.
Retry base: a85ee36ababf1a8e3378ad252423cba3bc5c7afe
Fix: gate now checks advancedReservationForm + recordAdvancedReservation and loyaltyTransactionForm + loyaltyTransaction.
