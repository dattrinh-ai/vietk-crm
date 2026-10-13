// Danh mục & phép tính dùng chung cho VietK CRM.
import { fold, todayStr } from './util.js';

export const CUSTOMER_STATUS = {
  new: { label: 'Mới', cls: 'info', icon: '🆕' },
  consulting: { label: 'Đang tư vấn', cls: 'warn', icon: '💬' },
  quoted: { label: 'Đã báo giá', cls: 'warn', icon: '📄' },
  won: { label: 'Đã chốt', cls: 'ok', icon: '✅' },
  lost: { label: 'Không mua', cls: '', icon: '✖' },
};
export const SOURCES = {
  fanpage: 'Fanpage',
  zalo: 'Zalo',
  hotline: 'Hotline',
  showroom: 'Showroom',
  tiktok: 'TikTok',
  website: 'Website',
  referral: 'Khách giới thiệu',
  old: 'Khách cũ',
  other: 'Khác',
};
export const KINDS = { home: 'Karaoke gia đình', business: 'Karaoke kinh doanh' };
export const ACT_KINDS = { call: '📞 Gọi', msg: '💬 Nhắn tin', visit: '🏬 Đến showroom', note: '📝 Ghi chú', quote: '📄 Báo giá', order: '🧾 Đơn hàng', install: '🛠 Lắp đặt' };

export const ORDER_STATUS = {
  quote: { label: 'Báo giá', cls: 'info' },
  confirmed: { label: 'Đã chốt', cls: 'warn' },
  scheduled: { label: 'Đã hẹn lắp', cls: 'warn' },
  installed: { label: 'Đã lắp xong', cls: 'ok' },
  done: { label: 'Hoàn tất', cls: 'ok' },
  cancelled: { label: 'Huỷ', cls: '' },
};
export const DELIVERY = { install: '🛠 Lắp đặt tận nơi', ship: '🚚 Giao hàng', pickup: '🏬 Lấy tại showroom' };
export const PAY_METHODS = { transfer: 'Chuyển khoản', cash: 'Tiền mặt', card: 'Quẹt thẻ', cod: 'COD' };

export const INSTALL_STATUS = {
  scheduled: { label: 'Đã hẹn', cls: 'info' },
  done: { label: 'Đã lắp xong', cls: 'ok' },
  issue: { label: 'Có vướng', cls: 'bad' },
  cancelled: { label: 'Huỷ', cls: '' },
};
// Các bước kỹ thuật viên tick khi lắp đặt
export const INSTALL_STEPS = [
  ['check', 'Kiểm đủ hàng & phụ kiện trước khi đi'],
  ['wire', 'Đi dây, cố định loa / sub'],
  ['tune', 'Cân chỉnh vang số / amply, test micro'],
  ['guide', 'Hướng dẫn khách sử dụng'],
  ['photo', 'Chụp ảnh bàn giao'],
  ['pay', 'Thu tiền còn lại / xác nhận đã thanh toán'],
];

export const CATEGORIES = ['Loa', 'Sub', 'Amply / Vang', 'Micro', 'Đầu karaoke / Màn hình', 'TV Box', 'Phụ kiện', 'Khác'];

// ---------------------------------------------------------------------------
export const money = (n) => (n == null || n === '' ? '—' : Math.round(+n).toLocaleString('vi-VN') + ' ₫');
export const moneyShort = (n) => {
  n = +n || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0).replace('.', ',') + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace('.', ',') + ' tr';
  return n.toLocaleString('vi-VN');
};
// "15tr", "15.000.000", "15,5 tr" → số
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  const t = fold(s).replace(/\s/g, '');
  if (!t) return 0;
  const m = t.match(/^([\d.,]+)(tr|trieu|m|k|nghin|ty)?$/);
  if (!m) return +t.replace(/[^\d]/g, '') || 0;
  const unit = { tr: 1e6, trieu: 1e6, m: 1e6, k: 1e3, nghin: 1e3, ty: 1e9 }[m[2]] || 1;
  const num = unit === 1 ? +m[1].replace(/[.,]/g, '') : +m[1].replace(/\./g, '').replace(',', '.');
  return Math.round(num * unit);
}
export const normPhone = (p) => String(p || '').replace(/\D/g, '');
export const telHref = (p) => 'tel:' + normPhone(p);
export const zaloHref = (p) => 'https://zalo.me/' + normPhone(p);

export const subtotal = (items) => items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0);
export const orderTotal = (items, discount) => Math.max(0, subtotal(items) - (+discount || 0));
export const paidOf = (state, orderId) => state.payments.filter((p) => p.order_id === orderId).reduce((a, p) => a + (+p.amount || 0), 0);
export const itemsOf = (state, orderId) => state.items.filter((i) => i.order_id === orderId).sort((a, b) => a.sort - b.sort);

// Giá vốn 1 dòng hàng (combo = tổng vốn các sản phẩm bên trong) — chỉ Quản trị có dữ liệu
export function costOf(state, item) {
  const c = (pid) => +(state.costs[pid] ?? NaN);
  if (item.product_id) return c(item.product_id) * (+item.qty || 0);
  if (item.combo_id) {
    const cb = state.combos.find((x) => x.id === item.combo_id);
    if (!cb) return NaN;
    return cb.items.reduce((a, x) => a + c(x.product_id) * x.qty, 0) * (+item.qty || 0);
  }
  return NaN;
}

export const customerOf = (state, id) => state.customers.find((c) => c.id === id);
export const personName = (state, id) => state.people.find((p) => p.id === id)?.full_name || '—';
export const ordersOf = (state, customerId) => state.orders.filter((o) => o.customer_id === customerId).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
export const installsOf = (state, orderId) => state.installs.filter((i) => i.order_id === orderId).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
export const lastActivity = (state, customerId) => state.activities.filter((a) => a.customer_id === customerId).sort((a, b) => b.at.localeCompare(a.at))[0];

export const followState = (c, today = todayStr()) =>
  !c.next_follow || c.status === 'won' || c.status === 'lost' ? null : c.next_follow < today ? 'overdue' : c.next_follow === today ? 'today' : 'later';

export const matches = (q, ...fields) => {
  const f = fold(q).trim();
  if (!f) return true;
  const digits = normPhone(q);
  return fields.some((x) => fold(x).includes(f) || (digits.length >= 3 && normPhone(x).includes(digits)));
};

// Ai thấy khách nào (bản thật do máy chủ lọc sẵn; bản demo lọc ở đây cho giống)
export function canSeeCustomer(state, me, c) {
  if (me.role === 'admin' || !c.owner_id || c.owner_id === me.id) return true;
  const owner = state.people.find((p) => p.id === c.owner_id);
  if (me.role === 'manager' && owner && owner.dept === me.dept) return true;
  return state.orders.some((o) => o.customer_id === c.id && state.installs.some((i) => i.order_id === o.id && i.tech_ids.includes(me.id)));
}
export const visibleCustomers = (state, me) => state.customers.filter((c) => canSeeCustomer(state, me, c));
export const visibleOrders = (state, me) => {
  const ids = new Set(visibleCustomers(state, me).map((c) => c.id));
  return state.orders.filter((o) => ids.has(o.customer_id));
};
// Người nhận khách / kỹ thuật viên để chọn
export const sellers = (state) => state.people.filter((p) => p.active !== false && p.role !== 'bod');
export const techs = (state) => {
  const t = state.people.filter((p) => p.active !== false && (p.emp_type === 'field' || /ky thuat|lap dat/.test(fold(state.depts.find((d) => d.id === p.dept)?.name || ''))));
  return t.length ? t : sellers(state);
};

// ---------------------------------------------------------------------------
// Cài đặt CRM (Quản trị sửa trong tab Cài đặt; lưu bảng crm_settings)
export const DEFAULT_SETTINGS = {
  sources: ['Fanpage', 'Zalo', 'Hotline', 'Showroom', 'TikTok', 'Website', 'Shopee / Lazada', 'Khách giới thiệu', 'Khách cũ', 'Khác'],
  regions: ['Hà Nội', 'TP.HCM', 'Hải Phòng', 'Bắc Ninh', 'Đà Nẵng', 'Tỉnh khác'],
  lost_reasons: ['Giá cao', 'Chọn hàng trên sàn / đối thủ', 'Chưa có nhu cầu ngay', 'Không phản hồi', 'Ngoài khu vực lắp đặt', 'Khác'],
  categories: ['VOD chuyên nghiệp', 'Đầu liền màn VOD', 'TV Box', 'Âm thanh', 'Microphone', 'Phụ kiện', 'Khác'],
  stale_days: 7, // khách đang theo không có chăm sóc quá N ngày → cảnh báo
  quote_valid_days: 7,
  follow_default_days: 1,
  zalo_template: 'Chào anh/chị {ten}, em là {nhan_vien} bên VietK. Em gửi anh/chị thông tin bộ karaoke phù hợp nhu cầu {nhu_cau} ạ. Anh/chị cần em tư vấn thêm gì cứ nhắn em nhé!',
  company_name: 'VietK — Công ty CP Điện tử Hồ Gươm',
  company_address: 'D3K2 toà D chung cư Complex, ngõ 164 Khuất Duy Tiến, Thanh Xuân, Hà Nội',
  company_phone: '1900.545568',
  bank_info: '',
  quote_note: 'Giá đã bao gồm VAT. Sản phẩm bảo hành chính hãng theo chính sách VietK.',
  policy_notes: [],
};
export const withDefaults = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });
// Nguồn khách: dữ liệu cũ lưu mã (fanpage…), dữ liệu mới lưu nhãn
export const srcLabel = (s) => SOURCES[s] || s || '—';
export const fillTemplate = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
export const staleCare = (state, c, days) => {
  if (['won', 'lost'].includes(c.status)) return false;
  const last = lastActivity(state, c.id)?.at || c.created_at;
  return !!last && (Date.now() - new Date(last)) / 86400000 > days;
};
// Bậc khuyến mại ngắn gọn: "Mua 10 tặng 1 đôi · hoặc CK 8%"
export const promoShort = (p) => [p.min_qty && `Mua ${p.min_qty}`, p.gift_qty && `tặng ${p.gift_qty}${p.gift ? ' ' + p.gift : ''}`, p.discount_pct != null && `${p.gift_qty ? 'hoặc ' : ''}CK ${p.discount_pct}%`].filter(Boolean).join(' ') || p.text;
