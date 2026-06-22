
import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Upload, History, Shield, User, LogOut, Search, Filter, BarChart2 } from 'lucide-react';

export default function App() {
  // =========================================================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATES)
  // =========================================================================
  const [currentPage, setCurrentPage] = useState('library'); 
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  
  const [authMode, setAuthMode] = useState('login');
  const [formAuth, setFormAuth] = useState({ name: '', email: '', password: '' });
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [faculty, setFaculty] = useState('Tất cả khoa');
  const [uploadForm, setUploadForm] = useState({ title: '', author: '', faculty: 'Công nghệ thông tin', major: 'Kỹ thuật phần mềm', subject: '' });
  const [stats, setStats] = useState({ users: 0, documents: 0, pending: 0, comments: 0 });

  // Trạng thái cho Bóng Chat Hỗ Trợ
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');

  // Trạng thái cho Popup Chi Tiết Tài Liệu (Bản gốc 2 cột)
  const [selectedDoc, setSelectedDoc] = useState(null); 
  const [comments, setComments] = useState([]);          
  const [commentInput, setCommentInput] = useState('');  
  const [userRating, setUserRating] = useState(5);       
  const [historyList, setHistoryList] = useState([]);    

  // =========================================================================
  // 2. HIỆU ỨNG TỰ ĐỘNG GỌI API (USEEFFECTS)
  // =========================================================================
  
  // Tải danh sách tài liệu thư viện và số liệu dashboard admin
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:5000/api/documents?search=${search}&faculty=${faculty}`);
        if (res.ok) {
          const data = await res.json();
          setDocuments(Array.isArray(data) ? data : []);
        }
      } catch { console.log("Lỗi tải tài liệu:"); }
    };

    const fetchStats = async () => {
      try {
        const res = await fetch('http://127.0.0.1:5000/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch { console.log("Lỗi tải thống kê:"); }
    };

    fetchDocuments();
    if (currentPage === 'admin') {
      fetchStats();
    }
  }, [search, faculty, currentPage]);

  // Tải tin nhắn chat hỗ trợ trực tuyến công cộng
  const fetchChatMessages = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/chat');
      if (res.ok) {
        const data = await res.json();
        setChatMessages(Array.isArray(data) ? data : []);
      }
    } catch (err) { 
      console.log("Lỗi tải tin nhắn chat:", err); 
    }
  }, []);

  // Polling cập nhật tự động bóng chat hỗ trợ 3 giây một lần
  useEffect(() => {
    if (!isChatOpen) return;
    
    // Tạo một hàm bọc để bắt lỗi Promise, giúp IDE không báo đỏ (Floating Promise)
    const loadMessages = () => {
      fetchChatMessages().catch(err => console.error("Lỗi polling chat:", err));
    };

    loadMessages(); // Gọi lần đầu ngay khi mở chat
    const interval = setInterval(loadMessages, 3000); // Lặp lại sau mỗi 3s
    return () => clearInterval(interval);
  }, [isChatOpen, fetchChatMessages]);

  // Tải lịch sử đọc riêng của từng tài khoản khi click tab Lịch sử
  useEffect(() => {
    if (currentPage === 'history' && user) {
      fetch(`http://127.0.0.1:5000/api/users/${user.id}/history`)
        .then(res => res.json())
        .then(data => setHistoryList(data))
        .catch(() => console.log("Lỗi tải lịch sử"));
    }
  }, [currentPage, user]);


  // =========================================================================
  // 3. LOGIC HÀM XỬ LÝ SỰ KIỆN (HANDLERS)
  // =========================================================================
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://127.0.0.1:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formAuth.email, password: formAuth.password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        alert(data.message || "Đăng nhập thành công!"); 
        setCurrentPage('library');
      } else { 
        alert(data.message || "Đăng nhập thất bại!"); 
      }
    } catch { alert("Không thể kết nối đến máy chủ Backend!"); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://127.0.0.1:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: formAuth.name, email: formAuth.email, password: formAuth.password })
      });
      const data = await res.json();
      alert(data.message);
      if (res.ok) setAuthMode('login');
    } catch { alert("Không thể kết nối đến Backend!"); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!user) return alert("Bạn cần đăng nhập để upload!");
    try {
      const res = await fetch('http://127.0.0.1:5000/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...uploadForm, uploaded_by: user.id })
      });
      if (res.ok) {
        alert("Tải lên tài liệu thành công!");
        setCurrentPage('library');
      }
    } catch { alert("Không thể kết nối đến Backend!"); }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!newMsg.trim()) return;

    const payload = {
      sender_id: user ? user.id : null,
      sender_name: user ? (user.full_name || 'Thành viên') : 'Khách vãng lai',
      message: newMsg.trim()
    };

    try {
      const res = await fetch('http://127.0.0.1:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setNewMsg('');
        fetchChatMessages();
        setTimeout(fetchChatMessages, 1200); // Lấy phản hồi của Bot AI chạy trễ ngầm
      } else {
        const errorData = await res.json();
        alert("Lỗi: " + errorData.error);
      }
    } catch { alert("Không thể kết nối đến máy chủ chat!"); }
  };

  // Mở Popup 2 cột nguyên bản (Không chuyển trang details)
  const handleViewDetails = async (docId) => {
    try {
      const docRes = await fetch(`http://127.0.0.1:5000/api/documents/${docId}`);
      if (docRes.ok) {
        const docData = await docRes.json();
        setSelectedDoc(docData);
      }
      const commentRes = await fetch(`http://127.0.0.1:5000/api/comments/${docId}`);
      if (commentRes.ok) {
        const commentData = await commentRes.json();
        setComments(commentData);
      }
    } catch { console.log("Lỗi tải chi tiết tài liệu"); }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!user) return alert("Vui lòng đăng nhập để bình luận!");
    if (!commentInput.trim()) return;

    try {
      const res = await fetch('http://127.0.0.1:5000/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, doc_id: selectedDoc.id, content: commentInput.trim() })
      });
      if (res.ok) {
        setCommentInput('');
        const commentRes = await fetch(`http://127.0.0.1:5000/api/comments/${selectedDoc.id}`);
        const commentData = await commentRes.json();
        setComments(commentData);
      }
    } catch { alert("Không gửi được bình luận!"); }
  };

  const handleSendRating = async (stars) => {
    if (!user) return alert("Vui lòng đăng nhập để đánh giá!");
    try {
      const res = await fetch('http://127.0.0.1:5000/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, doc_id: selectedDoc.id, value: stars })
      });
      if (res.ok) {
        alert("Cảm ơn bạn đã đánh giá!");
        const docRes = await fetch(`http://127.0.0.1:5000/api/documents/${selectedDoc.id}`);
        const docData = await docRes.json();
        setSelectedDoc(docData);
      }
    } catch { console.log("Lỗi đánh giá!"); }
  };

  // =========================================================================
  // 4. KHỐI RENDER GIAO DIỆN CHÍNH (JSX)
  // =========================================================================
  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div style={styles.logoArea} onClick={() => setCurrentPage('library')}>
          <div style={styles.logoIcon}>📚</div>
          <div>
            <h1 style={styles.logoText}>DocShare Pro</h1>
            <p style={styles.logoSub}>Kho tài liệu học tập</p>
          </div>
        </div>
        
        <nav style={styles.nav}>
          <button style={currentPage === 'library' ? styles.navActive : styles.navBtn} onClick={() => setCurrentPage('library')}><BookOpen size={18}/> Tài liệu</button>
          <button style={currentPage === 'upload' ? styles.navActive : styles.navBtn} onClick={() => setCurrentPage('upload')}><Upload size={18}/> Upload</button>
          <button style={currentPage === 'history' ? styles.navActive : styles.navBtn} onClick={() => setCurrentPage('history')}><History size={18}/> Lịch sử</button>
          {user && user.role === 'ADMIN' && (
            <button style={currentPage === 'admin' ? styles.navActive : styles.navBtn} onClick={() => setCurrentPage('admin')}><Shield size={18}/> Admin</button>
          )}
        </nav>

        <div style={styles.authArea}>
          {user ? (
            <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
              <span style={styles.userBadge}><User size={14}/> {user.full_name || 'User'} ({user.role || 'USER'})</span>
              <button style={styles.logoutBtn} onClick={() => { setUser(null); localStorage.removeItem('user'); }}><LogOut size={16}/> Thoát</button>
            </div>
          ) : (
            <button style={styles.loginPageBtn} onClick={() => setCurrentPage('auth')}>Đăng nhập / Đăng ký</button>
          )}
        </div>
      </header>

      <main style={styles.mainContent}>
        {/* --- TRANG THƯ VIỆN TÀI LIỆU --- */}
        {currentPage === 'library' && (
          <div>
            <h2 style={styles.pageTitle}>Thư viện tài liệu</h2>
            <p style={styles.pageSubTitle}>Tìm kiếm thông minh theo tên, tác giả, khoa, ngành, môn học...</p>
            
            <div style={styles.filterBar}>
              <div style={styles.searchBox}>
                <Search size={18} style={{color:'#6b7280'}}/>
                <input type="text" placeholder="Tên tài liệu, tác giả, môn học..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.inputSearch}/>
              </div>
              <div style={styles.selectBox}>
                <Filter size={18} style={{color:'#6b7280'}}/>
<select value={faculty} onChange={(e) => setFaculty(e.target.value)} style={styles.select}>
  <option value="Tất cả khoa">Tất cả khoa</option>
  <option value="Công nghệ thông tin">Công nghệ thông tin</option>
  <option value="Kinh tế">Kinh tế đối ngoại</option>
  <option value="Điện - Điện tử">Điện - Điện tử</option> {/* Thêm dòng này */}
</select>
              </div>
            </div>

            <div style={styles.grid}>
              {documents && documents.map((doc) => (
                <div key={doc.id} style={{ ...styles.card, cursor: 'pointer' }} onClick={() => handleViewDetails(doc.id)}>
                  <div style={styles.cardThumbnail}>
                    {doc.subject ? String(doc.subject).toUpperCase() : 'DOC'}
                  </div>
                  <div style={styles.cardBody}>
                    <h4 style={styles.cardTitle}>{doc.title}</h4>
                    <p style={styles.cardAuthor}>Tác giả: {doc.author}</p>
                    <p style={styles.cardMeta}>{doc.faculty} • {doc.major}</p>
                    <div style={styles.cardStats}>
                      <span>👁️ {doc.views || 0} lượt xem</span>
                      <span>📥 {doc.downloads || 0} tải xuống</span>
                    </div>
                  </div>
                </div>
              ))}
              {(!documents || documents.length === 0) && (
                <div style={styles.emptyState}>Không tìm thấy tài liệu nào phù hợp hoặc chưa kết nối cơ sở dữ liệu.</div>
              )}
            </div>
          </div>
        )}

        {/* --- TRANG TẢI LÊN TÀI LIỆU --- */}
        {currentPage === 'upload' && (
          <div style={styles.formContainer}>
            <h2 style={styles.pageTitle}>Upload tài liệu</h2>
            <form onSubmit={handleUpload} style={styles.form}>
              <input type="text" placeholder="Tên tài liệu học tập" required value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} style={styles.formInput}/>
              <input type="text" placeholder="Tác giả / Giảng viên biên soạn" required value={uploadForm.author} onChange={e => setUploadForm({...uploadForm, author: e.target.value})} style={styles.formInput}/>
              <input type="text" placeholder="Môn học (Ví dụ: Lập trình C++)" required value={uploadForm.subject} onChange={e => setUploadForm({...uploadForm, subject: e.target.value})} style={styles.formInput}/>
              <button type="submit" style={styles.submitBtn}>Tải lên hệ thống</button>
            </form>
          </div>
        )}

        {/* --- TRANG LỊCH SỬ ĐỌC --- */}
        {currentPage === 'history' && (
          <div>
            <h2 style={styles.pageTitle}>Lịch sử hoạt động của tôi</h2>
            <p style={styles.pageSubTitle}>Danh sách các tài liệu bạn đã xem học tập gần đây trên hệ thống.</p>
            {historyList.length > 0 ? (
              <div style={styles.grid}>
                {historyList.map((doc, idx) => (
                  <div key={idx} style={styles.card}>
                    <div style={styles.cardBody}>
                      <h4 style={styles.cardTitle}>{doc.title}</h4>
                      <p style={styles.cardAuthor}>Tác giả: {doc.author}</p>
                      <p style={styles.cardMeta}>Môn học: {doc.subject}</p>
                      <div style={styles.cardStats}>
                        <span>Đọc lúc: {new Date(doc.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>Chưa phát sinh hoạt động đọc nào trên tài khoản này.</div>
            )}
          </div>
        )}

        {/* --- TRANG ADMIN DASHBOARD --- */}
        {currentPage === 'admin' && (
          <div>
            <h2 style={styles.pageTitle}>
              <BarChart2 size={28} style={{ marginRight: '10px', verticalAlign: 'middle', color: '#eab308' }} />
              Admin Dashboard Tổng quan
            </h2>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}><h3 style={{color:'#38bdf8', fontSize: '36px', margin: '0 0 5px 0'}}>{stats.users}</h3><p>Người dùng hệ thống</p></div>
              <div style={styles.statCard}><h3 style={{color:'#eab308', fontSize: '36px', margin: '0 0 5px 0'}}>{stats.documents}</h3><p>Kho tài liệu hiện tại</p></div>
              <div style={styles.statCard}><h3 style={{color:'#a855f7', fontSize: '36px', margin: '0 0 5px 0'}}>{stats.pending}</h3><p>Tài liệu chờ duyệt</p></div>
              <div style={styles.statCard}><h3 style={{color:'#f43f5e', fontSize: '36px', margin: '0 0 5px 0'}}>{stats.comments}</h3><p>Bình luận</p></div>
            </div>
          </div>
        )}

        {/* --- TRANG ĐĂNG NHẬP / ĐĂNG KÝ --- */}
        {currentPage === 'auth' && (
          <div style={styles.formContainer}>
            <h2 style={styles.pageTitle}>{authMode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}</h2>
            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} style={styles.form}>
              {authMode === 'register' && (
                <input type="text" placeholder="Họ tên của bạn" required value={formAuth.name} onChange={e => setFormAuth({...formAuth, name: e.target.value})} style={styles.formInput}/>
              )}
              <input type="email" placeholder="Email đăng nhập" required value={formAuth.email} onChange={e => setFormAuth({...formAuth, email: e.target.value})} style={styles.formInput}/>
              <input type="password" placeholder="Mật khẩu" required value={formAuth.password} onChange={e => setFormAuth({...formAuth, password: e.target.value})} style={styles.formInput}/>
              <button type="submit" style={styles.submitBtn}>{authMode === 'login' ? 'Đăng nhập vào hệ thống' : 'Tạo tài khoản'}</button>
              <p style={{textAlign:'center', marginTop:'10px', cursor:'pointer', color:'#eab308'}} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
              </p>
            </form>
          </div>
        )}
      </main>

      {/* --- CẤU TRÚC POPUP XEM CHI TIẾT TÀI LIỆU BẢN GỐC 2 CỘT --- */}
      {selectedDoc && (
        <div style={extendedStyles.modalOverlay}>
          <div style={extendedStyles.modalBox}>
            <button style={extendedStyles.closeModalBtn} onClick={() => setSelectedDoc(null)}>✖ Đóng</button>
            
            <div style={extendedStyles.modalLayout}>
              {/* CỘT TRÁI: Đọc trực tuyến PDF & Đánh giá */}
              <div style={extendedStyles.pdfColumn}>
                <h2 style={{margin:'0 0 5px 0', color:'#fff', fontSize: '24px'}}>{selectedDoc.title}</h2>
                <p style={{color:'#94a3b8', fontSize:'14px', marginBottom: '15px'}}>
                  Môn: {selectedDoc.subject} | Tác giả: {selectedDoc.author}
                </p>
                
                {/* Giả lập Đọc trực tuyến PDF */}
                <div style={extendedStyles.pdfViewerSimulate}>
                  <div style={{textAlign:'center', color:'#64748b'}}>
                    <span style={{fontSize: '40px'}}>📄</span>
                    <p style={{margin: '10px 0 0 0', fontSize: '14px'}}>Hệ thống đang hiển thị Preview trực tuyến vài trang đầu...</p>
                    <span style={{fontSize:'12px', color:'#eab308', display: 'block', marginTop: '5px'}}>⚠️ Watermark: Đã đóng dấu bản quyền tài liệu của trường</span>
                  </div>
                </div>
                
                {/* Thống kê & Đánh giá sao */}
                <div style={{marginTop:'15px', display:'flex', justifyContent: 'space-between', alignItems:'center', backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px'}}>
                  <div style={{fontSize: '13px', color: '#94a3b8', display: 'flex', gap: '15px'}}>
                    <span>👁️ {selectedDoc.views || 0} xem</span>
                    <span>📥 {selectedDoc.downloads || 0} tải</span>
                    <span style={{color:'#eab308', fontWeight:'bold'}}>⭐ {Number(selectedDoc.avgRating || 0).toFixed(1)}/5 ({selectedDoc.totalRatings || 0} vote)</span>
                  </div>
                  
                  <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                    <span style={{fontSize:'13px', color: '#fff'}}>Đánh giá:</span>
                    <select value={userRating} onChange={(e) => setUserRating(Number(e.target.value))} style={{backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', outline: 'none'}}>
                      <option value={5}>5 ⭐</option>
                      <option value={4}>4 ⭐</option>
                      <option value={3}>3 ⭐</option>
                      <option value={2}>2 ⭐</option>
                      <option value={1}>1 ⭐</option>
                    </select>
                    <button onClick={() => handleSendRating(userRating)} style={{backgroundColor: '#eab308', color: '#0f172a', border: 'none', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer'}}>Gửi</button>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: Bình luận thảo luận học tập */}
              <div style={extendedStyles.commentColumn}>
                <h4 style={{margin:'0 0 12px 0', borderBottom:'1px solid #1e293b', paddingBottom:'8px', color: '#fff'}}>💬 Thảo luận lớp học ({comments.length})</h4>
                
                <div style={extendedStyles.commentList}>
                  {comments.map((cmt, idx) => (
                    <div key={idx} style={extendedStyles.commentItem}>
                      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b'}}>
                        <strong style={{color: '#38bdf8'}}>{cmt.full_name}</strong>
                        <span>{new Date(cmt.created_at).toLocaleDateString()}</span>
                      </div>
                      <p style={{margin:'5px 0 0 0', fontSize:'13px', color:'#f3f4f6', lineHeight: '1.4'}}>{cmt.content}</p>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p style={{color:'#64748b', textAlign:'center', fontSize:'13px', marginTop: '40px'}}>Chưa có thảo luận nào cho tài liệu này.</p>
                  )}
                </div>

                <form onSubmit={handlePostComment} style={{display:'flex', gap:'6px', marginTop:'10px'}}>
                  <input type="text" placeholder="Hỏi bài hoặc viết nhận xét..." value={commentInput} onChange={e => setCommentInput(e.target.value)} style={extendedStyles.commentInput}/>
                  <button type="submit" style={extendedStyles.commentSubmitBtn}>Gửi</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- BÓNG CHAT HỖ TRỢ TRỰC TUYẾN TOÀN CỤC --- */}
      <div style={chatStyles.chatWidgetContainer}>
        <button style={chatStyles.chatButton} onClick={() => setIsChatOpen(!isChatOpen)}>
          {isChatOpen ? '✖' : '💬 Hỗ trợ'}
        </button>

        {isChatOpen && (
          <div style={chatStyles.chatBox}>
            <div style={chatStyles.chatHeader}>
              <h4 style={{margin: '0 0 2px 0', color: '#fff', fontSize: '16px'}}>💬 DocShare Hỗ trợ trực tuyến</h4>
              <p style={{fontSize:'11px', color:'#94a3b8', margin:0}}>Chúng tôi thường trả lời sau vài phút</p>
            </div>
            
            <div style={chatStyles.chatBody}>
              {chatMessages.map((msg) => {
                const isBot = msg.sender_name === 'AI_Bot';
                const isSystem = msg.sender_name === 'SYSTEM_ADMIN';
                const isMe = user ? (msg.sender_id === user.id || msg.sender_name === (user.full_name || user.name)) : false;
                
                return (
                  <div key={msg.id || msg.created_at} style={{
                    ...chatStyles.messageRow,
                    justifyContent: isSystem ? 'center' : (isMe ? 'flex-end' : 'flex-start'),
                    alignItems: 'flex-end',
                    display: 'flex'
                  }}>
                    {isBot && <span style={{ fontSize: '20px', marginRight: '6px', marginBottom: '4px' }}>🤖</span>}

                    <div style={{
                      ...chatStyles.messageBubble,
                      backgroundColor: isSystem ? '#334155' : (isMe ? '#eab308' : isBot ? '#e2e8f0' : '#1e293b'),
                      color: isSystem ? '#f3f4f6' : (isMe || isBot ? '#0f172a' : '#f3f4f6'),
                      borderRadius: isSystem ? '8px' : (isMe ? '12px 12px 0 12px' : '12px 12px 12px 0'),
                      maxWidth: isSystem ? '90%' : '75%',
                      fontSize: isSystem ? '12px' : '14px',
                      fontStyle: isSystem ? 'italic' : 'normal'
                    }}>
                      {!isSystem && (
                        <p style={{fontSize:'10px', margin:'0 0 4px 0', opacity: 0.7, fontWeight: 'bold'}}>
                          {msg.sender_name}
                        </p>
                      )}
                      <p style={{margin:0, fontWeight: '500'}}>{msg.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendChat} style={chatStyles.chatFooter}>
              <input type="text" placeholder="Nhập câu hỏi của bạn..." value={newMsg} onChange={(e) => setNewMsg(e.target.value)} style={chatStyles.chatInput}/>
              <button type="submit" style={chatStyles.sendBtn}>Gửi</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 5. CẤU HÌNH CSS STYLESHEETS ENGINE
// =========================================================================
const styles = {
  appContainer: { backgroundColor: '#090d16', color: '#f3f4f6', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' },
  logoArea: { display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' },
  logoIcon: { fontSize: '28px' },
  logoText: { fontSize: '20px', fontWeight: 'bold', color: '#fff', margin: 0 },
  logoSub: { fontSize: '12px', color: '#94a3b8', margin: 0 },
  nav: { display: 'flex', gap: '10px' },
  navBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#94a3b8', padding: '8px 16px', cursor: 'pointer', borderRadius: '6px', fontWeight: '500' },
  navActive: { display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', border: 'none', color: '#eab308', padding: '8px 16px', cursor: 'pointer', borderRadius: '6px', fontWeight: '600' },
  authArea: {},
  loginPageBtn: { backgroundColor: '#eab308', color: '#0f172a', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' },
  userBadge: { color: '#38bdf8', fontSize: '14px', fontWeight: '500', display:'flex', alignItems:'center', gap:'5px' },
  logoutBtn: { background: 'none', border: '1px solid #ef4444', color: '#ef4444', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', display:'flex', alignItems:'center', gap:'5px' },
  mainContent: { padding: '40px' },
  pageTitle: { fontSize: '32px', fontWeight: 'bold', margin: '0 0 5px 0' },
  pageSubTitle: { color: '#94a3b8', marginBottom: '30px' },
  filterBar: { display: 'flex', gap: '20px', backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px', border: '1px solid #1e293b', marginBottom: '30px' },
  searchBox: { flex: 2, display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '6px' },
  inputSearch: { background: 'none', border: 'none', color: '#fff', outline: 'none', width: '100%' },
  selectBox: { flex: 1, display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '6px' },
  select: { background: 'none', border: 'none', color: '#94a3b8', outline: 'none', width: '100%', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '25px' },
  card: { backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', overflow: 'hidden', transition: '0.3s' },
  cardThumbnail: { height: '140px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold', color: '#eab308', letterSpacing: '1px' },
  cardBody: { padding: '20px' },
  cardTitle: { fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#fff' },
  cardAuthor: { fontSize: '14px', color: '#94a3b8', margin: '0 0 4px 0' },
  cardMeta: { fontSize: '12px', color: '#64748b', margin: '0 0 15px 0' },
  cardStats: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: '12px' },
  formContainer: { maxWidth: '500px', margin: '40px auto', backgroundColor: '#0f172a', padding: '30px', borderRadius: '12px', border: '1px solid #1e293b' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  formInput: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '12px', borderRadius: '6px', outline: 'none' },
  submitBtn: { backgroundColor: '#eab308', color: '#0f172a', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '16px' },
  emptyState: { textAlign: 'center', padding: '40px', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px dashed #334155' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '20px' },
  statCard: { backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '25px', borderRadius: '12px', textAlign: 'center' }
};

const chatStyles = {
  chatWidgetContainer: { position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999, fontFamily: 'system-ui, sans-serif' },
  chatButton: { backgroundColor: '#eab308', color: '#0f172a', border: 'none', width: '120px', height: '45px', borderRadius: '25px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chatBox: { position: 'absolute', bottom: '60px', right: '0', width: '340px', height: '430px', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  chatBody: { flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#090d16' },
  messageRow: { display: 'flex', width: '100%' },
  messageBubble: { padding: '10px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  chatFooter: { display: 'flex', padding: '10px', backgroundColor: '#1e293b', borderTop: '1px solid #334155' },
  chatInput: { flex: 1, backgroundColor: '#090d16', border: '1px solid #334155', color: '#fff', padding: '8px 12px', borderRadius: '6px', outline: 'none', fontSize: '14px' },
  sendBtn: { backgroundColor: '#eab308', color: '#0f172a', border: 'none', marginLeft: '8px', padding: '0 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }
};

const extendedStyles = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 8, 16, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)' },
  modalBox: { width: '920px', height: '560px', backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', padding: '25px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)' },
  closeModalBtn: { position: 'absolute', top: '15px', right: '15px', backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  modalLayout: { display: 'flex', gap: '20px', flex: 1, marginTop: '20px', overflow: 'hidden' },
  pdfColumn: { flex: 1.6, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  pdfViewerSimulate: { flex: 1, backgroundColor: '#090d16', border: '1px dashed #334155', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  commentColumn: { flex: 1, backgroundColor: '#090d16', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', border: '1px solid #1e293b' },
  commentList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' },
  commentItem: { backgroundColor: '#1e293b', padding: '10px 12px', borderRadius: '8px', border: '1px solid #23324d' },
  commentInput: { flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '10px', borderRadius: '6px', outline: 'none', fontSize: '13px' },
  commentSubmitBtn: { backgroundColor: '#eab308', color: '#0f172a', border: 'none', padding: '0 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }
};
