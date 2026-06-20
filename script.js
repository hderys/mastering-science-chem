// 防止 Ctrl + 滾輪縮放
document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
        e.preventDefault();
    }
}, { passive: false });

// 防止 Ctrl + +/- 縮放
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) {
        e.preventDefault();
    }
});

// ==================== 全域變量 ====================
let currentUser = null;
let userData = { latestStatus: {}, allAttempts: [], favorites: [], practiceHistory: [], achievements: {} };
let currentUnit = null;
let currentChapter = null;
let currentQuestions = [];
let currentOptionsMapping = [];
let currentAnswers = [];
let currentQIndex = 0;
let timerInterval = null;
let timeRemaining = 0;
let pendingUnit = null;
let pendingChapter = null;
let lastResults = null;
let selectedDifficulty = 1;
let selectedCount = 10;
let isTrialMode = false;
let excludeTranslate = true;
let blinkInterval = null;
let customCount = 10;
let isSingleQuestionMode = false;
let singleQuestionSource = null;
let startTime = null;

// 成績總表控制變量
let showOnlyWrong = false;
let showAnswers = false;

// 登入相關變量
let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = 5;

// Firebase 同步狀態
let firestoreEnabled = false;

// 成就積分對應表
const ACHIEVEMENT_POINTS = {
    'firstPractice': 10,
    'tenQuestions': 25,
    'fiveHundred': 50,
    'thousand': 100,
    'perfectLesson': 50,
    'dseComplete': 50,
    'speedStar': 50,
    'consecutive20': 100,
    'allChaptersMaster': 200,
    'fiveStarStreak': 200,
    'mistakeEraser': 50,
    'collector': 25,
    'weekChallenge': 100,
    'star1': 10,
    'star3': 25,
    'star5': 50,
    'trial': 50,
    'blankPaper': -10,
    'downwardTrend': -10
};

// ==================== 在登入畫面顯示狀態（中文） ====================
function showFirestoreStatus(text, bg, color) {
    const statusEl = document.getElementById('firestoreReadStatus');
    if (!statusEl) {
        const div = document.createElement('div');
        div.id = 'firestoreReadStatus';
        div.style.cssText = 'text-align:center; padding:10px; margin:10px 0; border-radius:8px; font-size:14px; font-weight:bold;';
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) {
            loginScreen.insertBefore(div, loginScreen.querySelector('#loginBtn'));
        }
    }
    const el = document.getElementById('firestoreReadStatus');
    el.textContent = text;
    el.style.background = bg;
    el.style.color = color;
}

// ==================== 取得 Auth 錯誤的中文對應 ====================
function getAuthErrorMessage(e) {
    const code = e.code;
    const message = e.message;
    let userMessage = '';
    
    switch(code) {
        case 'auth/user-not-found':
            userMessage = '❌ 帳戶不存在！請先建立帳戶或確認學號是否正確';
            break;
        case 'auth/wrong-password':
            userMessage = '❌ 密碼錯誤！請確認密碼是否正確，或向老師索取新密碼';
            break;
        case 'auth/invalid-credential':
            userMessage = '❌ 帳戶異常！可能是帳戶被刪除或密碼錯誤，請聯絡老師';
            break;
        case 'auth/too-many-requests':
            userMessage = '❌ 登入嘗試過多，請稍後再試';
            break;
        case 'auth/network-request-failed':
            userMessage = '❌ 網路連線失敗，請檢查網路後重試';
            break;
        case 'auth/user-disabled':
            userMessage = '❌ 帳戶已被停用，請聯絡老師';
            break;
        case 'auth/email-already-in-use':
            userMessage = '⚠️ 此學號已被其他帳戶使用';
            break;
        default:
            userMessage = '❌ Auth 驗證失敗：' + message;
            break;
    }
    
    // 同時在 console 顯示完整錯誤碼（方便除錯）
    console.log('🔍 完整錯誤碼:', code);
    console.log('🔍 完整錯誤訊息:', message);
    
    return userMessage;
}

// ==================== Firebase 初始化檢查 ====================
function checkFirebase() {
    // 強制啟用 Firestore
    firestoreEnabled = true;
    console.log('✅ Firestore 已強制啟用');
    return true;
}

// ==================== Firestore 數據同步函數 ====================
async function syncToFirestore(collection, docId, data) {
    if (!firestoreEnabled || !currentUser) return false;
    try {
        await firebase.firestore()
            .collection(collection)
            .doc(docId)
            .set(data, { merge: true });
        return true;
    } catch(e) {
        console.warn('⚠️ Firestore 同步失敗:', e.message);
        return false;
    }
}

async function loadFromFirestore(collection, docId) {
    if (!firestoreEnabled || !currentUser) return null;
    try {
        const doc = await firebase.firestore()
            .collection(collection)
            .doc(docId)
            .get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch(e) {
        console.warn('⚠️ Firestore 讀取失敗:', e.message);
        return null;
    }
}

// ==================== Firebase 遷移相關函數 ====================
async function saveMigrationToFirebase(migrationData) {
    if (!firestoreEnabled) {
        console.warn('⚠️ Firestore 未啟用，遷移請求儲存到 localStorage');
        const db = getUsers();
        if (!db.migrations) db.migrations = [];
        db.migrations.push(migrationData);
        saveUsers(db);
        return migrationData;
    }
    
    try {
        await firebase.firestore()
            .collection('migrations')
            .doc(migrationData.code)
            .set(migrationData, { merge: true });
        console.log('✅ 遷移請求已儲存到 Firebase');
        return migrationData;
    } catch(e) {
        console.warn('⚠️ Firebase 儲存失敗，改用 localStorage:', e.message);
        const db = getUsers();
        if (!db.migrations) db.migrations = [];
        db.migrations.push(migrationData);
        saveUsers(db);
        return migrationData;
    }
}

async function getMigrationsFromFirebase() {
    if (!firestoreEnabled) {
        const db = getUsers();
        return db.migrations || [];
    }
    
    try {
        const snapshot = await firebase.firestore()
            .collection('migrations')
            .where('status', '==', 'pending')
            .get();
        const migrations = [];
        snapshot.forEach(doc => {
            migrations.push(doc.data());
        });
        console.log(`✅ 從 Firebase 讀取 ${migrations.length} 個待處理遷移請求`);
        return migrations;
    } catch(e) {
        console.warn('⚠️ Firebase 讀取失敗，改用 localStorage:', e.message);
        const db = getUsers();
        return db.migrations || [];
    }
}

async function getMigrationByCodeFromFirebase(code) {
    if (!firestoreEnabled) {
        const db = getUsers();
        return (db.migrations || []).find(m => m.code === code && m.status === 'pending');
    }
    
    try {
        const doc = await firebase.firestore()
            .collection('migrations')
            .doc(code)
            .get();
        if (doc.exists) {
            const data = doc.data();
            if (data.status === 'pending') {
                return data;
            }
        }
        return null;
    } catch(e) {
        console.warn('⚠️ Firebase 讀取失敗，改用 localStorage:', e.message);
        const db = getUsers();
        return (db.migrations || []).find(m => m.code === code && m.status === 'pending');
    }
}

async function updateMigrationStatusInFirebase(code, status, newUserId) {
    if (!firestoreEnabled) {
        const db = getUsers();
        if (!db.migrations) db.migrations = [];
        const migration = db.migrations.find(m => m.code === code);
        if (migration) {
            migration.status = status;
            migration.completedAt = new Date().toISOString();
            migration.newUserId = newUserId;
            saveUsers(db);
        }
        return;
    }
    
    try {
        await firebase.firestore()
            .collection('migrations')
            .doc(code)
            .update({
                status: status,
                completedAt: new Date().toISOString(),
                newUserId: newUserId
            });
        console.log(`✅ 遷移請求 ${code} 已更新為 ${status}`);
    } catch(e) {
        console.warn('⚠️ Firebase 更新失敗，改用 localStorage:', e.message);
        const db = getUsers();
        if (!db.migrations) db.migrations = [];
        const migration = db.migrations.find(m => m.code === code);
        if (migration) {
            migration.status = status;
            migration.completedAt = new Date().toISOString();
            migration.newUserId = newUserId;
            saveUsers(db);
        }
    }
}

// ==================== 從 Firebase 讀取學生數據 ====================
async function loadAllStudentsFromFirebase(className) {
    console.log('📥 從 Firebase 讀取學生數據:', className);
    
    const db = getUsers();
    const localStudents = db.users.filter(u => u.className === className && !u.isTeacher);
    console.log(`📊 localStorage: ${localStudents.length} 位學生`);
    
    if (!firestoreEnabled) {
        return localStudents;
    }
    
    try {
        const snapshot = await firebase.firestore()
            .collection('users')
            .where('className', '==', className)
            .where('isTeacher', '==', false)
            .get();
        const firebaseStudents = [];
        snapshot.forEach(doc => {
            firebaseStudents.push(doc.data());
        });
        console.log(`📊 Firebase: ${firebaseStudents.length} 位學生`);
        
        const merged = [...firebaseStudents];
        for (const s of localStudents) {
            if (!merged.find(m => m.userId === s.userId)) {
                merged.push(s);
            }
        }
        return merged;
    } catch(e) {
        console.warn('⚠️ Firebase 讀取失敗，使用 localStorage:', e.message);
        return localStudents;
    }
}

// ==================== format 函數 ====================
function format(date, pattern) {
    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');
    return pattern.replace('yyyy', year).replace('MM', month).replace('dd', day);
}

// ==================== 數據操作函數 ====================
function saveUserData() {
    if (!currentUser) return;
    const userId = currentUser.id || currentUser.userId;
    localStorage.setItem(`ms_chem_${userId}`, JSON.stringify(userData));
    if (firestoreEnabled) {
        syncToFirestore('users', userId, {
            latestStatus: userData.latestStatus || {},
            allAttempts: userData.allAttempts || [],
            favorites: userData.favorites || [],
            practiceHistory: userData.practiceHistory || [],
            achievements: userData.achievements || {},
            stats: userData.stats || {},
            lastUpdated: new Date().toISOString()
        });
    }
}

async function loadUserData() {
    if (!currentUser) return;
    const userId = currentUser.id || currentUser.userId;
    
    if (firestoreEnabled) {
        try {
            const cloudData = await loadFromFirestore('users', userId);
            if (cloudData) {
                userData = {
                    latestStatus: cloudData.latestStatus || {},
                    allAttempts: cloudData.allAttempts || [],
                    favorites: cloudData.favorites || [],
                    practiceHistory: cloudData.practiceHistory || [],
                    achievements: cloudData.achievements || {},
                    stats: cloudData.stats || { totalQuestionsAnswered: 0, totalCorrect: 0, consecutiveCorrect: 0, maxConsecutive: 0, dailyPracticeDates: [], lastAccuracy: null }
                };
                if (!userData.practiceHistory) userData.practiceHistory = [];
                if (!userData.achievements) userData.achievements = {};
                if (!userData.stats) userData.stats = { totalQuestionsAnswered: 0, totalCorrect: 0, consecutiveCorrect: 0, maxConsecutive: 0, dailyPracticeDates: [], lastAccuracy: null };
                if (!userData.stats.dailyPracticeDates) userData.stats.dailyPracticeDates = [];
                localStorage.setItem(`ms_chem_${userId}`, JSON.stringify(userData));
                console.log('✅ 從 Firebase 載入數據');
                return;
            }
        } catch(e) {
            console.warn('⚠️ Firebase 讀取失敗:', e.message);
        }
    }
    
    const raw = localStorage.getItem(`ms_chem_${userId}`);
    if (raw) {
        userData = JSON.parse(raw);
        if (!userData.practiceHistory) userData.practiceHistory = [];
        if (!userData.achievements) userData.achievements = {};
        if (!userData.stats) userData.stats = { totalQuestionsAnswered: 0, totalCorrect: 0, consecutiveCorrect: 0, maxConsecutive: 0, dailyPracticeDates: [], lastAccuracy: null };
        if (!userData.stats.dailyPracticeDates) userData.stats.dailyPracticeDates = [];
        console.log('✅ 從 localStorage 載入數據');
        if (firestoreEnabled) {
            syncToFirestore('users', userId, {
                latestStatus: userData.latestStatus || {},
                allAttempts: userData.allAttempts || [],
                favorites: userData.favorites || [],
                practiceHistory: userData.practiceHistory || [],
                achievements: userData.achievements || {},
                stats: userData.stats || {},
                lastUpdated: new Date().toISOString()
            });
        }
        return;
    }
    
    userData = { latestStatus: {}, allAttempts: [], favorites: [], practiceHistory: [], achievements: {} };
    if (!userData.practiceHistory) userData.practiceHistory = [];
    if (!userData.achievements) userData.achievements = {};
    if (!userData.stats) userData.stats = { totalQuestionsAnswered: 0, totalCorrect: 0, consecutiveCorrect: 0, maxConsecutive: 0, dailyPracticeDates: [], lastAccuracy: null };
    if (!userData.stats.dailyPracticeDates) userData.stats.dailyPracticeDates = [];
    saveUserData();
}

function recordBatch(answers) {
    for (let a of answers) {
        userData.latestStatus[a.qid] = a.isCorrect;
        userData.allAttempts.push({ qid: a.qid, isCorrect: a.isCorrect, timestamp: Date.now() });
    }
    saveUserData();
}

// ==================== 進度計算函數 ====================
function getUnitMastery(unit) {
    let total = 0, correct = 0;
    for (let ch in window.ALL_UNITS[unit].chapters) {
        for (let q of window.ALL_UNITS[unit].chapters[ch].questions) {
            total++;
            if (userData.latestStatus[q.id] === true) correct++;
        }
    }
    return total === 0 ? 0 : Math.round(correct / total * 100);
}

function getChapterTotalQuestions(unit, chapter) {
    return window.ALL_UNITS[unit]?.chapters[chapter]?.questions.length || 0;
}

function getChapterMastery(unit, chapter) {
    let questions = window.ALL_UNITS[unit]?.chapters[chapter]?.questions || [];
    if (questions.length === 0) return 0;
    let correct = 0;
    for (let q of questions) if (userData.latestStatus[q.id] === true) correct++;
    return Math.round(correct / questions.length * 100);
}

function getChapterDifficultyMastery(unit, chapter, difficultyLevel) {
    let questions = window.ALL_UNITS[unit]?.chapters[chapter]?.questions || [];
    let total = 0, correct = 0;
    for (let q of questions) {
        if (q.difficulty_level === difficultyLevel) {
            total++;
            if (userData.latestStatus[q.id] === true) correct++;
        }
    }
    return total === 0 ? 0 : Math.round(correct / total * 100);
}

function getCurrentWrongByChapter() {
    let wrongByChapter = {};
    for (let u in window.ALL_UNITS) {
        for (let c in window.ALL_UNITS[u].chapters) {
            for (let q of window.ALL_UNITS[u].chapters[c].questions) {
                if (userData.latestStatus[q.id] === false) {
                    if (!wrongByChapter[c]) wrongByChapter[c] = [];
                    wrongByChapter[c].push({ ...q, chapterName: window.ALL_UNITS[u].chapters[c].name });
                }
            }
        }
    }
    return wrongByChapter;
}

function getPastWrongByChapter() {
    const wrongQids = new Set();
    for (let att of userData.allAttempts) if (!att.isCorrect) wrongQids.add(att.qid);
    let pastByChapter = {};
    for (let u in window.ALL_UNITS) {
        for (let c in window.ALL_UNITS[u].chapters) {
            for (let q of window.ALL_UNITS[u].chapters[c].questions) {
                if (wrongQids.has(q.id)) {
                    if (!pastByChapter[c]) pastByChapter[c] = [];
                    pastByChapter[c].push({ ...q, chapterName: window.ALL_UNITS[u].chapters[c].name });
                }
            }
        }
    }
    return pastByChapter;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function hasEverWrong(qid) {
    return userData.allAttempts.some(att => att.qid === qid && !att.isCorrect);
}

function isNotAttempted(qid) {
    return !userData.allAttempts.some(att => att.qid === qid);
}

// ==================== 登入相關函數 ====================
function showLoginError(msg) {
    const errEl = document.getElementById('loginError');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    setTimeout(() => { errEl.style.display = 'none'; }, 4000);
}

function clearLoginError() {
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.style.display = 'none';
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('show');
}

function formatTime(seconds) {
    if (!seconds || seconds < 0) return '-';
    let m = Math.floor(seconds / 60);
    let s = seconds % 60;
    if (m === 0) return `${s}秒`;
    return `${m}分${s}秒`;
}

function getUsers() {
    const raw = localStorage.getItem('ms_chem_users');
    if (raw) {
        try { return JSON.parse(raw); } catch(e) { return { users: [] }; }
    }
    return { users: [] };
}

function saveUsers(users) {
    localStorage.setItem('ms_chem_users', JSON.stringify(users));
}

function findUser(userId) {
    const db = getUsers();
    return db.users.find(u => u.userId === userId);
}

function updateUser(userId, data) {
    const db = getUsers();
    const index = db.users.findIndex(u => u.userId === userId);
    if (index !== -1) {
        db.users[index] = { ...db.users[index], ...data };
        saveUsers(db);
        if (firestoreEnabled) {
            firebase.firestore()
                .collection('users')
                .doc(userId)
                .set(db.users[index], { merge: true })
                .then(() => console.log('✅ 用戶資料已同步到 Firebase:', userId))
                .catch(e => console.warn('⚠️ Firebase 更新失敗:', e.message));
        }
        return db.users[index];
    }
    return null;
}

function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
        pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    return pwd;
}

function generateUserId(className) {
    const db = getUsers();
    const classUsers = db.users.filter(u => u.className === className);
    const num = classUsers.length + 1;
    return String(num).padStart(6, '0');
}

// ==================== 建立用戶（支援自訂學號 + Firebase Auth） ====================
function createUser(name, className, phone, customUserId = null) {
    const db = getUsers();
    const userId = customUserId || generateUserId(className);
    const initialPassword = generateRandomPassword();
    const user = {
        userId: userId,
        name: name,
        className: className,
        phone: phone,
        initialPassword: initialPassword,
        password: null,
        isFirstLogin: true,
        isTeacher: false,
        managedClasses: [className],
        createdAt: new Date().toISOString(),
        latestStatus: {},
        allAttempts: [],
        favorites: [],
        practiceHistory: [],
        achievements: {},
        stats: { totalQuestionsAnswered: 0, totalCorrect: 0 }
    };
    
    db.users.push(user);
    saveUsers(db);
    
    if (firestoreEnabled) {
        firebase.firestore()
            .collection('users')
            .doc(userId)
            .set(user, { merge: true })
            .then(() => console.log('✅ 用戶已存入 Firebase:', userId))
            .catch(e => console.warn('⚠️ Firebase 儲存失敗:', e.message));
    }
    
    // 建立 Firebase Auth 帳戶（重要！手機登入需要）
    if (firestoreEnabled) {
        const email = userId + '@mastering-science.com';
        firebase.auth().createUserWithEmailAndPassword(email, initialPassword)
            .then(() => console.log('✅ Firebase Auth 帳戶已建立:', userId))
            .catch(e => {
                if (e.code !== 'auth/email-already-in-use') {
                    console.warn('⚠️ Firebase Auth 建立失敗:', e.message);
                }
            });
    }
    
    return user;
}

// ==================== 登入處理 ====================
async function handleLogin(userId, password) {
    clearLoginError();
    let user = null;
    
    // ===== 步驟 1：Auth 登入 =====
    showFirestoreStatus('⏳ 步驟 1/3：正在驗證身份...', '#e9e4f5', '#2e0f5a');
    
    try {
        // 如果還沒有 Auth 用戶，嘗試登入
        if (!firebase.auth().currentUser) {
            const email = userId + '@mastering-science.com';
            await firebase.auth().signInWithEmailAndPassword(email, password);
            console.log('✅ Auth 登入成功');
        } else {
            // 檢查當前 Auth 用戶是否匹配
            const currentEmail = firebase.auth().currentUser?.email;
            if (currentEmail && currentEmail !== userId + '@mastering-science.com') {
                await firebase.auth().signOut();
                const email = userId + '@mastering-science.com';
                await firebase.auth().signInWithEmailAndPassword(email, password);
                console.log('✅ 重新登入 Auth 成功');
            }
        }
        
        // ===== 檢查 Auth 狀態 =====
        const authUser = firebase.auth().currentUser;
        if (!authUser) {
            showFirestoreStatus('❌ Auth 狀態異常，請重新登入', '#f8d7da', '#7f1d1d');
            showLoginError('❌ 登入異常，請重新嘗試');
            return;
        }
        
        console.log('✅ Auth 用戶:', authUser.uid);
        showFirestoreStatus('✅ 步驟 1/3：身份驗證成功', '#d4edda', '#065f46');
        
    } catch(e) {
        console.warn('⚠️ Auth 登入失敗:', e.code, e.message);
        // 用中文顯示錯誤訊息
        const errorMsg = getAuthErrorMessage(e);
        showFirestoreStatus('❌ ' + errorMsg, '#f8d7da', '#7f1d1d');
        showLoginError('❌ ' + errorMsg);
        return;
    }
    
    // ===== 步驟 2：讀取 Firestore =====
    showFirestoreStatus('⏳ 步驟 2/3：讀取用戶資料...', '#e9e4f5', '#2e0f5a');
    
    try {
        const doc = await firebase.firestore()
            .collection('users')
            .doc(userId)
            .get();
        if (doc.exists) {
            user = doc.data();
            console.log('✅ 從 Firestore 找到用戶:', userId);
            showFirestoreStatus('✅ 步驟 2/3：找到用戶資料！', '#d4edda', '#065f46');
            
            // 同步到 localStorage
            const db = getUsers();
            const existing = db.users.find(u => u.userId === userId);
            if (existing) {
                Object.assign(existing, user);
            } else {
                db.users.push(user);
            }
            saveUsers(db);
        } else {
            console.log('⚠️ Firestore 無此用戶:', userId);
            showFirestoreStatus('⚠️ 步驟 2/3：Firestore 無此用戶，檢查本地儲存', '#fef3c7', '#7c5a00');
        }
    } catch(e) {
        console.warn('⚠️ Firestore 讀取失敗:', e.message);
        if (e.message.includes('permission') || e.message.includes('denied')) {
            showFirestoreStatus('❌ 步驟 2/3：Security Rules 擋住了！請確認 Firebase 規則已發布', '#f8d7da', '#7f1d1d');
        } else if (e.message.includes('network') || e.message.includes('offline')) {
            showFirestoreStatus('❌ 步驟 2/3：網路連線失敗，請檢查網路', '#f8d7da', '#7f1d1d');
        } else {
            showFirestoreStatus('❌ 步驟 2/3：Firestore 讀取失敗 - ' + e.message, '#f8d7da', '#7f1d1d');
        }
    }
    
    // ===== 步驟 3：如果 Firestore 找不到，從 localStorage 查詢 =====
    if (!user) {
        showFirestoreStatus('⏳ 步驟 3/3：嘗試本地儲存...', '#e9e4f5', '#2e0f5a');
        user = findUser(userId);
        if (user) {
            console.log('✅ 從 localStorage 找到用戶:', userId);
            showFirestoreStatus('✅ 步驟 3/3：從本地儲存找到用戶', '#d4edda', '#065f46');
        } else {
            showFirestoreStatus('⚠️ 步驟 3/3：本地儲存也沒有', '#fef3c7', '#7c5a00');
        }
    }
    
    if (!user) {
        showFirestoreStatus('❌ 步驟 3/3：帳號不存在（Firestore 和本地都找不到）', '#f8d7da', '#7f1d1d');
        showLoginError('❌ 帳號不存在，請確認登入 ID');
        return;
    }
    
    // ===== 檢查密碼 =====
    const isValid = (user.password && user.password === password) ||
                    (user.isFirstLogin && user.initialPassword === password);
    
    if (!isValid) {
        loginAttempts++;
        const remaining = MAX_LOGIN_ATTEMPTS - loginAttempts;
        if (remaining <= 0) {
            showLoginError('❌ 密碼錯誤次數過多，請稍後再試');
            document.getElementById('loginBtn').disabled = true;
            setTimeout(() => {
                document.getElementById('loginBtn').disabled = false;
                loginAttempts = 0;
            }, 30000);
            return;
        }
        showFirestoreStatus('❌ 密碼錯誤，剩餘 ' + remaining + ' 次', '#f8d7da', '#7f1d1d');
        showLoginError(`❌ 密碼錯誤，剩餘嘗試次數：${remaining}`);
        return;
    }
    
    // ===== 登入成功 =====
    showFirestoreStatus('✅ 登入成功！歡迎回來 ' + user.name, '#d4edda', '#065f46');
    loginAttempts = 0;
    currentUser = user;
    
    // 記住我
    if (document.getElementById('rememberMeCheckbox').checked) {
        localStorage.setItem('ms_chem_login', JSON.stringify({ userId: userId, password: password }));
    } else {
        localStorage.removeItem('ms_chem_login');
    }
    
    if (user.isFirstLogin) {
        openChangePasswordModal(true);
    } else {
        enterMainApp(user);
    }
}

function enterMainApp(user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    const teacherTab = document.getElementById('teacherTab');
    if (user.isTeacher) {
        teacherTab.style.display = 'inline-block';
    } else {
        teacherTab.style.display = 'none';
    }
    
    updateUserLabel();
    
    loadUserData().then(() => {
        renderPractice();
        initTabs();
        document.querySelector('.tab[data-tab="practice"]').click();
        setupLogout();
    });
}

function logout() {
    if (confirm('⚠️ 確定要登出嗎？\n\n登出後：\n✅ 您的學習進度、成就、錯題會完全保留\n❌ 下次登入需要重新輸入密碼\n\n如果您只是要關閉瀏覽器，可以直接關閉，不需要登出。')) {
        currentUser = null;
        localStorage.removeItem('ms_chem_login');
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginPassword').value = '';
        document.getElementById('userLabel').innerHTML = '';
        clearLoginError();
        document.getElementById('loginBtn').disabled = false;
        loginAttempts = 0;
    }
}

function checkAutoLogin() {
    const saved = localStorage.getItem('ms_chem_login');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.userId && data.password) {
                document.getElementById('loginUserId').value = data.userId;
                document.getElementById('loginPassword').value = data.password;
                const rememberMe = document.getElementById('rememberMeCheckbox');
                if (rememberMe) rememberMe.checked = true;
                setTimeout(async () => {
                    await handleLogin(data.userId, data.password);
                }, 300);
                return true;
            }
        } catch(e) {}
    }
    return false;
}

function updateUserLabel() {
    if (!currentUser) return;
    document.getElementById('userLabel').innerHTML = `
        👋 ${currentUser.name} (${currentUser.className})
        <button id="logoutBtn" class="btn btn-small" style="background:#dc2626; margin-left:8px; padding:0.15rem 0.5rem; font-size:0.6rem;">登出</button>
    `;
    setupLogout();
}

// ==================== 忘記密碼 ====================
document.getElementById('forgotPasswordLink')?.addEventListener('click', function() {
    document.getElementById('forgotPasswordModal').classList.add('show');
    document.getElementById('forgotUserId').value = '';
    document.getElementById('forgotPhone').value = '';
    document.getElementById('forgotMessage').innerHTML = '';
    document.getElementById('forgotError').style.display = 'none';
});

document.getElementById('forgotSubmitBtn')?.addEventListener('click', function() {
    const userId = document.getElementById('forgotUserId').value.trim();
    const phone = document.getElementById('forgotPhone').value.trim();
    const errEl = document.getElementById('forgotError');
    const msgEl = document.getElementById('forgotMessage');

    if (!userId || !phone) {
        errEl.textContent = '⚠️ 請輸入學號和電話號碼';
        errEl.style.display = 'block';
        return;
    }

    const user = findUser(userId);
    if (!user) {
        errEl.textContent = '❌ 學號不存在';
        errEl.style.display = 'block';
        return;
    }

    if (user.phone !== phone) {
        errEl.textContent = '❌ 電話號碼不正確';
        errEl.style.display = 'block';
        return;
    }

    errEl.style.display = 'none';
    const newPwd = generateRandomPassword();
    updateUser(userId, {
        initialPassword: newPwd,
        password: null,
        isFirstLogin: true
    });

    msgEl.innerHTML = `<div class="alert alert-success">✅ 驗證成功！新的初始密碼已設定：<br><strong style="font-size:20px; font-family:monospace;">${newPwd}</strong><br>請用這個密碼登入，然後修改密碼。</div>`;

    setTimeout(() => {
        closeModal('forgotPasswordModal');
        document.getElementById('loginUserId').value = userId;
        document.getElementById('loginPassword').value = '';
    }, 3000);
});

// ==================== 修改密碼（支援 Enter 送出） ====================
function openChangePasswordModal(isFirstLogin = false) {
    const modal = document.getElementById('changePasswordModal');
    const title = document.getElementById('changePasswordTitle');
    const desc = document.getElementById('changePasswordDesc');
    const cancelBtn = document.getElementById('changePasswordCancelBtn');

    if (isFirstLogin) {
        title.textContent = '🔐 首次登入 - 設定密碼';
        desc.textContent = '這是您第一次登入，請設定自己的密碼。';
        cancelBtn.style.display = 'none';
    } else {
        title.textContent = '🔑 修改密碼';
        desc.textContent = '請輸入新的密碼。';
        cancelBtn.style.display = 'block';
    }

    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('changePasswordMessage').innerHTML = '';
    document.getElementById('changePasswordError').style.display = 'none';
    modal.classList.add('show');
}

document.getElementById('changePasswordCancelBtn')?.addEventListener('click', function() {
    closeModal('changePasswordModal');
});

document.getElementById('changePasswordBtn')?.addEventListener('click', function() {
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;
    const errEl = document.getElementById('changePasswordError');
    const msgEl = document.getElementById('changePasswordMessage');

    if (newPwd.length < 4) {
        errEl.textContent = '⚠️ 密碼至少 4 個字元';
        errEl.style.display = 'block';
        return;
    }

    if (newPwd !== confirmPwd) {
        errEl.textContent = '❌ 兩次輸入的密碼不一致';
        errEl.style.display = 'block';
        return;
    }

    errEl.style.display = 'none';

    if (!currentUser) {
        errEl.textContent = '❌ 請先登入';
        errEl.style.display = 'block';
        return;
    }

    const userId = currentUser.id || currentUser.userId;
    
    updateUser(userId, {
        password: newPwd,
        isFirstLogin: false
    });

    if (firestoreEnabled) {
        const email = userId + '@mastering-science.com';
        firebase.auth().signInWithEmailAndPassword(email, currentUser.password || '')
            .then(() => {
                const user = firebase.auth().currentUser;
                if (user) {
                    user.updatePassword(newPwd)
                        .then(() => console.log('✅ Firebase Auth 密碼已更新'))
                        .catch(e => console.warn('⚠️ Firebase Auth 密碼更新失敗:', e.message));
                }
            })
            .catch(() => {
                const email = userId + '@mastering-science.com';
                firebase.auth().createUserWithEmailAndPassword(email, newPwd)
                    .then(() => console.log('✅ Firebase Auth 帳戶已建立'))
                    .catch(e => console.warn('⚠️ Firebase Auth 建立失敗:', e.message));
            });
    }

    currentUser = findUser(userId);
    updateUserLabel();

    msgEl.innerHTML = `<div class="alert alert-success">✅ 密碼已成功修改！</div>`;

    setTimeout(() => {
        closeModal('changePasswordModal');
        if (document.getElementById('loginScreen').style.display !== 'none') {
            document.getElementById('loginUserId').value = userId;
        }
    }, 1500);
});

// 修改密碼彈窗支援 Enter 送出
document.getElementById('newPassword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('changePasswordBtn').click();
    }
});
document.getElementById('confirmPassword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('changePasswordBtn').click();
    }
});

// ==================== 密碼顯示切換 ====================
document.getElementById('togglePasswordBtn')?.addEventListener('click', function() {
    const input = document.getElementById('loginPassword');
    if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '🙈';
    } else {
        input.type = 'password';
        this.textContent = '👁️';
    }
});

// ==================== 登入按鈕 ====================
document.getElementById('loginBtn')?.addEventListener('click', async function() {
    const userId = document.getElementById('loginUserId').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (!userId || !password) {
        showLoginError('⚠️ 請輸入登入 ID 和密碼');
        return;
    }
    
    await handleLogin(userId, password);
});

document.getElementById('loginPassword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('loginUserId')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

// ==================== 成就系統 ====================
function showUnlockCard(title, message, date, points) {
    if (points > 0) {
        const flash = document.createElement('div');
        flash.className = 'unlock-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 800);
    }
    
    let container = document.getElementById('unlockCardsContainer');
    let card = document.createElement('div');
    card.className = 'unlock-card';
    let pointsText = '';
    if (points > 0) pointsText = `<div style="font-size:0.8rem; margin-top:4px;">🏆 +${points} 積分</div>`;
    else if (points < 0) pointsText = `<div style="font-size:0.8rem; margin-top:4px;">⚠️ ${points} 積分</div>`;
    else if (points === 0) pointsText = `<div style="font-size:0.8rem; margin-top:4px;">✨ 再次達標！繼續保持 ✨</div>`;
    
    card.innerHTML = `<div style="font-size:1.5rem;">${points > 0 ? '🎉' : '🌟'}</div>
                      <div style="font-weight:bold; margin:4px 0;">${title}</div>
                      <div style="font-size:0.85rem;">${message}</div>
                      ${pointsText}
                      <div style="font-size:0.65rem; margin-top:6px;">${date}</div>`;
    container.appendChild(card);
    setTimeout(() => { if (card.parentNode) card.remove(); }, 4200);
}

function showUnlockCardsSequentially(cards) {
    for (let i = 0; i < cards.length; i++) {
        setTimeout(() => {
            showUnlockCard(cards[i].title, cards[i].message, cards[i].date, cards[i].points);
        }, i * 500);
    }
}

function addPenaltyAchievement(name, icon, points, desc) {
    let today = new Date().toISOString().slice(0, 10);
    if (!userData.achievements[name]) {
        userData.achievements[name] = { unlocked: true, date: today, points: points, isPenalty: true };
        saveUserData();
        showUnlockCard("⚠️ 警示", `${icon} ${name} - ${desc}`, today, points);
    }
}

function checkAndUnlockAchievements(unit, chapter, accuracy, questionCount, isPerfect, isDSE, isSpeed, currentTotalQuestions, newUnlocks, consecutiveCorrectCount, isBlankPaper, previousAccuracy) {
    let today = new Date().toISOString().slice(0, 10);
    let key = `${unit}_${chapter}`;
    if (!userData.achievements[key]) userData.achievements[key] = {};
    
    let s1 = getChapterDifficultyMastery(unit, chapter, 1);
    let s3 = getChapterDifficultyMastery(unit, chapter, 2);
    let s5 = getChapterDifficultyMastery(unit, chapter, 3);

    if (isBlankPaper) {
        addPenaltyAchievement('blankPaper', '📄', -10, '提交空白答案卷');
    }

    if (previousAccuracy !== null && previousAccuracy - accuracy > 20) {
        addPenaltyAchievement('downwardTrend', '📉', -10, '連續兩次正確率下降超過20%');
    }

    if (s1 >= 80) {
        if (!userData.achievements[key].star1) {
            userData.achievements[key].star1 = { unlocked: true, date: today, lastAccuracy: s1 };
            newUnlocks.push({ title: "🎉 成就解鎖！", message: `✅ ${window.ALL_UNITS[unit].chapters[chapter].name} - 一星完成`, date: today, points: ACHIEVEMENT_POINTS.star1 });
        } else if (userData.achievements[key].star1.lastAccuracy && userData.achievements[key].star1.lastAccuracy < 80 && s1 >= 80) {
            userData.achievements[key].star1.lastAccuracy = s1;
            newUnlocks.push({ title: "🎉 成就恢復！", message: `✅ ${window.ALL_UNITS[unit].chapters[chapter].name} - 一星完成 (再次達標)`, date: today, points: 0 });
        } else {
            userData.achievements[key].star1.lastAccuracy = s1;
        }
    }

    if (s1 >= 80 && s3 >= 80) {
        if (!userData.achievements[key].star3) {
            userData.achievements[key].star3 = { unlocked: true, date: today, lastAccuracy: s3 };
            newUnlocks.push({ title: "🎉 成就解鎖！", message: `🔥 ${window.ALL_UNITS[unit].chapters[chapter].name} - 三星解鎖`, date: today, points: ACHIEVEMENT_POINTS.star3 });
        } else if (userData.achievements[key].star3.lastAccuracy && userData.achievements[key].star3.lastAccuracy < 80 && s3 >= 80) {
            userData.achievements[key].star3.lastAccuracy = s3;
            newUnlocks.push({ title: "🎉 成就恢復！", message: `🔥 ${window.ALL_UNITS[unit].chapters[chapter].name} - 三星解鎖 (再次達標)`, date: today, points: 0 });
        } else {
            userData.achievements[key].star3.lastAccuracy = s3;
        }
    }

    if (s1 >= 80 && s3 >= 80 && s5 >= 80) {
        if (!userData.achievements[key].star5) {
            userData.achievements[key].star5 = { unlocked: true, date: today, lastAccuracy: s5 };
            newUnlocks.push({ title: "🎉 成就解鎖！", message: `💎 ${window.ALL_UNITS[unit].chapters[chapter].name} - 五星解鎖`, date: today, points: ACHIEVEMENT_POINTS.star5 });
        } else if (userData.achievements[key].star5.lastAccuracy && userData.achievements[key].star5.lastAccuracy < 80 && s5 >= 80) {
            userData.achievements[key].star5.lastAccuracy = s5;
            newUnlocks.push({ title: "🎉 成就恢復！", message: `💎 ${window.ALL_UNITS[unit].chapters[chapter].name} - 五星解鎖 (再次達標)`, date: today, points: 0 });
        } else {
            userData.achievements[key].star5.lastAccuracy = s5;
        }
    }

    if (isTrialMode && accuracy >= 80) {
        if (!userData.achievements[key].trial) {
            userData.achievements[key].trial = { unlocked: true, date: today, lastAccuracy: accuracy };
            newUnlocks.push({ title: "🎉 成就解鎖！", message: `⚔️ ${window.ALL_UNITS[unit].chapters[chapter].name} - 試煉完成`, date: today, points: ACHIEVEMENT_POINTS.trial });
        } else if (userData.achievements[key].trial.lastAccuracy && userData.achievements[key].trial.lastAccuracy < 80 && accuracy >= 80) {
            userData.achievements[key].trial.lastAccuracy = accuracy;
            newUnlocks.push({ title: "🎉 成就恢復！", message: `⚔️ ${window.ALL_UNITS[unit].chapters[chapter].name} - 試煉完成 (再次達標)`, date: today, points: 0 });
        } else {
            userData.achievements[key].trial.lastAccuracy = accuracy;
        }
    }

    let totalQ = userData.stats.totalQuestionsAnswered;
    let clearedMistakes = userData.allAttempts.filter(a => a.isCorrect === true && userData.latestStatus[a.qid] === true).length;

    if (!userData.achievements.firstPractice && userData.practiceHistory.length === 1) {
        userData.achievements.firstPractice = { unlocked: true, date: today, progress: 1, target: 1 };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "🎯 初試啼聲 - 完成第一次練習", date: today, points: ACHIEVEMENT_POINTS.firstPractice });
    }
    if (totalQ >= 100 && !userData.achievements.tenQuestions) {
        userData.achievements.tenQuestions = { unlocked: true, date: today, progress: totalQ, target: 100 };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "📝 十題達人 - 累積完成100題", date: today, points: ACHIEVEMENT_POINTS.tenQuestions });
    }
    if (totalQ >= 500 && !userData.achievements.fiveHundred) {
        userData.achievements.fiveHundred = { unlocked: true, date: today, progress: totalQ, target: 500 };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "⚔️ 百題斬 - 累積完成500題", date: today, points: ACHIEVEMENT_POINTS.fiveHundred });
    }
    if (totalQ >= 1000 && !userData.achievements.thousand) {
        userData.achievements.thousand = { unlocked: true, date: today, progress: totalQ, target: 1000 };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "👑 千題之王 - 累積完成1000題", date: today, points: ACHIEVEMENT_POINTS.thousand });
    }
    if (isPerfect && !userData.achievements.perfectLesson) {
        userData.achievements.perfectLesson = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "🌟 完美一課 - 單次練習10題以上全對", date: today, points: ACHIEVEMENT_POINTS.perfectLesson });
    }
    if (isDSE && !userData.achievements.dseComplete) {
        userData.achievements.dseComplete = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "📝 DSE模擬完成 - 完成36題模式", date: today, points: ACHIEVEMENT_POINTS.dseComplete });
    }
    if (isSpeed && !userData.achievements.speedStar) {
        userData.achievements.speedStar = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "⚡ 速度之星 - 提前50%時間完成練習且正確率≥70%", date: today, points: ACHIEVEMENT_POINTS.speedStar });
    }

    if (consecutiveCorrectCount >= 20 && !userData.achievements.consecutive20) {
        userData.achievements.consecutive20 = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "🔥 連續答對王 - 連續答對20題", date: today, points: ACHIEVEMENT_POINTS.consecutive20 });
    }

    let allChaptersDone = true;
    for (let u in window.ALL_UNITS) {
        for (let c in window.ALL_UNITS[u].chapters) {
            if (getChapterMastery(u, c) < 80) allChaptersDone = false;
        }
    }
    if (allChaptersDone && !userData.achievements.allChaptersMaster) {
        userData.achievements.allChaptersMaster = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "🏆 全科目制霸 - 所有章節完成度達80%", date: today, points: ACHIEVEMENT_POINTS.allChaptersMaster });
    }

    let recentPractices = userData.practiceHistory.slice(0, 5);
    let allPerfect = recentPractices.length >= 5 && recentPractices.every(p => p.accuracy === 100);
    if (allPerfect && !userData.achievements.fiveStarStreak) {
        userData.achievements.fiveStarStreak = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "⭐ 五星連珠 - 連續5次練習正確率100%", date: today, points: ACHIEVEMENT_POINTS.fiveStarStreak });
    }

    if (clearedMistakes >= 50 && !userData.achievements.mistakeEraser) {
        userData.achievements.mistakeEraser = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "🗑️ 錯題剋星 - 從錯題本清除50道錯題", date: today, points: ACHIEVEMENT_POINTS.mistakeEraser });
    }

    if (userData.favorites.length >= 50 && !userData.achievements.collector) {
        userData.achievements.collector = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "📚 收藏家 - 收藏50道題目", date: today, points: ACHIEVEMENT_POINTS.collector });
    }

    let lastDate = userData.stats.lastPracticeDate;
    if (lastDate) {
        let last = new Date(lastDate);
        let todayDate = new Date(today);
        let diffDays = Math.floor((todayDate - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1 || diffDays === 0) {
            if (!userData.stats.dailyPracticeDates.includes(today)) {
                userData.stats.dailyPracticeDates.push(today);
            }
        } else if (diffDays > 1) {
            userData.stats.dailyPracticeDates = [today];
        }
    } else {
        userData.stats.dailyPracticeDates = [today];
    }
    userData.stats.lastPracticeDate = today;

    if (userData.stats.dailyPracticeDates.length >= 7 && !userData.achievements.weekChallenge) {
        userData.achievements.weekChallenge = { unlocked: true, date: today };
        newUnlocks.push({ title: "🎉 成就解鎖！", message: "📅 一週挑戰 - 連續7天完成至少一次練習", date: today, points: ACHIEVEMENT_POINTS.weekChallenge });
    }

    saveUserData();
}

function addPracticeHistory(unit, chapter, difficultyName, questionCount, correctCount, accuracy, mode, timeSpentPercent, consecutiveCorrectCount, isBlankPaper, timeSpentSeconds) {
    let now = new Date(), date = now.toISOString().slice(0, 10), time = now.toTimeString().slice(0, 5);
    let unitObj = window.ALL_UNITS[unit];
    let unitName = unitObj ? unitObj.name : unit;
    let chapterName = '單元測驗';
    if (chapter && unitObj && unitObj.chapters[chapter]) {
        chapterName = unitObj.chapters[chapter].name;
    } else if (chapter) {
        chapterName = chapter;
    }
    userData.practiceHistory.unshift({ 
        id: Date.now(), date, time, unitId: unit, unitName, chapterId: chapter, chapterName, 
        difficulty: difficultyName, questionCount, correctCount, accuracy, mode,
        timeSpent: timeSpentSeconds || 0
    });
    if (userData.practiceHistory.length > 100) userData.practiceHistory = userData.practiceHistory.slice(0, 100);

    let totalQuestions = (userData.stats?.totalQuestionsAnswered || 0) + questionCount;
    if (!userData.stats) userData.stats = { totalQuestionsAnswered: 0, totalCorrect: 0, consecutiveCorrect: 0, maxConsecutive: 0, dailyPracticeDates: [], lastAccuracy: null };
    userData.stats.totalQuestionsAnswered = totalQuestions;
    userData.stats.totalCorrect = (userData.stats.totalCorrect || 0) + correctCount;

    let previousAccuracy = userData.stats.lastAccuracy;
    userData.stats.lastAccuracy = accuracy;
    
    let isSpeed = timeSpentPercent <= 50 && accuracy >= 70;
    
    saveUserData();

    let newUnlocks = [];
    checkAndUnlockAchievements(unit, chapter, accuracy, questionCount, accuracy === 100 && questionCount >= 10, selectedCount === 36, isSpeed, totalQuestions, newUnlocks, consecutiveCorrectCount, isBlankPaper, previousAccuracy);
    if (newUnlocks.length > 0) {
        showUnlockCardsSequentially(newUnlocks);
    }
}

function calculateTotalPoints(achievements) {
    let total = 0;
    for (let key in achievements) {
        if (achievements[key]?.unlocked) {
            total += ACHIEVEMENT_POINTS[key] || 0;
        }
    }
    return total;
}

function calculateClassRank(userId, userPoints) {
    let classmates = [];
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key && key.startsWith('ms_chem_') && key.includes(currentUser.class)) {
            let data = JSON.parse(localStorage.getItem(key));
            let points = calculateTotalPoints(data.achievements || {});
            let uid = key.replace('ms_chem_', '');
            classmates.push({ id: uid, points: points });
        }
    }
    classmates.sort((a, b) => b.points - a.points);
    let rank = classmates.findIndex(c => c.id === userId) + 1;
    return { rank: rank, total: classmates.length };
}

// ==================== 挑題邏輯 ====================
function selectQuestionsByDifficultyAndCount(questions, count, preference, isTrial, isUnitTest = false) {
    let filteredQuestions = excludeTranslate ? questions.filter(q => q.difficulty !== "🌐 Translate") : [...questions];
    
    if (isTrial) {
        let sorted = [...filteredQuestions];
        sorted.sort((a, b) => {
            if (a.difficulty_level !== b.difficulty_level) return b.difficulty_level - a.difficulty_level;
            let aWrong = userData.latestStatus[a.id] === false, bWrong = userData.latestStatus[b.id] === false;
            if (aWrong !== bWrong) return aWrong ? -1 : 1;
            return 0;
        });
        return sorted.slice(0, Math.min(count, 50));
    }

    if (isUnitTest) {
        let wrongQuestions = filteredQuestions.filter(q => hasEverWrong(q.id));
        wrongQuestions = shuffleArray(wrongQuestions);
        
        if (wrongQuestions.length >= count) {
            return wrongQuestions.slice(0, count);
        }
        
        let remainingQuestions = filteredQuestions.filter(q => !hasEverWrong(q.id));
        let advancedQuestions = remainingQuestions.filter(q => q.difficulty_level === 2);
        let challengeQuestions = remainingQuestions.filter(q => q.difficulty_level === 3);
        
        advancedQuestions = shuffleArray(advancedQuestions);
        challengeQuestions = shuffleArray(challengeQuestions);
        
        let needed = count - wrongQuestions.length;
        let advCount = Math.round(needed * 0.2);
        let chalCount = needed - advCount;
        
        let selectedAdv = advancedQuestions.slice(0, advCount);
        let selectedChal = challengeQuestions.slice(0, chalCount);
        
        let result = [...wrongQuestions, ...selectedAdv, ...selectedChal];
        
        if (result.length < count) {
            let allRemaining = remainingQuestions.filter(q => 
                !selectedAdv.includes(q) && !selectedChal.includes(q)
            );
            let extra = shuffleArray(allRemaining).slice(0, count - result.length);
            result = [...result, ...extra];
        }
        
        return shuffleArray(result);
    }

    let allowedLevels = [];
    if (preference === 0) {
        allowedLevels = [0, 1];
    } else if (preference === 1) {
        allowedLevels = [2];
    } else if (preference === 2) {
        allowedLevels = [2, 3];
    }

    let wrongQuestions = [];
    let notAttemptedQuestions = [];
    let otherQuestions = [];

    for (let q of filteredQuestions) {
        const level = q.difficulty_level;
        const isAllowed = allowedLevels.includes(level);
        
        if (userData.latestStatus[q.id] === false) {
            wrongQuestions.push(q);
            continue;
        }
        
        if (isNotAttempted(q.id) && isAllowed) {
            notAttemptedQuestions.push(q);
            continue;
        }
        
        if (isAllowed) {
            otherQuestions.push(q);
        }
    }

    let candidates = [...wrongQuestions];
    
    if (candidates.length < count) {
        let shuffledNotAttempted = shuffleArray([...notAttemptedQuestions]);
        candidates = [...candidates, ...shuffledNotAttempted];
    }
    
    if (candidates.length < count) {
        let remaining = count - candidates.length;
        let otherShuffled = shuffleArray([...otherQuestions]);
        
        let selected = [];
        if (preference === 0) {
            let basicTranslate = otherShuffled.filter(q => q.difficulty_level === 0 || q.difficulty_level === 1);
            let advanced = otherShuffled.filter(q => q.difficulty_level === 2);
            let half = Math.ceil(remaining / 2);
            selected = [
                ...shuffleArray(basicTranslate).slice(0, half),
                ...shuffleArray(advanced).slice(0, remaining - half)
            ];
        } else if (preference === 1) {
            let advanced = otherShuffled.filter(q => q.difficulty_level === 2);
            let challenge = otherShuffled.filter(q => q.difficulty_level === 3);
            let half = Math.ceil(remaining / 2);
            selected = [
                ...shuffleArray(advanced).slice(0, half),
                ...shuffleArray(challenge).slice(0, remaining - half)
            ];
        } else if (preference === 2) {
            let advanced = otherShuffled.filter(q => q.difficulty_level === 2);
            let challenge = otherShuffled.filter(q => q.difficulty_level === 3);
            let advCount = Math.ceil(remaining * 0.2);
            selected = [
                ...shuffleArray(advanced).slice(0, advCount),
                ...shuffleArray(challenge).slice(0, remaining - advCount)
            ];
        }
        candidates = [...candidates, ...selected];
    }
    
    candidates = [...new Map(candidates.map(q => [q.id, q])).values()];
    candidates = shuffleArray(candidates);
    
    return candidates.slice(0, Math.min(count, candidates.length));
}

// ==================== UI 渲染函數 ====================
function toggleUnit(unitId) {
    let c = document.getElementById(`chapters-${unitId}`), t = document.getElementById(`toggle-${unitId}`);
    if (c.classList.contains('open')) { c.classList.remove('open'); t.textContent = '▶'; }
    else { c.classList.add('open'); t.textContent = '▼'; }
}

function toggleAchievementUnit(unitId) {
    let c = document.getElementById(`achievement-chapters-${unitId}`), t = document.getElementById(`achievement-toggle-${unitId}`);
    if (c.classList.contains('open')) { c.classList.remove('open'); t.textContent = '▶'; }
    else { c.classList.add('open'); t.textContent = '▼'; }
}

function toggleMistakeChapter(chapterKey, type) {
    let c = document.getElementById(`${type}-${chapterKey}`), t = document.getElementById(`${type}-toggle-${chapterKey}`);
    if (c.classList.contains('open')) { c.classList.remove('open'); t.textContent = '▶'; }
    else { c.classList.add('open'); t.textContent = '▼'; }
}

function toggleCollapsible(id) {
    let el = document.getElementById(id);
    if (el) {
        if (el.classList.contains('collapsed')) el.classList.remove('collapsed');
        else el.classList.add('collapsed');
    }
}

function isMobile() {
    return window.innerWidth <= 640;
}

function renderPractice() {
    const container = document.getElementById('practicePanel');
    if (!container) return;
    if (!window.ALL_UNITS) { container.innerHTML = '<div class="card">題庫未載入</div>'; return; }
    let html = '';
    for (let unit in window.ALL_UNITS) {
        let unitObj = window.ALL_UNITS[unit], chapters = unitObj.chapters;
        if (Object.keys(chapters).length === 0) continue;
        let mastery = getUnitMastery(unit);
        let unitNameForDisplay = isMobile() ? unitObj.name.replace(/（[^）]*）/, '') : unitObj.name;
        
        html += `<div class="unit-group"><div class="unit-header" onclick="toggleUnit('${unit}')">
            <div class="unit-header-left">
                <span class="unit-toggle" id="toggle-${unit}">▶</span>
                <span>${unitNameForDisplay}</span>
            </div>
            <div class="mastery-wrapper">
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${mastery}%;"></div></div>
                <span class="mastery-text">完成度 ${mastery}%</span>
                <button class="btn btn-small unit-test-btn" data-unit="${unit}" style="background:var(--deep-purple-light); padding:0.15rem 0.5rem; font-size:0.7rem;">📝 單元測驗</button>
            </div>
        </div><div class="chapters-container" id="chapters-${unit}">`;
        for (let ch in chapters) {
            let chMastery = getChapterMastery(unit, ch), chTotal = getChapterTotalQuestions(unit, ch);
            let chNameDisplay = chapters[ch].name;
            if (isMobile()) {
                html += `<div class="chapter-item">
                    <span class="chapter-name">${chNameDisplay} (${chTotal} 題)</span>
                    <div class="chapter-row">
                        <div class="progress-wrapper">
                            <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${chMastery}%;"></div></div>
                            <span class="mastery-text">${chMastery}%</span>
                        </div>
                        <div class="chapter-actions">
                            <button class="btn btn-small practice-chapter" data-unit="${unit}" data-chapter="${ch}">✏️練習</button>
                            <button class="btn btn-danger btn-small clear-chapter" data-unit="${unit}" data-chapter="${ch}">🗑️重置</button>
                        </div>
                    </div>
                </div>`;
            } else {
                html += `<div class="chapter-item">
                    <span class="chapter-name">${chNameDisplay} (${chTotal} 題)</span>
                    <div class="mastery-wrapper">
                        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${chMastery}%;"></div></div>
                        <span class="mastery-text">完成度 ${chMastery}%</span>
                    </div>
                    <div class="chapter-actions">
                        <button class="btn btn-small practice-chapter" data-unit="${unit}" data-chapter="${ch}">✏️ 練習</button>
                        <button class="btn btn-danger btn-small clear-chapter" data-unit="${unit}" data-chapter="${ch}">🗑️ 重置</button>
                    </div>
                </div>`;
            }
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;
    
    const unit2Container = document.getElementById('chapters-2');
    if (unit2Container) {
        unit2Container.classList.add('open');
        const toggle2 = document.getElementById('toggle-2');
        if (toggle2) toggle2.textContent = '▼';
    }
    
    document.querySelectorAll('.practice-chapter').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        pendingUnit = btn.dataset.unit; 
        pendingChapter = btn.dataset.chapter; 
        isSingleQuestionMode = false;
        updateSettingsUnlockStatus(); 
        document.getElementById('settingsModal').style.display = 'flex';
    }));
    
    document.querySelectorAll('.unit-test-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const unit = btn.dataset.unit;
        startUnitTest(unit);
    }));
    
    document.querySelectorAll('.clear-chapter').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation(); let unit = btn.dataset.unit, chapter = btn.dataset.chapter;
        if (confirm(`確定清空「${window.ALL_UNITS[unit].chapters[chapter].name}」的所有練習紀錄？`)) {
            let qs = window.ALL_UNITS[unit].chapters[chapter].questions;
            for (let q of qs) delete userData.latestStatus[q.id];
            userData.allAttempts = userData.allAttempts.filter(att => !qs.some(q => q.id === att.qid));
            saveUserData(); renderPractice(); renderMyMistakes(); renderPastMistakes(); renderPinned(); renderHistory(); renderAchievements(); updateSettingsUnlockStatus();
        }
    }));
}

// ==================== 單元測驗功能 ====================
function startUnitTest(unit) {
    let allQuestions = [];
    for (let ch in window.ALL_UNITS[unit].chapters) {
        allQuestions = allQuestions.concat(window.ALL_UNITS[unit].chapters[ch].questions);
    }
    if (allQuestions.length === 0) {
        alert('此單元暫無題目');
        return;
    }
    
    let count = Math.min(36, allQuestions.length);
    let selectedQuestions = selectQuestionsByDifficultyAndCount(allQuestions, count, 1, false, true);
    
    if (selectedQuestions.length < count) {
        let remaining = allQuestions.filter(q => !selectedQuestions.includes(q));
        let shuffled = shuffleArray(remaining);
        selectedQuestions = [...selectedQuestions, ...shuffled.slice(0, count - selectedQuestions.length)];
    }
    selectedQuestions = shuffleArray(selectedQuestions);
    
    currentUnit = unit;
    currentChapter = null;
    currentQuestions = selectedQuestions;
    currentOptionsMapping = currentQuestions.map(q => {
        if (q.sf === 0) {
            let letters = ['A', 'B', 'C', 'D'], map = {};
            for (let i = 0; i < 4; i++) { let optText = q.options[i].substring(3); map[letters[i]] = optText; }
            return { letterToText: map, correctLetter: q.correct };
        } else {
            let texts = q.options.map(opt => opt.replace(/^[A-D]\.\s*/, '')), shuffled = shuffleArray([...texts]), letters = ['A', 'B', 'C', 'D'], map = {};
            for (let i = 0; i < 4; i++) map[letters[i]] = shuffled[i];
            let correctText = q.options.find(opt => opt.startsWith(q.correct)).replace(/^[A-D]\.\s*/, ''), correctLetter = null;
            for (let [l, t] of Object.entries(map)) if (t === correctText) { correctLetter = l; break; }
            return { letterToText: map, correctLetter: correctLetter };
        }
    });
    currentAnswers = new Array(selectedQuestions.length).fill(null);
    currentQIndex = 0;
    isTrialMode = false;
    isSingleQuestionMode = false;
    selectedCount = 36;
    
    let timePerQuestion = 90;
    timeRemaining = selectedQuestions.length * timePerQuestion;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) submitAll();
        else { timeRemaining--; updateTimerDisplay(); }
    }, 1000);
    
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
    }
    const submitBtn = document.getElementById('submitAllBtn');
    if (submitBtn) submitBtn.style.animation = '';
    
    document.getElementById('settingsModal').style.display = 'none';
    document.getElementById('explainModal').style.display = 'none';
    document.getElementById('resultModal').style.display = 'none';
    
    startTime = Date.now();
    
    if (isMobile()) {
        showQuizModal();
    } else {
        showDesktopQuizModal();
    }
}

// ==================== 單題練習功能 ====================
function startSingleQuestion(qid, source) {
    let foundQ = null;
    let foundUnit = null;
    let foundChapter = null;
    for (let u in window.ALL_UNITS) {
        for (let c in window.ALL_UNITS[u].chapters) {
            let q = window.ALL_UNITS[u].chapters[c].questions.find(qq => qq.id === qid);
            if (q) {
                foundQ = q;
                foundUnit = u;
                foundChapter = c;
                break;
            }
        }
        if (foundQ) break;
    }
    if (!foundQ) {
        alert('找不到該題目');
        return;
    }
    
    currentUnit = foundUnit;
    currentChapter = foundChapter;
    currentQuestions = [foundQ];
    currentOptionsMapping = currentQuestions.map(q => {
        if (q.sf === 0) {
            let letters = ['A', 'B', 'C', 'D'], map = {};
            for (let i = 0; i < 4; i++) { let optText = q.options[i].substring(3); map[letters[i]] = optText; }
            return { letterToText: map, correctLetter: q.correct };
        } else {
            let texts = q.options.map(opt => opt.replace(/^[A-D]\.\s*/, '')), shuffled = shuffleArray([...texts]), letters = ['A', 'B', 'C', 'D'], map = {};
            for (let i = 0; i < 4; i++) map[letters[i]] = shuffled[i];
            let correctText = q.options.find(opt => opt.startsWith(q.correct)).replace(/^[A-D]\.\s*/, ''), correctLetter = null;
            for (let [l, t] of Object.entries(map)) if (t === correctText) { correctLetter = l; break; }
            return { letterToText: map, correctLetter: correctLetter };
        }
    });
    currentAnswers = new Array(1).fill(null);
    currentQIndex = 0;
    isSingleQuestionMode = true;
    singleQuestionSource = source;
    isTrialMode = false;
    selectedDifficulty = 1;
    
    timeRemaining = 90;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) submitAll();
        else { timeRemaining--; updateTimerDisplay(); }
    }, 1000);
    
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
    }
    const submitBtn = document.getElementById('submitAllBtn');
    if (submitBtn) submitBtn.style.animation = '';
    
    document.getElementById('settingsModal').style.display = 'none';
    startTime = Date.now();
    showQuizModal();
}

function updateSettingsUnlockStatus() {
    if (!pendingUnit || !pendingChapter) return;
    
    let questions = window.ALL_UNITS[pendingUnit].chapters[pendingChapter].questions;
    
    let availableQuestions = excludeTranslate ? questions.filter(q => q.difficulty !== "🌐 Translate") : [...questions];
    let basicQuestions = availableQuestions.filter(q => q.difficulty_level === 1);
    let basicCorrect = basicQuestions.filter(q => userData.latestStatus[q.id] === true).length;
    let basicTotal = basicQuestions.length;
    let basicPercent = basicTotal === 0 ? 0 : Math.round(basicCorrect / basicTotal * 100);
    
    let advancedQuestions = availableQuestions.filter(q => q.difficulty_level === 2);
    let advancedCorrect = advancedQuestions.filter(q => userData.latestStatus[q.id] === true).length;
    let advancedTotal = advancedQuestions.length;
    let advancedPercent = advancedTotal === 0 ? 0 : Math.round(advancedCorrect / advancedTotal * 100);
    
    let challengeQuestions = availableQuestions.filter(q => q.difficulty_level === 3);
    let challengeCorrect = challengeQuestions.filter(q => userData.latestStatus[q.id] === true).length;
    let challengeTotal = challengeQuestions.length;
    let challengePercent = challengeTotal === 0 ? 0 : Math.round(challengeCorrect / challengeTotal * 100);
    
    let star3Unlocked = basicPercent >= 80;
    let star5Unlocked = star3Unlocked && advancedPercent >= 80;
    let trialUnlocked = star5Unlocked && challengePercent >= 80;
    
    let targetPercent = 0;
    let targetCorrect = 0;
    let targetTotal = 0;
    let targetName = '';
    let currentStage = 'locked';
    
    if (!star3Unlocked) {
        currentStage = 'locked';
        targetPercent = basicPercent;
        targetCorrect = basicCorrect;
        targetTotal = basicTotal;
        targetName = '三星 & 36題';
    } else if (!star5Unlocked) {
        currentStage = 'star3';
        targetPercent = advancedPercent;
        targetCorrect = advancedCorrect;
        targetTotal = advancedTotal;
        targetName = '五星';
    } else if (!trialUnlocked) {
        currentStage = 'star5';
        targetPercent = challengePercent;
        targetCorrect = challengeCorrect;
        targetTotal = challengeTotal;
        targetName = '試煉模式';
    } else {
        currentStage = 'complete';
    }
    
    let needed = 0;
    if (currentStage === 'locked') {
        needed = Math.ceil(0.8 * basicTotal) - basicCorrect;
        if (needed < 0) needed = 0;
    } else if (currentStage === 'star3') {
        needed = Math.ceil(0.8 * advancedTotal) - advancedCorrect;
        if (needed < 0) needed = 0;
    } else if (currentStage === 'star5') {
        needed = Math.ceil(0.8 * challengeTotal) - challengeCorrect;
        if (needed < 0) needed = 0;
    }
    
    let dM = document.getElementById('diff-medium');
    let dH = document.getElementById('diff-hard');
    let tM = document.getElementById('trial-mode');
    let diffHint = document.getElementById('diffHint');
    
    if (dM) {
        if (star3Unlocked) {
            dM.classList.remove('locked');
            dM.disabled = false;
            dM.innerHTML = '<span class="stars">★★★</span><span class="label">3 星</span>';
        } else {
            dM.classList.add('locked');
            dM.disabled = true;
            if (selectedDifficulty === 1) {
                selectedDifficulty = 0;
                document.getElementById('diff-easy').classList.add('active');
                document.getElementById('diff-medium').classList.remove('active');
                document.getElementById('diff-hard').classList.remove('active');
            }
        }
    }
    
    if (dH) {
        if (star5Unlocked) {
            dH.classList.remove('locked');
            dH.disabled = false;
            dH.innerHTML = '<span class="stars">★★★★★</span><span class="label">5 星</span>';
        } else {
            dH.classList.add('locked');
            dH.disabled = true;
            if (selectedDifficulty === 2) {
                selectedDifficulty = 0;
                document.getElementById('diff-easy').classList.add('active');
                document.getElementById('diff-medium').classList.remove('active');
                document.getElementById('diff-hard').classList.remove('active');
            }
        }
    }
    
    if (tM) {
        if (trialUnlocked) {
            tM.classList.remove('locked');
            tM.disabled = false;
            tM.innerHTML = '🔥 5** 試煉模式';
        } else {
            tM.classList.add('locked');
            tM.disabled = true;
        }
    }
    
    let count10 = document.getElementById('count-10');
    let count20 = document.getElementById('count-20');
    let count36 = document.getElementById('count-36');
    let customInput = document.getElementById('customCount');
    let countHint = document.getElementById('countHint');
    
    if (count10) {
        count10.disabled = false;
        count10.classList.remove('locked');
    }
    if (count20) {
        count20.disabled = false;
        count20.classList.remove('locked');
    }
    
    let maxCustom = 0;
    if (selectedDifficulty === 0) {
        if (excludeTranslate) {
            maxCustom = basicTotal;
        } else {
            maxCustom = questions.filter(q => q.difficulty_level === 0 || q.difficulty_level === 1).length;
        }
    } else if (selectedDifficulty === 1) {
        maxCustom = availableQuestions.length;
    } else if (selectedDifficulty === 2) {
        maxCustom = advancedTotal + challengeTotal;
    } else if (isTrialMode) {
        maxCustom = Math.min(availableQuestions.length, 50);
    }
    maxCustom = Math.min(maxCustom, 50);
    if (maxCustom < 1) maxCustom = 1;
    
    if (count36 && customInput) {
        if (star3Unlocked) {
            count36.disabled = false;
            count36.classList.remove('locked');
            count36.innerHTML = '36 題';
            customInput.disabled = false;
            customInput.style.opacity = '1';
            customInput.max = maxCustom;
            
            let currentVal = parseInt(customInput.value);
            if (isNaN(currentVal)) currentVal = 10;
            if (currentVal > maxCustom) {
                customInput.value = maxCustom;
                customCount = maxCustom;
                selectedCount = maxCustom;
            } else if (currentVal < 1) {
                customInput.value = 1;
                customCount = 1;
                selectedCount = 1;
            } else {
                customCount = currentVal;
                selectedCount = currentVal;
            }
            
            if (countHint) countHint.innerHTML = `✅ 36題及自訂題數已解鎖！(上限 ${maxCustom} 題)`;
        } else {
            count36.disabled = true;
            count36.classList.add('locked');
            count36.innerHTML = '36 題 🔒';
            customInput.disabled = true;
            customInput.style.opacity = '0.5';
            if (countHint) countHint.innerHTML = `🔒 36題及自訂題數需Basic正確率達80%解鎖 (目前 ${basicPercent}%)`;
        }
    }
    
    if (diffHint) {
        if (currentStage === 'locked') {
            diffHint.innerHTML = `🔒 解鎖三星需要 Basic 題正確率 ≥ 80% (目前 ${basicPercent}%)`;
        } else if (currentStage === 'star3') {
            diffHint.innerHTML = `🔒 解鎖五星需要 Advanced 題正確率 ≥ 80% (目前 ${advancedPercent}%)`;
        } else if (currentStage === 'star5') {
            diffHint.innerHTML = `🔒 解鎖試煉模式需要 Challenge 題正確率 ≥ 80% (目前 ${challengePercent}%)`;
        } else {
            diffHint.innerHTML = `✅ 所有難度已解鎖！`;
        }
    }
    
    let progressContainer = document.getElementById('star3-progress-container');
    if (!progressContainer && diffHint && diffHint.parentNode) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'star3-progress-container';
        progressContainer.className = 'star3-progress-container';
        diffHint.parentNode.appendChild(progressContainer);
    }
    
    if (progressContainer) {
        if (currentStage === 'complete') {
            progressContainer.innerHTML = `
                <div class="star3-progress-bar">
                    <div class="star3-progress-fill unlocked" style="width: 100%;"></div>
                </div>
                <div class="star3-progress-text unlocked">🏆 恭喜！全部難度已解鎖！所有難度皆可自由選擇</div>
            `;
        } else {
            let fillClass = (targetPercent >= 80) ? 'unlocked' : '';
            let statusText = (targetPercent >= 80) ? '✅ 已達標！' : `尚需 ${needed} 題`;
            progressContainer.innerHTML = `
                <div class="star3-progress-bar">
                    <div class="star3-progress-fill ${fillClass}" style="width: ${targetPercent}%;"></div>
                </div>
                <div class="star3-progress-text ${fillClass}">📈 解鎖${targetName}進度：${targetPercent}% (${targetCorrect}/${targetTotal}) ${statusText}</div>
            `;
        }
    }
}

function renderMyMistakes() {
    let wrongByChapter = {};
    for (let u in window.ALL_UNITS) for (let c in window.ALL_UNITS[u].chapters) for (let q of window.ALL_UNITS[u].chapters[c].questions) if (userData.latestStatus[q.id] === false) { if (!wrongByChapter[c]) wrongByChapter[c] = []; wrongByChapter[c].push({ ...q, chapterName: window.ALL_UNITS[u].chapters[c].name }); }
    let container = document.getElementById('myMistakesPanel');
    if (Object.keys(wrongByChapter).length === 0) { container.innerHTML = '<div class="card">✨ 目前沒有錯題</div>'; return; }
    let html = '<div class="card"><h3>我的錯題</h3>';
    for (let ch in wrongByChapter) {
        html += `<div class="mistake-chapter-group"><div class="mistake-chapter-header" onclick="toggleMistakeChapter('${ch}','my')"><span>📖 ${wrongByChapter[ch][0].chapterName}</span><span class="unit-toggle" id="my-toggle-${ch}">▶</span></div><div class="mistake-questions" id="my-${ch}">`;
        for (let q of wrongByChapter[ch]) {
            let isFav = userData.favorites.includes(q.id);
            html += `<div class="mistake-question-item"><span>${q.text}</span><div>
                <button class="btn-icon star" data-qid="${q.id}" style="color:${isFav ? '#fbbf24' : '#ccc'}">★</button>
                <button class="btn-icon redo-q" data-qid="${q.id}" data-source="myMistakes">🔄</button>
            </div></div>`;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    attachMistakeEvents();
}

function renderPastMistakes() {
    let wrongQids = new Set();
    for (let att of userData.allAttempts) if (!att.isCorrect) wrongQids.add(att.qid);
    let pastByChapter = {};
    for (let u in window.ALL_UNITS) for (let c in window.ALL_UNITS[u].chapters) for (let q of window.ALL_UNITS[u].chapters[c].questions) if (wrongQids.has(q.id)) { if (!pastByChapter[c]) pastByChapter[c] = []; pastByChapter[c].push({ ...q, chapterName: window.ALL_UNITS[u].chapters[c].name }); }
    let container = document.getElementById('pastMistakesPanel');
    if (Object.keys(pastByChapter).length === 0) { container.innerHTML = '<div class="card">📭 尚無錯題歷程</div>'; return; }
    let html = '<div class="card"><h3>錯題歷程</h3>';
    for (let ch in pastByChapter) {
        html += `<div class="mistake-chapter-group"><div class="mistake-chapter-header" onclick="toggleMistakeChapter('${ch}','past')"><span>📖 ${pastByChapter[ch][0].chapterName}</span><span class="unit-toggle" id="past-toggle-${ch}">▶</span></div><div class="mistake-questions" id="past-${ch}">`;
        for (let q of pastByChapter[ch]) {
            let isFav = userData.favorites.includes(q.id);
            html += `<div class="mistake-question-item"><span>${q.text}</span><div>
                <button class="btn-icon star" data-qid="${q.id}" style="color:${isFav ? '#fbbf24' : '#ccc'}">★</button>
                <button class="btn-icon redo-q" data-qid="${q.id}" data-source="pastMistakes">🔄</button>
                <button class="btn-icon remove-q" data-qid="${q.id}" style="color:#dc2626;" title="移除該題">🗑️</button>
            </div></div>`;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    attachMistakeEvents();
    attachRemoveEvents();
}

function renderPinned() {
    let container = document.getElementById('pinnedPanel');
    if (userData.favorites.length === 0) { container.innerHTML = '<div class="card">⭐ 尚無收藏題目</div>'; return; }
    let html = '<div class="card"><h3>收藏題目</h3>';
    for (let qid of userData.favorites) {
        let found = null, chapterName = '';
        for (let u in window.ALL_UNITS) for (let c in window.ALL_UNITS[u].chapters) { let q = window.ALL_UNITS[u].chapters[c].questions.find(qq => qq.id === qid); if (q) { found = q; chapterName = window.ALL_UNITS[u].chapters[c].name; break; } }
        if (found) html += `<div class="mistake-question-item"><span><strong>${chapterName}</strong> ${found.text}</span><div>
            <button class="btn-icon redo-q" data-qid="${qid}" data-source="pinned">🔄</button>
            <button class="btn-icon remove-q" data-qid="${qid}" style="color:#dc2626;" title="移除該題">🗑️</button>
        </div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    document.querySelectorAll('.redo-q').forEach(btn => btn.addEventListener('click', (e) => {
        const qid = btn.dataset.qid;
        const source = btn.dataset.source || 'myMistakes';
        startSingleQuestion(qid, source);
    }));
    attachRemoveEvents();
}

function attachMistakeEvents() {
    document.querySelectorAll('.star').forEach(star => star.addEventListener('click', (e) => { let qid = star.dataset.qid; if (userData.favorites.includes(qid)) userData.favorites = userData.favorites.filter(id => id !== qid); else userData.favorites.push(qid); saveUserData(); renderMyMistakes(); renderPastMistakes(); renderPinned(); }));
    document.querySelectorAll('.redo-q').forEach(btn => btn.addEventListener('click', (e) => {
        const qid = btn.dataset.qid;
        const source = btn.dataset.source || 'myMistakes';
        startSingleQuestion(qid, source);
    }));
}

function attachRemoveEvents() {
    document.querySelectorAll('.remove-q').forEach(btn => btn.addEventListener('click', (e) => {
        const qid = btn.dataset.qid;
        if (confirm('確定移除該題？')) {
            if (userData.favorites.includes(qid)) {
                userData.favorites = userData.favorites.filter(id => id !== qid);
            }
            userData.allAttempts = userData.allAttempts.filter(att => att.qid !== qid);
            delete userData.latestStatus[qid];
            saveUserData();
            renderPastMistakes();
            renderPinned();
            renderMyMistakes();
        }
    }));
}

// ==================== renderHistory ====================
function renderHistory() {
    let container = document.getElementById('historyPanel');
    if (!userData.practiceHistory || userData.practiceHistory.length === 0) { container.innerHTML = '<div class="card">📋 暫無做題紀錄</div>'; return; }
    let html = `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;"><h3>📋 做題紀錄</h3><button id="exportHistoryBtn" class="btn export-btn">📥 匯出 CSV</button></div><div style="overflow-x:auto;"><table class="history-table"><thead><tr><th>日期</th><th>時間</th><th>單元</th><th>章節</th><th>題數</th><th>正確率</th><th>模式</th><th>花費時間</th></tr></thead><tbody>`;
    for (let h of userData.practiceHistory) {
        let timeStr = h.timeSpent ? formatTime(h.timeSpent) : '-';
        html += `<tr><td>${format(new Date(h.date), 'yyyy-MM-dd')}</td><td>${h.time}</td><td>${h.unitName}</td><td>${h.chapterName}</td><td>${h.questionCount}</td><td>${h.accuracy}%</td><td>${h.mode === 'trial' ? '試煉' : '一般'}</td><td>${timeStr}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
    document.getElementById('exportHistoryBtn')?.addEventListener('click', () => {
        let csv = [["日期", "時間", "單元", "章節", "題數", "正確數", "正確率", "模式", "花費時間"]];
        for (let h of userData.practiceHistory) {
            let timeStr = h.timeSpent ? formatTime(h.timeSpent) : '-';
            csv.push([h.date, h.time, h.unitName, h.chapterName, h.questionCount, h.correctCount, `${h.accuracy}%`, h.mode === 'trial' ? '試煉' : '一般', timeStr]);
        }
        let blob = new Blob(["\uFEFF" + csv.map(r => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
        let link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `mastering_science_history_${currentUser.name}.csv`; link.click(); URL.revokeObjectURL(link.href);
    });
}

function renderAchievements() {
    let container = document.getElementById('achievementsPanel');
    
    let chapterList = [];
    for (let u in window.ALL_UNITS) {
        for (let ch in window.ALL_UNITS[u].chapters) {
            chapterList.push({
                unit: u,
                unitName: window.ALL_UNITS[u].name,
                chapter: ch,
                chapterNum: parseInt(ch),
                chapterName: window.ALL_UNITS[u].chapters[ch].name
            });
        }
    }
    chapterList.sort((a, b) => a.chapterNum - b.chapterNum);
    
    let unlockedChapters = [];
    let lockedChapters = [];
    
    for (let item of chapterList) {
        let key = `${item.unit}_${item.chapter}`;
        let ach = userData.achievements[key] || {};
        let types = [
            { id: 'star1', name: '一星完成', icon: '✅', unlocked: ach.star1?.unlocked || false, date: ach.star1?.date || null, needHint: '需一星80%', points: ACHIEVEMENT_POINTS.star1, order: 1 },
            { id: 'star3', name: '三星解鎖', icon: '🔥', unlocked: ach.star3?.unlocked || false, date: ach.star3?.date || null, needHint: '需三星80%', points: ACHIEVEMENT_POINTS.star3, order: 2 },
            { id: 'star5', name: '五星解鎖', icon: '💎', unlocked: ach.star5?.unlocked || false, date: ach.star5?.date || null, needHint: '需五星80%', points: ACHIEVEMENT_POINTS.star5, order: 3 },
            { id: 'trial', name: '試煉完成', icon: '⚔️', unlocked: ach.trial?.unlocked || false, date: ach.trial?.date || null, needHint: '需試煉模式80%', points: ACHIEVEMENT_POINTS.trial, order: 4 }
        ];
        for (let t of types) {
            let entry = {
                unitName: item.unitName,
                chapterName: item.chapterName,
                chapterNum: item.chapterNum,
                name: t.name,
                icon: t.icon,
                unlocked: t.unlocked,
                date: t.date,
                needHint: t.needHint,
                points: t.points,
                order: t.order
            };
            if (t.unlocked) {
                unlockedChapters.push(entry);
            } else {
                lockedChapters.push(entry);
            }
        }
    }
    
    unlockedChapters.sort((a, b) => {
        if (a.chapterNum !== b.chapterNum) return a.chapterNum - b.chapterNum;
        return a.order - b.order;
    });
    lockedChapters.sort((a, b) => {
        if (a.chapterNum !== b.chapterNum) return a.chapterNum - b.chapterNum;
        return a.order - b.order;
    });
    
    let totalQ = userData.stats?.totalQuestionsAnswered || 0;
    let specials = [
        { id: 'firstPractice', name: '初試啼聲', icon: '🎯', unlocked: userData.achievements.firstPractice?.unlocked || false, date: userData.achievements.firstPractice?.date || null, desc: '完成第一次練習', progress: userData.achievements.firstPractice?.progress || totalQ, target: 1, showProgress: true, points: ACHIEVEMENT_POINTS.firstPractice, isPenalty: false },
        { id: 'tenQuestions', name: '十題達人', icon: '📝', unlocked: userData.achievements.tenQuestions?.unlocked || false, date: userData.achievements.tenQuestions?.date || null, desc: '累積完成100題', progress: totalQ, target: 100, showProgress: true, points: ACHIEVEMENT_POINTS.tenQuestions, isPenalty: false },
        { id: 'fiveHundred', name: '百題斬', icon: '⚔️', unlocked: userData.achievements.fiveHundred?.unlocked || false, date: userData.achievements.fiveHundred?.date || null, desc: '累積完成500題', progress: totalQ, target: 500, showProgress: true, points: ACHIEVEMENT_POINTS.fiveHundred, isPenalty: false },
        { id: 'thousand', name: '千題之王', icon: '👑', unlocked: userData.achievements.thousand?.unlocked || false, date: userData.achievements.thousand?.date || null, desc: '累積完成1000題', progress: totalQ, target: 1000, showProgress: true, points: ACHIEVEMENT_POINTS.thousand, isPenalty: false },
        { id: 'perfectLesson', name: '完美一課', icon: '🌟', unlocked: userData.achievements.perfectLesson?.unlocked || false, date: userData.achievements.perfectLesson?.date || null, desc: '單次練習10題以上全對', points: ACHIEVEMENT_POINTS.perfectLesson, isPenalty: false },
        { id: 'dseComplete', name: 'DSE模擬完成', icon: '📝', unlocked: userData.achievements.dseComplete?.unlocked || false, date: userData.achievements.dseComplete?.date || null, desc: '完成一次36題模式', points: ACHIEVEMENT_POINTS.dseComplete, isPenalty: false },
        { id: 'speedStar', name: '速度之星', icon: '⚡', unlocked: userData.achievements.speedStar?.unlocked || false, date: userData.achievements.speedStar?.date || null, desc: '提前50%時間完成練習且正確率≥70%', points: ACHIEVEMENT_POINTS.speedStar, isPenalty: false },
        { id: 'consecutive20', name: '連續答對王', icon: '🔥', unlocked: userData.achievements.consecutive20?.unlocked || false, date: userData.achievements.consecutive20?.date || null, desc: '連續答對20題', points: ACHIEVEMENT_POINTS.consecutive20, isPenalty: false },
        { id: 'allChaptersMaster', name: '全科目制霸', icon: '🏆', unlocked: userData.achievements.allChaptersMaster?.unlocked || false, date: userData.achievements.allChaptersMaster?.date || null, desc: '所有章節完成度達80%', points: ACHIEVEMENT_POINTS.allChaptersMaster, isPenalty: false },
        { id: 'fiveStarStreak', name: '五星連珠', icon: '⭐', unlocked: userData.achievements.fiveStarStreak?.unlocked || false, date: userData.achievements.fiveStarStreak?.date || null, desc: '連續5次練習正確率100%', points: ACHIEVEMENT_POINTS.fiveStarStreak, isPenalty: false },
        { id: 'mistakeEraser', name: '錯題剋星', icon: '🗑️', unlocked: userData.achievements.mistakeEraser?.unlocked || false, date: userData.achievements.mistakeEraser?.date || null, desc: '從錯題本清除50道錯題', points: ACHIEVEMENT_POINTS.mistakeEraser, isPenalty: false },
        { id: 'collector', name: '收藏家', icon: '📚', unlocked: userData.achievements.collector?.unlocked || false, date: userData.achievements.collector?.date || null, desc: '收藏50道題目', points: ACHIEVEMENT_POINTS.collector, isPenalty: false },
        { id: 'weekChallenge', name: '一週挑戰', icon: '📅', unlocked: userData.achievements.weekChallenge?.unlocked || false, date: userData.achievements.weekChallenge?.date || null, desc: '連續7天完成至少一次練習', points: ACHIEVEMENT_POINTS.weekChallenge, isPenalty: false },
        { id: 'blankPaper', name: '交白卷', icon: '📄', unlocked: userData.achievements.blankPaper?.unlocked || false, date: userData.achievements.blankPaper?.date || null, desc: '提交空白答案卷', points: ACHIEVEMENT_POINTS.blankPaper, isPenalty: true },
        { id: 'downwardTrend', name: '下滑趨勢', icon: '📉', unlocked: userData.achievements.downwardTrend?.unlocked || false, date: userData.achievements.downwardTrend?.date || null, desc: '連續兩次正確率下降超過20%', points: ACHIEVEMENT_POINTS.downwardTrend, isPenalty: true }
    ];
    
    let unlockedSpecials = specials.filter(s => s.unlocked && !s.isPenalty);
    let unlockedPenalties = specials.filter(s => s.unlocked && s.isPenalty);
    let lockedSpecials = specials.filter(s => !s.unlocked && !s.isPenalty);
    unlockedSpecials.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    unlockedPenalties.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    lockedSpecials.sort((a, b) => (b.points || 0) - (a.points || 0));
    
    let totalUnlocked = unlockedSpecials.length + unlockedPenalties.length + unlockedChapters.length;
    let totalPossible = specials.length + (chapterList.length * 4);
    let percent = totalPossible > 0 ? Math.round(totalUnlocked / totalPossible * 100) : 0;
    let totalPoints = calculateTotalPoints(userData.achievements);
    let rankInfo = calculateClassRank(currentUser.id, totalPoints);
    
    let html = `<div class="card">
        <div class="points-rank-bar">
            <div class="points-box">
                <div class="points-number">${totalPoints}</div>
                <div class="points-label">總積分</div>
            </div>
            <div class="rank-box">
                <div class="rank-number">#${rankInfo.rank} / ${rankInfo.total}</div>
                <div class="rank-label">班級排名</div>
            </div>
        </div>
        <div class="achievement-progress">
            <div style="display:flex; justify-content:space-between;">
                <span>🏆 總解鎖進度</span>
                <span>${totalUnlocked} / ${totalPossible} (${percent}%)</span>
            </div>
            <div class="achievement-bar">
                <div class="achievement-fill" style="width:${percent}%;"></div>
            </div>
        </div>`;
    
    if (unlockedSpecials.length > 0 || unlockedPenalties.length > 0 || lockedSpecials.length > 0) {
        html += `<h3 style="margin-top:0.5rem;">🎯 特殊成就</h3>`;
        
        for (let ach of unlockedSpecials) {
            let pointsDisplay = ach.points > 0 ? `🏆 +${ach.points}` : '';
            html += `<div class="achievement-item unlocked"><div class="achievement-row"><div><span class="achievement-badge">${ach.icon}</span> <strong>${ach.name}</strong></div><div class="achievement-date">${ach.date} ${pointsDisplay}</div></div><div class="achievement-desc">${ach.desc}</div>`;
            if (ach.showProgress) {
                let percentProgress = Math.min(100, Math.round(ach.progress / ach.target * 100));
                html += `<div class="progress-small"><div class="progress-small-fill" style="width:${percentProgress}%;"></div></div><div class="achievement-desc">${ach.progress}/${ach.target}</div>`;
            }
            html += `</div>`;
        }
        
        for (let ach of unlockedPenalties) {
            html += `<div class="achievement-item unlocked" style="background:#f8d7da; border-left-color:#dc2626;"><div class="achievement-row"><div><span class="achievement-badge">${ach.icon}</span> <strong>${ach.name}</strong></div><div class="achievement-date">${ach.date} ⚠️ ${ach.points}</div></div><div class="achievement-desc">${ach.desc}</div></div>`;
        }
        
        for (let ach of lockedSpecials) {
            let pointsDisplay = ach.points > 0 ? `🏆 +${ach.points}` : '';
            html += `<div class="achievement-item locked"><div class="achievement-row"><div><span class="achievement-badge">🔒</span> <strong>${ach.name}</strong></div><div class="achievement-date">${pointsDisplay}</div></div><div class="achievement-desc">🔒 未解鎖</div>`;
            if (ach.showProgress) {
                let percentProgress = Math.min(100, Math.round(ach.progress / ach.target * 100));
                html += `<div class="progress-small"><div class="progress-small-fill" style="width:${percentProgress}%;"></div></div><div class="achievement-desc">${ach.progress}/${ach.target}</div>`;
            }
            html += `</div>`;
        }
    }
    
    if (unlockedChapters.length > 0) {
        html += `<h3 style="margin-top:0.8rem;">📖 已獲得章節成就</h3>`;
        let currentUnit = '';
        for (let ach of unlockedChapters) {
            if (ach.unitName !== currentUnit) {
                currentUnit = ach.unitName;
                html += `<div style="margin-top:0.5rem; font-weight:bold;">${currentUnit}</div>`;
            }
            let pointsDisplay = ach.points > 0 ? `🏆 +${ach.points}` : '';
            html += `<div class="achievement-item unlocked"><div class="achievement-row"><div><span class="achievement-badge">${ach.icon}</span> ${ach.chapterName} - ${ach.name}</div><div class="achievement-date">${ach.date} ${pointsDisplay}</div></div></div>`;
        }
    }
    
    if (lockedChapters.length > 0) {
        let lockedId = "lockedChaptersPanel";
        html += `<h3 class="collapsible" onclick="toggleCollapsible('${lockedId}')">🔒 未獲得章節成就 (${lockedChapters.length}) ▼</h3>
                 <div id="${lockedId}" class="collapsible-content collapsed">`;
        let currentUnit = '';
        for (let ach of lockedChapters) {
            if (ach.unitName !== currentUnit) {
                currentUnit = ach.unitName;
                html += `<div style="margin-top:0.5rem; font-weight:bold;">${currentUnit}</div>`;
            }
            let pointsDisplay = ach.points > 0 ? `🏆 +${ach.points}` : '';
            html += `<div class="achievement-item locked"><div class="achievement-row"><div><span class="achievement-badge">🔒</span> ${ach.chapterName} - ${ach.name}</div><div class="achievement-date">${pointsDisplay}</div></div><div class="achievement-desc">🔒 ${ach.needHint}</div></div>`;
        }
        html += `</div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

function startPracticeWithSettings() {
    let unit = pendingUnit, chapter = pendingChapter;
    let allQuestions = [...window.ALL_UNITS[unit].chapters[chapter].questions], total = allQuestions.length;
    let count = customCount > 0 ? customCount : selectedCount;
    if (count > total) count = total;
    if (count < 1) count = 1;
    let selectedQuestions = selectQuestionsByDifficultyAndCount(allQuestions, count, selectedDifficulty, isTrialMode, false);
    selectedQuestions = shuffleArray(selectedQuestions);
    currentUnit = unit;
    currentChapter = chapter;
    currentQuestions = selectedQuestions;
    currentOptionsMapping = currentQuestions.map(q => {
        if (q.sf === 0) {
            let letters = ['A', 'B', 'C', 'D'], map = {};
            for (let i = 0; i < 4; i++) { let optText = q.options[i].substring(3); map[letters[i]] = optText; }
            return { letterToText: map, correctLetter: q.correct };
        } else {
            let texts = q.options.map(opt => opt.replace(/^[A-D]\.\s*/, '')), shuffled = shuffleArray([...texts]), letters = ['A', 'B', 'C', 'D'], map = {};
            for (let i = 0; i < 4; i++) map[letters[i]] = shuffled[i];
            let correctText = q.options.find(opt => opt.startsWith(q.correct)).replace(/^[A-D]\.\s*/, ''), correctLetter = null;
            for (let [l, t] of Object.entries(map)) if (t === correctText) { correctLetter = l; break; }
            return { letterToText: map, correctLetter: correctLetter };
        }
    });
    currentAnswers = new Array(selectedQuestions.length).fill(null);
    currentQIndex = 0;
    isSingleQuestionMode = false;
    let timePerQuestion = selectedDifficulty == 0 ? 108 : (selectedDifficulty == 2 ? 75 : 90);
    timeRemaining = selectedQuestions.length * timePerQuestion;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) submitAll();
        else { timeRemaining--; updateTimerDisplay(); }
    }, 1000);
    
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
    }
    const submitBtn = document.getElementById('submitAllBtn');
    if (submitBtn) submitBtn.style.animation = '';
    
    document.getElementById('settingsModal').style.display = 'none';
    
    startTime = Date.now();
    
    if (isMobile()) {
        showQuizModal();
    } else {
        showDesktopQuizModal();
    }
}

// ==================== showExplainModal ====================
function showExplainModal(question, userLetter, correctLetter, userText, correctText, isCorrect) {
    const isFav = userData.favorites.includes(question.id);
    const favIcon = isFav ? '⭐' : '☆';
    const favText = isFav ? '取消收藏' : '收藏';
    
    const qIndex = currentQuestions.findIndex(q => q.id === question.id);
    let optionsHtml = '';
    
    if (qIndex !== -1 && currentOptionsMapping[qIndex]) {
        const map = currentOptionsMapping[qIndex];
        const letters = ['A', 'B', 'C', 'D'];
        for (let l of letters) {
            const isUser = (l === userLetter);
            const isCor = (l === correctLetter);
            let cls = 'explain-option-normal';
            if (isCor) cls = 'explain-option-correct';
            else if (isUser && !isCor) cls = 'explain-option-wrong';
            optionsHtml += `<div class="${cls}">${l}. ${map.letterToText[l]}</div>`;
        }
    } else {
        for (let opt of question.options) {
            let l = opt[0], t = opt.substring(3), isUser = (l === userLetter), isCor = (l === correctLetter);
            let cls = 'explain-option-normal';
            if (isCor) cls = 'explain-option-correct';
            else if (isUser && !isCor) cls = 'explain-option-wrong';
            optionsHtml += `<div class="${cls}">${l}. ${t}</div>`;
        }
    }
    
    let ansClass = isCorrect ? 'answer-correct' : 'answer-wrong';
    let ansHtml = `<div class="answer-comparison"><span>你的答案: <span class="${ansClass}">${userLetter}</span></span><span>正解: <span class="${ansClass}">${correctLetter}</span></span></div>`;
    
    let imageHtml = '';
    if (question.imageUrl) {
        imageHtml = `<div style="text-align:center; margin: 0.5rem 0;">
            <img src="${question.imageUrl}" style="max-height:150px; max-width:100%; border-radius:8px; cursor:pointer;" onclick="document.getElementById('zoomImage').src='${question.imageUrl}'; document.getElementById('imageZoomModal').style.display='flex';">
            <div style="font-size:0.65rem; color:#999; margin-top:4px;">🖱️ 點擊圖片放大</div>
        </div>`;
    }
    
    let headerHtml = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
        <strong style="font-size:1.1rem;">📖 題目與題解</strong>
        <button onclick="toggleFavorite('${question.id}')" class="btn" style="background:var(--deep-purple-light); padding:0.2rem 0.8rem; font-size:0.85rem;">${favIcon} ${favText}</button>
    </div>`;
    
    let html = `${headerHtml}
                <div style="margin-bottom:0.8rem;"><strong>題目:</strong> ${question.text}</div>
                ${imageHtml}
                ${optionsHtml}
                <div style="margin:0.8rem 0; padding:0.4rem; background:#f0f0f0; border-radius:12px;"><strong>📖 題解:</strong> ${question.explanation || '無'}</div>
                ${ansHtml}`;
    document.getElementById('explainContent').innerHTML = html;
    document.getElementById('explainModal').style.display = 'flex';
}

// ==================== toggleFavorite ====================
function toggleFavorite(qid) {
    if (userData.favorites.includes(qid)) {
        userData.favorites = userData.favorites.filter(id => id !== qid);
    } else {
        userData.favorites.push(qid);
    }
    saveUserData();
    renderPinned();
    renderMyMistakes();
    renderPastMistakes();
}

// ==================== 元素周期表功能 ====================
function showPeriodicTable() {
    const imgUrl = 'https://raw.githubusercontent.com/hderys/mastering-science-images/main/webp_image/periodic_table.png';
    document.getElementById('zoomImage').src = imgUrl;
    document.getElementById('imageZoomModal').style.display = 'flex';
}

function closeImageZoom() {
    document.getElementById('imageZoomModal').style.display = 'none';
}

// ==================== 顯示 DSE 等級預測彈窗 ====================
function showDSEResult(accuracy, correctCount, totalCount) {
    let level = '';
    let levelClass = '';
    let emoji = '';
    
    if (accuracy >= 95) {
        level = '5**';
        levelClass = 'level-5star';
        emoji = '🌟';
    } else if (accuracy >= 90) {
        level = '5*';
        levelClass = 'level-5star';
        emoji = '🌟';
    } else if (accuracy >= 85) {
        level = '5';
        levelClass = 'level-5';
        emoji = '🌟';
    } else if (accuracy >= 78) {
        level = '4';
        levelClass = 'level-4';
        emoji = '📘';
    } else if (accuracy >= 57) {
        level = '3';
        levelClass = 'level-3';
        emoji = '📗';
    } else {
        level = '尚未達標';
        levelClass = 'level-fail';
        emoji = '📖';
    }
    
    const isPass = accuracy >= 57;
    const passText = isPass ? '🎉 繼續加油！' : '💪 請多多複習，下次一定可以！';
    
    const overlay = document.createElement('div');
    overlay.id = 'dseResultOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center;
        z-index: 9999; animation: fadeIn 0.3s ease;
    `;
    
    const card = document.createElement('div');
    card.style.cssText = `
        background: linear-gradient(145deg, #1a1a2e, #2d2d44);
        border-radius: 32px; padding: 2.5rem 3rem; max-width: 480px; width: 90%;
        text-align: center; color: white; box-shadow: 0 20px 60px rgba(0,0,0,0.8);
        animation: slideUp 0.4s ease; border: 2px solid rgba(255,215,0,0.3);
    `;
    
    let levelColor = '#ffd700';
    if (level === '4') levelColor = '#4a9eff';
    else if (level === '3') levelColor = '#34d399';
    else if (level === '尚未達標') levelColor = '#94a3b8';
    
    card.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
        <div style="font-size: 1.2rem; font-weight: 600; color: #a78bfa; margin-bottom: 0.3rem;">單元測驗完成！</div>
        <div style="font-size: 1rem; color: #94a3b8; margin-bottom: 1.5rem;">
            正確率：<span style="color: white; font-weight: 700;">${accuracy}%</span>
            （${correctCount} / ${totalCount} 題）
        </div>
        <div style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">📊 DSE 預計等級</div>
        <div style="font-size: 4rem; font-weight: 900; color: ${levelColor}; text-shadow: 0 0 30px ${levelColor}40; line-height: 1.2;">
            ${emoji} ${level}
        </div>
        <div style="margin: 1.5rem 0 2rem 0; font-size: 1rem; color: #cbd5e1;">
            ${passText}
        </div>
        <button onclick="closeDSEResult()" style="
            background: linear-gradient(135deg, #7c3aed, #4a1d8c);
            color: white; border: none; padding: 0.8rem 2.5rem;
            border-radius: 60px; font-size: 1rem; font-weight: 600;
            cursor: pointer; transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            查看詳細成績
        </button>
    `;
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeDSEResult();
        }
    });
    
    window._dseResultCallback = function() {
        closeDSEResult();
    };
}

function closeDSEResult() {
    const overlay = document.getElementById('dseResultOverlay');
    if (overlay) {
        overlay.remove();
    }
    if (window._dseResultCallback) {
        window._dseResultCallback();
    }
}

// ==================== showQuizModal（手機版） ====================
function showQuizModal() { 
    renderQuizNav(); 
    renderCurrentQuestion(); 
    document.getElementById('quizModal').style.display = 'flex';
    
    const isMobileDevice = window.innerWidth <= 640;
    const footerClass = isMobileDevice ? 'quiz-footer-mobile' : 'quiz-footer-desktop';
    const footer = document.querySelector(`.${footerClass}`);
    const footerElement = footer || document.querySelector('.quiz-footer');
    
    let periodicBtn = document.getElementById('periodicTableBtn');
    const shouldShowPeriodicTable = (currentChapter && parseInt(currentChapter) >= 6) || currentChapter === null;
    
    if (shouldShowPeriodicTable) {
        if (!periodicBtn) {
            periodicBtn = document.createElement('button');
            periodicBtn.id = 'periodicTableBtn';
            periodicBtn.className = 'btn btn-outline';
            periodicBtn.textContent = '📊 元素周期表';
            periodicBtn.addEventListener('click', showPeriodicTable);
            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn && footerElement) {
                footerElement.insertBefore(periodicBtn, nextBtn.nextSibling);
            }
        }
        periodicBtn.style.display = 'inline-block';
    } else {
        if (periodicBtn) {
            periodicBtn.style.display = 'none';
        }
    }
}

function renderQuizNav() {
    let nav = document.getElementById('questionNav'), html = '';
    for (let i = 0; i < currentQuestions.length; i++) {
        let cls = '';
        if (i === currentQIndex) cls = 'current';
        else if (currentAnswers[i] !== null) cls = 'answered';
        else cls = 'unanswered';
        html += `<button class="q-nav-btn ${cls}" data-idx="${i}">${i + 1}</button>`;
    }
    nav.innerHTML = html;
    document.getElementById('quizCounter').innerHTML = `${currentQIndex + 1} / ${currentQuestions.length}`;
    document.querySelectorAll('.q-nav-btn').forEach(btn => btn.addEventListener('click', (e) => { currentQIndex = parseInt(btn.dataset.idx); renderQuizNav(); renderCurrentQuestion(); updateNavButtons(); }));
    checkAllQuestionsAnswered();
}

// ==================== renderCurrentQuestion（手機版） ====================
function renderCurrentQuestion() {
    let q = currentQuestions[currentQIndex];
    let map = currentOptionsMapping[currentQIndex];
    let hasImage = q.imageUrl !== null;
    
    const isMobileDevice = window.innerWidth <= 640;
    const layoutClass = isMobileDevice ? 'quiz-layout-mobile' : 'quiz-layout-desktop';
    const imageClass = isMobileDevice ? 'image-area-mobile' : 'image-area-desktop';
    const optionsClass = isMobileDevice ? 'options-area-mobile' : 'options-area-desktop';
    const footerClass = isMobileDevice ? 'quiz-footer-mobile' : 'quiz-footer-desktop';
    
    const modalContent = document.querySelector('#quizModal .modal-content');
    if (modalContent) {
        modalContent.classList.remove('difficulty-translate', 'difficulty-basic', 'difficulty-advanced', 'difficulty-challenge');
        if (q.difficulty === '🌐 Translate') {
            modalContent.classList.add('difficulty-translate');
        } else if (q.difficulty === '✅ Basic') {
            modalContent.classList.add('difficulty-basic');
        } else if (q.difficulty === '📈 Advanced') {
            modalContent.classList.add('difficulty-advanced');
        } else if (q.difficulty === '🔥 Challenge') {
            modalContent.classList.add('difficulty-challenge');
        }
    }
    
    document.getElementById('modalQuestionText').innerHTML = q.text;
    document.getElementById('quizCounter').innerHTML = `${currentQIndex + 1} / ${currentQuestions.length}`;
    document.getElementById('quizDifficulty').innerHTML = q.difficulty;
    
    let imgArea = document.getElementById('modalImageArea');
    let quizLayout = document.querySelector(`.${layoutClass}`);
    
    if (!quizLayout) {
        const quizBodyEl = document.querySelector('.quiz-body');
        const originalOptions = document.getElementById('modalOptions');
        const originalImgArea = imgArea;
        
        const layoutDiv = document.createElement('div');
        layoutDiv.className = layoutClass;
        
        const optionsDiv = document.createElement('div');
        optionsDiv.className = optionsClass;
        optionsDiv.id = 'options-area-container';
        
        const imageDiv = document.createElement('div');
        imageDiv.className = imageClass;
        imageDiv.id = 'image-area-container';
        
        if (originalOptions && originalOptions.parentNode) {
            originalOptions.parentNode.insertBefore(layoutDiv, originalOptions);
            if (isMobileDevice) {
                layoutDiv.appendChild(imageDiv);
                layoutDiv.appendChild(optionsDiv);
            } else {
                layoutDiv.appendChild(optionsDiv);
                layoutDiv.appendChild(imageDiv);
            }
            optionsDiv.appendChild(originalOptions);
        }
        if (originalImgArea) {
            imageDiv.appendChild(originalImgArea);
        }
        quizLayout = layoutDiv;
    }
    
    const imageAreaContainer = document.getElementById('image-area-container');
    const optionsArea = document.getElementById('options-area-container');
    
    if (imageAreaContainer) {
        imageAreaContainer.className = imageClass;
        imageAreaContainer.id = 'image-area-container';
    }
    if (optionsArea) {
        optionsArea.className = optionsClass;
        optionsArea.id = 'options-area-container';
    }
    if (quizLayout) {
        quizLayout.className = layoutClass;
    }
    
    if (hasImage) {
        if (imageAreaContainer) imageAreaContainer.style.display = 'block';
        if (quizLayout) quizLayout.classList.remove('no-image');
        
        let imgHtml = '';
        if (q.imageUrl) {
            imgHtml = `<img src="${q.imageUrl}" class="quiz-image" id="quizImageThumb" style="max-width:100%; max-height:180px; object-fit:contain; cursor:pointer; border-radius:8px;">`;
        }
        document.getElementById('modalImageArea').innerHTML = imgHtml;
        document.getElementById('quizImageThumb')?.addEventListener('click', () => {
            document.getElementById('zoomImage').src = q.imageUrl;
            document.getElementById('imageZoomModal').style.display = 'flex';
        });
        
        if (optionsArea) {
            optionsArea.classList.add('vertical');
            optionsArea.classList.remove('grid');
        }
    } else {
        if (imageAreaContainer) imageAreaContainer.style.display = 'none';
        if (quizLayout) quizLayout.classList.add('no-image');
        document.getElementById('modalImageArea').innerHTML = '';
        
        if (optionsArea) {
            optionsArea.classList.add('grid');
            optionsArea.classList.remove('vertical');
        }
    }
    
    let optsDiv = document.getElementById('modalOptions');
    optsDiv.innerHTML = '';
    optsDiv.className = 'options-grid';
    
    for (let l of ['A', 'B', 'C', 'D']) {
        let btn = document.createElement('button');
        btn.className = 'option-btn';
        if (currentAnswers[currentQIndex] === l) btn.classList.add('selected');
        btn.textContent = `${l}. ${map.letterToText[l]}`;
        btn.addEventListener('click', () => {
            currentAnswers[currentQIndex] = l;
            renderCurrentQuestion();
            renderQuizNav();
            checkAllQuestionsAnswered();
        });
        optsDiv.appendChild(btn);
    }
    
    const footerElement = document.querySelector('.quiz-footer');
    if (footerElement) {
        footerElement.className = footerClass;
    }
    
    updateNavButtons();
    checkAllQuestionsAnswered();
}

function updateNavButtons() { let prev = document.getElementById('prevBtn'), next = document.getElementById('nextBtn'); prev.disabled = (currentQIndex === 0); next.disabled = (currentQIndex === currentQuestions.length - 1); }

function updateTimerDisplay() { let m = Math.floor(timeRemaining / 60), s = timeRemaining % 60; document.getElementById('timerDisplay').innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; }

function checkAllQuestionsAnswered() {
    if (currentQuestions.length === 0) return;
    
    const allAnswered = currentAnswers.every(a => a !== null && a !== undefined);
    const submitBtn = document.getElementById('submitAllBtn');
    if (!submitBtn) return;
    
    if (allAnswered && currentAnswers.length > 0) {
        if (!blinkInterval) {
            blinkInterval = setInterval(() => {
                submitBtn.style.animation = 'blink 0.3s step-end infinite';
            }, 100);
        }
    } else {
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = null;
            submitBtn.style.animation = '';
        }
    }
}

// ==================== submitAll ====================
function submitAll() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        const submitBtn = document.getElementById('submitAllBtn');
        if (submitBtn) submitBtn.style.animation = '';
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    const timeSpentSeconds = Math.round((Date.now() - startTime) / 1000);
    
    let results = [], batch = [], correctCount = 0;
    let consecutiveCorrect = userData.stats.consecutiveCorrect || 0;
    let answeredCount = currentAnswers.filter(a => a !== null).length;
    let isBlankPaper = (answeredCount === 0);
    const isUnitTestMode = (currentChapter === null && currentQuestions.length > 1);

    for (let i = 0; i < currentQuestions.length; i++) {
        let q = currentQuestions[i], map = currentOptionsMapping[i], userLetter = currentAnswers[i];
        let isCorrect = (userLetter === map.correctLetter);
        if (isCorrect) {
            correctCount++;
            consecutiveCorrect++;
        } else {
            consecutiveCorrect = 0;
        }
        let userText = userLetter ? map.letterToText[userLetter] : '(未作答)', correctText = map.letterToText[map.correctLetter];
        results.push({ question: q, userLetter: userLetter || '?', correctLetter: map.correctLetter, userText, correctText, isCorrect, qid: q.id });
        batch.push({ qid: q.id, isCorrect: isCorrect });
    }
    userData.stats.consecutiveCorrect = consecutiveCorrect;
    if (consecutiveCorrect > (userData.stats.maxConsecutive || 0)) userData.stats.maxConsecutive = consecutiveCorrect;
    recordBatch(batch);
    let accuracy = Math.round(correctCount / currentQuestions.length * 100);
    let diffName = selectedDifficulty == 0 ? "★ 1星" : (selectedDifficulty == 1 ? "★★★ 3星" : "★★★★★ 5星");
    let mode = isTrialMode ? 'trial' : 'normal';
    let expectedTime = currentQuestions.length * (selectedDifficulty == 0 ? 108 : (selectedDifficulty == 2 ? 75 : 90));
    let timeSpent = Math.round((expectedTime - timeRemaining) / expectedTime * 100);
    
    if (isSingleQuestionMode && currentQuestions.length === 1) {
        const qid = currentQuestions[0].id;
        const isCorrectSingle = results[0].isCorrect;
        
        if (singleQuestionSource === 'myMistakes' && isCorrectSingle) {
            userData.latestStatus[qid] = true;
            saveUserData();
            alert('🎉 答對了！該題已從「我的錯題」中移除！');
        } else if (singleQuestionSource === 'myMistakes' && !isCorrectSingle) {
            alert('❌ 答錯了！該題仍保留在「我的錯題」中，加油！');
        } else if (singleQuestionSource === 'pastMistakes' || singleQuestionSource === 'pinned') {
            if (isCorrectSingle) {
                alert('✅ 答對了！該題仍保留在列表中（歷程/收藏不會自動移除）');
            } else {
                alert('❌ 答錯了！再試一次吧！');
            }
        }
        recordBatch(batch);
        addPracticeHistory(currentUnit, currentChapter, '單題練習', 1, isCorrectSingle ? 1 : 0, isCorrectSingle ? 100 : 0, 'single', 0, consecutiveCorrect, isBlankPaper, timeSpentSeconds);
        renderMyMistakes();
        renderPastMistakes();
        renderPinned();
        renderHistory();
        renderAchievements();
        document.getElementById('quizModal').style.display = 'none';
        return;
    }
    
    addPracticeHistory(currentUnit, currentChapter, diffName, currentQuestions.length, correctCount, accuracy, mode, timeSpent, consecutiveCorrect, isBlankPaper, timeSpentSeconds);
    lastResults = results;
    
    if (isUnitTestMode && currentQuestions.length >= 10) {
        window._dseResultCallback = function() {
            displayResults(results);
        };
        showDSEResult(accuracy, correctCount, currentQuestions.length);
        document.getElementById('quizModal').style.display = 'none';
        renderPractice();
        renderMyMistakes();
        renderPastMistakes();
        renderPinned();
        renderHistory();
        renderAchievements();
        updateSettingsUnlockStatus();
        return;
    }
    
    displayResults(results);
    document.getElementById('quizModal').style.display = 'none';
    renderPractice();
    renderMyMistakes();
    renderPastMistakes();
    renderPinned();
    renderHistory();
    renderAchievements();
    updateSettingsUnlockStatus();
}

function displayResults(results) {
    let totalOriginal = results.length;
    let correctOriginal = results.filter(r => r.isCorrect).length;
    let percentOriginal = Math.round(correctOriginal / totalOriginal * 100);
    let color = percentOriginal < 40 ? '#dc2626' : (percentOriginal < 70 ? '#f59e0b' : '#10b981');

    let filteredResults = showOnlyWrong ? results.filter(r => !r.isCorrect) : results;
    
    if (filteredResults.length === 0) {
        let html = `<div class="result-summary-bar">
            <div class="result-progress">
                <span>✅ ${percentOriginal}% (${correctOriginal}/${totalOriginal})</span>
                <div class="big-progress-bar">
                    <div class="big-progress-fill" style="width:${percentOriginal}%; background:${color};"></div>
                </div>
            </div>
            <div class="result-buttons">
                <button id="toggleWrongBtn" class="btn btn-small">❌ 只顯示錯題</button>
                <button id="toggleAnswersBtn" class="btn btn-small">📋 顯示答案</button>
            </div>
        </div>
        <div style="padding:20px; text-align:center;">🎉 沒有錯題！繼續保持！</div>`;
        document.getElementById('resultContent').innerHTML = html;
        document.getElementById('resultModal').style.display = 'flex';
        
        document.getElementById('toggleWrongBtn')?.addEventListener('click', () => {
            showOnlyWrong = !showOnlyWrong;
            displayResults(lastResults);
        });
        document.getElementById('toggleAnswersBtn')?.addEventListener('click', () => {
            showAnswers = !showAnswers;
            displayResults(lastResults);
        });
        return;
    }

    let html = `<div class="result-summary-bar">
        <div class="result-progress">
            <span>✅ ${percentOriginal}% (${correctOriginal}/${totalOriginal})</span>
            <div class="big-progress-bar">
                <div class="big-progress-fill" style="width:${percentOriginal}%; background:${color};"></div>
            </div>
        </div>
        <div class="result-buttons">
            <button id="toggleWrongBtn" class="btn btn-small">❌ 只顯示錯題</button>
            <button id="toggleAnswersBtn" class="btn btn-small">📋 顯示答案</button>
        </div>
    </div>`;

    html += `<div class="results-card-list">`;

    for (let i = 0; i < results.length; i++) {
        if (showOnlyWrong && results[i].isCorrect) continue;

        let r = results[i];
        let cardClass = r.isCorrect ? 'correct' : 'wrong';
        let icon = r.isCorrect ? '✅' : '❌';

        html += `<div class="result-card ${cardClass}">`;
        html += `<div class="result-card-header">`;
        html += `<span class="result-card-question">${i + 1}. ${r.question.text}</span>`;
        html += `<span class="result-card-icon">${icon}</span>`;
        html += `</div>`;

        if (showAnswers) {
            html += `<div class="result-card-details">`;
            html += `<span>📝 你的答案：${r.userLetter || '?'}</span>`;
            html += `<span>✓ 正解：${r.correctLetter}</span>`;
            html += `</div>`;
        }

        html += `<div class="result-card-actions">`;
        html += `<button class="btn-explain" data-idx="${i}">📖 查看題解</button>`;
        html += `</div>`;
        html += `</div>`;
    }

    html += `</div>`;

    document.getElementById('resultContent').innerHTML = html;
    document.getElementById('resultModal').style.display = 'flex';

    document.getElementById('toggleWrongBtn')?.addEventListener('click', () => {
        showOnlyWrong = !showOnlyWrong;
        displayResults(lastResults);
    });
    document.getElementById('toggleAnswersBtn')?.addEventListener('click', () => {
        showAnswers = !showAnswers;
        displayResults(lastResults);
    });
    document.querySelectorAll('.btn-explain').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let idx = parseInt(btn.dataset.idx);
            let r = lastResults[idx];
            document.getElementById('resultModal').style.display = 'none';
            showExplainModal(r.question, r.userLetter, r.correctLetter, r.userText, r.correctText, r.isCorrect);
        });
    });
}

// ==================== 桌面版獨立函數 ====================

function showDesktopQuizModal() {
    renderDesktopQuizNav();
    renderDesktopCurrentQuestion();
    document.getElementById('desktopQuizModal').style.display = 'flex';
}

function renderDesktopQuizNav() {
    let nav = document.getElementById('desktopNav');
    if (!nav) return;
    let html = '';
    const total = currentQuestions.length;
    
    let dotClass = '';
    if (total <= 30) dotClass = '';
    else if (total <= 45) dotClass = 'small';
    else dotClass = 'tiny';
    
    for (let i = 0; i < total; i++) {
        let cls = dotClass;
        if (i === currentQIndex) cls += ' current';
        else if (currentAnswers[i] !== null) cls += ' answered';
        else cls += ' unanswered';
        html += `<button class="nav-dot ${cls}" data-idx="${i}">${i + 1}</button>`;
    }
    nav.innerHTML = html;
    
    document.getElementById('desktopCounter').innerHTML = `${currentQIndex + 1} / ${total}`;
    
    document.querySelectorAll('#desktopNav .nav-dot').forEach(btn => btn.addEventListener('click', (e) => {
        currentQIndex = parseInt(btn.dataset.idx);
        renderDesktopQuizNav();
        renderDesktopCurrentQuestion();
        updateDesktopNavButtons();
    }));
    
    updateDesktopSidebarDifficulty();
    checkDesktopAllQuestionsAnswered();
}

function updateDesktopSidebarDifficulty() {
    if (currentQuestions.length === 0) return;
    const q = currentQuestions[currentQIndex];
    const sidebar = document.getElementById('desktopSidebar');
    if (!sidebar) return;
    
    sidebar.classList.remove('difficulty-translate', 'difficulty-basic', 'difficulty-advanced', 'difficulty-challenge');
    
    if (q.difficulty === '🌐 Translate') {
        sidebar.classList.add('difficulty-translate');
    } else if (q.difficulty === '✅ Basic') {
        sidebar.classList.add('difficulty-basic');
    } else if (q.difficulty === '📈 Advanced') {
        sidebar.classList.add('difficulty-advanced');
    } else if (q.difficulty === '🔥 Challenge') {
        sidebar.classList.add('difficulty-challenge');
    }
}

function renderDesktopCurrentQuestion() {
    if (currentQuestions.length === 0) return;
    
    const q = currentQuestions[currentQIndex];
    const map = currentOptionsMapping[currentQIndex];
    const hasImage = q.imageUrl !== null;
    
    document.getElementById('desktopQuestionText').innerHTML = q.text;
    document.getElementById('desktopCounter').innerHTML = `${currentQIndex + 1} / ${currentQuestions.length}`;
    document.getElementById('desktopDifficulty').innerHTML = q.difficulty;
    
    updateDesktopTimerDisplay();
    updateDesktopSidebarDifficulty();
    
    const imageArea = document.getElementById('desktopImageArea');
    const mainPanel = document.querySelector('.main-panel');
    
    if (hasImage && q.imageUrl) {
        imageArea.innerHTML = `<img src="${q.imageUrl}" class="quiz-image" id="desktopImageThumb" style="max-height:110px; max-width:100%; object-fit:contain; cursor:pointer; border-radius:8px; border:1px solid #e9e4f5; padding:4px;">`;
        imageArea.style.display = 'block';
        if (mainPanel) mainPanel.classList.remove('no-image');
        
        document.getElementById('desktopImageThumb')?.addEventListener('click', () => {
            document.getElementById('zoomImage').src = q.imageUrl;
            document.getElementById('imageZoomModal').style.display = 'flex';
        });
    } else {
        imageArea.innerHTML = '';
        imageArea.style.display = 'none';
        if (mainPanel) mainPanel.classList.add('no-image');
    }
    
    const optsDiv = document.getElementById('desktopOptions');
    optsDiv.innerHTML = '';
    optsDiv.className = 'options-grid';
    
    for (let l of ['A', 'B', 'C', 'D']) {
        let btn = document.createElement('button');
        btn.className = 'option-btn';
        if (currentAnswers[currentQIndex] === l) btn.classList.add('selected');
        btn.textContent = `${l}. ${map.letterToText[l]}`;
        btn.addEventListener('click', () => {
            currentAnswers[currentQIndex] = l;
            renderDesktopCurrentQuestion();
            renderDesktopQuizNav();
            checkDesktopAllQuestionsAnswered();
        });
        optsDiv.appendChild(btn);
    }
    
    updateDesktopNavButtons();
    checkDesktopAllQuestionsAnswered();
    updateDesktopPeriodicButton();
}

function updateDesktopNavButtons() {
    let prev = document.getElementById('desktopPrevBtn'), next = document.getElementById('desktopNextBtn');
    if (prev) prev.disabled = (currentQIndex === 0);
    if (next) next.disabled = (currentQIndex === currentQuestions.length - 1);
}

function updateDesktopTimerDisplay() {
    let m = Math.floor(timeRemaining / 60), s = timeRemaining % 60;
    const timerEl = document.getElementById('desktopTimer');
    if (timerEl) timerEl.innerText = `⏱️ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function checkDesktopAllQuestionsAnswered() {
    if (currentQuestions.length === 0) return;
    
    const allAnswered = currentAnswers.every(a => a !== null && a !== undefined);
    const submitBtn = document.getElementById('desktopSubmitBtn');
    if (!submitBtn) return;
    
    if (allAnswered && currentAnswers.length > 0) {
        if (!blinkInterval) {
            blinkInterval = setInterval(() => {
                submitBtn.style.animation = 'blink 0.3s step-end infinite';
            }, 100);
        }
    } else {
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = null;
            submitBtn.style.animation = '';
        }
    }
}

function updateDesktopPeriodicButton() {
    const periodicBtn = document.getElementById('desktopPeriodicBtn');
    if (!periodicBtn) return;
    
    const shouldShow = (currentChapter && parseInt(currentChapter) >= 6) || currentChapter === null;
    
    if (shouldShow) {
        periodicBtn.style.display = 'inline-block';
        periodicBtn.classList.remove('hidden');
    } else {
        periodicBtn.style.display = 'none';
        periodicBtn.classList.add('hidden');
    }
}

function submitDesktopAll() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        const submitBtn = document.getElementById('desktopSubmitBtn');
        if (submitBtn) submitBtn.style.animation = '';
    }
    if (timerInterval) clearInterval(timerInterval);
    const timeSpentSeconds = Math.round((Date.now() - startTime) / 1000);
    
    let results = [], batch = [], correctCount = 0;
    let consecutiveCorrect = userData.stats.consecutiveCorrect || 0;
    let answeredCount = currentAnswers.filter(a => a !== null).length;
    let isBlankPaper = (answeredCount === 0);
    const isUnitTestMode = (currentChapter === null && currentQuestions.length > 1);

    for (let i = 0; i < currentQuestions.length; i++) {
        let q = currentQuestions[i], map = currentOptionsMapping[i], userLetter = currentAnswers[i];
        let isCorrect = (userLetter === map.correctLetter);
        if (isCorrect) {
            correctCount++;
            consecutiveCorrect++;
        } else {
            consecutiveCorrect = 0;
        }
        let userText = userLetter ? map.letterToText[userLetter] : '(未作答)', correctText = map.letterToText[map.correctLetter];
        results.push({ question: q, userLetter: userLetter || '?', correctLetter: map.correctLetter, userText, correctText, isCorrect, qid: q.id });
        batch.push({ qid: q.id, isCorrect: isCorrect });
    }
    userData.stats.consecutiveCorrect = consecutiveCorrect;
    if (consecutiveCorrect > (userData.stats.maxConsecutive || 0)) userData.stats.maxConsecutive = consecutiveCorrect;
    recordBatch(batch);
    let accuracy = Math.round(correctCount / currentQuestions.length * 100);
    let diffName = selectedDifficulty == 0 ? "★ 1星" : (selectedDifficulty == 1 ? "★★★ 3星" : "★★★★★ 5星");
    let mode = isTrialMode ? 'trial' : 'normal';
    let expectedTime = currentQuestions.length * (selectedDifficulty == 0 ? 108 : (selectedDifficulty == 2 ? 75 : 90));
    let timeSpent = Math.round((expectedTime - timeRemaining) / expectedTime * 100);
    
    if (isSingleQuestionMode && currentQuestions.length === 1) {
        const qid = currentQuestions[0].id;
        const isCorrectSingle = results[0].isCorrect;
        
        if (singleQuestionSource === 'myMistakes' && isCorrectSingle) {
            userData.latestStatus[qid] = true;
            saveUserData();
            alert('🎉 答對了！該題已從「我的錯題」中移除！');
        } else if (singleQuestionSource === 'myMistakes' && !isCorrectSingle) {
            alert('❌ 答錯了！該題仍保留在「我的錯題」中，加油！');
        } else if (singleQuestionSource === 'pastMistakes' || singleQuestionSource === 'pinned') {
            if (isCorrectSingle) {
                alert('✅ 答對了！該題仍保留在列表中（歷程/收藏不會自動移除）');
            } else {
                alert('❌ 答錯了！再試一次吧！');
            }
        }
        recordBatch(batch);
        addPracticeHistory(currentUnit, currentChapter, '單題練習', 1, isCorrectSingle ? 1 : 0, isCorrectSingle ? 100 : 0, 'single', 0, consecutiveCorrect, isBlankPaper, timeSpentSeconds);
        renderMyMistakes();
        renderPastMistakes();
        renderPinned();
        renderHistory();
        renderAchievements();
        document.getElementById('desktopQuizModal').style.display = 'none';
        return;
    }
    
    addPracticeHistory(currentUnit, currentChapter, diffName, currentQuestions.length, correctCount, accuracy, mode, timeSpent, consecutiveCorrect, isBlankPaper, timeSpentSeconds);
    lastResults = results;
    
    if (isUnitTestMode && currentQuestions.length >= 10) {
        window._dseResultCallback = function() {
            displayResults(results);
        };
        showDSEResult(accuracy, correctCount, currentQuestions.length);
        document.getElementById('desktopQuizModal').style.display = 'none';
        renderPractice();
        renderMyMistakes();
        renderPastMistakes();
        renderPinned();
        renderHistory();
        renderAchievements();
        updateSettingsUnlockStatus();
        return;
    }
    
    displayResults(results);
    document.getElementById('desktopQuizModal').style.display = 'none';
    renderPractice();
    renderMyMistakes();
    renderPastMistakes();
    renderPinned();
    renderHistory();
    renderAchievements();
    updateSettingsUnlockStatus();
}

// ==================== initTabs ====================
function initTabs() {
    let tabs = document.querySelectorAll('.tab'), panels = { 
        practice: document.getElementById('practicePanel'), 
        myMistakes: document.getElementById('myMistakesPanel'), 
        pastMistakes: document.getElementById('pastMistakesPanel'), 
        pinned: document.getElementById('pinnedPanel'), 
        history: document.getElementById('historyPanel'), 
        achievements: document.getElementById('achievementsPanel'),
        teacher: document.getElementById('teacherPanel')
    };
    tabs.forEach(tab => tab.addEventListener('click', () => {
        let target = tab.dataset.tab;
        Object.keys(panels).forEach(p => {
            if (panels[p]) panels[p].style.display = 'none';
        });
        if (panels[target]) panels[target].style.display = 'block';
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (target === 'myMistakes') renderMyMistakes();
        if (target === 'pastMistakes') renderPastMistakes();
        if (target === 'pinned') renderPinned();
        if (target === 'history') renderHistory();
        if (target === 'achievements') renderAchievements();
        if (target === 'teacher') renderTeacherPanel();
    }));
}

// ==================== renderTeacherPanel（老師後台） ====================
async function renderTeacherPanel() {
    const container = document.getElementById('teacherPanel');
    if (!container) return;
    if (!currentUser || !currentUser.isTeacher) {
        container.innerHTML = '<div class="card">⚠️ 只有老師可以查看此頁面</div>';
        return;
    }
    
    if (!currentUser.managedClasses) {
        currentUser.managedClasses = [currentUser.className];
        updateUser(currentUser.userId, { managedClasses: currentUser.managedClasses });
    }
    
    const managedClasses = currentUser.managedClasses || [currentUser.className];
    const currentClass = currentUser.currentClass || currentUser.className;
    const students = await loadAllStudentsFromFirebase(currentClass);
    const classSettings = await loadClassSettings(currentClass) || {};
    const openChapters = classSettings.openChapters || [];
    
    let html = `
        <div class="card">
            <div class="card-title">👤 教師設定</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:end;">
                <div>
                    <label style="font-size:12px; font-weight:500; color:#2e0f5a;">教師姓名</label>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="text" id="teacherNameInput" value="${currentUser.name}" style="flex:1; padding:8px 12px; border-radius:10px; border:2px solid #e0d6f5; font-size:13px; outline:none;">
                        <button class="btn btn-primary" id="updateTeacherNameBtn" style="padding:8px 16px; font-size:13px; white-space:nowrap;">更新姓名</button>
                    </div>
                </div>
                <div>
                    <label style="font-size:12px; font-weight:500; color:#2e0f5a;">目前班級</label>
                    <select id="teacherClassSelector" style="width:100%; padding:8px 12px; border-radius:10px; border:2px solid #e0d6f5; font-size:13px; outline:none; background:white;">
                        ${managedClasses.map(c => `<option value="${c}" ${c === currentClass ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="margin-top:8px; font-size:12px; color:#888;">
                💡 管理班級：${managedClasses.join('、')} 
                <button class="btn btn-small" id="manageClassesBtn" style="font-size:11px; padding:2px 10px; margin-left:6px;">管理班級</button>
            </div>
        </div>
        
        <div class="card">
            <div class="card-title">📝 建立學生帳戶</div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:8px; margin-bottom:8px;">
                <div>
                    <label style="font-size:12px; font-weight:500; color:#2e0f5a;">學號（可自訂）</label>
                    <input type="text" id="teacherNewId" placeholder="留空自動產生" style="width:100%; padding:8px 12px; border-radius:10px; border:2px solid #e0d6f5; font-size:13px; outline:none;">
                </div>
                <div>
                    <label style="font-size:12px; font-weight:500; color:#2e0f5a;">姓名</label>
                    <input type="text" id="teacherNewName" placeholder="陳小明" style="width:100%; padding:8px 12px; border-radius:10px; border:2px solid #e0d6f5; font-size:13px; outline:none;">
                </div>
                <div>
                    <label style="font-size:12px; font-weight:500; color:#2e0f5a;">班級</label>
                    <input type="text" id="teacherNewClass" placeholder="3A" style="width:100%; padding:8px 12px; border-radius:10px; border:2px solid #e0d6f5; font-size:13px; outline:none;" value="${currentClass}">
                </div>
                <div>
                    <label style="font-size:12px; font-weight:500; color:#2e0f5a;">電話號碼</label>
                    <input type="text" id="teacherNewPhone" placeholder="91234567" style="width:100%; padding:8px 12px; border-radius:10px; border:2px solid #e0d6f5; font-size:13px; outline:none;">
                </div>
            </div>
            <button class="btn btn-primary" id="teacherCreateStudentBtn" style="padding:8px 16px; font-size:13px;">✅ 建立帳戶</button>
            <div id="teacherCreateResult" class="mt-8"></div>
        </div>
        
        <div class="card">
            <div class="card-title">👨‍🎓 已建立的學生（${currentClass}）</div>
            <div id="teacherStudentList">
    `;
    
    if (students.length === 0) {
        html += `<div style="text-align:center; color:#999; padding:16px 0; font-size:13px;">還沒有學生帳戶</div>`;
    } else {
        html += `<div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f5f0ff;">
                        <th style="padding:8px 10px; text-align:left; border-bottom:2px solid #4a1d8c;">姓名</th>
                        <th style="padding:8px 10px; text-align:left; border-bottom:2px solid #4a1d8c;">學號</th>
                        <th style="padding:8px 10px; text-align:center; border-bottom:2px solid #4a1d8c;">總題數</th>
                        <th style="padding:8px 10px; text-align:center; border-bottom:2px solid #4a1d8c;">正確率</th>
                        <th style="padding:8px 10px; text-align:center; border-bottom:2px solid #4a1d8c;">狀態</th>
                        <th style="padding:8px 10px; text-align:center; border-bottom:2px solid #4a1d8c;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;
        for (const s of students) {
            const stats = s.stats || { totalQuestionsAnswered: 0, totalCorrect: 0 };
            const total = stats.totalQuestionsAnswered || 0;
            const acc = total > 0 ? Math.round((stats.totalCorrect || 0) / total * 100) : 0;
            const status = s.isFirstLogin ? '⏳ 首次登入' : '✅ 已啟用';
            const statusColor = s.isFirstLogin ? '#f59e0b' : '#10b981';
            html += `
                <tr style="border-bottom:1px solid #f0edf8;">
                    <td style="padding:8px 10px; font-weight:500;">
                        ${s.name}
                        <button class="btn-icon" onclick="openEditNameModal('${s.userId}')" style="font-size:12px;" title="修改姓名">✏️</button>
                    </td>
                    <td style="padding:8px 10px; color:#666;">${s.userId}</td>
                    <td style="padding:8px 10px; text-align:center;">${total}</td>
                    <td style="padding:8px 10px; text-align:center; font-weight:600; color:${acc >= 70 ? '#10b981' : (acc >= 40 ? '#f59e0b' : '#dc2626')};">${acc}%</td>
                    <td style="padding:8px 10px; text-align:center;">
                        <span style="background:${statusColor}; color:white; padding:2px 12px; border-radius:12px; font-size:11px;">${status}</span>
                    </td>
                    <td style="padding:8px 10px; text-align:center;">
                        <button class="btn btn-small" onclick="showStudentPassword('${s.userId}')" style="background:#f59e0b; padding:2px 8px; font-size:10px; color:white; border:none; border-radius:12px;">🔑 密碼</button>
                        <button class="btn btn-danger btn-small" onclick="deleteStudent('${s.userId}')" style="font-size:10px; padding:2px 8px;">刪除</button>
                    </td>
                </tr>
            `;
        }
        html += `</tbody></table></div>`;
    }
    html += `</div></div>`;
    
    // 章節管理
    html += `
        <div class="card">
            <div class="card-title">📖 章節開放管理</div>
            <div style="font-size:13px; color:#666; margin-bottom:10px;">
                勾選 = 學生可以看見該章節
            </div>
            <div id="chapterManagement">
    `;
    
    // 動態從題庫讀取章節
    const allChaptersFromDB = [];
    for (let u in window.ALL_UNITS) {
        for (let ch in window.ALL_UNITS[u].chapters) {
            const chNum = parseInt(ch);
            allChaptersFromDB.push({
                id: chNum,
                name: window.ALL_UNITS[u].chapters[ch].name
            });
        }
    }
    allChaptersFromDB.sort((a, b) => a.id - b.id);
    
    for (const ch of allChaptersFromDB) {
        const isOpen = openChapters.includes(ch.id);
        html += `
            <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #f0edf8;">
                <input type="checkbox" id="ch_${ch.id}" ${isOpen ? 'checked' : ''} data-chapter="${ch.id}">
                <label for="ch_${ch.id}" style="font-size:13px;">${ch.name}</label>
                <span style="font-size:11px; color:${isOpen ? '#10b981' : '#999'}; margin-left:auto;">${isOpen ? '🔓 已開放' : '🔒 已隱藏'}</span>
            </div>
        `;
    }
    
    html += `
            </div>
            <button class="btn btn-success" id="saveChaptersBtn" style="margin-top:10px; padding:8px 16px; font-size:13px;">💾 儲存章節設定</button>
            <div id="chapterSaveResult" class="mt-8"></div>
        </div>
    `;
    
    // 錯題統計
    html += `
        <div class="card">
            <div class="card-title">❌ 錯題統計</div>
            <div id="wrongStatsContainer">
    `;
    
    const wrongCount = {};
    for (const s of students) {
        const attempts = s.allAttempts || [];
        for (const att of attempts) {
            if (!att.isCorrect) {
                wrongCount[att.qid] = (wrongCount[att.qid] || 0) + 1;
            }
        }
    }
    
    const sortedWrong = Object.entries(wrongCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    if (sortedWrong.length === 0) {
        html += `<div style="text-align:center; color:#999; padding:12px 0; font-size:13px;">🎉 全班沒有錯題！繼續保持！</div>`;
    } else {
        let qTexts = {};
        for (let u in window.ALL_UNITS) {
            for (let c in window.ALL_UNITS[u].chapters) {
                for (let q of window.ALL_UNITS[u].chapters[c].questions) {
                    qTexts[q.id] = q.text;
                }
            }
        }
        for (const [qid, count] of sortedWrong) {
            const text = qTexts[qid] || qid;
            const shortText = text.length > 60 ? text.substring(0, 60) + '...' : text;
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f0edf8;">
                    <span style="font-size:13px;">${shortText}</span>
                    <span style="font-size:13px; font-weight:600; color:#dc2626;">${count} 人錯</span>
                </div>
            `;
        }
    }
    
    html += `
            </div>
        </div>
    `;
    
    // 成就/積分排名
    html += `
        <div class="card">
            <div class="card-title">🏆 成就/積分排名</div>
            <div id="rankContainer">
    `;
    
    const ranked = [...students].sort((a, b) => {
        const aPoints = calculateTotalPoints(a.achievements || {});
        const bPoints = calculateTotalPoints(b.achievements || {});
        return bPoints - aPoints;
    }).slice(0, 10);
    
    if (ranked.length === 0) {
        html += `<div style="text-align:center; color:#999; padding:12px 0; font-size:13px;">暫無數據</div>`;
    } else {
        const medals = ['🥇', '🥈', '🥉'];
        for (let i = 0; i < ranked.length; i++) {
            const s = ranked[i];
            const points = calculateTotalPoints(s.achievements || {});
            const medal = i < 3 ? medals[i] : `${i+1}.`;
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #f0edf8;">
                    <span style="font-size:14px;">${medal} ${s.name}</span>
                    <span style="font-size:14px; font-weight:600; color:#4a1d8c;">${points} 分</span>
                </div>
            `;
        }
    }
    
    html += `
            </div>
        </div>
    `;
    
    // 匯出全班成績
    html += `
        <div class="card">
            <div class="card-title">📥 匯出數據</div>
            <button class="btn btn-primary" id="exportClassDataBtn" style="padding:8px 16px; font-size:13px;">📥 匯出全班成績 CSV</button>
            <div id="exportResult" class="mt-8"></div>
        </div>
    `;
    
    // 舊用戶轉移功能已移除，不再顯示
    
    html += `
        <div class="card" style="background:#f0fdf4; border:1px solid #10b981;">
            <div class="card-title">💡 老師後台功能</div>
            <div style="font-size:13px; color:#065f46;">
                ✅ 修改教師姓名<br>
                ✅ 切換管理班級<br>
                ✅ 建立學生帳戶（可自訂學號）<br>
                ✅ 查看學生進度（即時）<br>
                ✅ 修改學生姓名<br>
                ✅ 刪除學生帳戶<br>
                ✅ 查看學生初始密碼（可複製）<br>
                ✅ 章節開放/隱藏<br>
                ✅ 錯題統計<br>
                ✅ 成就/積分排名<br>
                ✅ 匯出全班成績 CSV
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    bindTeacherEvents();
}

// ==================== 顯示學生密碼（可複製） ====================
function showStudentPassword(userId) {
    const user = findUser(userId);
    if (!user) {
        alert('❌ 找不到該學生');
        return;
    }
    const password = user.initialPassword || '（已修改密碼）';
    
    // 用獨立彈窗顯示，含複製按鈕
    const modalHtml = `
        <div id="passwordModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center;
            z-index: 10000;
        ">
            <div style="
                background: white; border-radius: 24px; padding: 32px; 
                max-width: 420px; width: 90%; text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            ">
                <div style="font-size: 36px; margin-bottom: 8px;">🔑</div>
                <h2 style="color: #2e0f5a; margin-bottom: 4px;">學生初始密碼</h2>
                <div style="color: #888; font-size: 14px; margin-bottom: 16px;">${user.name}（${user.userId}）</div>
                <div style="
                    font-family: monospace; font-size: 24px; 
                    background: #f0f0f0; padding: 12px 20px; border-radius: 8px;
                    display: inline-block; margin-bottom: 16px;
                    letter-spacing: 2px;
                ">${password}</div>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="navigator.clipboard?.writeText('${password}').then(() => alert('✅ 密碼已複製！')).catch(() => alert('⚠️ 請手動複製'))" style="
                        background: #4a1d8c; color: white; border: none; 
                        padding: 8px 24px; border-radius: 40px; font-size: 14px; cursor: pointer;
                    ">📋 複製密碼</button>
                    <button onclick="document.getElementById('passwordModal').remove()" style="
                        background: white; color: #666; border: 1px solid #ddd; 
                        padding: 8px 24px; border-radius: 40px; font-size: 14px; cursor: pointer;
                    ">關閉</button>
                </div>
                <div style="font-size: 12px; color: #f59e0b; margin-top: 12px;">⚠️ 如果學生已修改過密碼，這個密碼可能已經無效</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function bindTeacherEvents() {
    document.getElementById('updateTeacherNameBtn')?.addEventListener('click', function() {
        const newName = document.getElementById('teacherNameInput').value.trim();
        if (!newName) { alert('請輸入姓名'); return; }
        if (newName === currentUser.name) { alert('姓名未變更'); return; }
        updateUser(currentUser.userId, { name: newName });
        currentUser = findUser(currentUser.userId);
        updateUserLabel();
        renderTeacherPanel();
        alert('✅ 姓名已更新！');
    });
    
    document.getElementById('teacherClassSelector')?.addEventListener('change', function() {
        const newClass = this.value;
        if (newClass !== currentUser.className) {
            updateUser(currentUser.userId, { className: newClass, currentClass: newClass });
            currentUser = findUser(currentUser.userId);
            renderTeacherPanel();
            renderPractice();
        }
    });
    
    // 建立學生（包含獨立彈窗顯示密碼）
    document.getElementById('teacherCreateStudentBtn')?.addEventListener('click', function() {
        const customId = document.getElementById('teacherNewId').value.trim() || null;
        const name = document.getElementById('teacherNewName').value.trim();
        const className = document.getElementById('teacherNewClass').value.trim() || currentUser.className;
        const phone = document.getElementById('teacherNewPhone').value.trim();
        const resultEl = document.getElementById('teacherCreateResult');
        
        if (!name || !phone) {
            resultEl.innerHTML = `<div class="alert alert-danger">⚠️ 請填寫姓名和電話號碼</div>`;
            return;
        }
        
        const newUser = createUser(name, className, phone, customId);
        
        // 清空輸入框
        document.getElementById('teacherNewId').value = '';
        document.getElementById('teacherNewName').value = '';
        document.getElementById('teacherNewPhone').value = '';
        
        // 用獨立彈窗顯示結果（不會消失，可複製）
        const modalHtml = `
            <div id="createSuccessModal" style="
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white; border-radius: 24px; padding: 32px; 
                    max-width: 420px; width: 90%; text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                ">
                    <div style="font-size: 48px; margin-bottom: 8px;">✅</div>
                    <h2 style="color: #065f46; margin-bottom: 12px;">帳戶已建立！</h2>
                    <div style="text-align: left; line-height: 2; font-size: 15px;">
                        <div>👤 姓名：<strong>${newUser.name}</strong></div>
                        <div>🆔 學號：<strong style="font-size: 20px; color: #4a1d8c;">${newUser.userId}</strong></div>
                        <div>
                            🔑 密碼：
                            <span style="font-family: monospace; font-size: 20px; background: #f0f0f0; padding: 2px 12px; border-radius: 6px; display: inline-block;">${newUser.initialPassword}</span>
                            <button onclick="navigator.clipboard?.writeText('${newUser.initialPassword}').then(() => alert('✅ 密碼已複製！')).catch(() => alert('⚠️ 請手動複製'))" style="
                                background: #4a1d8c; color: white; border: none; 
                                padding: 2px 14px; border-radius: 20px; cursor: pointer; font-size: 13px;
                            ">📋 複製</button>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #f59e0b; margin: 8px 0;">⚠️ 學生第一次登入時會要求修改密碼</div>
                    <button onclick="document.getElementById('createSuccessModal').remove()" style="
                        background: #4a1d8c; color: white; border: none; 
                        padding: 10px 40px; border-radius: 40px; font-size: 16px; cursor: pointer; font-weight: 600;
                    ">我知道了</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // 重新整理老師後台（但保留彈窗）
        renderTeacherPanel();
    });
    
    document.getElementById('saveChaptersBtn')?.addEventListener('click', async function() {
        const checkboxes = document.querySelectorAll('#chapterManagement input[type="checkbox"]');
        const openChapters = [];
        checkboxes.forEach(cb => {
            if (cb.checked) {
                openChapters.push(parseInt(cb.dataset.chapter));
            }
        });
        const className = currentUser.currentClass || currentUser.className;
        await saveClassSettings(className, { openChapters: openChapters });
        document.getElementById('chapterSaveResult').innerHTML = `<div class="alert alert-success">✅ 章節設定已儲存！學生重新整理後即可看到變化。</div>`;
        setTimeout(() => {
            document.getElementById('chapterSaveResult').innerHTML = '';
        }, 3000);
    });
    
    document.getElementById('exportClassDataBtn')?.addEventListener('click', async function() {
        const className = currentUser.currentClass || currentUser.className;
        const students = await loadAllStudentsFromFirebase(className);
        if (students.length === 0) {
            document.getElementById('exportResult').innerHTML = `<div class="alert alert-warning">⚠️ 該班級沒有學生數據</div>`;
            return;
        }
        
        let csv = [["姓名", "學號", "總題數", "正確率", "總積分", "狀態"]];
        for (const s of students) {
            const stats = s.stats || { totalQuestionsAnswered: 0, totalCorrect: 0 };
            const total = stats.totalQuestionsAnswered || 0;
            const acc = total > 0 ? Math.round((stats.totalCorrect || 0) / total * 100) : 0;
            const points = calculateTotalPoints(s.achievements || {});
            const status = s.isFirstLogin ? '首次登入' : '已啟用';
            csv.push([s.name, s.userId, total, acc + '%', points, status]);
        }
        
        const blob = new Blob(["\uFEFF" + csv.map(r => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `全班成績_${className}_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        document.getElementById('exportResult').innerHTML = `<div class="alert alert-success">✅ 匯出成功！</div>`;
        setTimeout(() => {
            document.getElementById('exportResult').innerHTML = '';
        }, 3000);
    });
    
    document.getElementById('manageClassesBtn')?.addEventListener('click', function() {
        const currentClasses = currentUser.managedClasses || [currentUser.className];
        const input = prompt('請輸入您要管理的班級（用逗號分隔）：\n例如：3A,3B,3C', currentClasses.join(','));
        if (input !== null) {
            const classes = input.split(',').map(s => s.trim()).filter(Boolean);
            if (classes.length === 0) { alert('至少需要一個班級'); return; }
            updateUser(currentUser.userId, { managedClasses: classes });
            currentUser = findUser(currentUser.userId);
            renderTeacherPanel();
            alert('✅ 班級管理已更新！');
        }
    });
    
    // 移除舊用戶轉移相關事件
}

function openEditNameModal(userId) {
    const user = findUser(userId);
    if (!user) return;
    const newName = prompt(`修改「${user.name}」的姓名：`, user.name);
    if (newName && newName.trim() !== '' && newName.trim() !== user.name) {
        updateUser(userId, { name: newName.trim() });
        renderTeacherPanel();
        if (currentUser && currentUser.userId === userId) {
            currentUser = findUser(userId);
            updateUserLabel();
        }
    }
}

function deleteStudent(userId) {
    if (userId === currentUser?.userId) {
        alert('⚠️ 無法刪除自己的帳戶');
        return;
    }
    const user = findUser(userId);
    if (!user) return;
    if (confirm(`⚠️ 確定要刪除「${user.name}」（${user.userId}）的帳戶嗎？`)) {
        const db = getUsers();
        db.users = db.users.filter(u => u.userId !== userId);
        saveUsers(db);
        renderTeacherPanel();
    }
}

function unlockAll() {
    if (!pendingUnit || !pendingChapter) {
        alert('請先選擇一個章節');
        return;
    }
    let qs = window.ALL_UNITS[pendingUnit].chapters[pendingChapter].questions;
    for (let q of qs) {
        userData.latestStatus[q.id] = true;
    }
    saveUserData();
    updateSettingsUnlockStatus();
    renderPractice();
    renderMyMistakes();
    renderPastMistakes();
    renderPinned();
    renderHistory();
    renderAchievements();
    alert('🔓 所有難度已解鎖！');
}

function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

async function loadClassSettings(className) {
    if (!firestoreEnabled) {
        const db = getUsers();
        return db.classSettings || {};
    }
    try {
        const doc = await firebase.firestore()
            .collection('classes')
            .doc(className)
            .get();
        if (doc.exists) {
            return doc.data() || {};
        }
        return {};
    } catch(e) {
        console.warn('⚠️ Firebase 讀取失敗:', e.message);
        const db = getUsers();
        return db.classSettings || {};
    }
}

async function saveClassSettings(className, settings) {
    if (!firestoreEnabled) {
        const db = getUsers();
        db.classSettings = { ...db.classSettings, [className]: settings };
        saveUsers(db);
        return;
    }
    try {
        await firebase.firestore()
            .collection('classes')
            .doc(className)
            .set(settings, { merge: true });
        console.log(`✅ 班級 ${className} 設定已儲存`);
    } catch(e) {
        console.warn('⚠️ Firebase 儲存失敗:', e.message);
        const db = getUsers();
        db.classSettings = { ...db.classSettings, [className]: settings };
        saveUsers(db);
    }
}

// ==================== DOMContentLoaded ====================
document.addEventListener('DOMContentLoaded', function() {
    const hasAutoLogin = checkAutoLogin();
    checkFirebase();
    if (!hasAutoLogin) {
        const saved = localStorage.getItem('ms_chem_login');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.userId) {
                    document.getElementById('loginUserId').value = data.userId;
                }
            } catch(e) {}
        }
    }
    
    // 難度選擇
    document.getElementById('diff-easy').addEventListener('click', () => { selectedDifficulty = 0; document.getElementById('diff-easy').classList.add('active'); document.getElementById('diff-medium').classList.remove('active'); document.getElementById('diff-hard').classList.remove('active'); isTrialMode = false; updateSettingsUnlockStatus(); });
    document.getElementById('diff-medium').addEventListener('click', () => { if (document.getElementById('diff-medium').disabled) return; selectedDifficulty = 1; document.getElementById('diff-easy').classList.remove('active'); document.getElementById('diff-medium').classList.add('active'); document.getElementById('diff-hard').classList.remove('active'); isTrialMode = false; updateSettingsUnlockStatus(); });
    document.getElementById('diff-hard').addEventListener('click', () => { if (document.getElementById('diff-hard').disabled) return; selectedDifficulty = 2; document.getElementById('diff-easy').classList.remove('active'); document.getElementById('diff-medium').classList.remove('active'); document.getElementById('diff-hard').classList.add('active'); isTrialMode = false; updateSettingsUnlockStatus(); });
    
    // 題數選擇
    document.getElementById('count-10').addEventListener('click', () => {
        selectedCount = 10;
        customCount = 10;
        document.getElementById('count-10').classList.add('active');
        document.getElementById('count-20').classList.remove('active');
        if (document.getElementById('count-36')) document.getElementById('count-36').classList.remove('active');
        const customInput = document.getElementById('customCount');
        if (customInput) customInput.value = 10;
    });
    document.getElementById('count-20').addEventListener('click', () => {
        if (document.getElementById('count-20').disabled) return;
        selectedCount = 20;
        customCount = 20;
        document.getElementById('count-10').classList.remove('active');
        document.getElementById('count-20').classList.add('active');
        if (document.getElementById('count-36')) document.getElementById('count-36').classList.remove('active');
        const customInput = document.getElementById('customCount');
        if (customInput) customInput.value = 20;
    });
    document.getElementById('count-36').addEventListener('click', () => {
        if (document.getElementById('count-36').disabled) return;
        selectedCount = 36;
        customCount = 36;
        document.getElementById('count-10').classList.remove('active');
        document.getElementById('count-20').classList.remove('active');
        document.getElementById('count-36').classList.add('active');
        const customInput = document.getElementById('customCount');
        if (customInput) customInput.value = 36;
    });
    
    // 試煉模式
    document.getElementById('trial-mode').addEventListener('click', () => {
        if (document.getElementById('trial-mode').disabled) return;
        isTrialMode = true;
        selectedDifficulty = 2;
        selectedCount = 50;
        customCount = 50;
        document.getElementById('diff-easy').classList.remove('active');
        document.getElementById('diff-medium').classList.remove('active');
        document.getElementById('diff-hard').classList.add('active');
        document.getElementById('count-10').classList.remove('active');
        document.getElementById('count-20').classList.remove('active');
        if (document.getElementById('count-36')) document.getElementById('count-36').classList.remove('active');
        const customInput = document.getElementById('customCount');
        if (customInput) customInput.value = 50;
        updateSettingsUnlockStatus();
    });
    
    // 一鍵解鎖
    document.getElementById('devUnlockBtn').addEventListener('click', unlockAll);
    
    // 排除翻譯題
    const excludeTranslateCheckbox = document.getElementById('excludeTranslate');
    if (excludeTranslateCheckbox) {
        excludeTranslateCheckbox.addEventListener('change', (e) => {
            excludeTranslate = e.target.checked;
            updateSettingsUnlockStatus();
        });
    }
    
    // 自訂題數
    const customInput = document.getElementById('customCount');
    if (customInput) {
        customInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val)) val = 10;
            let maxVal = parseInt(customInput.max);
            if (!isNaN(maxVal) && val > maxVal) val = maxVal;
            if (val < 1) val = 1;
            customCount = val;
            selectedCount = val;
            customInput.value = val;
            document.getElementById('count-10').classList.remove('active');
            document.getElementById('count-20').classList.remove('active');
            if (document.getElementById('count-36')) document.getElementById('count-36').classList.remove('active');
        });
    }
    
    // 開始練習
    document.getElementById('startPracticeBtn').addEventListener('click', () => {
        if (window._singleRedoQid) {
            let qid = window._singleRedoQid;
            window._singleRedoQid = null;
            let unit = pendingUnit, chapter = pendingChapter, allQs = [...window.ALL_UNITS[unit].chapters[chapter].questions], targetQ = allQs.find(q => q.id === qid);
            if (targetQ) {
                currentUnit = unit;
                currentChapter = chapter;
                currentQuestions = [targetQ];
                currentOptionsMapping = currentQuestions.map(q => { let letters = ['A', 'B', 'C', 'D'], map = {}; for (let i = 0; i < 4; i++) { let optText = q.options[i].substring(3); map[letters[i]] = optText; } return { letterToText: map, correctLetter: q.correct }; });
                currentAnswers = new Array(1).fill(null);
                currentQIndex = 0;
                timeRemaining = 90;
                updateTimerDisplay();
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => { if (timeRemaining <= 0) submitAll(); else { timeRemaining--; updateTimerDisplay(); } }, 1000);
                document.getElementById('settingsModal').style.display = 'none';
                showQuizModal();
            }
        } else {
            startPracticeWithSettings();
        }
    });
    
    // 取消
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => document.getElementById('settingsModal').style.display = 'none');
    
    // 關閉題解
    document.getElementById('closeExplainBtn').addEventListener('click', () => { document.getElementById('explainModal').style.display = 'none'; if (lastResults) displayResults(lastResults); });
    
    // 提交答案（手機版）
    document.getElementById('submitAllBtn').addEventListener('click', () => submitAll());
    
    // 關閉結果
    document.getElementById('closeResultBtn').addEventListener('click', () => document.getElementById('resultModal').style.display = 'none');
    document.getElementById('closeZoomBtn').addEventListener('click', closeImageZoom);
    
    // 上一題 / 下一題（手機版）
    document.getElementById('prevBtn').addEventListener('click', () => { if (currentQIndex > 0) { currentQIndex--; renderQuizNav(); renderCurrentQuestion(); updateNavButtons(); } });
    document.getElementById('nextBtn').addEventListener('click', () => { if (currentQIndex < currentQuestions.length - 1) { currentQIndex++; renderQuizNav(); renderCurrentQuestion(); updateNavButtons(); } });
    
    // 桌面版
    const desktopSubmitBtn = document.getElementById('desktopSubmitBtn');
    if (desktopSubmitBtn) {
        desktopSubmitBtn.addEventListener('click', submitDesktopAll);
    }
    const desktopPrevBtn = document.getElementById('desktopPrevBtn');
    const desktopNextBtn = document.getElementById('desktopNextBtn');
    if (desktopPrevBtn) {
        desktopPrevBtn.addEventListener('click', function() {
            if (currentQIndex > 0) {
                currentQIndex--;
                renderDesktopQuizNav();
                renderDesktopCurrentQuestion();
                updateDesktopNavButtons();
            }
        });
    }
    if (desktopNextBtn) {
        desktopNextBtn.addEventListener('click', function() {
            if (currentQIndex < currentQuestions.length - 1) {
                currentQIndex++;
                renderDesktopQuizNav();
                renderDesktopCurrentQuestion();
                updateDesktopNavButtons();
            }
        });
    }
    const desktopPeriodicBtn = document.getElementById('desktopPeriodicBtn');
    if (desktopPeriodicBtn) {
        desktopPeriodicBtn.addEventListener('click', showPeriodicTable);
    }
});