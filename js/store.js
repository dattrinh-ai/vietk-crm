// Kho dữ liệu VietK CRM.
// - js/config.js để trống → DEMO: dữ liệu mẫu lưu trên trình duyệt.
// - Đã điền → THẬT: Supabase dùng chung với VietK Checklist (cùng tài khoản, cùng phân quyền).
// Mọi thao tác cập nhật giao diện ngay rồi ghi lên máy chủ; máy chủ từ chối → báo lỗi + tải lại.
import { makeSeed } from './seed.js';
import { CONFIG } from './config.js';
import { uid, todayStr, setDepts } from './util.js';
import { normPhone, withDefaults } from './core.js';

export const LIVE = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const KEY = 'vietk-crm-demo-v1';
let state;
let sb = null;
let onError = () => {};
const subs = new Set();

function commit() {
  if (!LIVE) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }
  state = { ...state };
  subs.forEach((f) => f(state));
}
export const getState = () => state;
export function subscribe(f) {
  subs.add(f);
  return () => subs.delete(f);
}
export function setErrorHandler(f) {
  onError = f;
}
export function resetDemo() {
  state = makeSeed();
  state.settings = withDefaults(state.settings);
  setDepts(state.depts);
  commit();
}

// ---------------------------------------------------------------------------
const translate = (msg = '') => {
  if (/Invalid login credentials/i.test(msg)) return 'Sai email hoặc mật khẩu';
  if (/row-level security|permission denied/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác này';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Mất kết nối mạng, thử lại sau';
  if (/duplicate key.*sku/i.test(msg)) return 'Mã sản phẩm (SKU) đã tồn tại';
  return msg;
};
const chk = ({ data, error }) => {
  if (error) throw new Error(translate(error.message));
  return data;
};
async function all(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = chk(await q().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k] === '' ? null : o[k]]));
const COLS = {
  customers: ['id', 'name', 'phone', 'phone2', 'address', 'area', 'kind', 'source', 'need', 'budget', 'status', 'owner_id', 'next_follow', 'lost_reason', 'note'],
  orders: ['id', 'customer_id', 'owner_id', 'status', 'delivery', 'address', 'discount', 'discount_pct', 'total', 'quote_valid_until', 'note'],
  items: ['id', 'order_id', 'product_id', 'combo_id', 'name', 'qty', 'price', 'sort'],
  payments: ['id', 'order_id', 'amount', 'method', 'paid_at', 'note'],
  installs: ['id', 'order_id', 'date', 'time', 'tech_ids', 'status', 'checklist', 'note', 'issue'],
  products: ['id', 'sku', 'name', 'full_name', 'category', 'brand', 'unit', 'price', 'dealer_price', 'min_dealer_price', 'demo_price', 'flex_price', 'promos', 'warranty_months', 'track_serial', 'active', 'note', 'sort'],
  combos: ['id', 'name', 'price', 'items', 'active', 'note'],
};
const TABLE = { customers: 'crm_customers', orders: 'crm_orders', items: 'crm_order_items', payments: 'crm_payments', installs: 'crm_installs', products: 'crm_products', combos: 'crm_combos', activities: 'crm_activities' };

export const auth = {
  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  async signIn(email, password) {
    chk(await sb.auth.signInWithPassword({ email: email.trim(), password }));
  },
  async signOut() {
    await sb.auth.signOut();
  },
  async changePassword(password) {
    chk(await sb.auth.updateUser({ password }));
  },
  async resetPassword(email) {
    chk(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname }));
  },
  onChange(cb) {
    const { data } = sb.auth.onAuthStateChange((event) => setTimeout(() => cb(event), 0));
    return () => data.subscription.unsubscribe();
  },
};

export async function initStore() {
  if (!LIVE) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch {}
    state = state || makeSeed();
    state.settings = withDefaults(state.settings);
    setDepts(state.depts);
    commit();
    return;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

export async function loadLive() {
  const s = await auth.session();
  if (!s) return null;
  const meId = s.user.id;
  const members = chk(await sb.from('cl_members').select('id, email, full_name, role, dept, title, active, emp_type, crm_access, created_at').order('created_at'));
  const me = members.find((m) => m.id === meId);
  if (!me || !me.active || !me.crm_access || me.role === 'bod') return { notMember: true, email: s.user.email };
  const [settings, depts, products, costs, combos, customers, activities, orders, items, payments, installs] = await Promise.all([
    sb.from('crm_settings').select('data').eq('id', 1).maybeSingle().then(chk).catch(() => null),
    all(() => sb.from('cl_depts').select('*').order('sort')),
    all(() => sb.from('crm_products').select('*').order('sort').order('name')),
    me.role === 'admin' ? all(() => sb.from('crm_product_costs').select('*')) : Promise.resolve([]),
    all(() => sb.from('crm_combos').select('*').order('name')),
    all(() => sb.from('crm_customers').select('*').order('created_at', { ascending: false })),
    all(() => sb.from('crm_activities').select('*').order('at', { ascending: false })),
    all(() => sb.from('crm_orders').select('*').order('created_at', { ascending: false })),
    all(() => sb.from('crm_order_items').select('*')),
    all(() => sb.from('crm_payments').select('*')),
    all(() => sb.from('crm_installs').select('*').order('date')),
  ]);
  setDepts(depts);
  state = {
    live: true,
    meId,
    settings: withDefaults(settings?.data),
    people: members,
    depts,
    products,
    costs: Object.fromEntries(costs.map((c) => [c.product_id, +c.cost])),
    combos,
    customers,
    activities,
    orders,
    items,
    payments,
    installs,
    loadedAt: Date.now(),
  };
  commit();
  return state;
}

function persist(fn) {
  if (!LIVE) return Promise.resolve();
  return (async () => {
    try {
      return await fn();
    } catch (e) {
      onError(translate(e.message));
      await loadLive().catch(() => {});
    }
  })();
}
const run = async (q) => chk(await q);
const now = () => new Date().toISOString();
const find = (coll, id) => state[coll].find((x) => x.id === id);

// Thêm mới hoặc sửa 1 dòng (giao diện cập nhật ngay, máy chủ trả về bản chuẩn)
function upsert(coll, row) {
  const exists = !!find(coll, row.id);
  const next = exists ? { ...find(coll, row.id), ...row } : { created_at: now(), ...row };
  state[coll] = exists ? state[coll].map((x) => (x.id === row.id ? next : x)) : [next, ...state[coll]];
  commit();
  const p = persist(async () => {
    const q = exists ? sb.from(TABLE[coll]).update(pick(row, COLS[coll])).eq('id', row.id) : sb.from(TABLE[coll]).insert(pick(next, COLS[coll]));
    const saved = await run(q.select().single());
    state[coll] = state[coll].map((x) => (x.id === row.id ? saved : x));
    commit();
    return saved;
  });
  return { row: next, saved: p };
}
function remove(coll, id) {
  state[coll] = state[coll].filter((x) => x.id !== id);
  commit();
  return persist(() => run(sb.from(TABLE[coll]).delete().eq('id', id)));
}

// Bản demo: mô phỏng việc máy chủ tự làm (mã đơn, đổi trạng thái đơn theo lịch lắp)
function demoCode() {
  const d = todayStr().slice(2).replace(/-/g, '');
  const n = state.orders.filter((o) => (o.code || '').startsWith('DH' + d)).length + 1;
  return `DH${d}-${String(n).padStart(2, '0')}`;
}
function demoInstallEffects(inst) {
  const o = find('orders', inst.order_id);
  if (!o) return;
  if (inst.status === 'done' && ['confirmed', 'scheduled'].includes(o.status)) o.status = 'installed';
  else if (inst.status === 'scheduled' && o.status === 'confirmed') o.status = 'scheduled';
  state.orders = state.orders.map((x) => (x.id === o.id ? { ...o } : x));
}

export const actions = {
  // ----- Khách hàng -----
  saveCustomer(c) {
    const row = { ...c, id: c.id || uid(), updated_at: now() };
    if (!c.id) row.created_by = state.meId;
    return upsert('customers', row).row;
  },
  deleteCustomer(id) {
    for (const o of state.orders.filter((x) => x.customer_id === id)) actions._dropOrderLocal(o.id);
    state.activities = state.activities.filter((a) => a.customer_id !== id);
    return remove('customers', id);
  },
  addActivity(customer_id, kind, text) {
    const row = { id: uid(), customer_id, kind, text, by_id: state.meId, at: now() };
    state.activities = [row, ...state.activities];
    commit();
    persist(async () => {
      const saved = await run(sb.from('crm_activities').insert(pick(row, ['id', 'customer_id', 'kind', 'text'])).select().single());
      state.activities = state.activities.map((x) => (x.id === row.id ? saved : x));
      commit();
    });
  },
  deleteActivity(id) {
    return remove('activities', id);
  },
  // Tra trùng SĐT trên toàn công ty
  async phoneOwner(phone) {
    if (normPhone(phone).length < 9) return [];
    if (!LIVE)
      return state.customers.filter((c) => normPhone(c.phone) === normPhone(phone)).map((c) => ({ customer_name: c.name, owner_name: state.people.find((p) => p.id === c.owner_id)?.full_name || null, status: c.status }));
    return chk(await sb.rpc('crm_phone_owner', { p_phone: phone }));
  },

  // ----- Báo giá / đơn hàng -----
  // items: [{product_id|combo_id, name, qty, price}] — thay toàn bộ dòng hàng của đơn
  async saveOrder(order, items) {
    const isNew = !order.id || !find('orders', order.id);
    const id = order.id || uid();
    const total = Math.max(0, items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0) - (+order.discount || 0));
    const row = { ...order, id, total, updated_at: now() };
    if (isNew) {
      row.code = LIVE ? '…' : demoCode();
      row.owner_id = row.owner_id || state.meId;
    }
    const newItems = items.map((i, k) => ({ ...i, id: i.id && !String(i.id).startsWith('tmp') ? i.id : uid(), order_id: id, sort: k }));
    const oldIds = state.items.filter((i) => i.order_id === id).map((i) => i.id);
    state.items = [...state.items.filter((i) => i.order_id !== id), ...newItems];
    const { saved } = upsert('orders', row);
    await persist(async () => {
      await saved;
      if (oldIds.length) await run(sb.from('crm_order_items').delete().in('id', oldIds));
      if (newItems.length) await run(sb.from('crm_order_items').insert(newItems.map((i) => pick(i, COLS.items))));
    });
    return find('orders', id);
  },
  setOrder(id, patch) {
    return upsert('orders', { id, ...patch }).row;
  },
  _dropOrderLocal(id) {
    state.items = state.items.filter((i) => i.order_id !== id);
    state.payments = state.payments.filter((i) => i.order_id !== id);
    state.installs = state.installs.filter((i) => i.order_id !== id);
  },
  deleteOrder(id) {
    actions._dropOrderLocal(id);
    return remove('orders', id);
  },
  addPayment(p) {
    return upsert('payments', { id: uid(), paid_at: todayStr(), method: 'transfer', ...p }).row;
  },
  deletePayment(id) {
    return remove('payments', id);
  },

  // ----- Lịch lắp đặt (máy chủ tự tạo việc cho kỹ thuật viên bên Checklist) -----
  async saveInstall(inst) {
    const row = { status: 'scheduled', checklist: {}, ...inst, id: inst.id || uid() };
    if (!LIVE) demoInstallEffects(row);
    const { saved } = upsert('installs', row);
    await saved;
    // đơn có thể đã đổi trạng thái phía máy chủ
    await persist(async () => {
      const o = await run(sb.from('crm_orders').select('*').eq('id', row.order_id).single());
      state.orders = state.orders.map((x) => (x.id === o.id ? o : x));
      commit();
    });
    return find('installs', row.id);
  },
  deleteInstall(id) {
    return remove('installs', id);
  },

  // ----- Sản phẩm & combo (Quản trị) -----
  saveProduct(p, cost) {
    const { row, saved } = upsert('products', { ...p, id: p.id || uid() });
    if (cost != null && cost !== '') {
      state.costs = { ...state.costs, [row.id]: +cost };
      commit();
      persist(async () => {
        await saved; // giá vốn cần sản phẩm đã có trên máy chủ
        await run(sb.from('crm_product_costs').upsert({ product_id: row.id, cost: +cost, updated_at: now() }));
      });
    }
    return row;
  },
  saveCombo(c) {
    return upsert('combos', { ...c, id: c.id || uid() }).row;
  },
  async reload() {
    return LIVE ? loadLive() : state;
  },

  // ----- Cài đặt (Quản trị) -----
  saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    commit();
    return persist(() => run(sb.from('crm_settings').update({ data: state.settings, updated_at: now() }).eq('id', 1)));
  },
  updateMember(id, patch) {
    state.people = state.people.map((p) => (p.id === id ? { ...p, ...patch } : p));
    commit();
    return persist(() => run(sb.from('cl_members').update(patch).eq('id', id)));
  },
  async createMember(p) {
    if (!LIVE) {
      const row = { id: uid(), active: true, crm_access: true, ...p };
      delete row.password;
      state.people = [...state.people, row];
      commit();
      return row;
    }
    const { data, error } = await sb.functions.invoke('cl-admin-users', { body: { action: 'create', ...p } });
    if (error) {
      let msg = error.message;
      try {
        msg = (await error.context.json()).error || msg;
      } catch {}
      throw new Error(translate(msg));
    }
    await loadLive();
    return data;
  },
  async resetPassword(userId, password) {
    if (!LIVE) return { ok: true };
    const { error } = await sb.functions.invoke('cl-admin-users', { body: { action: 'reset_password', user_id: userId, password } });
    if (error) {
      let msg = error.message;
      try {
        msg = (await error.context.json()).error || msg;
      } catch {}
      throw new Error(translate(msg));
    }
    return { ok: true };
  },
  // Nhập bảng giá: khớp theo mã (SKU) hoặc tên → sửa sản phẩm có sẵn, thêm sản phẩm mới. Không xoá gì.
  async importProducts(rows, { onProgress } = {}) {
    const bySku = Object.fromEntries(state.products.filter((p) => p.sku).map((p) => [p.sku.toUpperCase(), p]));
    const byName = Object.fromEntries(state.products.map((p) => [p.name.toLowerCase(), p]));
    let added = 0, updated = 0;
    for (const [i, r] of rows.entries()) {
      onProgress && onProgress(i + 1, rows.length);
      const { cost, ...fields } = r;
      const old = bySku[String(r.sku || '').toUpperCase()] || byName[r.name.toLowerCase()];
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
      const row = { track_serial: true, warranty_months: 12, brand: /bbs/i.test(r.name) ? 'BBS' : 'VietK', active: true, ...(old || {}), ...clean, id: old?.id || uid(), sort: i };
      const { saved } = upsert('products', row);
      old ? updated++ : added++;
      if (cost != null) {
        state.costs = { ...state.costs, [row.id]: cost };
        commit();
      }
      await persist(async () => {
        await saved;
        if (cost != null) await run(sb.from('crm_product_costs').upsert({ product_id: row.id, cost, updated_at: now() }));
      });
    }
    return { added, updated };
  },
  async importCustomers(rows, { onProgress } = {}) {
    let n = 0;
    for (const [i, r] of rows.entries()) {
      onProgress && onProgress(i + 1, rows.length);
      const { saved } = upsert('customers', { ...r, id: uid(), created_by: state.meId, updated_at: now() });
      await persist(() => saved);
      n++;
    }
    return n;
  },
};
