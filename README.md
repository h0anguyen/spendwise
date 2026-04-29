# SpendWise — Ứng Dụng Theo Dõi Chi Tiêu

## Cài đặt nhanh

```bash
# 1. Cài dependencies
npm install

# 2. Copy file cấu hình
cp .env.example .env
# Sửa MONGODB_URI và SESSION_SECRET trong .env

# 3. Seed dữ liệu mẫu (tùy chọn)
node scripts/seed.js

# 4. Chạy dev
npm run dev

# 5. Chạy production
npm start
```

## Cấu trúc dự án

```
expense-tracker/
├── src/
│   ├── app.js              # Entry point
│   ├── config/             # DB, Logger, Passport
│   ├── controllers/        # Business logic
│   ├── middleware/         # Auth, Error handler
│   ├── models/             # Mongoose models
│   ├── routes/             # Express routes
│   ├── services/           # Cron jobs
│   └── socket/             # Socket.IO
├── views/                  # EJS templates
├── public/                 # CSS, JS, uploads
└── scripts/                # Migrate, Seed
```

## Tính năng
- Đăng nhập / Đăng ký (Passport.js + bcrypt)
- Thêm/sửa/xóa chi tiêu & thu nhập
- Phân loại danh mục (tùy chỉnh)
- Ngân sách tháng + cảnh báo real-time (Socket.IO)
- Báo cáo tháng / năm với biểu đồ (Chart.js)
- Export CSV
- Chi tiêu lặp lại tự động (Cron)
- API REST với JWT
- Rate limiting, Helmet, Mongo sanitize

## Yêu cầu
- Node.js >= 18
- MongoDB >= 6
