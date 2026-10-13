// Khách hàng: danh sách + lọc, thêm khách (báo trùng SĐT), hồ sơ khách (thông tin, chăm sóc, đơn hàng).
import { html, Modal, Badge, Empty, ConfirmButton } from './ui.js';
import { useState, useEffect, useMemo } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import * as U from './util.js';
import * as K from './core.js';
import { OrderDrawer, NewOrderButton } from './orders.js';

const FILTERS = [
  { id: 'follow', label: '📞 Cần gọi' },
  { id: 'open', label: 'Đang theo' },
  { id: 'unassigned', label: 'Chưa ai nhận' },
  { id: 'won', label: 'Đã chốt' },
  { id: 'lost', label: 'Không mua' },
  { id: 'all', label: 'Tất cả' },
];

export function CustomersView({ ctx }) {
  const { state, me } = ctx;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('follow');
  const [owner, setOwner] = useState('');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const today = U.todayStr();
  const mine = K.visibleCustomers(state, me);
  const counts = {
    follow: mine.filter((c) => K.followState(c, today) === 'overdue' || K.followState(c, today) === 'today' || (c.status === 'new' && (!c.owner_id || c.owner_id === me.id))).length,
    unassigned: mine.filter((c) => !c.owner_id && c.status !== 'lost').length,
  };
  const list = mine
    .filter((c) => {
      if (owner && c.owner_id !== (owner === 'none' ? null : owner)) return false;
      if (filter === 'follow') return ['overdue', 'today'].includes(K.followState(c, today)) || (c.status === 'new' && (!c.owner_id || c.owner_id === me.id));
      if (filter === 'open') return !['won', 'lost'].includes(c.status);
      if (filter === 'unassigned') return !c.owner_id && c.status !== 'lost';
      if (filter === 'won' || filter === 'lost') return c.status === filter;
      return true;
    })
    .filter((c) => K.matches(q, c.name, c.phone, c.phone2, c.area, c.address, c.need))
    .sort((a, b) => (a.next_follow || '9999').localeCompare(b.next_follow || '9999') || (b.created_at || '').localeCompare(a.created_at || ''));
  const leader = me.role === 'admin' || me.role === 'manager';
  const openC = open && state.customers.find((c) => c.id === open);

  return html`<div class="page">
    <div class="page-head">
      <div><h1>👥 Khách hàng</h1><div class="muted">${mine.length} khách · ${counts.follow} cần xử lý hôm nay</div></div>
      <button class="btn primary" onClick=${() => setAdding(true)}>+ Khách mới</button>
    </div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Tìm tên, SĐT, khu vực, nhu cầu…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="chips">${FILTERS.map((f) => html`<button class=${'chip ' + (filter === f.id ? 'on' : '')} onClick=${() => setFilter(f.id)}>${f.label}${counts[f.id] ? html` <b>${counts[f.id]}</b>` : ''}</button>`)}</div>
      ${leader && html`<select value=${owner} onChange=${(e) => setOwner(e.target.value)}>
        <option value="">Mọi người phụ trách</option><option value="none">Chưa ai nhận</option>
        ${K.sellers(state).map((p) => html`<option value=${p.id}>${p.full_name}</option>`)}</select>`}
    </div>
    ${list.length ? html`<div class="table-wrap"><table class="table clickable">
      <thead><tr><th>Khách</th><th>Nhu cầu</th><th>Nguồn</th><th>Trạng thái</th><th>Phụ trách</th><th>Hẹn gọi lại</th></tr></thead>
      <tbody>${list.map((c) => html`<${CustomerRow} key=${c.id} c=${c} ctx=${ctx} onOpen=${() => setOpen(c.id)} />`)}</tbody>
    </table></div>` : html`<${Empty}>${filter === 'follow' ? '🎉 Không còn khách nào cần gọi hôm nay.' : 'Không có khách phù hợp.'}</${Empty}>`}
    ${adding && html`<${CustomerForm} ctx=${ctx} onClose=${() => setAdding(false)} onSaved=${(c) => { setAdding(false); setOpen(c.id); }} />`}
    ${openC && html`<${CustomerDrawer} ctx=${ctx} c=${openC} onClose=${() => setOpen(null)} />`}
  </div>`;
}

function CustomerRow({ c, ctx, onOpen }) {
  const st = K.CUSTOMER_STATUS[c.status];
  const fs = K.followState(c);
  return html`<tr onClick=${onOpen}>
    <td><b>${c.name}</b>${c.kind === 'business' && html` <span class="tag">KD</span>`}<div class="muted small">${c.phone || ''}${c.area ? ' · ' + c.area : ''}</div></td>
    <td class="clamp small">${c.need || html`<span class="muted">—</span>`}</td>
    <td class="small nowrap">${K.SOURCES[c.source] || c.source}</td>
    <td><${Badge} cls=${st.cls}>${st.icon} ${st.label}</${Badge}></td>
    <td class="small nowrap">${c.owner_id ? K.personName(ctx.state, c.owner_id) : html`<span class="warn-t">Chưa ai nhận</span>`}</td>
    <td class="nowrap">${c.next_follow ? html`<span class=${fs === 'overdue' ? 'bad-t' : fs === 'today' ? 'warn-t' : ''}>${fs === 'overdue' ? '⚠️ ' : ''}${U.fmtShort(c.next_follow)}</span>` : html`<span class="muted">—</span>`}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
export function CustomerForm({ ctx, c, onClose, onSaved }) {
  const { state, me } = ctx;
  const [f, setF] = useState(c || { name: '', phone: '', address: '', area: '', kind: 'home', source: 'fanpage', need: '', budget: '', status: 'new', owner_id: me.id, next_follow: U.todayStr(), note: '' });
  const [dup, setDup] = useState([]);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    if (c || K.normPhone(f.phone).length < 9) return setDup([]);
    const t = setTimeout(() => actions.phoneOwner(f.phone).then(setDup).catch(() => setDup([])), 350);
    return () => clearTimeout(t);
  }, [f.phone]);
  function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Nhập tên khách');
    const row = actions.saveCustomer({ ...f, name: f.name.trim(), budget: f.budget === '' ? null : K.parseMoney(f.budget), owner_id: f.owner_id || null, next_follow: f.next_follow || null });
    if (!c) actions.addActivity(row.id, 'note', `Tiếp nhận khách từ ${K.SOURCES[f.source] || f.source}${f.need ? ': ' + f.need : ''}`);
    ctx.notify(c ? 'Đã lưu' : 'Đã thêm khách');
    onSaved ? onSaved(row) : onClose();
  }
  const leader = me.role === 'admin' || me.role === 'manager';
  return html`<${Modal} title=${c ? 'Sửa thông tin khách' : 'Khách mới'} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <div class="grid2">
        <label>Tên khách *<input value=${f.name} onInput=${set('name')} placeholder="Anh Trung" autofocus /></label>
        <label>Số điện thoại<input type="tel" value=${f.phone || ''} onInput=${set('phone')} placeholder="09xx xxx xxx" /></label>
      </div>
      ${dup.length > 0 && html`<div class="alert warn">⚠️ Số này đã có trong CRM: ${dup.map((d) => html`<b>${d.customer_name}</b> (${d.owner_name ? 'phụ trách: ' + d.owner_name : 'chưa ai nhận'}, ${K.CUSTOMER_STATUS[d.status]?.label}) `)} — kiểm tra trước khi thêm trùng.</div>`}
      <div class="grid2">
        <label>Nguồn<select value=${f.source} onChange=${set('source')}>${Object.entries(K.SOURCES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
        <label>Loại<select value=${f.kind} onChange=${set('kind')}>${Object.entries(K.KINDS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      </div>
      <label>Nhu cầu<textarea rows="2" value=${f.need || ''} onInput=${set('need')} placeholder="Phòng 25m², hát gia đình, thích loa màu trắng…"></textarea></label>
      <div class="grid2">
        <label>Ngân sách<input value=${f.budget ?? ''} onInput=${set('budget')} placeholder="vd 25tr" /></label>
        <label>Khu vực<input value=${f.area || ''} onInput=${set('area')} placeholder="Cầu Giấy, Hà Nội" /></label>
      </div>
      <label>Địa chỉ<input value=${f.address || ''} onInput=${set('address')} /></label>
      <div class="grid2">
        <label>Phụ trách<select value=${f.owner_id || ''} onChange=${set('owner_id')}>
          <option value="">— Chưa ai nhận —</option>
          ${(leader ? K.sellers(state) : state.people.filter((p) => p.id === me.id || p.id === f.owner_id)).map((p) => html`<option value=${p.id}>${p.full_name}</option>`)}</select></label>
        <label>Hẹn gọi lại<input type="date" value=${f.next_follow || ''} onInput=${set('next_follow')} /></label>
      </div>
      ${c && html`<label>Trạng thái<select value=${f.status} onChange=${set('status')}>${Object.entries(K.CUSTOMER_STATUS).map(([k, s]) => html`<option value=${k}>${s.icon} ${s.label}</option>`)}</select></label>
        ${f.status === 'lost' && html`<label>Lý do không mua<input value=${f.lost_reason || ''} onInput=${set('lost_reason')} placeholder="Giá cao, chọn hàng sàn…" /></label>`}`}
      <label>Ghi chú<textarea rows="2" value=${f.note || ''} onInput=${set('note')}></textarea></label>
      ${err && html`<div class="err">${err}</div>`}
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
    </form>
  </${Modal}>`;
}

// ---------------------------------------------------------------------------
export function CustomerDrawer({ ctx, c, onClose, tab0 = 'care' }) {
  const { state, me } = ctx;
  const [tab, setTab] = useState(tab0);
  const [edit, setEdit] = useState(false);
  const [order, setOrder] = useState(null);
  const orders = K.ordersOf(state, c.id);
  const st = K.CUSTOMER_STATUS[c.status];
  const openOrder = order && state.orders.find((o) => o.id === order);
  return html`<div class="drawer-overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <aside class="drawer">
      <div class="drawer-head">
        <div>
          <h2>${c.name} <${Badge} cls=${st.cls}>${st.icon} ${st.label}</${Badge}></h2>
          <div class="muted small">${K.KINDS[c.kind]} · ${K.SOURCES[c.source] || c.source} · Phụ trách: ${c.owner_id ? K.personName(state, c.owner_id) : 'chưa ai nhận'}</div>
          ${c.phone && html`<div class="row gap"><a class="btn sm" href=${K.telHref(c.phone)}>📞 ${c.phone}</a><a class="btn sm" href=${K.zaloHref(c.phone)} target="_blank" rel="noopener">💬 Zalo</a></div>`}
        </div>
        <button class="x" onClick=${onClose}>×</button>
      </div>
      <div class="drawer-tabs">
        ${[['care', '📝 Chăm sóc'], ['orders', `🧾 Báo giá & đơn (${orders.length})`], ['info', 'ℹ️ Thông tin']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}
      </div>
      <div class="drawer-body">
        ${tab === 'care' && html`<${Care} ctx=${ctx} c=${c} />`}
        ${tab === 'orders' && html`<div class="stack">
          <div class="row between"><b>Báo giá & đơn hàng</b><${NewOrderButton} ctx=${ctx} customer=${c} onCreated=${(o) => setOrder(o.id)} /></div>
          ${orders.length ? orders.map((o) => html`<${OrderCard} key=${o.id} o=${o} ctx=${ctx} onOpen=${() => setOrder(o.id)} />`) : html`<${Empty}>Chưa có báo giá nào.</${Empty}>`}
        </div>`}
        ${tab === 'info' && html`<div class="stack">
          <dl class="infolist">
            <dt>SĐT</dt><dd>${c.phone || '—'}${c.phone2 ? ' · ' + c.phone2 : ''}</dd>
            <dt>Địa chỉ</dt><dd>${c.address || '—'}${c.area ? ' (' + c.area + ')' : ''}</dd>
            <dt>Nhu cầu</dt><dd>${c.need || '—'}</dd>
            <dt>Ngân sách</dt><dd>${c.budget ? K.money(c.budget) : '—'}</dd>
            <dt>Hẹn gọi lại</dt><dd>${c.next_follow ? U.fmtDate(c.next_follow) : '—'}</dd>
            ${c.status === 'lost' && html`<dt>Lý do không mua</dt><dd>${c.lost_reason || '—'}</dd>`}
            <dt>Ghi chú</dt><dd class="pre">${c.note || '—'}</dd>
            <dt>Ngày tạo</dt><dd>${U.fmtDate((c.created_at || '').slice(0, 10))}</dd>
          </dl>
          <div class="row between">
            <button class="btn" onClick=${() => setEdit(true)}>✏️ Sửa thông tin</button>
            ${me.role === 'admin' && html`<${ConfirmButton} label="Xoá khách" ask="Xoá khách + mọi đơn? Bấm lần nữa" onConfirm=${() => { actions.deleteCustomer(c.id); ctx.notify('Đã xoá khách'); onClose(); }} />`}
          </div>
        </div>`}
      </div>
    </aside>
    ${edit && html`<${CustomerForm} ctx=${ctx} c=${c} onClose=${() => setEdit(false)} />`}
    ${openOrder && html`<${OrderDrawer} ctx=${ctx} o=${openOrder} onClose=${() => setOrder(null)} />`}
  </div>`;
}

function OrderCard({ o, ctx, onOpen }) {
  const st = K.ORDER_STATUS[o.status];
  const paid = K.paidOf(ctx.state, o.id);
  return html`<div class="card pad click" onClick=${onOpen}>
    <div class="row between"><b>${o.code}</b><${Badge} cls=${st.cls}>${st.label}</${Badge}></div>
    <div class="small muted">${K.itemsOf(ctx.state, o.id).map((i) => `${i.name} x${i.qty}`).join(', ') || 'Chưa có hàng'}</div>
    <div class="row between small"><span>Tổng <b>${K.money(o.total)}</b></span>${o.status !== 'quote' && html`<span class=${paid >= o.total ? 'ok-t' : 'warn-t'}>Đã thu ${K.money(paid)}</span>`}</div>
  </div>`;
}

// Nhật ký chăm sóc + đổi trạng thái nhanh + hẹn gọi lại
function Care({ ctx, c }) {
  const { state, me } = ctx;
  const [kind, setKind] = useState('call');
  const [text, setText] = useState('');
  const [next, setNext] = useState(c.next_follow || '');
  const acts = state.activities.filter((a) => a.customer_id === c.id).sort((a, b) => b.at.localeCompare(a.at));
  function log(e) {
    e.preventDefault();
    if (!text.trim()) return;
    actions.addActivity(c.id, kind, text.trim());
    const patch = { id: c.id, next_follow: next || null };
    if (c.status === 'new') patch.status = 'consulting';
    if (!c.owner_id) patch.owner_id = me.id;
    actions.saveCustomer({ ...c, ...patch });
    setText('');
    ctx.notify('Đã ghi chăm sóc' + (next ? ' · hẹn gọi lại ' + U.fmtShort(next) : ''));
  }
  const quick = (d) => setNext(U.addDays(d));
  return html`<div class="stack">
    ${!c.owner_id && html`<div class="alert info row between"><span>Khách chưa ai nhận.</span><button class="btn sm primary" onClick=${() => { actions.saveCustomer({ ...c, owner_id: me.id }); ctx.notify('Bạn đã nhận khách này'); }}>Nhận khách</button></div>`}
    <form class="card pad form" onSubmit=${log}>
      <div class="chips">${['call', 'msg', 'visit', 'note'].map((k) => html`<button type="button" class=${'chip ' + (kind === k ? 'on' : '')} onClick=${() => setKind(k)}>${K.ACT_KINDS[k]}</button>`)}</div>
      <textarea rows="2" placeholder="Nội dung trao đổi, khách phản hồi gì…" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      <div class="row between">
        <div class="row">
          <span class="small muted">Hẹn gọi lại</span>
          <input type="date" value=${next} onInput=${(e) => setNext(e.target.value)} />
          ${[[1, 'Mai'], [3, '+3 ngày'], [7, '+1 tuần']].map(([d, l]) => html`<button type="button" class="chip" onClick=${() => quick(d)}>${l}</button>`)}
        </div>
        <button class="btn primary">Lưu</button>
      </div>
    </form>
    <div class="row gap">
      <span class="small muted">Chuyển trạng thái:</span>
      ${Object.entries(K.CUSTOMER_STATUS).map(([k, s]) => html`<button class=${'chip ' + (c.status === k ? 'on' : '')} onClick=${() => { if (c.status !== k) { actions.saveCustomer({ ...c, status: k, next_follow: k === 'won' || k === 'lost' ? null : c.next_follow }); actions.addActivity(c.id, 'note', `Chuyển trạng thái: ${s.label}`); } }}>${s.icon} ${s.label}</button>`)}
    </div>
    <div class="timeline">
      ${acts.length ? acts.map((a) => html`<div class="tl-item" key=${a.id}>
        <div class="tl-head"><b>${K.ACT_KINDS[a.kind] || a.kind}</b><span class="muted small">${U.fmtShort(a.at.slice(0, 10))} ${U.fmtTime(a.at)} · ${K.personName(state, a.by_id)}</span></div>
        <div class="pre">${a.text}</div>
      </div>`) : html`<div class="muted small">Chưa có lịch sử chăm sóc.</div>`}
    </div>
  </div>`;
}
