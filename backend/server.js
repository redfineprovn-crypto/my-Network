// 1. LUÔN LUÔN ĐẶT DOTENV LÊN ĐẦU TIÊN
require('dotenv').config(); 

const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Kiểm tra nhanh xem đã đọc được file .env chưa
if (!process.env.DATABASE_URL) {
    console.error("🔴 CẢNH BÁO: Không tìm thấy biến DATABASE_URL trong file .env! Vui lòng kiểm tra lại vị trí file.");
}

// Cấu hình kết nối Supabase PostgreSQL Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:AVNS_zs4VoqQXbwdzHYvPiUC@db.dujbquniddoirldqwdfy.supabase.co:6543/postgres",
    ssl: {
        rejectUnauthorized: false
    }
});

// Kiểm tra kết nối database ngay khi khởi động
pool.connect()
    .then(() => console.log("🟢 Đã kết nối thành công tới Supabase PostgreSQL Pool!"))
    .catch(err => {
        console.error("🔴 Lỗi khởi tạo Supabase Pool: ");
        console.error("- Hãy chắc chắn file .env nằm ở gốc thư mục backend.");
        console.error("- Nội dung lỗi chi tiết:", err.message);
    });

// =========================================================================
// PHẦN 1: HỆ THỐNG API NGƯỜI DÙNG
// =========================================================================

// 1. API Đăng nhập
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`🔑 Nhận yêu cầu đăng nhập: ${email}`);
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ message: "Tài khoản không tồn tại trên hệ thống!" });
        }
        const user = rows[0];
        
        if (user.password !== password) {
            return res.status(401).json({ message: "Sai mật khẩu! Vui lòng kiểm tra lại." });
        }
        if (!user.enabled) {
            return res.status(403).json({ message: "Tài khoản của bạn đã bị khóa bởi quản trị viên!" });
        }
        return res.json({ message: "Đăng nhập thành công!", user });
    } catch (err) {
        return res.status(500).json({ message: `Lỗi kết nối database: ${err.message}` });
    }
});

// 2. API Đăng ký
app.post('/api/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    try {
        await pool.query(
            'INSERT INTO users (full_name, email, password, role, enabled) VALUES ($1, $2, $3, \'USER\', true)',
            [full_name, email, password]
        );
        return res.json({ message: "Đăng ký thành công tài khoản mới!" });
    } catch (err) {
        return res.status(500).json({ message: "Email đã tồn tại hoặc lỗi hệ thống dữ liệu!" });
    }
});

// 3. API Lấy danh sách tài liệu + Tìm kiếm thông minh + Bộ lọc
app.get('/api/documents', async (req, res) => {
    const { search, faculty } = req.query;
    try {
        let query = "SELECT * FROM documents WHERE status = 'APPROVED'";
        let params = [];
        let paramIndex = 1; 

        if (search) {
            query += ` AND (title ILIKE $${paramIndex} OR author ILIKE $${paramIndex + 1} OR subject ILIKE $${paramIndex + 2})`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
            paramIndex += 3;
        }
        
        if (faculty && faculty !== 'Tất cả khoa') {
            query += ` AND faculty = $${paramIndex}`;
            params.push(faculty);
        }

        const { rows } = await pool.query(query, params);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. API Tải lên tài liệu
app.post('/api/documents', async (req, res) => {
    const { title, author, faculty, major, subject, uploaded_by } = req.body;
    try {
        await pool.query(
            'INSERT INTO documents (title, author, faculty, major, subject, status, views, downloads, uploaded_by) VALUES ($1, $2, $3, $4, $5, \'APPROVED\', 0, 0, $6)',
            [title, author, faculty, major, subject, uploaded_by]
        );
        return res.json({ message: "Tải lên tài liệu thành công!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 5. API Lấy danh sách bình luận
app.get('/api/comments/:doc_id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.*, u.full_name, u.avatar 
             FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.doc_id = $1 
             ORDER BY c.created_at DESC`,
            [req.params.doc_id]
        );
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 6. API Gửi bình luận mới
app.post('/api/comments', async (req, res) => {
    const { user_id, doc_id, content } = req.body;
    try {
        await pool.query(
            'INSERT INTO comments (user_id, doc_id, content) VALUES ($1, $2, $3)',
            [user_id, doc_id, content]
        );
        return res.json({ message: "Đăng bình luận thành công!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 7. API Lấy chi tiết tài liệu + Tính điểm đánh giá (Rating) trung bình
app.get('/api/documents/:id', async (req, res) => {
    try {
        const { rows: docs } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
        if (docs.length === 0) return res.status(404).json({ message: "Không tìm thấy tài liệu!" });

        const { rows: ratingRows } = await pool.query(
            'SELECT AVG(value) as "avgRating", COUNT(*) as "totalRatings" FROM ratings WHERE doc_id = $1', 
            [req.params.id]
        );
        const ratingStats = ratingRows[0];

        await pool.query('UPDATE documents SET views = views + 1 WHERE id = $1', [req.params.id]);

        return res.json({
            ...docs[0],
            avgRating: parseFloat(ratingStats.avgRating) || 0,
            totalRatings: parseInt(ratingStats.totalRatings) || 0
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 8. API Gửi đánh giá sao (UPSERT PostgreSQL)
app.post('/api/ratings', async (req, res) => {
    const { user_id, doc_id, value } = req.body;
    if (!user_id || !doc_id || !value) return res.status(400).json({ error: "Thiếu thông tin!" });

    try {
        await pool.query(
            `INSERT INTO ratings (user_id, doc_id, value) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, doc_id) DO UPDATE SET value = EXCLUDED.value`,
            [user_id, doc_id, value]
        );
        return res.json({ success: true, message: "Đánh giá tài liệu thành công!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 9. API Lấy lịch sử đọc của riêng từng User
app.get('/api/users/:id/history', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT h.created_at, d.title, d.author, d.subject 
             FROM read_history h
             JOIN documents d ON h.doc_id = d.id
             WHERE h.user_id = $1
             ORDER BY h.created_at DESC LIMIT 20`,
            [req.params.id]
        );
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// PHẦN 2: HỆ THỐNG API QUẢN TRỊ - ADMIN
// =========================================================================

// 10. API Thống kê tổng quan cho Admin Dashboard
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { rows: usersCount } = await pool.query("SELECT COUNT(*) as total FROM users");
        const { rows: docsCount } = await pool.query("SELECT COUNT(*) as total FROM documents");
        const { rows: pendingCount } = await pool.query("SELECT COUNT(*) as total FROM documents WHERE status = 'PENDING'");
        const { rows: commentsCount } = await pool.query("SELECT COUNT(*) as total FROM comments");

        return res.json({
            users: parseInt(usersCount[0].total) || 0,
            documents: parseInt(docsCount[0].total) || 0,
            pending: parseInt(pendingCount[0].total) || 0,
            comments: parseInt(commentsCount[0].total) || 0
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 11. API Lấy danh sách người dùng cho Admin quản lý
app.get('/api/admin/users', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, full_name, email, role, enabled, school FROM users');
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 12. API Khóa / Mở khóa tài khoản người dùng
app.put('/api/admin/users/:id/toggle', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT enabled FROM users WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy người dùng!" });
        
        const newStatus = !rows[0].enabled; 
        await pool.query('UPDATE users SET enabled = $1 WHERE id = $2', [newStatus, req.params.id]);
        return res.json({ message: "Cập nhật trạng thái tài khoản thành công!", enabled: newStatus });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 13. API Xóa tài liệu vi phạm nội dung
app.delete('/api/admin/documents/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
        return res.json({ message: "Đã xóa tài liệu khỏi hệ thống hoàn toàn!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// PHẦN 3: HỆ THỐNG API CHAT TRỰC TUYẾN
// =========================================================================

// 14. API Lấy lịch sử đoạn chat
app.get('/api/chat', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM (SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 50) AS sub ORDER BY created_at ASC'
        );
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 15. API Gửi tin nhắn mới + Tích hợp Bot AI trả lời tự động
app.post('/api/chat', async (req, res) => {
    const { sender_id, sender_name, message } = req.body;

    if (!sender_name || !message || !message.trim()) {
        return res.status(400).json({ error: "Nội dung tin nhắn không được để trống!" });
    }

    try {
        await pool.query(
            'INSERT INTO chat_messages (sender_id, sender_name, message) VALUES ($1, $2, $3)',
            [sender_id || null, sender_name, message.trim()]
        );

        const msgLower = message.toLowerCase().trim();
        let botReply = "Xin chào! Mình là trợ lý ảo DocShare 🤖. Hiện tại mình chưa hiểu rõ câu hỏi của bạn...";

        if (msgLower.includes("chào") || msgLower.includes("hello") || msgLower.includes("hi")) {
            botReply = "Xin chào bạn! Chúc bạn một ngày tốt lành. Mình có thể hỗ trợ gì cho bạn trên hệ thống DocShare hôm nay?";
        } else if (msgLower.includes("tài liệu") || msgLower.includes("tìm")) {
            botReply = "Để tìm tài liệu, bạn hãy nhập từ khóa vào thanh tìm kiếm ở đầu trang nhé!";
        } else if (msgLower.includes("tải lên") || msgLower.includes("upload")) {
            botReply = "Để tải lên tài liệu, bạn cần Đăng nhập trước. Sau đó nhấn vào mục 'Tải lên'...";
        } else if (msgLower.includes("đăng ký") || msgLower.includes("tài khoản")) {
            botReply = "Bạn có thể dễ dàng đăng ký tài khoản bằng cách chọn mục 'Đăng ký'...";
        } else if (msgLower.includes("lỗi") || msgLower.includes("không tải được")) {
            botReply = "Ui, xin lỗi bạn vì trải nghiệm chưa tốt này! Bạn hãy thử F5 xem sao...";
        } else if (msgLower.includes("cảm ơn") || msgLower.includes("thank")) {
            botReply = "Dạ không có gì ạ! Rất vui được hỗ trợ bạn. Chúc bạn học tập thật tốt cùng DocShare 📚!";
        }

        // Bọc trycatch kỹ cho luồng chạy ngầm của Bot tránh sập server đột ngột
        setTimeout(async () => {
            try {
                await pool.query(
                    'INSERT INTO chat_messages (sender_id, sender_name, message) VALUES ($1, $2, $3)',
                    [null, '🤖Bot', botReply]
                );
                console.log("🤖 Bot đã trả lời tự động.");
            } catch (err) {
                console.error("🔴 Lỗi lưu tin nhắn của Bot:", err.message);
            }
        }, 1000);

        return res.json({ success: true, message: "Tin nhắn đã được ghi nhận!" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend kết nối Supabase đang chạy ổn định tại port ${PORT}`));
