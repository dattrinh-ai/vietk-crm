import { html, render, useState, useEffect, useCallback } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { initStore, subscribe, getState, LIVE, auth, loadLive, setErrorHandler, resetDemo } from './store.js';
import { Avatar, Modal } from './ui.js';
import { DashboardView } from './dashboard.js';
import { CustomersView } from './customers.js';
import { OrdersView } from './orders.js';
import { InstallsView } from './installs.js';
import { ProductsView } from './products.js';
import * as U from './util.js';
import * as K from './core.js';

const followBadge = (s, me) => K.visibleCustomers(s, me).filter((c) => ['overdue', 'today'].includes(K.followState(c)) || (c.status === 'new' && !c.owner_id)).length;
const installBadge = (s, me) => s.installs.filter((i) => i.date === U.todayStr() && i.status === 'scheduled' && (me.role !== 'staff' || i.tech_ids.includes(me.id))).length;
const ITEMS = {
  dashboard: { id: 'dashboard', label: 'Tổng quan', icon: '📊' },
  customers: { id: 'customers', label: 'Khách hàng', icon: '👥', badge: followBadge },
  orders: { id: 'orders', label: 'Đơn hàng', icon: '🧾' },
  installs: { id: 'installs', label: 'Lắp đặt', icon: '🛠', badge: installBadge },
  products: { id: 'products', label: 'Sản phẩm', icon: '📦' },
};
// Menu theo vai trò; kỹ thuật viên mở thẳng lịch lắp đặt
function navFor(me) {
  if (me.role === 'admin' || me.role === 'manager') return ['dashboard', 'customers', 'orders', 'installs', 'products'].map((k) => ITEMS[k]);
  if (me.emp_type === 'field') return ['installs', 'customers', 'orders', 'products'].map((k) => ITEMS[k]);
  return ['customers', 'orders', 'installs', 'products'].map((k) => ITEMS[k]);
}

function App({ meId, onSignOut }) {
  const [state, setState] = useState(getState());
  const [asId, setAsId] = useState(() => {
    if (meId) return meId;
    try {
      return localStorage.getItem('vietk-crm-demo-as') || 'u_admin';
    } catch {
      return 'u_admin';
    }
  });
  const me = state.people.find((p) => p.id === asId) || state.people[0];
  const nav = navFor(me);
  const [view, setView] = useState(() => location.hash.replace(/^#\/?/, '') || nav[0].id);
  const [menu, setMenu] = useState(false);
  const [pw, setPw] = useState(false);
  const [toast, setToast] = useState(null);
  useEffect(() => subscribe(setState), []);
  useEffect(() => {
    const f = () => setView(location.hash.replace(/^#\/?/, '') || nav[0].id);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, [nav]);
  const notify = useCallback((msg, type = 'ok') => setToast({ msg, type, k: Date.now() }), []);
  useEffect(() => setErrorHandler((m) => notify(m, 'err')), []);
  useEffect(() => {
    if (!LIVE) return;
    const tick = () => document.visibilityState === 'visible' && Date.now() - (getState().loadedAt || 0) > 55000 && loadLive().catch(() => {});
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const cur = nav.find((n) => n.id === view) ? view : nav[0].id;
  const go = (id) => {
    location.hash = '#' + id;
    setView(id);
    scrollTo(0, 0);
  };
  function switchUser(id) {
    try {
      localStorage.setItem('vietk-crm-demo-as', id);
    } catch {}
    setAsId(id);
    const p = state.people.find((x) => x.id === id);
    go(navFor(p)[0].id);
  }
  const ctx = { state, me, notify };
  return html`
    ${!LIVE && html`<div class="demobar">
      <b>DEMO</b> Xem với vai trò:
      <select value=${me.id} onChange=${(e) => switchUser(e.target.value)}>
        ${state.people.map((p) => html`<option value=${p.id}>${p.full_name} — ${p.title}</option>`)}
      </select>
      <button class="link" onClick=${() => { resetDemo(); notify('Đã đặt lại dữ liệu mẫu'); }}>Đặt lại dữ liệu mẫu</button>
    </div>`}
    <header class="topbar">
      <div class="brand"><img src="assets/logo-mark.png" alt="" /><div class="wordmark"><b>VietK</b><small>CRM</small></div></div>
      <nav class="tabs">
        ${nav.map((n) => html`<a href=${'#' + n.id} class=${cur === n.id ? 'on' : ''} onClick=${(e) => { e.preventDefault(); go(n.id); }}>
          <span class="ic">${n.icon}</span><span>${n.label}</span>${n.badge && n.badge(state, me) > 0 && html`<i class="nbadge">${n.badge(state, me)}</i>`}</a>`)}
      </nav>
      <div class="usermenu">
        <button class="me" onClick=${() => LIVE && setMenu(!menu)} aria-label="Tài khoản"><${Avatar} p=${me} size=${34} /><div class="hide-sm"><b>${me.full_name}</b><small>${me.title || U.ROLES[me.role]}</small></div></button>
        ${menu && html`<div class="menu" onMouseLeave=${() => setMenu(false)}>
          <div class="menu-head"><b>${me.full_name}</b><small>${me.email || ''}</small></div>
          <button onClick=${() => { setMenu(false); setPw(true); }}>🔑 Đổi mật khẩu</button>
          <button onClick=${() => { setMenu(false); onSignOut(); }}>↪ Đăng xuất</button>
        </div>`}
      </div>
    </header>
    ${pw && html`<${ChangePassword} notify=${notify} onClose=${() => setPw(false)} />`}
    <main class="main">
      ${cur === 'dashboard' && html`<${DashboardView} ctx=${ctx} go=${go} />`}
      ${cur === 'customers' && html`<${CustomersView} ctx=${ctx} key=${me.id} />`}
      ${cur === 'orders' && html`<${OrdersView} ctx=${ctx} key=${me.id} />`}
      ${cur === 'installs' && html`<${InstallsView} ctx=${ctx} key=${me.id} />`}
      ${cur === 'products' && html`<${ProductsView} ctx=${ctx} key=${me.id} />`}
    </main>
    ${toast && html`<div class=${'toast ' + toast.type} key=${toast.k}>${toast.msg}</div>`}
  `;
}

function ChangePassword({ notify, onClose }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    if (a.length < 8) return setErr('Mật khẩu tối thiểu 8 ký tự');
    if (a !== b) return setErr('Hai lần nhập không khớp');
    try {
      await auth.changePassword(a);
      notify('Đã đổi mật khẩu');
      onClose();
    } catch (x) {
      setErr(x.message);
    }
  }
  return html`<${Modal} title="Đổi mật khẩu" onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Mật khẩu mới<input type="password" autocomplete="new-password" value=${a} onInput=${(e) => setA(e.target.value)} /></label>
      <label>Nhập lại<input type="password" autocomplete="new-password" value=${b} onInput=${(e) => setB(e.target.value)} /></label>
      ${err && html`<div class="err">${err}</div>`}
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
    </form>
  </${Modal}>`;
}

function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await auth.signIn(email, pw);
      await onDone();
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  async function forgot() {
    if (!/\S+@\S+/.test(email)) return setErr('Nhập email trước, rồi bấm "Quên mật khẩu"');
    try {
      await auth.resetPassword(email);
      setSent(true);
    } catch (x) {
      setErr(x.message);
    }
  }
  return html`<div class="login">
    <form class="login-card" onSubmit=${submit}>
      <div class="brand center-brand"><img src="assets/logo-mark.png" alt="" /><div class="wordmark"><b>VietK</b><small>CRM</small></div></div>
      <p class="muted">Dùng chung tài khoản với VietK Checklist</p>
      <label>Email<input type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} required /></label>
      <label>Mật khẩu<input type="password" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></label>
      ${err && html`<div class="err">${err}</div>`}
      ${sent && html`<div class="note">Đã gửi email đặt lại mật khẩu — kiểm tra hộp thư.</div>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <button type="button" class="link" onClick=${forgot}>Quên mật khẩu?</button>
    </form>
  </div>`;
}

function Root() {
  const [phase, setPhase] = useState(LIVE ? 'loading' : 'ready');
  const [info, setInfo] = useState(null);
  async function boot() {
    try {
      const st = await loadLive();
      if (!st) return setPhase('login');
      if (st.notMember) {
        setInfo(st);
        return setPhase('notmember');
      }
      setInfo(st);
      setPhase('ready');
    } catch (e) {
      setInfo({ error: e.message });
      setPhase('error');
    }
  }
  useEffect(() => {
    if (!LIVE) return;
    boot();
    return auth.onChange((ev) => {
      if (ev === 'SIGNED_OUT') setPhase('login');
      if (ev === 'PASSWORD_RECOVERY') setPhase('recovery');
    });
  }, []);
  const signOut = async () => {
    await auth.signOut();
    setPhase('login');
  };
  if (phase === 'loading') return html`<div class="splash">Đang tải…</div>`;
  if (phase === 'login') return html`<${Login} onDone=${boot} />`;
  if (phase === 'recovery') return html`<div class="login"><div class="login-card"><h3>Đặt mật khẩu mới</h3><${ChangePassword} notify=${() => {}} onClose=${boot} /></div></div>`;
  if (phase === 'error') return html`<div class="splash">Không tải được dữ liệu: ${info?.error}<br /><button class="btn" onClick=${boot}>Thử lại</button></div>`;
  if (phase === 'notmember')
    return html`<div class="splash">Tài khoản ${info?.email} chưa được cấp quyền dùng VietK CRM.<br />Nhờ Quản trị bật trong VietK Checklist → Cài đặt → Nhân sự.<br /><button class="btn" onClick=${signOut}>Đăng xuất</button></div>`;
  return html`<${App} meId=${LIVE ? info?.meId : null} onSignOut=${signOut} />`;
}

await initStore();
render(html`<${Root} />`, document.getElementById('app'));
