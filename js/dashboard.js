// Tổng quan bán hàng theo kỳ: khách mới, tỉ lệ chốt, doanh số, tiền đã thu, nguồn khách, kết quả từng người.
import { html, Stat, Seg, Bar, Empty } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import * as U from './util.js';
import * as K from './core.js';

export function DashboardView({ ctx, go }) {
  const { state, me } = ctx;
  const [period, setPeriod] = useState('month');
  const [ref, setRef] = useState(U.todayStr());
  const [a, b] = U.periodRange(period, ref);
  const inR = (iso) => !!iso && iso.slice(0, 10) >= a && iso.slice(0, 10) <= b;
  const customers = K.visibleCustomers(state, me);
  const orders = K.visibleOrders(state, me);
  const newC = customers.filter((c) => inR(c.created_at));
  const won = orders.filter((o) => !['quote', 'cancelled'].includes(o.status) && inR(o.confirmed_at || o.created_at));
  const quotes = orders.filter((o) => inR(o.created_at));
  const revenue = won.reduce((s, o) => s + +o.total, 0);
  const orderIds = new Set(orders.map((o) => o.id));
  const collected = state.payments.filter((p) => orderIds.has(p.order_id) && p.paid_at >= a && p.paid_at <= b).reduce((s, p) => s + +p.amount, 0);
  const owed = orders.filter((o) => !['quote', 'cancelled'].includes(o.status)).reduce((s, o) => s + Math.max(0, o.total - K.paidOf(state, o.id)), 0);
  const installs = state.installs.filter((i) => orderIds.has(i.order_id) && i.date >= a && i.date <= b && i.status !== 'cancelled');
  const overdue = customers.filter((c) => K.followState(c) === 'overdue').length;
  const unassigned = customers.filter((c) => !c.owner_id && c.status !== 'lost').length;
  const wonCustomers = new Set(won.map((o) => o.customer_id));
  const rate = newC.length ? Math.round((newC.filter((c) => c.status === 'won' || wonCustomers.has(c.id)).length / newC.length) * 100) : null;
  const bySource = Object.keys(K.SOURCES).map((s) => {
    const cs = newC.filter((c) => c.source === s);
    return { s, n: cs.length, won: cs.filter((c) => c.status === 'won').length, rev: won.filter((o) => cs.some((c) => c.id === o.customer_id)).reduce((x, o) => x + +o.total, 0) };
  }).filter((x) => x.n).sort((x, y) => y.n - x.n);
  const maxSrc = Math.max(1, ...bySource.map((x) => x.n));
  const people = K.sellers(state).map((p) => ({
    p,
    leads: newC.filter((c) => c.owner_id === p.id).length,
    quotes: quotes.filter((o) => o.owner_id === p.id).length,
    won: won.filter((o) => o.owner_id === p.id).length,
    rev: won.filter((o) => o.owner_id === p.id).reduce((s, o) => s + +o.total, 0),
    installs: installs.filter((i) => i.tech_ids.includes(p.id) && i.status === 'done').length,
  })).filter((r) => r.leads || r.quotes || r.won || r.installs).sort((x, y) => y.rev - x.rev);
  // Lãi gộp (chỉ Quản trị)
  let profit = null;
  if (me.role === 'admin') {
    const cost = won.reduce((s, o) => s + K.itemsOf(state, o.id).reduce((x, i) => x + K.costOf(state, i), 0), 0);
    profit = isFinite(cost) ? revenue - cost : null;
  }
  return html`<div class="page">
    <div class="page-head"><div><h1>📊 Tổng quan bán hàng</h1><div class="muted">${U.periodLabel(period, ref)}</div></div>
      <div class="row"><${Seg} value=${period} onChange=${(p) => { setPeriod(p); setRef(U.todayStr()); }} options=${U.PERIODS} />
        <button class="btn" onClick=${() => setRef(U.shiftPeriod(period, ref, -1))}>‹</button><button class="btn" disabled=${b >= U.todayStr()} onClick=${() => setRef(U.shiftPeriod(period, ref, 1))}>›</button></div></div>
    ${(overdue > 0 || unassigned > 0) && html`<div class="alert warn row between"><span>${overdue > 0 ? `⚠️ ${overdue} khách quá hẹn gọi lại. ` : ''}${unassigned > 0 ? `🆕 ${unassigned} khách chưa ai nhận.` : ''}</span><button class="btn sm" onClick=${() => go('customers')}>Xem khách</button></div>`}
    <div class="stats">
      <${Stat} value=${newC.length} label="Khách mới" />
      <${Stat} value=${rate == null ? '—' : rate + '%'} label="Tỉ lệ chốt (khách mới)" cls=${rate == null ? '' : rate >= 25 ? 'ok' : rate >= 15 ? 'warn' : 'bad'} />
      <${Stat} value=${won.length} label="Đơn chốt" sub=${quotes.length + ' báo giá tạo trong kỳ'} />
      <${Stat} value=${K.moneyShort(revenue)} label="Doanh số chốt" cls="ok" />
      <${Stat} value=${K.moneyShort(collected)} label="Tiền đã thu trong kỳ" />
      <${Stat} value=${K.moneyShort(owed)} label="Khách còn nợ (tất cả)" cls=${owed ? 'warn' : ''} />
      <${Stat} value=${installs.filter((i) => i.status === 'done').length + '/' + installs.length} label="Lịch lắp xong / hẹn" />
      ${profit != null && html`<${Stat} value=${K.moneyShort(profit)} label="🔒 Lãi gộp ước tính" sub=${revenue ? Math.round((profit / revenue) * 100) + '% doanh số' : ''} cls="ok" />`}
    </div>
    <div class="grid-2col">
      <section class="section"><div class="section-head"><h2>Nguồn khách</h2></div>
        ${bySource.length ? html`<div class="card pad stack">${bySource.map((x) => html`<div>
          <div class="row between small"><b>${K.SOURCES[x.s]}</b><span>${x.n} khách · chốt ${x.won} · ${K.moneyShort(x.rev)}</span></div>
          <${Bar} pct=${(x.n / maxSrc) * 100} cls="brand" /></div>`)}</div>` : html`<${Empty}>Chưa có khách mới trong kỳ.</${Empty}>`}
      </section>
      <section class="section"><div class="section-head"><h2>Phễu khách đang theo</h2></div>
        <div class="card pad stack">${['new', 'consulting', 'quoted', 'won', 'lost'].map((s) => {
          const n = customers.filter((c) => c.status === s).length;
          return html`<div><div class="row between small"><b>${K.CUSTOMER_STATUS[s].icon} ${K.CUSTOMER_STATUS[s].label}</b><span>${n}</span></div><${Bar} pct=${customers.length ? (n / customers.length) * 100 : 0} cls=${s === 'won' ? 'ok' : s === 'lost' ? '' : 'brand'} /></div>`;
        })}</div>
      </section>
    </div>
    <section class="section"><div class="section-head"><h2>Theo từng người</h2></div>
      ${people.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Người</th><th class="num">Khách mới</th><th class="num">Báo giá</th><th class="num">Đơn chốt</th><th class="num">Doanh số</th><th class="num">Lắp xong</th></tr></thead>
        <tbody>${people.map((r) => html`<tr><td><b>${r.p.full_name}</b><div class="muted small">${r.p.title || ''}</div></td><td class="num">${r.leads}</td><td class="num">${r.quotes}</td><td class="num">${r.won}</td><td class="num nowrap">${K.money(r.rev)}</td><td class="num">${r.installs}</td></tr>`)}</tbody></table></div>`
        : html`<${Empty}>Chưa có số liệu trong kỳ.</${Empty}>`}
    </section>
    <p class="muted small">Đơn sàn TMĐT (Shopee / Lazada / TikTok Shop) không nhập vào CRM — nhân viên sàn ghi số đơn & doanh thu hằng ngày trong báo cáo VietK Checklist (KPI).</p>
  </div>`;
}
