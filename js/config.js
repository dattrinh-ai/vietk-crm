// Kết nối Supabase của VietK (dùng chung cho VietK Checklist và VietK CRM).
// Để trống = chế độ DEMO (dữ liệu mẫu, lưu trên trình duyệt).
// Khoá publishable là khoá công khai, an toàn khi để trong code — dữ liệu được bảo vệ bằng phân quyền (RLS).
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  VAPID_PUBLIC_KEY: '',
  // Tên bot Telegram của VietK (không có @) — điền khi VietK tạo bot
  TELEGRAM_BOT: '',
};
