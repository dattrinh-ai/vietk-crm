// Dữ liệu mẫu cho chế độ DEMO — tên người, khách hàng là hư cấu; giá chỉ để minh hoạ.
import { uid, todayStr, addDays } from './util.js';

const PEOPLE = [
  { id: 'u_admin', full_name: 'Nguyễn Văn Quản', role: 'admin', dept: null, title: 'Giám đốc' },
  { id: 'u_mai', full_name: 'Nguyễn Mai Anh', role: 'staff', dept: 'd_sales', title: 'Tư vấn bán hàng showroom' },
  { id: 'u_lan', full_name: 'Đỗ Ngọc Lan', role: 'staff', dept: 'd_sales', title: 'Tư vấn online' },
  { id: 'u_kiet', full_name: 'Lê Tuấn Kiệt', role: 'manager', dept: 'd_tech', title: 'Trưởng nhóm Kỹ thuật', emp_type: 'field' },
  { id: 'u_son', full_name: 'Vũ Thành Sơn', role: 'staff', dept: 'd_tech', title: 'Kỹ thuật viên', emp_type: 'field' },
  { id: 'u_ha', full_name: 'Phạm Thu Hà', role: 'staff', dept: 'd_dealer', title: 'Kinh doanh đại lý' },
];
const DEPTS = [
  { id: 'd_sales', name: 'Sales showroom & online', sort: 1 },
  { id: 'd_mkt', name: 'Sàn TMĐT & Marketing', sort: 2 },
  { id: 'd_tech', name: 'Kỹ thuật lắp đặt & bảo hành', sort: 3 },
  { id: 'd_dealer', name: 'Kinh doanh đại lý', sort: 4 },
  { id: 'd_ops', name: 'Kho, giao vận & kế toán', sort: 5 },
];

const P = (id, sku, name, category, price, dealer, cost, extra = {}) => ({ id, sku, name, category, brand: 'BBS', unit: 'cái', price, dealer_price: dealer, warranty_months: 12, track_serial: true, active: true, _cost: cost, ...extra });
const PRODUCTS = [
  P('p_i6', 'ICON-6', 'Loa BBS iCON-6 (đôi)', 'Loa', 6900000, 5600000, 4300000, { unit: 'đôi' }),
  P('p_i8', 'ICON-8', 'Loa BBS iCON-8 (đôi)', 'Loa', 8900000, 7300000, 5600000, { unit: 'đôi' }),
  P('p_i9', 'ICON-9', 'Loa BBS iCON-9 (đôi)', 'Loa', 11900000, 9700000, 7400000, { unit: 'đôi' }),
  P('p_f12', 'ICON-F12', 'Loa BBS iCON-F12 (đôi)', 'Loa', 18900000, 15500000, 11800000, { unit: 'đôi' }),
  P('p_bbs8', 'BBS-8', 'Loa BBS 8 (đôi)', 'Loa', 7900000, 6400000, 4900000, { unit: 'đôi' }),
  P('p_s200', 'ICON-S200', 'Sub BBS iCON-S200', 'Sub', 7500000, 6100000, 4600000),
  P('p_amp', 'ICON-PRO-3IN1', 'Amply iCON Pro 3in1', 'Amply / Vang', 6500000, 5300000, 3900000),
  P('p_mic', 'TH-8', 'Micro không dây BBS TH-8', 'Micro', 3200000, 2600000, 1800000),
  P('p_vk22', 'VK-22', 'Đầu karaoke liền màn VietK 21,5"', 'Đầu karaoke / Màn hình', 14900000, 12300000, 9800000),
  P('p_box', 'VBOX-8K', 'TV Box VBox8K', 'TV Box', 1990000, 1600000, 1100000),
  P('p_cable', 'DAY-LOA', 'Dây loa & phụ kiện lắp đặt', 'Phụ kiện', 500000, 400000, 250000, { unit: 'bộ', track_serial: false, warranty_months: 0 }),
];
const COMBOS = [
  { id: 'c_bbs8pro', name: 'Combo BBS8 Pro Full Option', price: 21500000, items: [{ product_id: 'p_bbs8', qty: 1 }, { product_id: 'p_s200', qty: 1 }, { product_id: 'p_amp', qty: 1 }, { product_id: 'p_cable', qty: 1 }], active: true, note: 'Đôi loa BBS 8 + Sub S200 + Amply iCON Pro 3in1' },
  { id: 'c_i9', name: 'Combo iCON-9 Gia đình', price: 27900000, items: [{ product_id: 'p_i9', qty: 1 }, { product_id: 'p_s200', qty: 1 }, { product_id: 'p_amp', qty: 1 }, { product_id: 'p_mic', qty: 1 }, { product_id: 'p_cable', qty: 1 }], active: true },
  { id: 'c_kd', name: 'Combo phòng hát kinh doanh F12', price: 52900000, items: [{ product_id: 'p_f12', qty: 1 }, { product_id: 'p_s200', qty: 2 }, { product_id: 'p_amp', qty: 1 }, { product_id: 'p_mic', qty: 1 }, { product_id: 'p_vk22', qty: 1 }, { product_id: 'p_cable', qty: 1 }], active: true },
];

export function makeSeed() {
  const t = todayStr();
  const at = (d, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:15:00`).toISOString();
  const C = (o) => ({ id: uid(), kind: 'home', source: 'fanpage', status: 'new', created_at: at(addDays(-5)), updated_at: at(addDays(-1)), ...o });
  const customers = [
    C({ id: 'k1', name: 'Anh Trung', phone: '0912 345 671', address: 'Thôn Cự Đà, Thanh Oai', area: 'Thanh Oai', need: 'Phòng khách 25m², hát gia đình cuối tuần', budget: 22000000, status: 'won', owner_id: 'u_mai', source: 'fanpage', created_at: at(addDays(-9)) }),
    C({ id: 'k2', name: 'Chị Hương', phone: '0987 654 322', address: '12 Trần Duy Hưng, Cầu Giấy', area: 'Cầu Giấy', need: 'Chung cư 20m², cần loa gọn, đẹp', budget: 30000000, status: 'won', owner_id: 'u_lan', source: 'tiktok', created_at: at(addDays(-6)) }),
    C({ id: 'k3', name: 'Anh Dũng – Karaoke Hoa Sen', phone: '0903 111 223', address: 'Đường Phúc Diễn, Bắc Từ Liêm', area: 'Bắc Từ Liêm', kind: 'business', need: '3 phòng hát kinh doanh, mỗi phòng 30m²', budget: 160000000, status: 'quoted', owner_id: 'u_mai', source: 'hotline', next_follow: t, created_at: at(addDays(-4)) }),
    C({ id: 'k4', name: 'Cô Thu', phone: '0978 222 334', area: 'Long Biên', need: 'Hỏi loa iCON-9 màu trắng', status: 'consulting', owner_id: 'u_lan', source: 'zalo', next_follow: addDays(-1), created_at: at(addDays(-3)) }),
    C({ id: 'k5', name: 'Anh Phong', phone: '0965 333 445', area: 'Hà Đông', need: 'Muốn qua showroom nghe thử cuối tuần', status: 'consulting', owner_id: 'u_mai', source: 'showroom', next_follow: addDays(2), created_at: at(addDays(-2)) }),
    C({ id: 'k6', name: 'Chị Lan Anh', phone: '0934 444 556', area: 'Thanh Xuân', need: 'Inbox hỏi giá combo BBS8 Pro', status: 'new', owner_id: null, source: 'fanpage', created_at: at(t, 8) }),
    C({ id: 'k7', name: 'Anh Tuấn', phone: '0945 555 667', area: 'Nam Từ Liêm', status: 'new', owner_id: null, source: 'website', created_at: at(t, 9) }),
    C({ id: 'k8', name: 'Bác Bình', phone: '0916 666 778', area: 'Gia Lâm', need: 'Mua cho con, ngân sách 10 triệu', budget: 10000000, status: 'lost', lost_reason: 'Chọn hàng rẻ hơn trên sàn', owner_id: 'u_lan', source: 'fanpage', created_at: at(addDays(-12)) }),
  ];
  const A = (customer_id, kind, text, d, by_id) => ({ id: uid(), customer_id, kind, text, at: at(d, 11), by_id });
  const activities = [
    A('k1', 'msg', 'Khách inbox hỏi combo cho phòng 25m²', addDays(-9), 'u_mai'),
    A('k1', 'visit', 'Khách qua showroom nghe thử BBS8 Pro, rất ưng', addDays(-7), 'u_mai'),
    A('k1', 'order', 'Chốt combo BBS8 Pro, cọc 5 triệu', addDays(-6), 'u_mai'),
    A('k3', 'call', 'Gọi tư vấn 3 phòng kinh doanh, hẹn gửi báo giá', addDays(-4), 'u_mai'),
    A('k3', 'quote', 'Đã gửi báo giá 3 combo F12 qua Zalo', addDays(-3), 'u_mai'),
    A('k4', 'msg', 'Hỏi iCON-9 màu trắng còn hàng không, hẹn báo lại', addDays(-2), 'u_lan'),
  ];
  const O = (o) => ({ id: uid(), discount: 0, delivery: 'install', created_at: at(addDays(-5)), ...o });
  const orders = [
    O({ id: 'o1', code: 'DH' + addDays(-6).slice(2).replace(/-/g, '') + '-01', customer_id: 'k1', owner_id: 'u_mai', status: 'scheduled', address: 'Thôn Cự Đà, Thanh Oai', discount: 500000, created_at: at(addDays(-6)) }),
    O({ id: 'o2', code: 'DH' + addDays(-3).slice(2).replace(/-/g, '') + '-01', customer_id: 'k2', owner_id: 'u_lan', status: 'installed', address: '12 Trần Duy Hưng, Cầu Giấy', created_at: at(addDays(-3)) }),
    O({ id: 'o3', code: 'DH' + addDays(-3).slice(2).replace(/-/g, '') + '-02', customer_id: 'k3', owner_id: 'u_mai', status: 'quote', address: 'Đường Phúc Diễn, Bắc Từ Liêm', discount: 4500000, quote_valid_until: addDays(7), created_at: at(addDays(-3)) }),
  ];
  const I = (order_id, o, sort) => ({ id: uid(), order_id, sort, ...o });
  const items = [
    I('o1', { combo_id: 'c_bbs8pro', name: 'Combo BBS8 Pro Full Option', qty: 1, price: 21500000 }, 0),
    I('o2', { combo_id: 'c_i9', name: 'Combo iCON-9 Gia đình', qty: 1, price: 27900000 }, 0),
    I('o2', { product_id: 'p_box', name: 'TV Box VBox8K', qty: 1, price: 1990000 }, 1),
    I('o3', { combo_id: 'c_kd', name: 'Combo phòng hát kinh doanh F12', qty: 3, price: 52900000 }, 0),
  ];
  const payments = [
    { id: uid(), order_id: 'o1', amount: 5000000, method: 'transfer', paid_at: addDays(-6), note: 'Cọc' },
    { id: uid(), order_id: 'o2', amount: 29890000, method: 'transfer', paid_at: addDays(-1), note: 'Thanh toán đủ khi bàn giao' },
  ];
  const installs = [
    { id: uid(), order_id: 'o1', date: t, time: '14:00', tech_ids: ['u_kiet', 'u_son'], status: 'scheduled', checklist: { check: true }, note: 'Khách dặn gọi trước 30 phút' },
    { id: uid(), order_id: 'o2', date: addDays(-1), time: '09:30', tech_ids: ['u_son'], status: 'done', checklist: Object.fromEntries(['check', 'wire', 'tune', 'guide', 'photo', 'pay'].map((k) => [k, true])), done_at: at(addDays(-1), 12) },
  ];
  for (const o of orders) o.total = items.filter((i) => i.order_id === o.id).reduce((a, i) => a + i.qty * i.price, 0) - o.discount;
  return {
    people: PEOPLE.map((p) => ({ ...p, active: true })),
    depts: DEPTS,
    products: PRODUCTS.map(({ _cost, ...p }) => p),
    costs: Object.fromEntries(PRODUCTS.map((p) => [p.id, p._cost])),
    combos: COMBOS,
    customers,
    activities,
    orders,
    items,
    payments,
    installs,
  };
}
