// Kết nối Supabase của VietK (dùng chung cho VietK Checklist và VietK CRM).
// Để trống = chế độ DEMO (dữ liệu mẫu, lưu trên trình duyệt).
// Khoá publishable là khoá công khai, an toàn khi để trong code — dữ liệu được bảo vệ bằng phân quyền (RLS).
export const CONFIG = {
  SUPABASE_URL: 'https://ygxebyeipiofapeozfrq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_JMXx87gAD-iBxDDlUK664A_TR3dkuQS',
  VAPID_PUBLIC_KEY: 'BOUMK0K5YgrEjq-qPBBQ6jPA1GnsNgqUDadDQheDLAGl6JqVWhASODrqpUx8206JXoa8xlojtm6lYJ0ChYKrZvQ',
  // Tên bot Telegram của VietK (không có @) — điền khi VietK tạo bot
  TELEGRAM_BOT: '',
};
