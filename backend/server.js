const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Cấu hình kết nối MySQL
const dbConfig = {
    host: process.env.DB_SERVER || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'docshare_react_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log("🟢 Đã kết nối thành công tới MySQL Pool (docshare_react_db)");
} catch (err) {
    console.error("🔴 Lỗi khởi tạo MySQL Pool: ", err);
}

// =========================================================================
// PHẦN 1: HỆ THỐNG API NGƯỜI DÙNG
// =========================================================================

// 1. API Đăng nhập
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`🔑 Nhận yêu cầu đăng nhập: ${email}`);
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
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
        await pool.execute(
            'INSERT INTO users (full_name, email, password, role, enabled) VALUES (?, ?, ?, "USER", 1)',
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

        if (search) {
            query += " AND (title LIKE ? OR author LIKE ? OR subject LIKE ?)";
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }
        
        if (faculty && faculty !== 'Tất cả khoa') {
            query += " AND faculty = ?";
            params.push(faculty);
        }

        const [rows] = await pool.execute(query, params);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. API Tải lên tài liệu
app.post('/api/documents', async (req, res) => {
    const { title, author, faculty, major, subject, uploaded_by } = req.body;
    try {
        await pool.execute(
            'INSERT INTO documents (title, author, faculty, major, subject, status, views, downloads, uploaded_by) VALUES (?, ?, ?, ?, ?, "APPROVED", 0, 0, ?)',
            [title, author, faculty, major, subject, uploaded_by]
        );
        return res.json({ message: "Tải lên tài liệu thành công!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 5. API Lấy danh sách bình luận (JOIN để lấy tên hiển thị của user)
app.get('/api/comments/:doc_id', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.*, u.full_name, u.avatar 
             FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.doc_id = ? 
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
        await pool.execute(
            'INSERT INTO comments (user_id, doc_id, content) VALUES (?, ?, ?)',
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
        const [docs] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (docs.length === 0) return res.status(404).json({ message: "Không tìm thấy tài liệu!" });

        const [[ratingStats]] = await pool.execute(
            'SELECT AVG(value) as avgRating, COUNT(*) as totalRatings FROM ratings WHERE doc_id = ?', 
            [req.params.id]
        );

        await pool.execute('UPDATE documents SET views = views + 1 WHERE id = ?', [req.params.id]);

        return res.json({
            ...docs[0],
            avgRating: parseFloat(ratingStats.avgRating) || 0,
            totalRatings: ratingStats.totalRatings || 0
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 8. API Gửi đánh giá sao (Rating) mới hoặc cập nhật lại đánh giá cũ
app.post('/api/ratings', async (req, res) => {
    const { user_id, doc_id, value } = req.body;
    if (!user_id || !doc_id || !value) return res.status(400).json({ error: "Thiếu thông tin!" });

    try {
        await pool.execute(
            `INSERT INTO ratings (user_id, doc_id, value) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = ?`,
            [user_id, doc_id, value, value]
        );
        return res.json({ success: true, message: "Đánh giá tài liệu thành công!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 9. API Lấy lịch sử đọc của riêng từng User
app.get('/api/users/:id/history', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT h.created_at, d.title, d.author, d.subject 
             FROM read_history h
             JOIN documents d ON h.doc_id = d.id
             WHERE h.user_id = ?
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
        const [[usersCount]] = await pool.execute("SELECT COUNT(*) as total FROM users");
        const [[docsCount]] = await pool.execute("SELECT COUNT(*) as total FROM documents");
        const [[pendingCount]] = await pool.execute("SELECT COUNT(*) as total FROM documents WHERE status = 'PENDING'");
        const [[commentsCount]] = await pool.execute("SELECT COUNT(*) as total FROM comments");

        return res.json({
            users: usersCount.total,
            documents: docsCount.total,
            pending: pendingCount.total,
            comments: commentsCount.total
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 11. API Lấy danh sách người dùng cho Admin quản lý
app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, full_name, email, role, enabled, school FROM users');
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 12. API Khóa / Mở khóa tài khoản người dùng
app.put('/api/admin/users/:id/toggle', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT enabled FROM users WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy người dùng!" });
        
        const newStatus = rows[0].enabled ? 0 : 1;
        await pool.execute('UPDATE users SET enabled = ? WHERE id = ?', [newStatus, req.params.id]);
        return res.json({ message: "Cập nhật trạng thái tài khoản thành công!", enabled: newStatus });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 13. API Xóa tài liệu vi phạm nội dung
app.delete('/api/admin/documents/:id', async (req, res) => {
    try {
        await pool.execute('DELETE FROM documents WHERE id = ?', [req.params.id]);
        return res.json({ message: "Đã xóa tài liệu khỏi hệ thống hoàn toàn!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// PHẦN 3: HỆ THỐNG API CHAT TRỰC TUYẾN
// =========================================================================

// 14. API Lấy lịch sử đoạn chat (Giới hạn 50 tin nhắn sắp xếp từ cũ đến mới)
app.get('/api/chat', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM (SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 50) AS sub ORDER BY created_at ASC'
        );
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 15. API Gửi tin nhắn mới + Tích hợp Bot AI trả lời tự động (Đã đồng bộ hóa lưu sender_id)
app.post('/api/chat', async (req, res) => {
    const { sender_id, sender_name, message } = req.body;

    if (!sender_name || !message || !message.trim()) {
        return res.status(400).json({ error: "Nội dung tin nhắn không được để trống!" });
    }

    try {
        // 1. Lưu tin nhắn của NGƯỜI DÙNG vào database (Có lưu sender_id)
        await pool.execute(
            'INSERT INTO chat_messages (sender_id, sender_name, message) VALUES (?, ?, ?)',
            [sender_id || null, sender_name, message.trim()]
        );

        // 2. Kịch bản phân tích từ khóa xử lý tin nhắn của Bot AI
        const msgLower = message.toLowerCase().trim();
        let botReply = "Xin chào! Mình là trợ lý ảo DocShare 🤖. Hiện tại mình chưa hiểu rõ câu hỏi của bạn. Bạn có thể hỏi về 'tìm tài liệu', 'đăng ký tài khoản', hoặc cách 'tải lên tài liệu' nhé!";

        if (msgLower.includes("chào") || msgLower.includes("hello") || msgLower.includes("hi")) {
            botReply = "Xin chào bạn! Chúc bạn một ngày tốt lành. Mình có thể hỗ trợ gì cho bạn trên hệ thống DocShare hôm nay?";
        } 
        else if (msgLower.includes("tài liệu") || msgLower.includes("tìm") || msgLower.includes("bộ lọc")) {
            botReply = "Để tìm tài liệu, bạn hãy nhập từ khóa vào thanh tìm kiếm ở đầu trang, sau đó có thể chọn Bộ lọc theo từng Khoa để thu hẹp kết quả nhé!";
        } 
        else if (msgLower.includes("tải lên") || msgLower.includes("upload") || msgLower.includes("đăng tài liệu")) {
            botReply = "Để tải lên tài liệu, bạn cần Đăng nhập trước. Sau đó nhấn vào mục 'Tải lên', điền đầy đủ thông tin và bấm nút Gửi.";
        } 
        else if (msgLower.includes("đăng ký") || msgLower.includes("tài khoản") || msgLower.includes("tạo nick")) {
            botReply = "Bạn có thể dễ dàng đăng ký tài khoản bằng cách chọn mục 'Đăng ký', nhập Tên, Email và Mật khẩu.";
        } 
        else if (msgLower.includes("lỗi") || msgLower.includes("không tải được") || msgLower.includes("sập")) {
            botReply = "Ui, xin lỗi bạn vì trải nghiệm chưa tốt này! Bạn hãy thử F5 xem sao. Nếu vẫn lỗi, hãy liên hệ với Admin qua email: admin@docshare.com nhé.";
        } 
        else if (msgLower.includes("cảm ơn") || msgLower.includes("thank")) {
            botReply = "Dạ không có gì ạ! Rất vui được hỗ trợ bạn. Chúc bạn học tập thật tốt cùng DocShare 📚!";
        }

        // Tạo hiệu ứng delay 1 giây rồi Bot AI tự động ghi nhận câu trả lời vào DB
        setTimeout(async () => {
            try {
                await pool.execute(
                    'INSERT INTO chat_messages (sender_id, sender_name, message) VALUES (?, ?, ?)',
                    [null, '🤖Bot', botReply] // Bot mang sender_id là null
                );
                console.log("🤖 Bot đã trả lời tự động.");
            } catch (err) {
                console.error("Lỗi lưu tin nhắn của Bot:", err);
            }
        }, 1000);

        return res.json({ success: true, message: "Tin nhắn đã được ghi nhận!" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend MySQL đang chạy ổn định tại port ${PORT}`));