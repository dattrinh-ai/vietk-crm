// Báo giá / đơn hàng: danh sách, soạn dòng hàng (sản phẩm / combo), thu tiền, hẹn lắp đặt, in báo giá.
import { html, Modal, Badge, Empty, ConfirmButton, Stat } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import * as U from './util.js';
import * as K from './core.js';
import { InstallForm, InstallCard } from './installs.js';

const FILTERS = [
  { id: 'open', label: 'Đang xử lý' },
  { id: 'quote', label: 'Báo giá' },
  { id: 'unpaid', label: 'Còn nợ' },
  { id: 'done', label: 'Hoàn tất' },
  { id: 'all', label: 'Tất cả' },
];

export function OrdersView({ ctx }) {
  const { state, me } = ctx;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('open');
  const [open, setOpen] = useState(null);
  const all = K.visibleOrders(state, me);
  const due = (o) => o.total - K.paidOf(state, o.id);
  const list = all
    .filter((o) => {
      if (filter === 'open') return ['confirmed', 'scheduled', 'installed'].includes(o.status) || (o.status === 'quote' && (!o.quote_valid_until || o.quote_valid_until >= U.todayStr()));
      if (filter === 'quote') return o.status === 'quote';
      if (filter === 'unpaid') return !['quote', 'cancelled'].includes(o.status) && due(o) > 0;
      if (filter === 'done') return o.status === 'done';
      return true;
    })
    .filter((o) => {
      const c = K.customerOf(state, o.customer_id);
      return K.matches(q, o.code, c?.name, c?.phone, o.address);
    });
  const month = U.monthStart();
  const confirmedMonth = all.filter((o) => o.status !== 'quote' && o.status !== 'cancelled' && (o.confirmed_at || o.created_at || '').slice(0, 10) >= month);
  const openO = open && state.orders.find((o) => o.id === open);
  return html`<div class="page">
    <div class="page-head"><div><h1>🧾 Báo giá & đơn hàng</h1><div class="muted">Tạo báo giá từ hồ sơ khách (tab Khách hàng) hoặc nút bên cạnh</div></div>
      <${NewOrderButton} ctx=${ctx} onCreated=${(o) => setOpen(o.id)} /></div>
    <div class="stats">
      <${Stat} value=${confirmedMonth.length} label="Đơn chốt tháng này" />
      <${Stat} value=${K.moneyShort(confirmedMonth.reduce((a, o) => a + +o.total, 0))} label="Doanh số chốt tháng này" />
      <${Stat} value=${all.filter((o) => o.status === 'quote').length} label="Báo giá đang chờ" cls="info" />
      <${Stat} value=${K.moneyShort(all.filter((o) => !['quote', 'cancelled'].includes(o.status)).reduce((a, o) => a + Math.max(0, due(o)), 0))} label="Khách còn nợ" cls="warn" />
    </div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Tìm mã đơn, tên khách, SĐT…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="chips">${FILTERS.map((f) => html`<button class=${'chip ' + (filter === f.id ? 'on' : '')} onClick=${() => setFilter(f.id)}>${f.label}</button>`)}</div>
    </div>
    ${list.length ? html`<div class="table-wrap"><table class="table clickable">
      <thead><tr><th>Mã</th><th>Khách</th><th>Hàng</th><th>Trạng thái</th><th class="num">Tổng</th><th class="num">Còn lại</th><th>Phụ trách</th></tr></thead>
      <tbody>${list.map((o) => {
        const c = K.customerOf(state, o.customer_id);
        const st = K.ORDER_STATUS[o.status];
        const d = due(o);
        return html`<tr key=${o.id} onClick=${() => setOpen(o.id)}>
          <td class="nowrap"><b>${o.code}</b><div class="muted small">${U.fmtShort((o.created_at || '').slice(0, 10))}</div></td>
          <td><b>${c?.name || '—'}</b><div class="muted small">${c?.phone || ''}</div></td>
          <td class="small clamp">${K.itemsOf(state, o.id).map((i) => `${i.name} x${i.qty}`).join(', ')}</td>
          <td><${Badge} cls=${st.cls}>${st.label}</${Badge}></td>
          <td class="num nowrap">${K.money(o.total)}</td>
          <td class="num nowrap">${o.status === 'quote' || o.status === 'cancelled' ? html`<span class="muted">—</span>` : d > 0 ? html`<span class="warn-t">${K.money(d)}</span>` : html`<span class="ok-t">Đủ</span>`}</td>
          <td class="small nowrap">${K.personName(state, o.owner_id)}</td>
        </tr>`;
      })}</tbody></table></div>` : html`<${Empty}>Không có đơn phù hợp.</${Empty}>`}
    ${openO && html`<${OrderDrawer} ctx=${ctx} o=${openO} onClose=${() => setOpen(null)} />`}
  </div>`;
}

// Nút "+ Báo giá": có sẵn khách thì tạo luôn, chưa có thì chọn khách
export function NewOrderButton({ ctx, customer, onCreated }) {
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState('');
  async function create(c) {
    const o = await actions.saveOrder({ customer_id: c.id, status: 'quote', delivery: 'install', address: c.address || '', discount: 0, quote_valid_until: U.addDays(+ctx.state.settings.quote_valid_days || 7) }, []);
    if (c.status === 'new' || c.status === 'consulting') actions.saveCustomer({ ...c, status: 'quoted' });
    setPick(false);
    onCreated && onCreated(o);
  }
  if (customer) return html`<button class="btn primary sm" onClick=${() => create(customer)}>+ Báo giá mới</button>`;
  const list = K.visibleCustomers(ctx.state, ctx.me).filter((c) => K.matches(q, c.name, c.phone)).slice(0, 12);
  return html`<button class="btn primary" onClick=${() => setPick(true)}>+ Báo giá mới</button>
    ${pick && html`<${Modal} title="Chọn khách cho báo giá" onClose=${() => setPick(false)}>
      <div class="form">
        <input type="search" placeholder="Tìm tên / SĐT khách…" value=${q} onInput=${(e) => setQ(e.target.value)} autofocus />
        <div class="pick-list">${list.map((c) => html`<button class="pick" onClick=${() => create(c)}><b>${c.name}</b> <span class="muted small">${c.phone || ''} ${c.area ? '· ' + c.area : ''}</span></button>`)}</div>
        <p class="muted small">Khách chưa có trong CRM? Thêm ở tab Khách hàng trước.</p>
      </div>
    </${Modal}>`}`;
}

// ---------------------------------------------------------------------------
export function OrderDrawer({ ctx, o, onClose }) {
  const { state, me } = ctx;
  const c = K.customerOf(state, o.customer_id);
  const [tab, setTab] = useState(o.status === 'quote' ? 'items' : 'pay');
  const [print, setPrint] = useState(false);
  const st = K.ORDER_STATUS[o.status];
  const items = K.itemsOf(state, o.id);
  const paid = K.paidOf(state, o.id);
  const installs = K.installsOf(state, o.id);
  const isAdmin = me.role === 'admin';
  function setStatus(s) {
    actions.setOrder(o.id, { status: s });
    if (s === 'confirmed' && c && c.status !== 'won') actions.saveCustomer({ ...c, status: 'won', next_follow: null });
    if (s === 'confirmed') actions.addActivity(o.customer_id, 'order', `Chốt đơn ${o.code} — ${K.money(o.total)}`);
    ctx.notify('Đơn: ' + K.ORDER_STATUS[s].label);
  }
  return html`<div class="drawer-overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <aside class="drawer">
      <div class="drawer-head">
        <div>
          <h2>${o.code} <${Badge} cls=${st.cls}>${st.label}</${Badge}></h2>
          <div class="muted small">${c?.name} · ${c?.phone || ''} · Phụ trách ${K.personName(state, o.owner_id)}</div>
          <div class="row gap">
            ${o.status === 'quote' && html`<button class="btn sm primary" disabled=${!items.length} onClick=${() => setStatus('confirmed')}>✅ Khách đồng ý — chốt đơn</button>`}
            ${o.status === 'installed' && html`<button class="btn sm ok" onClick=${() => setStatus('done')}>✔ Hoàn tất đơn</button>`}
            ${o.delivery !== 'install' && o.status === 'confirmed' && html`<button class="btn sm ok" onClick=${() => setStatus('done')}>✔ Đã giao — hoàn tất</button>`}
            <button class="btn sm" onClick=${() => setPrint(true)}>🖨 ${o.status === 'quote' ? 'In báo giá' : 'In phiếu'}</button>
          </div>
        </div>
        <button class="x" onClick=${onClose}>×</button>
      </div>
      <div class="drawer-tabs">
        ${[['items', '📦 Hàng & giá'], ['pay', `💰 Thanh toán`], ['install', `🛠 Lắp đặt (${installs.length})`], ['more', '⚙️ Khác']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}
      </div>
      <div class="drawer-body">
        ${tab === 'items' && html`<${ItemsEditor} ctx=${ctx} o=${o} items=${items} key=${o.id + items.length} />`}
        ${tab === 'pay' && html`<${Payments} ctx=${ctx} o=${o} paid=${paid} />`}
        ${tab === 'install' && html`<div class="stack">
          ${o.status === 'quote' ? html`<div class="alert info">Chốt đơn trước rồi hẹn lịch lắp.</div>` : html`<${InstallForm} ctx=${ctx} order=${o} />`}
          ${installs.map((i) => html`<${InstallCard} key=${i.id} ctx=${ctx} inst=${i} />`)}
        </div>`}
        ${tab === 'more' && html`<${OrderMore} ctx=${ctx} o=${o} onDeleted=${onClose} />`}
        ${isAdmin && items.length > 0 && tab === 'items' && html`<${Profit} ctx=${ctx} o=${o} items=${items} />`}
      </div>
    </aside>
    ${print && html`<${PrintQuote} ctx=${ctx} o=${o} c=${c} items=${items} paid=${paid} onClose=${() => setPrint(false)} />`}
  </div>`;
}

function ItemsEditor({ ctx, o, items }) {
  const { state } = ctx;
  const [rows, setRows] = useState(items.map((i) => ({ ...i })));
  const [discount, setDiscount] = useState(o.discount || 0);
  const [q, setQ] = useState('');
  const [dirty, setDirty] = useState(false);
  const locked = ['done', 'cancelled'].includes(o.status);
  const add = (row) => {
    setRows([...rows, { id: 'tmp' + Math.random(), qty: 1, ...row }]);
    setQ('');
    setDirty(true);
  };
  const upd = (k, patch) => {
    setRows(rows.map((r, j) => (j === k ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const products = state.products.filter((p) => p.active !== false);
  const combos = state.combos.filter((c) => c.active !== false);
  const found = q.trim()
    ? [...combos.filter((c) => K.matches(q, c.name)).map((c) => ({ combo: c })), ...products.filter((p) => K.matches(q, p.name, p.sku, p.category)).map((p) => ({ product: p }))].slice(0, 10)
    : [];
  async function save() {
    await actions.saveOrder({ ...o, discount: K.parseMoney(discount) }, rows.map(({ id, product_id, combo_id, name, qty, price }) => ({ id, product_id: product_id || null, combo_id: combo_id || null, name, qty: +qty || 1, price: K.parseMoney(price) })));
    setDirty(false);
    ctx.notify('Đã lưu hàng & giá');
  }
  const total = K.orderTotal(rows.map((r) => ({ qty: r.qty, price: K.parseMoney(r.price) })), K.parseMoney(discount));
  return html`<div class="stack">
    ${!locked && html`<div class="addline">
      <input type="search" placeholder="🔎 Thêm combo / sản phẩm: gõ BBS8, iCON-9, micro…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${found.length > 0 && html`<div class="pick-list">${found.map((f) => f.combo
        ? html`<button class="pick" onClick=${() => add({ combo_id: f.combo.id, name: f.combo.name, price: f.combo.price })}>📦 <b>${f.combo.name}</b> <span class="muted small">combo · ${K.money(f.combo.price)}</span></button>`
        : html`<button class="pick" onClick=${() => add({ product_id: f.product.id, name: f.product.name, price: f.product.price })}><b>${f.product.name}</b> <span class="muted small">${f.product.sku || ''} · ${K.money(f.product.price)}</span></button>`)}</div>`}
      ${q.trim() && html`<button class="link" onClick=${() => add({ name: q.trim(), price: 0 })}>+ Thêm dòng tự do "${q.trim()}"</button>`}
    </div>`}
    ${rows.length ? html`<div class="table-wrap"><table class="table lines">
      <thead><tr><th>Hàng</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th></th></tr></thead>
      <tbody>${rows.map((r, k) => html`<tr key=${r.id}>
        <td>${locked ? r.name : html`<input class="cell" value=${r.name} onInput=${(e) => upd(k, { name: e.target.value })} />`}
          ${r.combo_id && html`<div class="muted small">${(state.combos.find((c) => c.id === r.combo_id)?.items || []).map((x) => `${state.products.find((p) => p.id === x.product_id)?.name || '?'} x${x.qty}`).join(' + ')}</div>`}</td>
        <td class="num">${locked ? r.qty : html`<input class="cell num w-num" type="number" min="1" value=${r.qty} onInput=${(e) => upd(k, { qty: e.target.value })} />`}</td>
        <td class="num">${locked ? K.money(r.price) : html`<input class="cell num" value=${r.price} onInput=${(e) => upd(k, { price: e.target.value })} />`}</td>
        <td class="num nowrap">${K.money((+r.qty || 0) * K.parseMoney(r.price))}</td>
        <td>${!locked && html`<button class="x" title="Bỏ dòng" onClick=${() => { setRows(rows.filter((_, j) => j !== k)); setDirty(true); }}>×</button>`}</td>
      </tr>`)}</tbody>
    </table></div>` : html`<${Empty}>Chưa có hàng — tìm combo hoặc sản phẩm ở ô phía trên.</${Empty}>`}
    <div class="totals">
      <div class="row between"><span>Tạm tính</span><b>${K.money(K.subtotal(rows.map((r) => ({ qty: r.qty, price: K.parseMoney(r.price) }))))}</b></div>
      <div class="row between"><span>Giảm giá</span>${locked ? K.money(discount) : html`<input class="cell num" style="max-width:10rem" value=${discount} onInput=${(e) => { setDiscount(e.target.value); setDirty(true); }} />`}</div>
      <div class="row between big"><span>Tổng cộng</span><b>${K.money(total)}</b></div>
    </div>
    ${!locked && html`<div class="row end"><button class="btn primary" disabled=${!dirty} onClick=${save}>${dirty ? 'Lưu hàng & giá' : 'Đã lưu'}</button></div>`}
    <p class="muted small">Giá nhập tay được: 15tr, 15.500.000, 15,5tr. Giá combo có thể sửa riêng cho từng khách.</p>
  </div>`;
}

// Lãi gộp ước tính — chỉ Quản trị
function Profit({ ctx, o, items }) {
  const cost = items.reduce((a, i) => a + K.costOf(ctx.state, i), 0);
  if (!isFinite(cost)) return html`<p class="muted small">🔒 Chưa đủ giá vốn để tính lãi (thiếu giá vốn sản phẩm hoặc có dòng tự do).</p>`;
  const profit = o.total - cost;
  return html`<div class="card pad admin-only"><div class="row between small"><span>🔒 Giá vốn</span><b>${K.money(cost)}</b></div>
    <div class="row between"><span>🔒 Lãi gộp ước tính</span><b class=${profit > 0 ? 'ok-t' : 'bad-t'}>${K.money(profit)} (${o.total ? Math.round((profit / o.total) * 100) : 0}%)</b></div>
    <div class="muted small">Chỉ Quản trị thấy phần này.</div></div>`;
}

function Payments({ ctx, o, paid }) {
  const { state, me } = ctx;
  const pays = state.payments.filter((p) => p.order_id === o.id).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const due = o.total - paid;
  const [f, setF] = useState({ amount: '', method: 'transfer', paid_at: U.todayStr(), note: '' });
  function add(e) {
    e.preventDefault();
    const amount = K.parseMoney(f.amount);
    if (!amount) return;
    actions.addPayment({ order_id: o.id, amount, method: f.method, paid_at: f.paid_at, note: f.note || null });
    actions.addActivity(o.customer_id, 'order', `Thu ${K.money(amount)} (${K.PAY_METHODS[f.method]}) cho đơn ${o.code}`);
    setF({ ...f, amount: '', note: '' });
    ctx.notify('Đã ghi nhận ' + K.money(amount));
  }
  return html`<div class="stack">
    <div class="stats">
      <${Stat} value=${K.moneyShort(o.total)} label="Tổng đơn" />
      <${Stat} value=${K.moneyShort(paid)} label="Đã thu" cls="ok" />
      <${Stat} value=${K.moneyShort(Math.max(0, due))} label="Còn lại" cls=${due > 0 ? 'warn' : 'ok'} />
    </div>
    ${o.status === 'quote' && html`<div class="alert info">Đây vẫn là báo giá. Thu cọc thì nên bấm "Chốt đơn" ở trên.</div>`}
    ${pays.length > 0 && html`<div class="table-wrap"><table class="table"><thead><tr><th>Ngày</th><th class="num">Số tiền</th><th>Hình thức</th><th>Ghi chú</th><th></th></tr></thead>
      <tbody>${pays.map((p) => html`<tr key=${p.id}><td>${U.fmtDate(p.paid_at)}</td><td class="num">${K.money(p.amount)}</td><td>${K.PAY_METHODS[p.method]}</td><td class="small">${p.note || ''}</td>
        <td>${me.role === 'admin' && html`<${ConfirmButton} label="Xoá" onConfirm=${() => actions.deletePayment(p.id)} />`}</td></tr>`)}</tbody></table></div>`}
    ${o.status !== 'cancelled' && html`<form class="card pad form" onSubmit=${add}>
      <b>+ Ghi nhận tiền khách trả</b>
      <div class="grid2">
        <label>Số tiền<input value=${f.amount} onInput=${(e) => setF({ ...f, amount: e.target.value })} placeholder=${due > 0 ? K.moneyShort(due) : 'vd 5tr'} /></label>
        <label>Hình thức<select value=${f.method} onChange=${(e) => setF({ ...f, method: e.target.value })}>${Object.entries(K.PAY_METHODS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
        <label>Ngày<input type="date" value=${f.paid_at} onInput=${(e) => setF({ ...f, paid_at: e.target.value })} /></label>
        <label>Ghi chú<input value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })} placeholder="Cọc / thanh toán đủ…" /></label>
      </div>
      <div class="row between">${due > 0 && html`<button type="button" class="link" onClick=${() => setF({ ...f, amount: String(due) })}>Điền số còn lại (${K.money(due)})</button>`}<button class="btn primary">Ghi nhận</button></div>
    </form>`}
  </div>`;
}

function OrderMore({ ctx, o, onDeleted }) {
  const { me } = ctx;
  const [f, setF] = useState({ delivery: o.delivery, address: o.address || '', quote_valid_until: o.quote_valid_until || '', note: o.note || '' });
  const canDelete = me.role === 'admin' || (o.status === 'quote' && o.owner_id === me.id);
  return html`<div class="stack">
    <div class="card pad form">
      <label>Hình thức giao<select value=${f.delivery} onChange=${(e) => setF({ ...f, delivery: e.target.value })}>${Object.entries(K.DELIVERY).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <label>Địa chỉ giao / lắp<input value=${f.address} onInput=${(e) => setF({ ...f, address: e.target.value })} /></label>
      ${o.status === 'quote' && html`<label>Báo giá có hiệu lực đến<input type="date" value=${f.quote_valid_until} onInput=${(e) => setF({ ...f, quote_valid_until: e.target.value })} /></label>`}
      <label>Ghi chú đơn<textarea rows="3" value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })}></textarea></label>
      <div class="row end"><button class="btn primary" onClick=${() => { actions.setOrder(o.id, { ...f, quote_valid_until: f.quote_valid_until || null }); ctx.notify('Đã lưu'); }}>Lưu</button></div>
    </div>
    <div class="row between">
      ${o.status !== 'cancelled' && o.status !== 'done' ? html`<${ConfirmButton} label="Huỷ đơn" ask="Huỷ đơn này? Bấm lần nữa" onConfirm=${() => { actions.setOrder(o.id, { status: 'cancelled' }); ctx.notify('Đã huỷ đơn'); }} />`
        : o.status === 'cancelled' ? html`<button class="link" onClick=${() => actions.setOrder(o.id, { status: 'quote' })}>Mở lại thành báo giá</button>` : html`<span></span>`}
      ${canDelete && html`<${ConfirmButton} label="Xoá hẳn" ask="Xoá vĩnh viễn? Bấm lần nữa" onConfirm=${() => { actions.deleteOrder(o.id); ctx.notify('Đã xoá'); onDeleted(); }} />`}
    </div>
  </div>`;
}

// Bản in báo giá / phiếu đơn hàng (dùng Ctrl+P → Lưu PDF để gửi Zalo)
function PrintQuote({ ctx, o, c, items, paid, onClose }) {
  const S = ctx.state.settings;
  const quote = o.status === 'quote';
  const sub = K.subtotal(items);
  return html`<div class="print-wrap">
    <div class="print-bar no-print"><button class="btn primary" onClick=${() => print()}>🖨 In / Lưu PDF</button><button class="btn" onClick=${onClose}>Đóng</button></div>
    <div class="paper">
      <div class="row between"><div><img src="assets/logo-full.png" alt="VietK" style="width:190px" /><div class="small">${S.company_name}<br />${S.company_address}<br />Hotline: ${S.company_phone}</div></div>
        <div class="right small"><b style="font-size:20px">${quote ? 'BÁO GIÁ' : 'PHIẾU ĐƠN HÀNG'}</b><div>Số: ${o.code}</div><div>Ngày: ${U.fmtDate((o.created_at || U.todayStr()).slice(0, 10))}</div></div></div>
      <hr />
      <p><b>Kính gửi:</b> ${c?.name}${c?.phone ? ' · ' + c.phone : ''}<br /><b>Địa chỉ:</b> ${o.address || c?.address || '—'}</p>
      <table class="ptable"><thead><tr><th>#</th><th>Hàng hoá</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>${items.map((i, k) => html`<tr><td>${k + 1}</td><td>${i.name}${i.combo_id && html`<div class="small">${(ctx.state.combos.find((x) => x.id === i.combo_id)?.items || []).map((x) => `${ctx.state.products.find((p) => p.id === x.product_id)?.name || ''} x${x.qty}`).join(' + ')}</div>`}</td>
          <td>${i.qty}</td><td class="right">${K.money(i.price)}</td><td class="right">${K.money(i.qty * i.price)}</td></tr>`)}</tbody>
        <tfoot>
          ${+o.discount > 0 && html`<tr><td colspan="4" class="right">Tạm tính</td><td class="right">${K.money(sub)}</td></tr><tr><td colspan="4" class="right">Giảm giá</td><td class="right">− ${K.money(o.discount)}</td></tr>`}
          <tr><td colspan="4" class="right"><b>Tổng cộng</b></td><td class="right"><b>${K.money(o.total)}</b></td></tr>
          ${!quote && html`<tr><td colspan="4" class="right">Đã thanh toán</td><td class="right">${K.money(paid)}</td></tr><tr><td colspan="4" class="right"><b>Còn lại</b></td><td class="right"><b>${K.money(Math.max(0, o.total - paid))}</b></td></tr>`}
        </tfoot></table>
      <p class="small">${K.DELIVERY[o.delivery]}${quote && o.quote_valid_until ? ` · Báo giá có hiệu lực đến ${U.fmtDate(o.quote_valid_until)}` : ''}. ${S.quote_note ? ' ' + S.quote_note : ''}${o.note ? html`<br />${o.note}` : ''}${S.bank_info ? html`<br /><b>Thanh toán:</b> <span class="pre">${S.bank_info}</span>` : ''}</p>
      <div class="row between small sign"><div>Khách hàng<br /><br /><br /></div><div>Người lập: ${K.personName(ctx.state, o.owner_id)}<br /><br /><br /></div></div>
    </div>
  </div>`;
}
