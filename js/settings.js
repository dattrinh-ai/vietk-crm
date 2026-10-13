// Cài đặt CRM (chỉ Quản trị): thành viên & quyền, quy tắc chăm sóc, danh mục, mẫu tin nhắn,
// thông tin in báo giá, ghi chú chính sách phân phối, nhập / xuất Excel.
import { html, Badge, ConfirmButton } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions, LIVE } from './store.js';
import * as U from './util.js';
import * as K from './core.js';
import * as X from './excel.js';

const LISTS = [['sources', 'Nguồn khách'], ['regions', 'Khu vực'], ['lost_reasons', 'Lý do không mua'], ['categories', 'Nhóm sản phẩm']];
const genPassword = () => {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'Vk-' + [...crypto.getRandomValues(new Uint32Array(10))].map((x) => c[x % c.length]).join('');
};

export function SettingsView({ ctx }) {
  const { state } = ctx;
  const [s, setS] = useState(state.settings);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  function save() {
    const n = (v, d) => Math.max(1, parseInt(v, 10) || d);
    actions.saveSettings({ ...s, stale_days: n(s.stale_days, 7), quote_valid_days: n(s.quote_valid_days, 7), follow_default_days: n(s.follow_default_days, 1) });
    ctx.notify('Đã lưu cài đặt');
  }
  return html`<div class="page mid settings">
    <div class="page-head"><div><h1>⚙️ Cài đặt CRM</h1><div class="muted">Chỉ Quản trị thấy trang này</div></div></div>
    <${Members} ctx=${ctx} />

    <section class="section card-sec">
      <h2>Quy tắc chăm sóc & báo giá</h2>
      <label class="inline">Cảnh báo <b>"lâu chưa chăm sóc"</b> khi khách đang theo không có ghi chép sau
        <input type="number" min="1" class="short" value=${s.stale_days} onInput=${set('stale_days')} /> ngày</label>
      <label class="inline">Báo giá mới có hiệu lực <input type="number" min="1" class="short" value=${s.quote_valid_days} onInput=${set('quote_valid_days')} /> ngày</label>
      <label class="inline">Khách mới tự hẹn gọi lại sau <input type="number" min="0" class="short" value=${s.follow_default_days} onInput=${set('follow_default_days')} /> ngày</label>
    </section>

    <section class="section card-sec">
      <h2>Danh mục lựa chọn</h2>
      <p class="muted small">Mỗi dòng một giá trị. Dùng cho ô chọn khi thêm khách / sản phẩm.</p>
      <div class="grid-rep">${LISTS.map(([k, l]) => html`<label>${l}<textarea rows="7" value=${(s[k] || []).join('\n')} onInput=${(e) => setS({ ...s, [k]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}></textarea></label>`)}</div>
    </section>

    <section class="section card-sec">
      <h2>Mẫu tin nhắn Zalo</h2>
      <p class="muted small">Tự copy khi bấm "💬 Zalo" trong hồ sơ khách. Biến dùng được: <code>{ten}</code> <code>{nhu_cau}</code> <code>{nhan_vien}</code> <code>{hotline}</code></p>
      <textarea rows="3" value=${s.zalo_template} onInput=${set('zalo_template')}></textarea>
    </section>

    <section class="section card-sec">
      <h2>Thông tin in trên báo giá</h2>
      <div class="grid2">
        <label>Tên công ty<input value=${s.company_name} onInput=${set('company_name')} /></label>
        <label>Hotline<input value=${s.company_phone} onInput=${set('company_phone')} /></label>
      </div>
      <label>Địa chỉ<input value=${s.company_address} onInput=${set('company_address')} /></label>
      <label>Tài khoản ngân hàng (in cuối báo giá)<textarea rows="2" value=${s.bank_info} onInput=${set('bank_info')} placeholder="Ngân hàng … · STK … · Chủ TK …"></textarea></label>
      <label>Ghi chú cuối báo giá<textarea rows="2" value=${s.quote_note} onInput=${set('quote_note')}></textarea></label>
    </section>

    <section class="section card-sec">
      <h2>Chính sách phân phối — ghi chú</h2>
      <p class="muted small">Hiện cho nhân viên ở tab Sản phẩm. Mỗi dòng một ý. Tự điền khi nhập file chính sách phân phối.</p>
      <textarea rows="8" value=${(s.policy_notes || []).join('\n')} onInput=${(e) => setS({ ...s, policy_notes: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}></textarea>
    </section>
    <div class="row end sticky-save"><button class="btn primary" onClick=${save}>Lưu cài đặt</button></div>

    <${ImportProducts} ctx=${ctx} onNotes=${(notes) => setS((x) => ({ ...x, policy_notes: notes }))} />
    <${ImportCustomers} ctx=${ctx} />
    <${ExportData} ctx=${ctx} />
  </div>`;
}

// ---------------------------------------------------------------------------
function Members({ ctx }) {
  const { state, me } = ctx;
  const [pw, setPw] = useState(null);
  const [adding, setAdding] = useState(false);
  const people = state.people.slice().sort((a, b) => (a.active === false) - (b.active === false) || (a.crm_access === false) - (b.crm_access === false));
  function upd(p, patch) {
    if (p.id === me.id && (patch.role || patch.active === false || patch.crm_access === false)) return ctx.notify('Không thể tự hạ quyền / khoá chính mình', 'err');
    actions.updateMember(p.id, patch);
    ctx.notify('Đã cập nhật ' + p.full_name);
  }
  async function reset(p) {
    const password = genPassword();
    try {
      await actions.resetPassword(p.id, password);
      setPw({ name: p.full_name, email: p.email, password });
    } catch (e) {
      ctx.notify(e.message, 'err');
    }
  }
  return html`<section class="section card-sec">
    <h2>Thành viên & quyền CRM</h2>
    <p class="muted small">Dùng chung tài khoản với VietK Checklist. <b>Giám đốc / Quản trị</b>: toàn quyền, thấy giá vốn & lãi. <b>Quản lý nhóm</b>: thấy khách của nhóm. <b>Nhân viên</b>: khách của mình + khách chưa ai nhận.
      Bỏ tick <b>Dùng CRM</b> → người đó chỉ dùng Checklist. Giờ làm, loại nhân sự, routine… chỉnh trong Checklist → Cài đặt → Nhân sự.</p>
    <div class="table-wrap"><table class="table compact">
      <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Phòng ban</th><th>Dùng CRM</th><th>Hoạt động</th><th></th></tr></thead>
      <tbody>${people.map((p) => html`<tr key=${p.id} class=${p.active === false || p.crm_access === false ? 'inactive' : ''}>
        <td><b>${p.full_name}</b><div class="muted small">${p.title || ''}${p.emp_type === 'field' ? ' · Kỹ thuật làm ngoài' : ''}</div></td>
        <td class="small">${p.email || '—'}</td>
        <td><select value=${p.role} onChange=${(e) => upd(p, { role: e.target.value })}>${Object.entries(U.ROLES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></td>
        <td class="small">${p.dept ? U.deptName(p.dept) : '—'}</td>
        <td><input type="checkbox" checked=${p.crm_access !== false && p.role !== 'bod'} disabled=${p.role === 'bod'} title=${p.role === 'bod' ? 'Vai trò Chỉ xem không dùng CRM' : ''} onChange=${(e) => upd(p, { crm_access: e.target.checked })} /></td>
        <td><input type="checkbox" checked=${p.active !== false} onChange=${(e) => upd(p, { active: e.target.checked })} /></td>
        <td>${p.id !== me.id && LIVE && html`<${ConfirmButton} cls="link" label="Đặt lại mật khẩu" ask="Tạo mật khẩu tạm mới? Bấm lần nữa" onConfirm=${() => reset(p)} />`}</td>
      </tr>`)}</tbody>
    </table></div>
    ${pw && html`<div class="note">🔑 Mật khẩu tạm mới của <b>${pw.name}</b> (${pw.email}): <code>${pw.password}</code> — gửi riêng cho họ, nhắc đổi sau khi đăng nhập. <button class="link" onClick=${() => setPw(null)}>Ẩn</button></div>`}
    ${adding ? html`<${AddMember} ctx=${ctx} onClose=${() => setAdding(false)} />` : html`<div class="row"><button class="btn primary" onClick=${() => setAdding(true)}>+ Thêm nhân viên</button></div>`}
  </section>`;
}

function AddMember({ ctx, onClose }) {
  const { state } = ctx;
  const [d, setD] = useState({ full_name: '', email: '', role: 'staff', dept: state.depts[0]?.id || '', title: '', emp_type: 'fulltime', password: genPassword() });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await actions.createMember({ ...d, email: d.email.trim(), dept: ['staff', 'manager'].includes(d.role) ? d.dept : null, crm_access: true });
      setDone(d);
      setD({ ...d, full_name: '', email: '', title: '', password: genPassword() });
      ctx.notify('Đã tạo tài khoản');
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  return html`<form class="form card pad" onSubmit=${submit}>
    <div class="grid2">
      <label>Họ tên *<input required value=${d.full_name} onInput=${set('full_name')} placeholder="Nguyễn Văn Minh" /></label>
      <label>Email đăng nhập *<input required type="email" value=${d.email} onInput=${set('email')} /></label>
      <label>Vai trò<select value=${d.role} onChange=${set('role')}>${Object.entries(U.ROLES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      ${['staff', 'manager'].includes(d.role) && html`<label>Phòng ban<select value=${d.dept} onChange=${set('dept')}>${state.depts.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></label>`}
      <label>Chức danh<input value=${d.title} onInput=${set('title')} placeholder="Tư vấn bán hàng" /></label>
      <label>Loại nhân sự<select value=${d.emp_type} onChange=${set('emp_type')}>${Object.entries(U.EMP_TYPES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <label>Mật khẩu tạm *<input required minlength="8" value=${d.password} onInput=${set('password')} /></label>
    </div>
    ${err && html`<div class="err">${err}</div>`}
    <div class="row end"><button type="button" class="btn" onClick=${onClose}>Đóng</button><button class="btn primary" disabled=${busy}>${busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button></div>
    ${done && html`<div class="note">✅ Đã tạo tài khoản cho <b>${done.full_name}</b>. Gửi cho nhân viên:<br />
      Checklist: <code>https://dattrinh-ai.github.io/vietk-checklist/</code> · CRM: <code>https://dattrinh-ai.github.io/vietk-crm/</code><br />
      Email: <code>${done.email}</code> · Mật khẩu tạm: <code>${done.password}</code><br /><small>Nhắc đổi mật khẩu sau lần đăng nhập đầu (menu avatar → Đổi mật khẩu).</small></div>`}
  </form>`;
}

// ---------------------------------------------------------------------------
// Nhập bảng giá / chính sách phân phối
function ImportProducts({ ctx, onNotes }) {
  const { state } = ctx;
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState('');
  const [withNotes, setWithNotes] = useState(true);
  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy('Đang đọc file…');
    try {
      const sheets = await X.readSheet(f);
      const best = sheets.map((s) => ({ s, r: X.parsePolicy(s.rows) })).sort((a, b) => b.r.products.length - a.r.products.length)[0];
      setRes({ file: f.name, sheet: best.s.name, ...best.r });
    } catch (x) {
      ctx.notify('Không đọc được file: ' + x.message, 'err');
    }
    setBusy('');
  }
  const match = (p) => state.products.find((x) => (x.sku && x.sku.toUpperCase() === String(p.sku).toUpperCase()) || x.name.toLowerCase() === p.name.toLowerCase());
  async function run() {
    setBusy('Đang nhập…');
    try {
      const r = await actions.importProducts(res.products.map(({ full_name, ...p }) => ({ ...p, full_name })), { onProgress: (i, n) => setBusy(`Đang nhập ${i}/${n}…`) });
      if (withNotes && res.notes.length) {
        actions.saveSettings({ policy_notes: res.notes });
        onNotes(res.notes);
      }
      const cats = [...new Set(res.products.map((p) => p.category))].filter((c) => !state.settings.categories.includes(c));
      if (cats.length) actions.saveSettings({ categories: [...state.settings.categories, ...cats] });
      ctx.notify(`Đã nhập: ${r.added} sản phẩm mới, cập nhật ${r.updated} sản phẩm`);
      setRes(null);
    } catch (x) {
      ctx.notify(x.message, 'err');
    }
    setBusy('');
  }
  return html`<section class="section card-sec">
    <h2>📥 Nhập bảng giá / chính sách phân phối (Excel)</h2>
    <p class="muted small">Dùng file mẫu <b>"Chính sách phân phối"</b> của VietK (cột: Tên sản phẩm, Giá PP công ty thu về, Giá PP báo trên đơn, Giá demo, Giá bán lẻ, Khuyến mại theo gói, Giá linh hoạt) — hoặc file "Bảng giá" xuất từ CRM.
      Sản phẩm trùng <b>mã</b> hoặc <b>tên</b> sẽ được cập nhật giá; sản phẩm mới được thêm; không xoá sản phẩm nào. Giá vốn không có trong file chính sách → nhập tay ở tab Sản phẩm (hoặc thêm cột "Giá vốn").</p>
    <input type="file" accept=".xlsx,.xls,.csv" onChange=${onFile} disabled=${!!busy} />
    ${busy && html`<div class="muted small">${busy}</div>`}
    ${res && html`<div class="stack">
      <div class="note">File <b>${res.file}</b> (sheet "${res.sheet}"): <b>${res.products.length}</b> sản phẩm —
        <b>${res.products.filter((p) => !match(p)).length}</b> mới, <b>${res.products.filter(match).length}</b> cập nhật; ${res.notes.length} dòng ghi chú chính sách.
        ${res.warnings.length > 0 && html`<div class="err">${res.warnings.join(' · ')}</div>`}</div>
      <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="table compact">
        <thead><tr><th></th><th>Nhóm</th><th>Mã</th><th>Tên</th><th>ĐV</th><th class="num">Thu về</th><th class="num">Báo trên đơn</th><th class="num">Demo</th><th class="num">Bán lẻ</th><th class="num">Linh hoạt</th><th>Khuyến mại theo gói</th></tr></thead>
        <tbody>${res.products.map((p) => {
          const old = match(p);
          const changed = old && ['price', 'dealer_price', 'min_dealer_price', 'flex_price', 'demo_price'].some((k) => (p[k] ?? null) !== (old[k] ?? null));
          return html`<tr><td>${old ? (changed ? html`<${Badge} cls="warn">Đổi giá</${Badge}>` : html`<${Badge}>Giữ</${Badge}>`) : html`<${Badge} cls="ok">Mới</${Badge}>`}</td>
            <td class="small">${p.category}</td><td class="small nowrap">${p.sku}</td><td class="small" title=${p.full_name}>${p.name}</td><td class="small">${p.unit}</td>
            <td class="num small">${K.moneyShort(p.min_dealer_price)}</td><td class="num small">${K.moneyShort(p.dealer_price)}</td><td class="num small">${p.demo_price ? K.moneyShort(p.demo_price) : ''}</td>
            <td class="num small">${K.moneyShort(p.price)}</td><td class="num small">${p.flex_price ? K.moneyShort(p.flex_price) : ''}</td>
            <td class="small">${p.promos.map((x) => html`<div>${K.promoShort(x)}</div>`)}</td></tr>`;
        })}</tbody></table></div>
      ${res.notes.length > 0 && html`<label class="check"><input type="checkbox" checked=${withNotes} onChange=${(e) => setWithNotes(e.target.checked)} /> Cập nhật luôn ${res.notes.length} dòng ghi chú chính sách</label>`}
      <div class="row end"><button class="btn" onClick=${() => setRes(null)}>Huỷ</button><button class="btn primary" disabled=${!!busy || !res.products.length} onClick=${run}>Nhập ${res.products.length} sản phẩm</button></div>
    </div>`}
  </section>`;
}

// Nhập khách hàng
function ImportCustomers({ ctx }) {
  const { state } = ctx;
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState('');
  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy('Đang đọc file…');
    try {
      const sheets = await X.readSheet(f);
      const best = sheets.map((s) => X.parseCustomers(s.rows, state.people)).sort((a, b) => b.customers.length - a.customers.length)[0];
      const phones = new Set(state.customers.map((c) => K.normPhone(c.phone)).filter((p) => p.length >= 9));
      const dup = best.customers.filter((c) => phones.has(K.normPhone(c.phone)));
      setRes({ file: f.name, ...best, dup, skipDup: true });
    } catch (x) {
      ctx.notify('Không đọc được file: ' + x.message, 'err');
    }
    setBusy('');
  }
  async function run() {
    const rows = res.skipDup ? res.customers.filter((c) => !res.dup.includes(c)) : res.customers;
    setBusy('Đang nhập…');
    try {
      const n = await actions.importCustomers(rows, { onProgress: (i, t) => setBusy(`Đang nhập ${i}/${t}…`) });
      ctx.notify(`Đã nhập ${n} khách`);
      setRes(null);
    } catch (x) {
      ctx.notify(x.message, 'err');
    }
    setBusy('');
  }
  const template = () => X.downloadXlsx('mau-nhap-khach-hang-vietk.xlsx', [{ name: 'Khách hàng', widths: [22, 14, 14, 30, 14, 18, 14, 30, 12, 12, 18, 18, 24], rows: [X.CUSTOMER_COLUMNS,
    ['Anh Trung', '0912345678', '', 'Thôn Cự Đà, Thanh Oai', 'Hà Nội', 'Gia đình', 'Fanpage', 'Phòng 25m², hát cuối tuần', 25000000, 'Đang tư vấn', state.people[0]?.full_name || '', U.addDays(1), '']] }]);
  return html`<section class="section card-sec">
    <h2>📥 Nhập khách hàng (Excel)</h2>
    <p class="muted small">Tải <button class="link" onClick=${template}>file mẫu</button>, điền rồi tải lên. Cột "Người phụ trách" ghi đúng họ tên nhân viên như ở trên. Số điện thoại đã có trong CRM sẽ được báo trùng.</p>
    <input type="file" accept=".xlsx,.xls,.csv" onChange=${onFile} disabled=${!!busy} />
    ${busy && html`<div class="muted small">${busy}</div>`}
    ${res && html`<div class="note">File <b>${res.file}</b>: <b>${res.customers.length}</b> khách${res.dup.length ? `, ${res.dup.length} số điện thoại đã có trong CRM` : ''}.
      ${res.warnings.map((w) => html`<div class="err">${w}</div>`)}
      ${res.dup.length > 0 && html`<label class="check"><input type="checkbox" checked=${res.skipDup} onChange=${(e) => setRes({ ...res, skipDup: e.target.checked })} /> Bỏ qua ${res.dup.length} khách trùng SĐT</label>`}
      <div class="row end"><button class="btn" onClick=${() => setRes(null)}>Huỷ</button><button class="btn primary" disabled=${!!busy} onClick=${run}>Nhập</button></div></div>`}
  </section>`;
}

// Xuất Excel
function ExportData({ ctx }) {
  const { state } = ctx;
  const stamp = U.todayStr();
  const name = (id) => K.personName(state, id);
  const exp = {
    products: () => X.downloadXlsx(`vietk-bang-gia-${stamp}.xlsx`, [
      { name: 'Bảng giá', widths: [5, 18, 18, 42, 7, 14, 14, 12, 14, 16, 48, 10, 50, 14], rows: X.productRows(state.products, { withCost: true, costs: state.costs }) },
      { name: 'Combo', widths: [36, 14, 70, 30], rows: [['Combo', 'Giá', 'Gồm', 'Ghi chú'], ...state.combos.map((c) => [c.name, c.price, c.items.map((x) => `${state.products.find((p) => p.id === x.product_id)?.name || '?'} x${x.qty}`).join(' + '), c.note || ''])] },
      { name: 'Chính sách', widths: [100], rows: [['Ghi chú chính sách phân phối'], ...(state.settings.policy_notes || []).map((n) => [n])] },
    ]),
    customers: () => X.downloadXlsx(`vietk-khach-hang-${stamp}.xlsx`, [{ name: 'Khách hàng', widths: [22, 14, 14, 30, 14, 18, 14, 30, 12, 12, 18, 18, 24, 12], rows: [[...X.CUSTOMER_COLUMNS, 'Ngày tạo'],
      ...state.customers.map((c) => [c.name, c.phone, c.phone2, c.address, c.area, K.KINDS[c.kind], K.srcLabel(c.source), c.need, c.budget, K.CUSTOMER_STATUS[c.status]?.label, c.owner_id ? name(c.owner_id) : '', c.next_follow, c.note, (c.created_at || '').slice(0, 10)])] }]),
    orders: () => X.downloadXlsx(`vietk-don-hang-${stamp}.xlsx`, [
      { name: 'Đơn hàng', widths: [16, 12, 22, 14, 14, 14, 14, 14, 14, 18, 30], rows: [['Mã', 'Ngày', 'Khách', 'SĐT', 'Trạng thái', 'Tổng', 'Đã thu', 'Còn lại', 'Giao', 'Phụ trách', 'Địa chỉ'],
        ...state.orders.map((o) => {
          const c = K.customerOf(state, o.customer_id);
          const paid = K.paidOf(state, o.id);
          return [o.code, (o.created_at || '').slice(0, 10), c?.name, c?.phone, K.ORDER_STATUS[o.status]?.label, +o.total, paid, +o.total - paid, K.DELIVERY[o.delivery], name(o.owner_id), o.address];
        })] },
      { name: 'Dòng hàng', widths: [16, 40, 6, 14, 14], rows: [['Mã đơn', 'Hàng', 'SL', 'Đơn giá', 'Thành tiền'], ...state.items.map((i) => [state.orders.find((o) => o.id === i.order_id)?.code, i.name, +i.qty, +i.price, i.qty * i.price])] },
      { name: 'Thanh toán', widths: [16, 12, 14, 14, 30], rows: [['Mã đơn', 'Ngày', 'Số tiền', 'Hình thức', 'Ghi chú'], ...state.payments.map((p) => [state.orders.find((o) => o.id === p.order_id)?.code, p.paid_at, +p.amount, K.PAY_METHODS[p.method], p.note])] },
    ]),
  };
  return html`<section class="section card-sec">
    <h2>📤 Xuất dữ liệu ra Excel</h2>
    <p class="muted small">Để lưu trữ, gửi kế toán, hoặc sửa hàng loạt rồi nhập lại (file bảng giá xuất ra nhập lại được ngay ở mục trên).</p>
    <div class="row">
      <button class="btn" onClick=${exp.products}>⬇ Bảng giá & combo (${state.products.length})</button>
      <button class="btn" onClick=${exp.customers}>⬇ Khách hàng (${state.customers.length})</button>
      <button class="btn" onClick=${exp.orders}>⬇ Đơn hàng & thanh toán (${state.orders.length})</button>
    </div>
  </section>`;
}
