// Read-only projections: never write POS totals into the local finance ledger.
export function mergePosFinance(state, snapshot, restaurantId) {
  const rows = restaurantId && snapshot?.restaurantId === restaurantId ? snapshot.rows || [] : [];
  const history = (state.financeHistory || []).map(row => ({...row}));
  const byDate = new Map(history.map(row => [row.date, row]));
  for (const remote of rows) {
    const date = String(remote?.business_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let row = byDate.get(date);
    if (!row) { row = {date, revenue:0, covers:0, expenses:0}; history.push(row); byDate.set(date,row); }
    row.posRevenue = Number(remote.net_sales) || 0;
    row.posCovers = Math.max(0, Number(remote.covers) || 0);
    row.revenue = (Number(row.revenue) || 0) + row.posRevenue;
    row.covers = (Number(row.covers) || 0) + row.posCovers;
  }
  history.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return {...state, financeHistory:history, __posFinance:snapshot?.restaurantId===restaurantId?snapshot:{rows:[]}};
}

export function todayTicketCount(state, snapshot, restaurantId, day) {
  const local = (state.orders || []).filter(row => row.status==='paid' && String(row.date || row.dateTime || '').slice(0,10)===day).length;
  const remote = snapshot?.restaurantId===restaurantId && restaurantId
    ? (snapshot.rows || []).filter(row => row.business_date===day).reduce((n,row) => n+Math.max(0,Number(row.paid_orders)||0),0) : 0;
  return local + remote;
}
