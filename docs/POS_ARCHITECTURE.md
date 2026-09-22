# ReMaPro POS integration architecture

ReMaPro Hub and ReMaPro POS are separate applications sharing the same ReMaPro platform identity and Supabase backend.

## Responsibility split
- ReMaPro Hub: management, recipes, food cost, stock, HACCP, HR, documents, reporting and POS catalog administration.
- ReMaPro POS: service, tables/orders, cash sessions, payments, receipts and future kitchen routing.
- Supabase: common identity, restaurant tenancy, POS transaction ledger, event sync and reporting bridge.

## POS source-of-truth tables
- pos_devices
- pos_catalog_items
- pos_cash_sessions
- pos_orders
- pos_order_items
- pos_payments
- pos_event_log

Financial records have no authenticated DELETE privilege. Corrections must be represented by state transitions, refunds/voids and append-only events rather than silent deletion.

## Offline model
Every POS entity uses client-generated UUIDs. The event ledger uses client_event_id UNIQUE for idempotency and a server sequence cursor for replay/pull. A future native POS database can queue mutations locally and replay them after connectivity returns.

## Payment boundary
ReMaPro stores only payment method, amount, tip, status, provider and provider reference. PAN/CVV/card magnetic data must remain inside the certified payment provider/terminal environment.

## Hub bridge
The security-invoker view pos_daily_sales_summary exposes paid-order daily totals under the same RLS as the underlying POS orders. Hub code accesses the POS backend through src/pos.js and the authenticated remapro-pos-sync Edge Function.

## Next POS milestones
1. standalone POS shell and login;
2. local/offline database and sync queue;
3. catalog and table/order UX;
4. cash-session open/close;
5. payments, refunds and receipt numbering;
6. printer/KDS routing;
7. payment-terminal integrations;
8. reconciliation, exports and production hardening.
