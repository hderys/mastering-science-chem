// ============================================================
// 【錯誤標示區】如果 Firebase 初始化失敗，請檢查：
// 1. Firebase 專案是否已啟用 Authentication 和 Firestore
// 2. 下方 firebaseConfig 的 apiKey 等資訊是否正確
// 3. 網路是否正常（能否連線到 Google 服務）
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyBWUr-qFjDuAbRn2ueCOA24Bx5vHhGwCzs",
    authDomain: "mastering-science.firebaseapp.com",
    projectId: "mastering-science",
    storageBucket: "mastering-science.firebasestorage.app",
    messagingSenderId: "969510026630",
    appId: "1:969510026630:web:5c0ff3ffc7b3bdc04c8007"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// 【錯誤標示區】如果忘記密碼失敗，請檢查：
// 1. MASTER_RESET_PASSWORD 是否等於 Demo1234（大小寫要完全一致）
// 2. Firestore 中該用戶的 isTeacher 是否為 true
// ============================================================
const MASTER_RESET_PASSWORD = 'Demo1234';

let currentUser = null;
let pendingAdminAction = null;

// ===== 顯示狀態函數 =====
function setStatus(text, color) {
    const el = document.getElementById('firebaseStatus');
    if (el) { el.textContent = text; el.style.color = color || '#2e0f5a'; }
}
function showResult(text, color) {
    const el = document.getElementById('result');
    if (el) { el.textContent = text; el.style.color = color || '#2e0f5a'; }
}
function showForgotResult(text, color) {
    const el = document.getElementById('forgotResult');
    if (el) { el.textContent = text; el.style.color = color || '#2e0f5a'; }
}
function showAdminVerifyResult(text, color) {
    const el = document.getElementById('adminVerifyResult');
    if (el) { el.textContent = text; el.style.color = color || '#2e0f5a'; }
}
function showChangePwdPanelResult(text, color) {
    const el = document.getElementById('changePwdPanelResult');
    if (el) { el.textContent = text; el.style.color = color || '#2e0f5a'; }
}
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

// ============================================================
// 【錯誤標示區】如果 Auth 錯誤訊息顯示不完整，請檢查：
// 1. e.code 是否在 map 中有對應
// 2. 是否出現了新的錯誤碼（可在 Console 查看 e.code）
// ============================================================
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

// ===== localStorage 輔助函數 =====
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
function saveUserToLocal(user) {
    const raw = localStorage.getItem('ms_chem_users');
    let db = raw ? JSON.parse(raw) : { users: [] };
    const idx = db.users.findIndex(u => u.userId === user.userId);
    if (idx >= 0) { db.users[idx] = user; } else { db.users.push(user); }
    localStorage.setItem('ms_chem_users', JSON.stringify(db));
}

// ============================================================
// 【錯誤標示區】如果 loadUser 回傳 null，請檢查：
// 1. Firestore 中是否有該 userId 的文件
// 2. Security Rules 是否允許讀取（allow read if request.auth != null）
// 3. 該文件是否缺少 userId 欄位
// ============================================================
async function loadUser(userId) {
    try {
        const doc = await db.collection('users').doc(userId).get();
        if (doc.exists) {
            const data = doc.data();
            data.userId = userId;
            saveUserToLocal(data);
            return data;
        }
    } catch(e) {
        console.warn('⚠️ Firestore 讀取失敗:', e.message);
    }
    const local = findUserInLocal(userId);
    if (local) return local;
    return null;
}

// ============================================================
// 【錯誤標示區】如果 saveUser 失敗，請檢查：
// 1. Firestore Security Rules 是否允許寫入（allow write if ...）
// 2. user.userId 是否為 undefined 或 null
// 3. 網路是否正常
// ============================================================
async function saveUser(user) {
    try {
        await db.collection('users').doc(user.userId).set(user, { merge: true });
        console.log('✅ Firestore 寫入成功');
    } catch(e) {
        console.warn('⚠️ Firestore 寫入失敗:', e.message);
    }
    saveUserToLocal(user);
}

// ============================================================
// 【錯誤標示區】如果 handleLogin 卡住，請檢查：
// 1. Auth 登入是否成功（email 格式是否為 userId@mastering-science.com）
// 2. loadUser 是否回傳正確資料
// 3. enterMainApp 是否被呼叫
// ============================================================
async function handleLogin(userId, password) {
    showResult('⏳ 登入中...', '#f59e0b');
    try {
        const email = userId + '@mastering-science.com';
        await auth.signInWithEmailAndPassword(email, password);
        showResult('✅ Auth 登入成功！讀取資料中...', '#10b981');
        
        const user = await loadUser(userId);
        if (user) {
            currentUser = user;
            const role = user.isTeacher ? '🧑‍🏫 老師' : '👨‍🎓 學生';
            showResult(`✅ 登入成功！\n👤 ${user.name} (${role})\n📚 班級：${user.className}`, '#10b981');
            enterMainApp(user);
        } else {
            showResult('❌ 找不到用戶資料', '#dc2626');
            await auth.signOut();
        }
    } catch(e) {
        console.error('登入錯誤:', e);
        showResult(getAuthErrorMessage(e), '#dc2626');
    }
}

// ============================================================
// 【錯誤標示區】如果 enterMainApp 卡住，請檢查：
// 1. 所有 panel 的 id 是否正確（practicePanel, myMistakesPanel 等）
// 2. teacherTab 是否被正確顯示或隱藏
// 3. switchTab('practice') 是否正常運作
// ============================================================
function enterMainApp(user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    
    const role = user.isTeacher ? '🧑‍🏫 老師' : '👨‍🎓 學生';
    document.getElementById('userLabel').textContent = `👋 ${user.name} (${user.className}) ${role}`;
    
    const teacherTab = document.getElementById('teacherTab');
    if (user.isTeacher) {
        teacherTab.style.display = 'inline-block';
    } else {
        teacherTab.style.display = 'none';
    }
    
    switchTab('practice');
    if (user.isTeacher) renderTeacherStudentList();
}

// ============================================================
// 【錯誤標示區】如果 switchTab 卡住，請檢查：
// 1. 所有 panel 是否有 class="panel" 和 style="display:none;"
// 2. tabId + 'Panel' 是否對應到正確的 id（例如 changePwd → changePwdPanel）
// 3. 是否有其他 CSS 覆蓋了 display 設定（例如 .panel.active）
// 4. 所有分頁按鈕的 data-tab 屬性是否與 panel id 對應
// ============================================================
function switchTab(tabId) {
    // 1. 隱藏所有面板（移除 class 並強制隱藏）
    document.querySelectorAll('.panel').forEach(function(p) {
        p.classList.remove('active');
        p.style.display = 'none';   // 👈 關鍵修復：強制隱藏
    });

    // 2. 顯示目標面板（加上 class 並強制顯示）
    var target = document.getElementById(tabId + 'Panel');
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';  // 👈 關鍵修復：強制顯示
    } else {
        console.warn('⚠️ 找不到面板:', tabId + 'Panel');
    }

    // 3. 更新分頁按鈕樣式
    document.querySelectorAll('.tab').forEach(function(t) {
        t.classList.remove('active');
    });
    var tabBtn = document.querySelector('.tab[data-tab="' + tabId + '"]');
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
}

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

// ============================================================
// 【錯誤標示區】如果 changePasswordFromPanel 卡住，請檢查：
// 1. 三個密碼輸入框是否都填寫了內容
// 2. 新密碼是否至少 4 個字元
// 3. 目前密碼是否與 currentUser.password 一致（Firestore 中的密碼）
// 4. Auth 更新密碼是否成功（需要先登入 Auth 才能更新）
// 5. 更新後是否正確寫入 Firestore
// ============================================================
async function changePasswordFromPanel() {
    var currentPwd = document.getElementById('changePwdCurrent').value.trim();
    var newPwd = document.getElementById('changePwdNew').value.trim();
    var confirmPwd = document.getElementById('changePwdConfirm').value.trim();
    var resultEl = document.getElementById('changePwdPanelResult');

    // === 檢查 1：是否全部填寫 ===
    if (!currentPwd || !newPwd || !confirmPwd) {
        resultEl.textContent = '⚠️ 請填寫所有欄位';
        resultEl.style.color = '#f59e0b';
        return;
    }

    // === 檢查 2：新密碼長度 ===
    if (newPwd.length < 4) {
        resultEl.textContent = '⚠️ 新密碼至少 4 個字元';
        resultEl.style.color = '#f59e0b';
        return;
    }

    // === 檢查 3：兩次新密碼是否一致 ===
    if (newPwd !== confirmPwd) {
        resultEl.textContent = '❌ 兩次輸入的密碼不一致';
        resultEl.style.color = '#dc2626';
        return;
    }

    // === 檢查 4：目前密碼是否正確（比對 Firestore 中的 password） ===
    if (currentPwd !== currentUser.password) {
        resultEl.textContent = '❌ 目前密碼錯誤（請確認 Firestore 中的密碼）';
        resultEl.style.color = '#dc2626';
        console.warn('🔍 目前輸入:', currentPwd, '| Firestore 記錄:', currentUser.password);
        return;
    }

    resultEl.textContent = '⏳ 更新中...';
    resultEl.style.color = '#f59e0b';

    try {
        // === 步驟 1：先登入 Auth（驗證身份） ===
        var email = currentUser.userId + '@mastering-science.com';
        await auth.signInWithEmailAndPassword(email, currentPwd);
        
        // === 步驟 2：更新 Auth 密碼 ===
        await auth.currentUser.updatePassword(newPwd);
        
        // === 步驟 3：更新 Firestore 密碼 ===
        currentUser.password = newPwd;
        await saveUser(currentUser);
        
        resultEl.textContent = '✅ 密碼已成功修改！（Auth 和 Firestore 已同步）';
        resultEl.style.color = '#10b981';
        
        document.getElementById('changePwdCurrent').value = '';
        document.getElementById('changePwdNew').value = '';
        document.getElementById('changePwdConfirm').value = '';
        
        setTimeout(function() {
            resultEl.textContent = '';
        }, 3000);
    } catch(e) {
        console.error('修改密碼錯誤:', e);
        // === 錯誤標示：Auth 更新失敗 ===
        if (e.code === 'auth/wrong-password') {
            resultEl.textContent = '❌ Auth 驗證失敗：目前密碼與 Auth 記錄不一致';
        } else if (e.code === 'auth/invalid-credential') {
            resultEl.textContent = '❌ Auth 憑證失效：請重新登入後再試';
        } else {
            resultEl.textContent = '❌ ' + getAuthErrorMessage(e);
        }
        resultEl.style.color = '#dc2626';
    }
}

// ============================================================
// 【錯誤標示區】如果 handleForgotPassword 卡住，請檢查：
// 1. 輸入的學號是否存在於 Firestore
// 2. 老師的 isTeacher 是否為 true
// 3. 輸入的驗證密碼是否等於 MASTER_RESET_PASSWORD（Demo1234）
// 4. Auth 更新密碼是否成功（需要先用舊密碼登入 Auth）
// ============================================================
async function handleForgotPassword() {
    var userId = document.getElementById('forgotUserId').value.trim();
    var inputPwd = document.getElementById('forgotPassword').value.trim();
    
    if (!userId || !inputPwd) {
        showForgotResult('⚠️ 請輸入學號和驗證密碼', '#f59e0b');
        return;
    }

    showForgotResult('⏳ 驗證中...', '#f59e0b');

    try {
        var user = await loadUser(userId);
        if (!user) {
            showForgotResult('❌ 學號不存在', '#dc2626');
            return;
        }

        // === 判斷是老師還是學生 ===
        if (user.isTeacher) {
            // === 老師：驗證萬用密碼 ===
            if (inputPwd === MASTER_RESET_PASSWORD) {
                var newPwd = generatePassword();
                user.password = newPwd;
                user.isFirstLogin = true;
                await saveUser(user);

                try {
                    var email = userId + '@mastering-science.com';
                    await auth.signInWithEmailAndPassword(email, MASTER_RESET_PASSWORD);
                    await auth.currentUser.updatePassword(newPwd);
                    await auth.signOut();
                } catch(e) {
                    console.warn('⚠️ Auth 更新失敗:', e.message);
                }

                showForgotResult('✅ 驗證成功！\n新密碼：' + newPwd + '\n請用此密碼登入並修改密碼', '#10b981');
                document.getElementById('forgotPassword').value = '';
            } else {
                showForgotResult('❌ 驗證密碼錯誤（老師請用 Demo1234）', '#dc2626');
            }
        } else {
            // === 學生：直接顯示請聯絡老師 ===
            showForgotResult('❌ 請聯絡老師重設密碼', '#dc2626');
        }
    } catch(e) {
        console.error('忘記密碼錯誤:', e);
        showForgotResult('❌ ' + e.message, '#dc2626');
    }
}

function generatePassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    var pwd = '';
    for (var i = 0; i < 8; i++) {
        pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    return pwd;
}

// ============================================================
// 【錯誤標示區】如果 renderTeacherStudentList 卡住，請檢查：
// 1. currentUser 是否為 null（未登入）
// 2. currentUser.isTeacher 是否為 true
// 3. Firestore 中是否有 className == currentUser.className 的用戶
// 4. Security Rules 是否允許讀取全班資料（allow read if request.auth != null）
// 5. 學生資料的 isTeacher 是否為 false
// ============================================================
async function renderTeacherStudentList() {
    var container = document.getElementById('teacherStudentList');
    if (!container) return;
    if (!currentUser || !currentUser.isTeacher) {
        container.innerHTML = '⚠️ 只有老師可以查看';
        return;
    }

    try {
        var snapshot = await db.collection('users')
            .where('className', '==', currentUser.className)
            .where('isTeacher', '==', false)
            .get();
        
        var students = [];
        snapshot.forEach(function(doc) {
            students.push(doc.data());
        });

        if (students.length === 0) {
            container.innerHTML = '<div style="color:#999; padding:12px 0;">📭 尚未建立學生帳戶</div>';
            return;
        }

        var html = '<table class="teacher-table"><thead><tr>' +
            '<th>姓名</th><th>學號</th><th>狀態</th><th>操作</th>' +
            '</tr></thead><tbody>';

        for (var i = 0; i < students.length; i++) {
            var s = students[i];
            var status = s.isFirstLogin ? '⏳ 首次登入' : '✅ 已啟用';
            var statusClass = s.isFirstLogin ? 'first' : 'active';
            html += '<tr>' +
                '<td>' + s.name + '</td>' +
                '<td>' + s.userId + '</td>' +
                '<td><span class="status-badge ' + statusClass + '">' + status + '</span></td>' +
                '<td><div class="student-actions">' +
                '<button class="btn-pwd" onclick="showStudentPassword(\'' + s.userId + '\')">🔑 密碼</button>' +
                '<button class="btn-reset" onclick="resetStudentPassword(\'' + s.userId + '\')">🔄 重設</button>' +
                '<button class="btn-delete" onclick="deleteStudentAccount(\'' + s.userId + '\')">🗑️ 刪除</button>' +
                '</div></td></tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch(e) {
        console.error('讀取學生列表失敗:', e);
        // === 錯誤標示：如果看到 Missing or insufficient permissions ===
        if (e.message.includes('permission')) {
            container.innerHTML = '⚠️ 權限不足：請檢查 Firestore Security Rules 是否允許讀取';
        } else {
            container.innerHTML = '⚠️ 讀取失敗：' + e.message;
        }
    }
}

// ===== 老師後台操作（高風險，需要管理密碼驗證） =====
function showStudentPassword(userId) {
    pendingAdminAction = { type: 'showPwd', userId: userId };
    openModal('adminVerifyModal');
    document.getElementById('adminPasswordInput').value = '';
    showAdminVerifyResult('', '');
}

function resetStudentPassword(userId) {
    pendingAdminAction = { type: 'resetPwd', userId: userId };
    openModal('adminVerifyModal');
    document.getElementById('adminPasswordInput').value = '';
    showAdminVerifyResult('', '');
}

function deleteStudentAccount(userId) {
    if (userId === currentUser?.userId) {
        alert('⚠️ 無法刪除自己的帳戶');
        return;
    }
    if (!confirm('確定要刪除學生 ' + userId + ' 的帳戶嗎？')) return;
    pendingAdminAction = { type: 'delete', userId: userId };
    openModal('adminVerifyModal');
    document.getElementById('adminPasswordInput').value = '';
    showAdminVerifyResult('', '');
}

// ============================================================
// 【錯誤標示區】如果 handleAdminVerify 卡住，請檢查：
// 1. 輸入的管理密碼是否等於 currentUser.adminPassword
// 2. currentUser.adminPassword 是否已在 Firestore 中設定
// 3. 待處理動作 (pendingAdminAction) 是否被正確設定
// ============================================================
async function handleAdminVerify() {
    var inputPwd = document.getElementById('adminPasswordInput').value.trim();
    
    if (!inputPwd) {
        showAdminVerifyResult('⚠️ 請輸入管理密碼', '#f59e0b');
        return;
    }

    if (!pendingAdminAction) {
        showAdminVerifyResult('⚠️ 無待處理操作', '#f59e0b');
        return;
    }

    // === 驗證管理密碼 ===
    if (inputPwd !== currentUser.adminPassword) {
        showAdminVerifyResult('❌ 管理密碼錯誤', '#dc2626');
        console.warn('⚠️ 管理密碼驗證失敗:', currentUser.userId, new Date());
        return;
    }

    showAdminVerifyResult('✅ 驗證成功！執行中...', '#10b981');

    try {
        var action = pendingAdminAction;
        pendingAdminAction = null;
        closeModal('adminVerifyModal');

        if (action.type === 'showPwd') {
            var user = await loadUser(action.userId);
            if (user) {
                var pwd = user.password || user.initialPassword || '（無法取得密碼）';
                alert('🔑 學生 ' + user.name + '（' + user.userId + '）的密碼：\n' + pwd);
            } else {
                alert('❌ 找不到該學生');
            }
        } else if (action.type === 'resetPwd') {
            var newPwd = generatePassword();
            var user = await loadUser(action.userId);
            if (user) {
                user.password = newPwd;
                user.isFirstLogin = true;
                await saveUser(user);
                
                try {
                    var email = user.userId + '@mastering-science.com';
                    await auth.signInWithEmailAndPassword(email, user.password);
                    await auth.currentUser.updatePassword(newPwd);
                    await auth.signOut();
                } catch(e) {
                    console.warn('⚠️ Auth 更新失敗:', e.message);
                }
                
                alert('✅ 密碼已重設！\n學生：' + user.name + '\n新密碼：' + newPwd);
                renderTeacherStudentList();
            } else {
                alert('❌ 找不到該學生');
            }
        } else if (action.type === 'delete') {
            await db.collection('users').doc(action.userId).delete();
            var raw = localStorage.getItem('ms_chem_users');
            if (raw) {
                var db = JSON.parse(raw);
                db.users = db.users.filter(function(u) { return u.userId !== action.userId; });
                localStorage.setItem('ms_chem_users', JSON.stringify(db));
            }
            alert('✅ 已刪除學生 ' + action.userId);
            renderTeacherStudentList();
        } else if (action.type === 'create') {
            await handleCreateStudent(action.data);
        }
    } catch(e) {
        console.error('管理操作失敗:', e);
        alert('❌ 操作失敗：' + e.message);
    }
}

// ============================================================
// 【錯誤標示區】如果 createStudentAccount 卡住，請檢查：
// 1. 姓名和電話是否已填寫
// 2. 管理密碼驗證是否通過
// 3. 新用戶的 userId 是否重複（Firestore 中已存在）
// 4. Auth 帳戶建立是否成功（可能 Email 已被使用）
// ============================================================
function createStudentAccount() {
    var customId = document.getElementById('teacherNewId').value.trim() || null;
    var name = document.getElementById('teacherNewName').value.trim();
    var className = document.getElementById('teacherNewClass').value.trim() || currentUser.className;
    var phone = document.getElementById('teacherNewPhone').value.trim();
    var resultEl = document.getElementById('teacherCreateResult');

    if (!name || !phone) {
        resultEl.innerHTML = '<span style="color:#dc2626;">⚠️ 請填寫姓名和電話號碼</span>';
        return;
    }

    pendingAdminAction = {
        type: 'create',
        data: { customId: customId, name: name, className: className, phone: phone }
    };
    openModal('adminVerifyModal');
    document.getElementById('adminPasswordInput').value = '';
    showAdminVerifyResult('', '');
}

async function handleCreateStudent(data) {
    var userId = data.customId || generateUserId(data.className);
    var initialPassword = generatePassword();
    var newUser = {
        userId: userId,
        name: data.name,
        className: data.className,
        phone: data.phone,
        initialPassword: initialPassword,
        password: initialPassword,
        isFirstLogin: true,
        isTeacher: false,
        createdAt: new Date().toISOString()
    };

    await saveUser(newUser);

    try {
        var email = userId + '@mastering-science.com';
        await auth.createUserWithEmailAndPassword(email, initialPassword);
    } catch(e) {
        if (e.code !== 'auth/email-already-in-use') {
            console.warn('⚠️ Auth 建立失敗:', e.message);
        }
    }

    var resultEl = document.getElementById('teacherCreateResult');
    resultEl.innerHTML = '<span style="color:#10b981;">✅ 帳戶已建立！<br>學號：' + userId + '，密碼：' + initialPassword + '</span>';
    
    document.getElementById('teacherNewId').value = '';
    document.getElementById('teacherNewName').value = '';
    document.getElementById('teacherNewPhone').value = '';
    
    renderTeacherStudentList();
}

function generateUserId(className) {
    var raw = localStorage.getItem('ms_chem_users');
    var db = raw ? JSON.parse(raw) : { users: [] };
    var classUsers = db.users.filter(function(u) { return u.className === className; });
    var num = classUsers.length + 1;
    return String(num).padStart(6, '0');
}

// ===== 監聽 Auth 狀態 =====
auth.onAuthStateChanged(function(user) {
    if (user) {
        setStatus('✅ Auth 已連線: ' + user.email, '#10b981');
        console.log('✅ Auth 用戶:', user.email);
    } else {
        setStatus('⏳ 等待登入...', '#999');
    }
});

setStatus('✅ Firebase 已初始化', '#10b981');

// ===== 事件綁定 =====
document.getElementById('loginBtn').addEventListener('click', function() {
    var userId = document.getElementById('userId').value.trim();
    var password = document.getElementById('password').value.trim();
    if (userId && password) {
        handleLogin(userId, password);
    } else {
        showResult('⚠️ 請輸入學號和密碼', '#f59e0b');
    }
});

document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('userId').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('testBtn').addEventListener('click', function() {
    var userId = document.getElementById('userId').value.trim();
    var password = document.getElementById('password').value.trim();
    if (!userId || !password) {
        alert('請先輸入學號和密碼');
        return;
    }
    var email = userId + '@mastering-science.com';
    auth.signInWithEmailAndPassword(email, password)
        .then(function() {
            alert('✅ Auth API 測試成功！\n請看 Console 日誌');
            console.log('✅ Auth 用戶:', auth.currentUser);
        })
        .catch(function(e) {
            alert('❌ Auth API 測試失敗：\n' + getAuthErrorMessage(e));
            console.error(e);
        });
});

document.getElementById('forgotPasswordBtn').addEventListener('click', function() {
    openModal('forgotModal');
    document.getElementById('forgotUserId').value = '';
    document.getElementById('forgotPassword').value = '';
    showForgotResult('', '');
});

document.getElementById('forgotCancelBtn').addEventListener('click', function() {
    closeModal('forgotModal');
});

document.getElementById('forgotSubmitBtn').addEventListener('click', handleForgotPassword);

document.getElementById('forgotPassword').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleForgotPassword();
});

document.getElementById('changePwdFromPanelBtn').addEventListener('click', changePasswordFromPanel);

document.getElementById('changePwdNew').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') changePasswordFromPanel();
});
document.getElementById('changePwdConfirm').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') changePasswordFromPanel();
});

document.getElementById('adminVerifySubmitBtn').addEventListener('click', handleAdminVerify);

document.getElementById('adminVerifyCancelBtn').addEventListener('click', function() {
    pendingAdminAction = null;
    closeModal('adminVerifyModal');
});

document.getElementById('adminPasswordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('adminVerifySubmitBtn').click();
});

// ===== 分頁切換（已修復 display 問題） =====
document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
        var tabId = this.dataset.tab;
        if (tabId === 'logout') {
            logout();
        } else if (tabId === 'changePwd') {
            switchTab(tabId);
            document.getElementById('changePwdPanelResult').textContent = '';
            document.getElementById('changePwdCurrent').value = '';
            document.getElementById('changePwdNew').value = '';
            document.getElementById('changePwdConfirm').value = '';
        } else {
            switchTab(tabId);
            if (tabId === 'teacher' && currentUser && currentUser.isTeacher) {
                renderTeacherStudentList();
            }
        }
    });
});

document.getElementById('teacherCreateStudentBtn').addEventListener('click', createStudentAccount);

document.getElementById('teacherRefreshBtn').addEventListener('click', function() {
    if (currentUser && currentUser.isTeacher) {
        renderTeacherStudentList();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    var saved = localStorage.getItem('ms_chem_login');
    if (saved) {
        try {
            var data = JSON.parse(saved);
            if (data.userId) {
                document.getElementById('userId').value = data.userId;
            }
        } catch(e) {}
    }
});