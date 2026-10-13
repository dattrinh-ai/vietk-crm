// Sản phẩm & combo. Mọi người xem giá bán; Quản trị sửa, và chỉ Quản trị thấy giá vốn / lãi.
import { html, Modal, Badge, Empty, Seg } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import * as K from './core.js';

export function ProductsView({ ctx }) {
  const { state, me } = ctx;
  const isAdmin = me.role === 'admin';
  const [tab, setTab] = useState('combos');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editP, setEditP] = useState(null);
  const [editC, setEditC] = useState(null);
  const [hidden, setHidden] = useState(false);
  const products = state.products.filter((p) => (hidden || p.active !== false) && (!cat || p.category === cat) && K.matches(q, p.name, p.sku, p.brand));
  const combos = state.combos.filter((c) => (hidden || c.active !== false) && K.matches(q, c.name, c.note));
  const comboCost = (c) => c.items.reduce((a, x) => a + (+state.costs[x.product_id] ?? NaN) * x.qty, 0);
  const comboList = (c) => c.items.reduce((a, x) => a + (+state.products.find((p) => p.id === x.product_id)?.price || 0) * x.qty, 0);
  return html`<div class="page">
    <div class="page-head"><div><h1>📦 Sản phẩm & combo</h1><div class="muted">${state.products.length} sản phẩm · ${state.combos.length} combo${isAdmin ? ' · 🔒 giá vốn chỉ Quản trị thấy' : ''}</div></div>
      ${isAdmin && html`<div class="row"><button class="btn" onClick=${() => setEditP({})}>+ Sản phẩm</button><button class="btn primary" onClick=${() => setEditC({})}>+ Combo</button></div>`}</div>
    <div class="toolbar">
      <${Seg} value=${tab} onChange=${setTab} options=${[{ id: 'combos', label: '📦 Combo' }, { id: 'products', label: '🔊 Sản phẩm' }]} />
      <input class="search" type="search" placeholder="Tìm tên, mã…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${tab === 'products' && html`<select value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="">Mọi loại</option>${K.CATEGORIES.map((c) => html`<option>${c}</option>`)}</select>`}
      ${isAdmin && html`<label class="check small"><input type="checkbox" checked=${hidden} onChange=${(e) => setHidden(e.target.checked)} /> Hiện cả hàng ngừng bán</label>`}
    </div>
    ${tab === 'products' && (products.length ? html`<div class="table-wrap"><table class=${'table' + (isAdmin ? ' clickable' : '')}>
      <thead><tr><th>Mã</th><th>Sản phẩm</th><th>Loại</th><th class="num">Giá lẻ</th><th class="num">Giá đại lý</th>${isAdmin && html`<th class="num">🔒 Giá vốn</th><th class="num">🔒 Lãi lẻ</th>`}<th>BH</th></tr></thead>
      <tbody>${products.map((p) => {
        const cost = state.costs[p.id];
        return html`<tr key=${p.id} class=${p.active === false ? 'inactive' : ''} onClick=${() => isAdmin && setEditP(p)}>
          <td class="small nowrap">${p.sku || '—'}</td><td><b>${p.name}</b>${p.active === false && html` <span class="tag">Ngừng bán</span>`}</td><td class="small">${p.category}</td>
          <td class="num nowrap">${K.money(p.price)}</td><td class="num nowrap">${K.money(p.dealer_price)}</td>
          ${isAdmin && html`<td class="num nowrap">${cost != null ? K.money(cost) : html`<span class="warn-t">chưa nhập</span>`}</td><td class="num nowrap">${cost != null && p.price ? Math.round(((p.price - cost) / p.price) * 100) + '%' : '—'}</td>`}
          <td class="small nowrap">${p.warranty_months ? p.warranty_months + ' th' : '—'}${p.track_serial ? ' · serial' : ''}</td>
        </tr>`;
      })}</tbody></table></div>` : html`<${Empty}>Chưa có sản phẩm.</${Empty}>`)}
    ${tab === 'combos' && (combos.length ? html`<div class="pgrid">${combos.map((c) => {
      const cost = comboCost(c);
      const list = comboList(c);
      return html`<div class=${'card pad combo' + (isAdmin ? ' click' : '') + (c.active === false ? ' inactive' : '')} key=${c.id} onClick=${() => isAdmin && setEditC(c)}>
        <div class="row between"><b>${c.name}</b><b class="brand-t">${K.money(c.price)}</b></div>
        <ul class="small">${c.items.map((x) => html`<li>${state.products.find((p) => p.id === x.product_id)?.name || '?'} × ${x.qty}</li>`)}</ul>
        ${list > c.price && html`<div class="small ok-t">Tiết kiệm ${K.money(list - c.price)} so với mua lẻ</div>`}
        ${isAdmin && isFinite(cost) && html`<div class="small muted">🔒 Vốn ${K.money(cost)} · lãi ${K.money(c.price - cost)} (${c.price ? Math.round(((c.price - cost) / c.price) * 100) : 0}%)</div>`}
        ${c.note && html`<div class="small muted">${c.note}</div>`}
      </div>`;
    })}</div>` : html`<${Empty}>Chưa có combo.</${Empty}>`)}
    ${editP && html`<${ProductForm} ctx=${ctx} p=${editP} onClose=${() => setEditP(null)} />`}
    ${editC && html`<${ComboForm} ctx=${ctx} c=${editC} onClose=${() => setEditC(null)} />`}
  </div>`;
}

function ProductForm({ ctx, p, onClose }) {
  const [f, setF] = useState({ sku: '', name: '', category: 'Loa', brand: 'BBS', unit: 'cái', price: '', dealer_price: '', warranty_months: 12, track_serial: true, active: true, note: '', ...p });
  const [cost, setCost] = useState(ctx.state.costs[p.id] ?? '');
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Nhập tên sản phẩm');
    actions.saveProduct({ ...f, name: f.name.trim(), sku: f.sku?.trim() || null, price: K.parseMoney(f.price), dealer_price: f.dealer_price === '' || f.dealer_price == null ? null : K.parseMoney(f.dealer_price), warranty_months: +f.warranty_months || 0 },
      cost === '' ? null : K.parseMoney(cost));
    ctx.notify('Đã lưu sản phẩm');
    onClose();
  }
  return html`<${Modal} title=${p.id ? 'Sửa sản phẩm' : 'Sản phẩm mới'} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <div class="grid2"><label>Mã (SKU)<input value=${f.sku || ''} onInput=${set('sku')} placeholder="ICON-9" /></label>
        <label>Loại<select value=${f.category} onChange=${set('category')}>${K.CATEGORIES.map((c) => html`<option>${c}</option>`)}</select></label></div>
      <label>Tên *<input value=${f.name} onInput=${set('name')} placeholder="Loa BBS iCON-9 (đôi)" /></label>
      <div class="grid2"><label>Thương hiệu<input value=${f.brand || ''} onInput=${set('brand')} /></label><label>Đơn vị<input value=${f.unit} onInput=${set('unit')} placeholder="cái / đôi / bộ" /></label></div>
      <div class="grid2"><label>Giá bán lẻ<input value=${f.price} onInput=${set('price')} placeholder="11,9tr" /></label><label>Giá đại lý<input value=${f.dealer_price ?? ''} onInput=${set('dealer_price')} /></label></div>
      <label class="admin-only">🔒 Giá vốn (chỉ Quản trị thấy)<input value=${cost} onInput=${(e) => setCost(e.target.value)} placeholder="7,4tr" /></label>
      <div class="grid2"><label>Bảo hành (tháng)<input type="number" min="0" value=${f.warranty_months} onInput=${set('warranty_months')} /></label>
        <label class="check"><input type="checkbox" checked=${f.track_serial} onChange=${(e) => setF({ ...f, track_serial: e.target.checked })} /> Quản lý theo serial</label></div>
      <label>Ghi chú<input value=${f.note || ''} onInput=${set('note')} /></label>
      <label class="check"><input type="checkbox" checked=${f.active === false} onChange=${(e) => setF({ ...f, active: !e.target.checked })} /> Ngừng bán (ẩn khỏi báo giá)</label>
      ${err && html`<div class="err">${err}</div>`}
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
    </form>
  </${Modal}>`;
}

function ComboForm({ ctx, c, onClose }) {
  const { state } = ctx;
  const [f, setF] = useState({ name: '', price: '', items: [], active: true, note: '', ...c });
  const [q, setQ] = useState('');
  const found = q.trim() ? state.products.filter((p) => p.active !== false && K.matches(q, p.name, p.sku)).slice(0, 8) : [];
  const list = f.items.reduce((a, x) => a + (+state.products.find((p) => p.id === x.product_id)?.price || 0) * x.qty, 0);
  function save(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.items.length) return;
    actions.saveCombo({ ...f, name: f.name.trim(), price: K.parseMoney(f.price) || list });
    ctx.notify('Đã lưu combo');
    onClose();
  }
  return html`<${Modal} title=${c.id ? 'Sửa combo' : 'Combo mới'} onClose=${onClose} wide>
    <form class="form" onSubmit=${save}>
      <div class="grid2"><label>Tên combo *<input value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} placeholder="Combo BBS8 Pro Full Option" /></label>
        <label>Giá combo<input value=${f.price} onInput=${(e) => setF({ ...f, price: e.target.value })} placeholder=${'Mua lẻ: ' + K.moneyShort(list)} /></label></div>
      <input type="search" placeholder="🔎 Thêm sản phẩm vào combo…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${found.length > 0 && html`<div class="pick-list">${found.map((p) => html`<button type="button" class="pick" onClick=${() => { setF({ ...f, items: [...f.items.filter((x) => x.product_id !== p.id), { product_id: p.id, qty: (f.items.find((x) => x.product_id === p.id)?.qty || 0) + 1 }] }); setQ(''); }}><b>${p.name}</b> <span class="muted small">${K.money(p.price)}</span></button>`)}</div>`}
      ${f.items.map((x, k) => html`<div class="row between" key=${x.product_id}><span>${state.products.find((p) => p.id === x.product_id)?.name}</span>
        <span class="row"><input class="cell num w-num" type="number" min="1" value=${x.qty} onInput=${(e) => setF({ ...f, items: f.items.map((y, j) => (j === k ? { ...y, qty: +e.target.value || 1 } : y)) })} />
        <button type="button" class="x" onClick=${() => setF({ ...f, items: f.items.filter((_, j) => j !== k) })}>×</button></span></div>`)}
      <div class="small muted">Tổng giá mua lẻ: ${K.money(list)}</div>
      <label>Mô tả ngắn<input value=${f.note || ''} onInput=${(e) => setF({ ...f, note: e.target.value })} /></label>
      <label class="check"><input type="checkbox" checked=${f.active === false} onChange=${(e) => setF({ ...f, active: !e.target.checked })} /> Ngừng bán</label>
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary" disabled=${!f.name.trim() || !f.items.length}>Lưu</button></div>
    </form>
  </${Modal}>`;
}
