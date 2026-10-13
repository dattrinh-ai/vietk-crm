// Lịch lắp đặt: xem theo ngày, hẹn lịch + chọn kỹ thuật viên, tick các bước, báo xong / vướng.
// Bản thật: mỗi lịch tự thành việc trong VietK Checklist của kỹ thuật viên (và ngược lại khi họ bấm "Xong").
import { html, Badge, Empty, ConfirmButton } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import * as U from './util.js';
import * as K from './core.js';
import { OrderDrawer } from './orders.js';

const RANGES = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày tới' },
  { id: 'issue', label: 'Có vướng' },
  { id: 'done', label: 'Đã lắp' },
];

export function InstallsView({ ctx }) {
  const { state, me } = ctx;
  const [range, setRange] = useState('week');
  const [mineOnly, setMineOnly] = useState(me.role === 'staff');
  const [order, setOrder] = useState(null);
  const today = U.todayStr();
  const orderIds = new Set(K.visibleOrders(state, me).map((o) => o.id));
  const list = state.installs
    .filter((i) => orderIds.has(i.order_id) && i.status !== 'cancelled')
    .filter((i) => !mineOnly || i.tech_ids.includes(me.id))
    .filter((i) => {
      if (range === 'today') return i.date === today || (i.date < today && i.status === 'scheduled');
      if (range === 'week') return (i.date >= today && i.date <= U.addDays(7)) || (i.date < today && i.status === 'scheduled');
      if (range === 'issue') return i.status === 'issue';
      return i.status === 'done';
    })
    .sort((a, b) => (range === 'done' ? -1 : 1) * (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const byDate = {};
  for (const i of list) (byDate[i.date] ||= []).push(i);
  // Đơn đã chốt, cần lắp mà chưa hẹn lịch
  const waiting = K.visibleOrders(state, me).filter((o) => o.delivery === 'install' && o.status === 'confirmed' && !state.installs.some((i) => i.order_id === o.id && i.status !== 'cancelled'));
  const openO = order && state.orders.find((o) => o.id === order);
  return html`<div class="page">
    <div class="page-head"><div><h1>🛠 Lịch lắp đặt</h1><div class="muted">Mỗi lịch tự hiện trong mục "Hôm nay" của kỹ thuật viên bên VietK Checklist</div></div></div>
    ${waiting.length > 0 && html`<div class="alert warn"><b>${waiting.length} đơn đã chốt chưa hẹn lịch lắp:</b> ${waiting.map((o) => html`<button class="chip" onClick=${() => setOrder(o.id)}>${o.code} · ${K.customerOf(state, o.customer_id)?.name}</button>`)}</div>`}
    <div class="toolbar">
      <div class="chips">${RANGES.map((r) => html`<button class=${'chip ' + (range === r.id ? 'on' : '')} onClick=${() => setRange(r.id)}>${r.label}</button>`)}</div>
      <label class="check small"><input type="checkbox" checked=${mineOnly} onChange=${(e) => setMineOnly(e.target.checked)} /> Chỉ lịch của tôi</label>
    </div>
    ${list.length ? Object.entries(byDate).map(([d, rows]) => html`<section class="section">
      <div class="section-head"><h2>${d === today ? 'Hôm nay · ' : d === U.addDays(1) ? 'Ngày mai · ' : ''}${U.fmtDayLong(d)}</h2><span class="count">${rows.length}</span></div>
      <div class="stack">${rows.map((i) => html`<${InstallCard} key=${i.id} ctx=${ctx} inst=${i} showOrder onOpenOrder=${() => setOrder(i.order_id)} />`)}</div>
    </section>`) : html`<${Empty}>Không có lịch lắp nào.</${Empty}>`}
    ${openO && html`<${OrderDrawer} ctx=${ctx} o=${openO} onClose=${() => setOrder(null)} />`}
  </div>`;
}

export function InstallCard({ ctx, inst, showOrder, onOpenOrder }) {
  const { state, me } = ctx;
  const [edit, setEdit] = useState(false);
  const [issue, setIssue] = useState(false);
  const [issueText, setIssueText] = useState(inst.issue || '');
  const o = state.orders.find((x) => x.id === inst.order_id);
  const c = o && K.customerOf(state, o.customer_id);
  const st = K.INSTALL_STATUS[inst.status];
  const steps = inst.checklist || {};
  const doneSteps = K.INSTALL_STEPS.filter(([k]) => steps[k]).length;
  const canAct = me.role !== 'staff' || inst.tech_ids.includes(me.id) || o?.owner_id === me.id;
  const due = o ? o.total - K.paidOf(state, o.id) : 0;
  const save = (patch, msg) => {
    actions.saveInstall({ ...inst, ...patch });
    if (msg) ctx.notify(msg);
  };
  if (edit) return html`<${InstallForm} ctx=${ctx} order=${o} inst=${inst} onDone=${() => setEdit(false)} />`;
  return html`<div class=${'card pad install ' + inst.status}>
    <div class="row between">
      <div><b>${inst.time || '—'}</b> · ${showOrder ? html`<button class="link-plain" onClick=${onOpenOrder}><b>${o?.code}</b></button>` : html`<b>${U.fmtDayLong(inst.date)}</b>`} <${Badge} cls=${st.cls}>${st.label}</${Badge}></div>
      <span class="small muted">👷 ${inst.tech_ids.map((t) => K.personName(state, t)).join(', ') || 'Chưa phân'}</span>
    </div>
    ${showOrder && c && html`<div class="small"><b>${c.name}</b>${c.phone ? html` · <a href=${K.telHref(c.phone)}>📞 ${c.phone}</a>` : ''}<br />📍 ${o.address || c.address || '—'}${o.address || c.address ? html` · <a href=${'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address || c.address)} target="_blank" rel="noopener">Chỉ đường</a>` : ''}</div>`}
    ${o && html`<div class="small muted">📦 ${K.itemsOf(state, o.id).map((i) => `${i.name} x${i.qty}`).join(', ')}${due > 0 && o.status !== 'quote' ? html` · <span class="warn-t">Thu thêm ${K.money(due)}</span>` : ''}</div>`}
    ${inst.note && html`<div class="small">📝 ${inst.note}</div>`}
    ${inst.status === 'issue' && html`<div class="alert bad small">🚧 ${inst.issue || 'Có vướng'}</div>`}
    <div class="steps">
      ${K.INSTALL_STEPS.map(([k, l]) => html`<label class=${'step ' + (steps[k] ? 'on' : '')}><input type="checkbox" disabled=${!canAct || inst.status === 'cancelled'} checked=${!!steps[k]} onChange=${(e) => save({ checklist: { ...steps, [k]: e.target.checked } })} /> ${l}</label>`)}
    </div>
    ${canAct && html`<div class="row between">
      <div class="row">
        ${inst.status !== 'done' && html`<button class="btn sm ok" onClick=${() => save({ status: 'done', checklist: Object.fromEntries(K.INSTALL_STEPS.map(([k]) => [k, true])) }, 'Đã lắp xong ✅')}>✅ Đã lắp xong</button>`}
        ${inst.status === 'scheduled' && html`<button class="btn sm" onClick=${() => setIssue(!issue)}>🚧 Báo vướng</button>`}
        ${inst.status !== 'scheduled' && html`<button class="btn sm" onClick=${() => save({ status: 'scheduled' })}>↩ Về "Đã hẹn"</button>`}
      </div>
      <div class="row"><span class="small muted">${doneSteps}/${K.INSTALL_STEPS.length} bước</span><button class="link" onClick=${() => setEdit(true)}>Đổi lịch / người</button></div>
    </div>`}
    ${issue && html`<div class="row"><input class="grow" placeholder="Vướng gì? (thiếu hàng, khách hẹn lại…)" value=${issueText} onInput=${(e) => setIssueText(e.target.value)} />
      <button class="btn sm primary" onClick=${() => { save({ status: 'issue', issue: issueText || 'Có vướng' }, 'Đã báo vướng'); setIssue(false); }}>Gửi</button></div>`}
  </div>`;
}

export function InstallForm({ ctx, order, inst, onDone }) {
  const { state, me } = ctx;
  const c = K.customerOf(state, order.customer_id);
  const [f, setF] = useState(inst ? { ...inst } : { date: U.addDays(1), time: '09:00', tech_ids: [], note: '' });
  const [open, setOpen] = useState(!!inst);
  const list = K.techs(state);
  const busy = (pid) => state.installs.filter((i) => i.id !== inst?.id && i.date === f.date && i.status !== 'cancelled' && i.tech_ids.includes(pid)).length;
  const toggle = (id) => setF({ ...f, tech_ids: f.tech_ids.includes(id) ? f.tech_ids.filter((x) => x !== id) : [...f.tech_ids, id] });
  async function save(e) {
    e.preventDefault();
    if (!f.date) return;
    await actions.saveInstall({ ...f, order_id: order.id });
    if (!inst) actions.addActivity(order.customer_id, 'install', `Hẹn lắp đặt ${order.code}: ${U.fmtDayLong(f.date)} ${f.time || ''} — ${f.tech_ids.map((t) => K.personName(state, t)).join(', ') || 'chưa phân người'}`);
    ctx.notify(inst ? 'Đã đổi lịch' : 'Đã hẹn lịch lắp' + (f.tech_ids.length ? ' — kỹ thuật viên sẽ thấy trong Checklist' : ''));
    if (onDone) onDone();
    else {
      setOpen(false);
      setF({ date: U.addDays(1), time: '09:00', tech_ids: [], note: '' });
    }
  }
  if (!open) return html`<button class="btn primary" onClick=${() => setOpen(true)}>+ Hẹn lịch lắp đặt</button>`;
  return html`<form class="card pad form" onSubmit=${save}>
    <b>${inst ? 'Đổi lịch / người lắp' : 'Hẹn lịch lắp đặt'} — ${c?.name}</b>
    <div class="grid2">
      <label>Ngày<input type="date" value=${f.date} onInput=${(e) => setF({ ...f, date: e.target.value })} /></label>
      <label>Giờ<input type="time" value=${f.time || ''} onInput=${(e) => setF({ ...f, time: e.target.value })} /></label>
    </div>
    <div><div class="small muted">Kỹ thuật viên</div>
      <div class="chips">${list.map((p) => html`<button type="button" class=${'chip ' + (f.tech_ids.includes(p.id) ? 'on' : '')} onClick=${() => toggle(p.id)}>${p.full_name}${busy(p.id) ? html` <small>(${busy(p.id)} lịch)</small>` : ''}</button>`)}</div></div>
    <label>Ghi chú cho kỹ thuật<input value=${f.note || ''} onInput=${(e) => setF({ ...f, note: e.target.value })} placeholder="Gọi khách trước 30 phút, nhà ngõ nhỏ…" /></label>
    <div class="row between">
      ${inst && me.role !== 'staff' ? html`<${ConfirmButton} label="Huỷ lịch" ask="Huỷ lịch lắp? Bấm lần nữa" onConfirm=${() => { actions.saveInstall({ ...inst, status: 'cancelled' }); onDone && onDone(); }} />` : html`<span></span>`}
      <div class="row"><button type="button" class="btn" onClick=${() => (onDone ? onDone() : setOpen(false))}>Huỷ</button><button class="btn primary">Lưu lịch</button></div>
    </div>
  </form>`;
}
