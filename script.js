// ===== Firebase 配置 =====
const firebaseConfig = {
    apiKey: "AIzaSyBWUr-qFjDuAbRn2ueCOA24Bx5vHhGwCzs",
    authDomain: "mastering-science.firebaseapp.com",
    projectId: "mastering-science",
    storageBucket: "mastering-science.firebasestorage.app",
    messagingSenderId: "969510026630",
    appId: "1:969510026630:web:5c0ff3ffc7b3bdc04c8007"
};

// ===== 初始化 Firebase =====
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// ===== 顯示狀態 =====
function setStatus(text, color) {
    const el = document.getElementById('firebaseStatus');
    if (el) {
        el.textContent = text;
        el.style.color = color || '#2e0f5a';
    }
}

function showResult(text, color) {
    const el = document.getElementById('result');
    if (el) {
        el.textContent = text;
        el.style.color = color || '#2e0f5a';
    }
}

// ===== Auth 錯誤訊息 =====
function getAuthErrorMessage(e) {
    const map = {
        'auth/user-not-found': '❌ 帳戶不存在！請確認學號是否正確',
        'auth/wrong-password': '❌ 密碼錯誤！請確認密碼',
        'auth/invalid-credential': '❌ 帳戶異常，請聯絡老師',
        'auth/too-many-requests': '❌ 登入嘗試過多，請稍後再試',
        'auth/network-request-failed': '❌ 網路連線失敗，請檢查網路',
        'auth/user-disabled': '❌ 帳戶已被停用，請聯絡老師',
        'auth/email-already-in-use': '⚠️ 此學號已被使用'
    };
    return map[e.code] || '❌ ' + e.message;
}

// ===== 登入函數 =====
async function handleLogin(userId, password) {
    showResult('⏳ 登入中...', '#f59e0b');
    
    try {
        const email = userId + '@mastering-science.com';
        
        // Step 1: Auth 登入
        await auth.signInWithEmailAndPassword(email, password);
        showResult('✅ Auth 登入成功！讀取資料中...', '#10b981');
        
        // Step 2: 讀取 Firestore
        const doc = await db.collection('users').doc(userId).get();
        
        if (doc.exists) {
            currentUser = doc.data();
            currentUser.userId = userId;
            
            // 顯示成功訊息
            const role = currentUser.isTeacher ? '🧑‍🏫 老師' : '👨‍🎓 學生';
            showResult(`✅ 登入成功！\n👤 ${currentUser.name} (${role})\n📚 班級：${currentUser.className}`, '#10b981');
            
            // 進入主畫面
            enterMainApp(currentUser);
            
        } else {
            // Auth 成功但 Firestore 沒資料 → 嘗試讀 localStorage
            showResult('⚠️ Firestore 無資料，檢查本地儲存...', '#f59e0b');
            
            const localUser = findUserInLocal(userId);
            if (localUser) {
                currentUser = localUser;
                const role = currentUser.isTeacher ? '🧑‍🏫 老師' : '👨‍🎓 學生';
                showResult(`✅ 從本地找到用戶！\n👤 ${currentUser.name} (${role})`, '#10b981');
                enterMainApp(currentUser);
            } else {
                showResult('❌ Firestore 和本地都找不到此用戶', '#dc2626');
            }
        }
        
    } catch(e) {
        console.error('登入錯誤:', e);
        showResult(getAuthErrorMessage(e), '#dc2626');
    }
}

// ===== 從 localStorage 找用戶 =====
function findUserInLocal(userId) {
    const raw = localStorage.getItem('ms_chem_users');
    if (raw) {
        try {
            const db = JSON.parse(raw);
            return db.users.find(u => u.userId === userId);
        } catch(e) {}
    }
    return null;
}

// ===== 進入主畫面 =====
function enterMainApp(user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    
    // 更新用戶標籤
    const role = user.isTeacher ? '🧑‍🏫 老師' : '👨‍🎓 學生';
    document.getElementById('userLabel').textContent = `👋 ${user.name} (${user.className}) ${role}`;
    
    // 顯示/隱藏老師分頁
    const teacherTab = document.getElementById('teacherTab');
    if (user.isTeacher) {
        teacherTab.style.display = 'inline-block';
    } else {
        teacherTab.style.display = 'none';
    }
    
    // 預設顯示練習頁
    switchTab('practice');
}

// ===== 切換分頁 =====
function switchTab(tabId) {
    // 隱藏所有 panel
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    
    // 顯示目標 panel
    const target = document.getElementById(tabId + 'Panel');
    if (target) target.classList.add('active');
    
    // 更新 tab 按鈕狀態
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');
}

// ===== 登出 =====
function logout() {
    if (confirm('確定要登出嗎？')) {
        auth.signOut();
        currentUser = null;
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('mainScreen').style.display = 'none';
        document.getElementById('password').value = '';
        showResult('已登出', '#999');
    }
}

// ===== 監聽 Auth 狀態 =====
auth.onAuthStateChanged(user => {
    if (user) {
        setStatus(`✅ Auth 已連線: ${user.email}`, '#10b981');
        console.log('✅ Auth 用戶:', user.email);
    } else {
        setStatus('⏳ 等待登入...', '#999');
    }
});

// ===== Firebase 初始化完成 =====
setStatus('✅ Firebase 已初始化', '#10b981');

// ===== 事件綁定 =====

// 登入按鈕
document.getElementById('loginBtn').addEventListener('click', () => {
    const userId = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value.trim();
    if (userId && password) {
        handleLogin(userId, password);
    } else {
        showResult('⚠️ 請輸入學號和密碼', '#f59e0b');
    }
});

// Enter 鍵支援
document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('userId').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

// 手動測試按鈕
document.getElementById('testBtn').addEventListener('click', () => {
    const userId = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!userId || !password) {
        alert('請先輸入學號和密碼');
        return;
    }
    const email = userId + '@mastering-science.com';
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            alert('✅ Auth API 測試成功！\n請看 Console 日誌');
            console.log('✅ Auth 用戶:', auth.currentUser);
        })
        .catch(e => {
            alert('❌ Auth API 測試失敗：\n' + getAuthErrorMessage(e));
            console.error(e);
        });
});

// 分頁切換
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        if (tabId === 'logout') {
            logout();
        } else {
            switchTab(tabId);
        }
    });
});