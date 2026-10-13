// Nhập / xuất Excel cho VietK CRM.
// - parsePolicy: đọc file "Chính sách phân phối" của VietK (mẫu HG - Chính sách phân phối) hoặc file sản phẩm do CRM xuất ra.
// - parseCustomers: đọc danh sách khách (file mẫu tải từ Cài đặt).
// - Xuất: bảng giá & chính sách, khách hàng, đơn hàng.
// Hàm parse là hàm thuần (nhận mảng 2 chiều) để chạy được cả trên trình duyệt lẫn khi kiểm thử bằng Node.

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = +String(v).replace(/[^\d]/g, '');
  return Number.isFinite(n) && String(v).match(/\d/) ? n : null;
};

// "25tr", "1,5 tỷ", "500k", "15.000.000" → số
const money = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const t = fold(v).replace(/\s/g, '');
  const m = t.match(/^([\d.,]+)(tr|trieu|m|k|nghin|ty)?d?$/);
  if (!m) return num(v);
  const unit = { tr: 1e6, trieu: 1e6, m: 1e6, k: 1e3, nghin: 1e3, ty: 1e9 }[m[2]] || 1;
  return Math.round((unit === 1 ? +m[1].replace(/[.,]/g, '') : +m[1].replace(/\./g, '').replace(',', '.')) * unit);
};
// SĐT gõ dạng số trong Excel mất số 0 đầu → thêm lại
const phone = (v) => {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return typeof v === 'number' && /^\d{9}$/.test(s) ? '0' + s : s;
};

let XLSX = null;
export async function loadXLSX() {
  if (!XLSX) XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  return XLSX;
}
// File → mảng 2 chiều của sheet đầu tiên (giữ ô trống để đúng cột)
export async function readSheet(file) {
  const X = await loadXLSX();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map((n) => ({ name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true }) }));
}

// ---------------------------------------------------------------------------
// Tên ngắn, mã, đơn vị từ tên đầy đủ trong bảng chính sách
const COLOR = /(black|white|r-?walnut|walnut|đen|trắng|đỏ|vàng)\s*$/i;
export function shortName(full) {
  const s = String(full || '').replace(/\s+/g, ' ').replace(/iCON\s+-\s*/gi, 'iCON-').trim();
  const ap = s.match(/(\d+(?:\.\d+)?)"\s*VietK Amazing Play\s*(\d{4}(?:-RGB)?)/i);
  if (ap) return `Đầu VOD liền màn VietK Amazing Play ${ap[2]} (${ap[1]}")`;
  let base = s.split('/')[0].trim();
  const model = s.match(/model\s+([A-Z0-9-]+)/i);
  if (model && !base.includes(model[1])) base += ` (Model ${model[1]})`;
  const col = s.match(/-\s*\/?\s*([A-Za-z-]*\s*(?:black|white|walnut))\s*$/i) || s.match(COLOR);
  if (col && s.includes('/')) base += ' – ' + col[1].replace(/^[-/\s]+/, '').replace(/^r-?walnut$/i, 'R-Walnut').replace(/^\w/, (c) => c.toUpperCase());
  return base;
}
// Mã gọn theo model: ICON-9-WHITE, AP-1855-RGB, ICON-PRO-3IN1-3500, TH8, VBOX-GT1…
export function makeSku(name) {
  const n = String(name || '');
  const color = (n.match(/–\s*(black|white|r-?walnut)/i) || [])[1];
  const col = color ? '-' + color.toUpperCase().replace('R-WALNUT', 'WALNUT') : '';
  let m;
  if ((m = n.match(/amazing play\s*(\d{4}(?:-rgb)?)/i))) return 'AP-' + m[1].toUpperCase();
  if ((m = n.match(/icon\s*pro\s*(\d)in1/i))) return `ICON-PRO-${m[1]}IN1` + ((n.match(/model\s+([a-z0-9-]+)/i) || [])[1] ? '-' + n.match(/model\s+([a-z0-9-]+)/i)[1].toUpperCase() : '');
  if ((m = n.match(/icon\s*-?\s*([a-z]?\d+)/i))) return 'ICON-' + m[1].toUpperCase() + col;
  if ((m = n.match(/model\s+([a-z0-9-]+)/i))) return (/vietk/i.test(n) ? 'VIETK-' : '') + m[1].toUpperCase();
  if ((m = n.match(/\b(TH\d+)\b/i))) return m[1].toUpperCase();
  if ((m = n.match(/vbox\s*([a-z0-9]+)/i))) return 'VBOX-' + m[1].toUpperCase();
  if (/gold titan/i.test(n)) return 'GOLD-TITAN-21';
  if (/gold\s*21/i.test(n)) return 'GOLD-21';
  if ((m = n.match(/ktv\s*(4k\s*plus)/i))) return 'KTV-4K-PLUS';
  return fold(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24);
}
export function guessUnit(name) {
  const n = fold(name);
  if (/^loa (full )?bbs icon-(?!s)/.test(n)) return 'đôi';
  if (/^bo /.test(n)) return 'bộ';
  return 'cái';
}
// "Mua 50 Đầu VOD … tặng 8 Màn Gold 21.5" [Hoặc CK 12%]" → {min_qty, gift_qty, gift, discount_pct, text}
export function parsePromo(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const q = t.match(/mua\s+(\d+)/i);
  const g = t.match(/tặng\s+0*(\d+)\s*([^[]*)/i);
  const ck = t.match(/ck\s*(\d+(?:[.,]\d+)?)\s*%/i);
  const gift = g ? g[2].replace(/\[.*$/, '').trim() : '';
  return { min_qty: q ? +q[1] : null, gift_qty: g ? +g[1] : null, gift: gift || null, discount_pct: ck ? +ck[1].replace(',', '.') : null, text: t };
}

// ---------------------------------------------------------------------------
// Bảng chính sách phân phối → { products, notes, warnings }
// Nhận diện cột theo tiêu đề nên chịu được việc thêm / bớt / đổi thứ tự cột.
const HEAD = [
  ['name', (h) => /ten san pham|san pham|ten hang/.test(h)],
  ['min_dealer_price', (h) => /thu ve/.test(h) && !/linh hoat/.test(h)],
  ['dealer_price', (h) => /bao tren don|gia pp$|gia dai ly|gia npp/.test(h)],
  ['demo_price', (h) => /demo/.test(h)],
  ['price', (h) => /ban le/.test(h)],
  ['promo', (h) => /khuyen mai|theo goi/.test(h)],
  ['flex_price', (h) => /linh hoat|goi nho/.test(h)],
  ['sku', (h) => /^ma( sp| san pham| hang)?$|^sku$/.test(h)],
  ['category', (h) => /^nhom|danh muc|^loai$/.test(h)],
  ['warranty_months', (h) => /bao hanh/.test(h)],
  ['unit', (h) => /don vi|^dvt$/.test(h)],
  ['note', (h) => /^ghi chu|mo ta|thong so/.test(h)],
  ['cost', (h) => /gia von/.test(h)],
];
export function parsePolicy(rows) {
  const warnings = [];
  // dòng tiêu đề: dòng đầu tiên có ô chứa "tên sản phẩm"
  const hi = rows.findIndex((r) => (r || []).some((c) => /ten san pham|ten hang/.test(fold(c))));
  if (hi < 0) return { products: [], notes: [], warnings: ['Không thấy dòng tiêu đề có cột "Tên sản phẩm"'] };
  const col = {};
  rows[hi].forEach((c, i) => {
    const h = fold(c).replace(/\n/g, ' ');
    if (!h) return;
    for (const [k, test] of HEAD) if (col[k] == null && test(h)) { col[k] = i; break; }
  });
  if (col.name == null) return { products: [], notes: [], warnings: ['Không nhận ra cột tên sản phẩm'] };
  const sttCol = rows[hi].findIndex((c) => /^stt$|^tt$/.test(fold(c)));
  const stt = sttCol >= 0 ? sttCol : col.name > 0 ? col.name - 1 : null;
  const products = [];
  const notes = [];
  let category = '';
  let cur = null;
  let inNotes = false;
  let noteGroup = '';
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const a = stt != null ? row[stt] : null;
    const name = row[col.name];
    const nameS = String(name ?? '').trim();
    if (!inNotes && /^ghi chu/.test(fold(nameS))) {
      inNotes = true;
      continue;
    }
    if (inNotes) {
      if (!nameS) continue;
      if (/^\d+\s*-?$/.test(String(a ?? '').trim())) noteGroup = nameS;
      else notes.push(noteGroup ? `${noteGroup}: ${nameS}` : nameS);
      continue;
    }
    const isSection = nameS && typeof a === 'string' && /^[IVX]+\s*-?$/i.test(a.trim());
    const hasPrice = ['price', 'dealer_price', 'min_dealer_price'].some((k) => col[k] != null && num(row[col[k]]) != null);
    if (isSection || (nameS && !hasPrice && a == null && !row[col.promo])) {
      category = nameS;
      cur = null;
      continue;
    }
    // 1 ô có thể chứa nhiều bậc (file CRM xuất ra: mỗi bậc 1 dòng)
    const promoList = col.promo != null ? String(row[col.promo] ?? '').split(/\n+/).map(parsePromo).filter(Boolean) : [];
    const promo = promoList[0] || null;
    if (!nameS) {
      // dòng nối: thêm bậc khuyến mại cho sản phẩm phía trên
      if (cur) cur.promos.push(...promoList);
      continue;
    }
    // Trùng tên (cùng sản phẩm, nhiều bậc) → gộp bậc khuyến mại
    const same = products.find((p) => fold(p._src) === fold(nameS));
    if (same) {
      for (const x of promoList) if (!same.promos.some((y) => y.text === x.text)) same.promos.push(x);
      cur = same;
      continue;
    }
    const sn = shortName(nameS);
    const p = {
      _src: nameS,
      full_name: col.note != null ? null : nameS, // file CRM xuất ra: thông số nằm ở cột Ghi chú
      name: sn,
      sku: col.sku != null && row[col.sku] ? String(row[col.sku]).trim() : makeSku(sn),
      category: (col.category != null && row[col.category]) || category || 'Khác',
      unit: (col.unit != null && row[col.unit]) || guessUnit(sn),
      price: num(row[col.price]) ?? 0,
      dealer_price: col.dealer_price != null ? num(row[col.dealer_price]) : null,
      min_dealer_price: col.min_dealer_price != null ? num(row[col.min_dealer_price]) : null,
      demo_price: col.demo_price != null ? num(row[col.demo_price]) : null,
      flex_price: col.flex_price != null ? num(row[col.flex_price]) : null,
      warranty_months: col.warranty_months != null && num(row[col.warranty_months]) != null ? num(row[col.warranty_months]) : null,
      note: col.note != null && row[col.note] ? String(row[col.note]) : sn !== nameS ? nameS : null,
      cost: col.cost != null ? num(row[col.cost]) : null,
      promos: promoList,
    };
    if (!p.price && !p.dealer_price && !p.min_dealer_price) warnings.push(`"${sn}" không có giá`);
    products.push(p);
    cur = p;
  }
  // Mã trùng (vd 2 màu cùng model mà không phân biệt được) → thêm số
  const seen = {};
  for (const p of products) {
    if (seen[p.sku]) p.sku = `${p.sku}-${++seen[p.sku]}`;
    else seen[p.sku] = 1;
  }
  for (const p of products) delete p._src;
  return { products, notes, warnings };
}

// ---------------------------------------------------------------------------
// Khách hàng (file mẫu)
export const CUSTOMER_COLUMNS = ['Tên khách', 'SĐT', 'SĐT 2', 'Địa chỉ', 'Khu vực', 'Loại (gia đình / kinh doanh)', 'Nguồn', 'Nhu cầu', 'Ngân sách', 'Trạng thái', 'Người phụ trách', 'Hẹn gọi lại (YYYY-MM-DD)', 'Ghi chú'];
const STATUS_BY = { moi: 'new', 'dang tu van': 'consulting', 'da bao gia': 'quoted', 'da chot': 'won', 'khong mua': 'lost', new: 'new', consulting: 'consulting', quoted: 'quoted', won: 'won', lost: 'lost' };
export function parseCustomers(rows, people = []) {
  const hi = rows.findIndex((r) => (r || []).some((c) => /^ten khach|^ho ten|^khach hang$/.test(fold(c))));
  if (hi < 0) return { customers: [], warnings: ['Không thấy cột "Tên khách"'] };
  const idx = (re) => rows[hi].findIndex((c) => re.test(fold(c)));
  const c = {
    name: idx(/^ten khach|^ho ten|^khach hang$/), phone: idx(/^sdt$|^so dien thoai|^dien thoai/), phone2: idx(/sdt 2|dien thoai 2/), address: idx(/^dia chi/),
    area: idx(/khu vuc|tinh|quan/), kind: idx(/^loai/), source: idx(/^nguon/), need: idx(/nhu cau/), budget: idx(/ngan sach/), status: idx(/trang thai/),
    owner: idx(/phu trach|nhan vien/), next: idx(/hen goi|follow/), note: idx(/ghi chu/),
  };
  const byName = Object.fromEntries(people.map((p) => [fold(p.full_name), p.id]));
  const customers = [];
  const warnings = [];
  const unmatched = new Set();
  for (const row of rows.slice(hi + 1)) {
    const g = (k) => (c[k] >= 0 ? row?.[c[k]] : null);
    const name = String(g('name') ?? '').trim();
    if (!name) continue;
    const owner = String(g('owner') ?? '').trim();
    if (owner && !byName[fold(owner)]) unmatched.add(owner);
    let next = g('next');
    if (typeof next === 'number') next = new Date(Math.round((next - 25569) * 86400000)).toISOString().slice(0, 10);
    customers.push({
      name, phone: phone(g('phone')), phone2: phone(g('phone2')),
      address: g('address'), area: g('area'), kind: /kinh doanh|kd|business/.test(fold(g('kind'))) ? 'business' : 'home',
      source: g('source') ? String(g('source')).trim() : 'Khác', need: g('need'), budget: money(g('budget')),
      status: STATUS_BY[fold(g('status'))] || 'new', owner_id: byName[fold(owner)] || null,
      next_follow: /^\d{4}-\d{2}-\d{2}$/.test(String(next || '')) ? next : null, note: g('note'),
    });
  }
  if (unmatched.size) warnings.push(`Không khớp tên nhân viên: ${[...unmatched].join(', ')} — các khách này sẽ ở mục "Chưa ai nhận"`);
  return { customers, warnings };
}

// ---------------------------------------------------------------------------
// Xuất file
export async function downloadXlsx(filename, sheets) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  for (const { name, rows, widths } of sheets) {
    const ws = X.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  X.writeFile(wb, filename);
}

export const PRODUCT_COLUMNS = ['STT', 'Nhóm', 'Mã', 'Tên sản phẩm', 'Đơn vị', 'Giá PP công ty thu về', 'Giá PP báo trên đơn', 'Giá demo SP', 'Giá bán lẻ', 'Giá linh hoạt gói nhỏ (thu về không nhỏ hơn)', 'Chương trình khuyến mại theo gói', 'Bảo hành (tháng)', 'Ghi chú / thông số'];
export function productRows(products, { withCost = false, costs = {} } = {}) {
  const head = withCost ? [...PRODUCT_COLUMNS, 'Giá vốn'] : PRODUCT_COLUMNS;
  return [head, ...products.map((p, i) => {
    const r = [i + 1, p.category, p.sku, p.name, p.unit, p.min_dealer_price, p.dealer_price, p.demo_price, p.price, p.flex_price, (p.promos || []).map((x) => x.text).join('\n'), p.warranty_months, p.note];
    return withCost ? [...r, costs[p.id] ?? null] : r;
  })];
}
