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

// ==================== 全局變量 ====================
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

// 成績總表控制變量
let showOnlyWrong = false;
let showAnswers = false;

// 成就定義
const ACHIEVEMENTS = {
    star1: { name: "一星完成", icon: "✅" },
    star3: { name: "三星解鎖", icon: "🔥" },
    star5: { name: "五星解鎖", icon: "💎" },
    trial: { name: "試煉完成", icon: "⚔️" },
    perfect: { name: "完美一課", icon: "🌟" },
    dse: { name: "DSE模擬完成", icon: "📝" },
    speed: { name: "速度之星", icon: "⚡" }
};

// ==================== 數據操作函數 ====================
function saveUserData() {
    if (!currentUser) return;
    localStorage.setItem(`ms_chem_${currentUser.id}`, JSON.stringify(userData));
}

function loadUserData() {
    if (!currentUser) return;
    const raw = localStorage.getItem(`ms_chem_${currentUser.id}`);
    if (raw) userData = JSON.parse(raw);
    else userData = { latestStatus: {}, allAttempts: [], favorites: [], practiceHistory: [], achievements: {} };
    if (!userData.latestStatus) userData.latestStatus = {};
    if (!userData.allAttempts) userData.allAttempts = [];
    if (!userData.favorites) userData.favorites = [];
    if (!userData.practiceHistory) userData.practiceHistory = [];
    if (!userData.achievements) userData.achievements = {};
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
    if (total === 0) return 0;
    return Math.round((correct / total) * 100);
}

function getChapterTotalQuestions(unit, chapter) {
    return window.ALL_UNITS[unit]?.chapters[chapter]?.questions.length || 0;
}

function getChapterMastery(unit, chapter) {
    let questions = window.ALL_UNITS[unit]?.chapters[chapter]?.questions || [];
    if (questions.length === 0) return 0;
    let correct = 0;
    for (let q of questions) if (userData.latestStatus[q.id] === true) correct++;
    return Math.round((correct / questions.length) * 100);
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
    if (total === 0) return 0;
    return Math.round((correct / total) * 100);
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

// ==================== 成就系統 ====================
function showUnlockCard(title, message, date) {
    let card = document.createElement('div');
    card.className = 'unlock-card';
    card.innerHTML = `
        <div style="font-size: 1.5rem;">🎉</div>
        <div style="font-weight: bold; margin: 4px 0;">${title}</div>
        <div style="font-size: 0.8rem;">${message}</div>
        <div style="font-size: 0.7rem; margin-top: 6px;">獲得日期：${date}</div>
    `;
    card.onclick = () => card.remove();
    document.body.appendChild(card);
    setTimeout(() => { if (card.parentNode) card.remove(); }, 4000);
}

function checkAndUnlockAchievements(unit, chapter, accuracy, questionCount, isPerfect, isDSE, isSpeed) {
    let today = new Date().toISOString().slice(0, 10);
    let achievementsKey = `${unit}_${chapter}`;
    if (!userData.achievements[achievementsKey]) userData.achievements[achievementsKey] = {};

    let star1Mastery = getChapterDifficultyMastery(unit, chapter, 0);
    let star3Mastery = getChapterDifficultyMastery(unit, chapter, 1);
    let star5Mastery = getChapterDifficultyMastery(unit, chapter, 2);

    if (star1Mastery >= 80 && !userData.achievements[achievementsKey].star1) {
        userData.achievements[achievementsKey].star1 = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `✅ ${ACHIEVEMENTS.star1.icon} ${window.ALL_UNITS[unit].chapters[chapter].name} - 一星完成`, today);
    }
    if (star3Mastery >= 80 && !userData.achievements[achievementsKey].star3) {
        userData.achievements[achievementsKey].star3 = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `🔥 ${ACHIEVEMENTS.star3.icon} ${window.ALL_UNITS[unit].chapters[chapter].name} - 三星解鎖`, today);
    }
    if (star5Mastery >= 80 && !userData.achievements[achievementsKey].star5) {
        userData.achievements[achievementsKey].star5 = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `💎 ${ACHIEVEMENTS.star5.icon} ${window.ALL_UNITS[unit].chapters[chapter].name} - 五星解鎖`, today);
    }
    if (isTrialMode && accuracy >= 80 && !userData.achievements[achievementsKey].trial) {
        userData.achievements[achievementsKey].trial = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `⚔️ ${ACHIEVEMENTS.trial.icon} ${window.ALL_UNITS[unit].chapters[chapter].name} - 試煉完成`, today);
    }

    if (isPerfect && !userData.achievements.perfect) {
        userData.achievements.perfect = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `🌟 完美一課 - 單次練習全部答對！`, today);
    }
    if (isDSE && !userData.achievements.dse) {
        userData.achievements.dse = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `📝 DSE模擬完成 - 完成36題模式！`, today);
    }
    if (isSpeed && !userData.achievements.speed) {
        userData.achievements.speed = { unlocked: true, date: today };
        showUnlockCard("成就解鎖！", `⚡ 速度之星 - 提前50%時間完成練習！`, today);
    }

    saveUserData();
}

// ==================== 做題紀錄 ====================
function addPracticeHistory(unit, chapter, difficultyName, questionCount, correctCount, accuracy, mode, timeSpentPercent) {
    let now = new Date();
    let date = now.toISOString().slice(0, 10);
    let time = now.toTimeString().slice(0, 5);
    let unitObj = window.ALL_UNITS[unit];
    let chapterName = unitObj ? unitObj.chapters[chapter].name : chapter;
    let unitName = unitObj ? unitObj.name : unit;

    userData.practiceHistory.unshift({
        id: Date.now(),
        date: date,
        time: time,
        unitId: unit,
        unitName: unitName,
        chapterId: chapter,
        chapterName: chapterName,
        difficulty: difficultyName,
        questionCount: questionCount,
        correctCount: correctCount,
        accuracy: accuracy,
        mode: mode
    });
    if (userData.practiceHistory.length > 100) userData.practiceHistory = userData.practiceHistory.slice(0, 100);
    saveUserData();

    if (timeSpentPercent !== undefined && timeSpentPercent <= 50) {
        checkAndUnlockAchievements(unit, chapter, accuracy, questionCount, false, false, true);
    }
}

// ==================== 抽題邏輯 ====================
function selectQuestionsByDifficultyAndCount(questions, count, preference, isTrial) {
    if (isTrial) {
        let sorted = [...questions];
        sorted.sort((a, b) => {
            if (a.difficulty_level !== b.difficulty_level) return b.difficulty_level - a.difficulty_level;
            let aWrong = userData.latestStatus[a.id] === false;
            let bWrong = userData.latestStatus[b.id] === false;
            if (aWrong !== bWrong) return aWrong ? -1 : 1;
            return 0;
        });
        return sorted.slice(0, Math.min(count, 50));
    }

    let candidates = [];
    for (let q of questions) {
        let include = false;
        if (preference == 0) {
            include = (q.difficulty_level == 0 || q.difficulty_level == 1);
        } else if (preference == 1) {
            include = true;
        } else {
            include = (q.difficulty_level == 2 || q.difficulty_level == 3);
        }
        if (include) candidates.push(q);
    }

    if (candidates.length < count) {
        candidates = [...questions];
    }

    let withStatus = candidates.map(q => {
        let status = userData.latestStatus[q.id];
        let isAttempted = (status !== undefined);
        let isCorrect = (status === true);
        return { q, isAttempted, isCorrect };
    });

    withStatus.sort((a, b) => {
        if (a.isAttempted !== b.isAttempted) return a.isAttempted ? 1 : -1;
        if (a.isAttempted && b.isAttempted) {
            if (a.isCorrect !== b.isCorrect) return a.isCorrect ? 1 : -1;
        }
        return 0;
    });

    let selected = withStatus.slice(0, count).map(item => item.q);
    return selected;
}

// ==================== UI 渲染函數 ====================
function toggleUnit(unitId) {
    const container = document.getElementById(`chapters-${unitId}`);
    const toggle = document.getElementById(`toggle-${unitId}`);
    if (container.classList.contains('open')) {
        container.classList.remove('open');
        toggle.textContent = '▶';
    } else {
        container.classList.add('open');
        toggle.textContent = '▼';
    }
}

function toggleAchievementUnit(unitId) {
    const container = document.getElementById(`achievement-chapters-${unitId}`);
    const toggle = document.getElementById(`achievement-toggle-${unitId}`);
    if (container.classList.contains('open')) {
        container.classList.remove('open');
        toggle.textContent = '▶';
    } else {
        container.classList.add('open');
        toggle.textContent = '▼';
    }
}

function toggleMistakeChapter(chapterKey, type) {
    const container = document.getElementById(`${type}-${chapterKey}`);
    const toggle = document.getElementById(`${type}-toggle-${chapterKey}`);
    if (container.classList.contains('open')) {
        container.classList.remove('open');
        toggle.textContent = '▶';
    } else {
        container.classList.add('open');
        toggle.textContent = '▼';
    }
}

function renderPractice() {
    const container = document.getElementById('practicePanel');
    if (!container) return;
    if (!window.ALL_UNITS) {
        container.innerHTML = '<div class="card">題庫未載入</div>';
        return;
    }
    let html = '';
    for (let unit in window.ALL_UNITS) {
        let unitObj = window.ALL_UNITS[unit];
        let chapters = unitObj.chapters;
        if (Object.keys(chapters).length === 0) continue;
        let mastery = getUnitMastery(unit);
        html += `
            <div class="unit-group">
                <div class="unit-header" onclick="toggleUnit('${unit}')">
                    <div class="unit-header-left">
                        <span class="unit-toggle" id="toggle-${unit}">▶</span>
                        <span>${unitObj.name}</span>
                    </div>
                    <div class="unit-right">
                        <div class="mastery-wrapper">
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill" style="width: ${mastery}%;"></div>
                            </div>
                            <span style="font-size:0.65rem;">完成度 ${mastery}%</span>
                        </div>
                    </div>
                </div>
                <div class="chapters-container" id="chapters-${unit}">
        `;
        for (let ch in chapters) {
            let chMastery = getChapterMastery(unit, ch);
            let chTotal = getChapterTotalQuestions(unit, ch);
            html += `
                <div class="chapter-item">
                    <span class="chapter-name">${chapters[ch].name} (${chTotal} 題)</span>
                    <div class="mastery-wrapper">
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${chMastery}%;"></div>
                        </div>
                        <span style="font-size:0.65rem;">完成度 ${chMastery}%</span>
                    </div>
                    <div class="chapter-actions">
                        <button class="btn btn-small practice-chapter" data-unit="${unit}" data-chapter="${ch}">✏️ 練習</button>
                        <button class="btn btn-danger btn-small clear-chapter" data-unit="${unit}" data-chapter="${ch}">🗑️ 重置</button>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;

    document.querySelectorAll('.practice-chapter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pendingUnit = btn.dataset.unit;
            pendingChapter = btn.dataset.chapter;
            updateSettingsUnlockStatus();
            document.getElementById('settingsModal').style.display = 'flex';
        });
    });
    document.querySelectorAll('.clear-chapter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let unit = btn.dataset.unit;
            let chapter = btn.dataset.chapter;
            if (confirm(`確定清空「${window.ALL_UNITS[unit].chapters[chapter].name}」的所有練習紀錄？`)) {
                let questions = window.ALL_UNITS[unit].chapters[chapter].questions;
                for (let q of questions) delete userData.latestStatus[q.id];
                userData.allAttempts = userData.allAttempts.filter(att => !questions.some(q => q.id === att.qid));
                saveUserData();
                renderPractice();
                renderMyMistakes();
                renderPastMistakes();
                renderPinned();
                renderHistory();
                renderAchievements();
                updateSettingsUnlockStatus();
            }
        });
    });
}

function updateSettingsUnlockStatus() {
    if (!pendingUnit || !pendingChapter) return;
    let star1Mastery = getChapterDifficultyMastery(pendingUnit, pendingChapter, 0);
    let star3Mastery = getChapterDifficultyMastery(pendingUnit, pendingChapter, 1);
    let star5Mastery = getChapterDifficultyMastery(pendingUnit, pendingChapter, 2);

    let star3Unlocked = star1Mastery >= 80;
    let star5Unlocked = star3Unlocked && star3Mastery >= 80;
    let countUnlocked = star1Mastery >= 80;
    let trialUnlocked = star5Mastery >= 80;

    let diffMedium = document.getElementById('diff-medium');
    let diffHard = document.getElementById('diff-hard');
    let count20 = document.getElementById('count-20');
    let count36 = document.getElementById('count-36');
    let trialBtn = document.getElementById('trial-mode');
    let diffHint = document.getElementById('diffHint');
    let countHint = document.getElementById('countHint');
    let trialHint = document.getElementById('trialHint');

    if (star3Unlocked) {
        diffMedium.classList.remove('locked');
        diffMedium.disabled = false;
        diffHint.innerHTML = '(3星需1星正確率達80%解鎖 ✅ 已解鎖)';
    } else {
        diffMedium.classList.add('locked');
        diffMedium.disabled = true;
        diffHint.innerHTML = '(3星需1星正確率達80%解鎖)';
    }

    if (star5Unlocked) {
        diffHard.classList.remove('locked');
        diffHard.disabled = false;
    } else {
        diffHard.classList.add('locked');
        diffHard.disabled = true;
    }

    if (countUnlocked) {
        count20.classList.remove('locked');
        count20.disabled = false;
        count36.classList.remove('locked');
        count36.disabled = false;
        countHint.innerHTML = '(20/36題需1星正確率達80%解鎖 ✅ 已解鎖)';
    } else {
        count20.classList.add('locked');
        count20.disabled = true;
        count36.classList.add('locked');
        count36.disabled = true;
        countHint.innerHTML = '(20/36題需1星正確率達80%解鎖)';
    }

    if (trialUnlocked) {
        trialBtn.classList.remove('locked');
        trialBtn.disabled = false;
        trialHint.innerHTML = '(需5星正確率達80%解鎖 ✅ 已解鎖)';
    } else {
        trialBtn.classList.add('locked');
        trialBtn.disabled = true;
        trialHint.innerHTML = '(需5星正確率達80%解鎖)';
    }
}

function renderMyMistakes() {
    const container = document.getElementById('myMistakesPanel');
    let wrongByChapter = getCurrentWrongByChapter();
    if (Object.keys(wrongByChapter).length === 0) {
        container.innerHTML = '<div class="card">✨ 目前沒有錯題</div>';
        return;
    }
    let html = '<div class="card"><h3>我的錯題</h3>';
    for (let ch in wrongByChapter) {
        html += `
            <div class="mistake-chapter-group">
                <div class="mistake-chapter-header" onclick="toggleMistakeChapter('${ch}', 'my')">
                    <span>📖 ${wrongByChapter[ch][0].chapterName}</span>
                    <span class="unit-toggle" id="my-toggle-${ch}">▶</span>
                </div>
                <div class="mistake-questions" id="my-${ch}">
        `;
        for (let q of wrongByChapter[ch]) {
            let isFav = userData.favorites.includes(q.id);
            html += `
                <div class="mistake-question-item">
                    <span>${q.text}</span>
                    <div>
                        <span class="btn-icon star ${isFav ? 'active' : ''}" data-qid="${q.id}" style="color:${isFav ? '#fbbf24' : '#ccc'}">★</span>
                        <button class="btn-icon redo-q" data-qid="${q.id}">🔄 重做</button>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    attachMistakeEvents();
}

function renderPastMistakes() {
    const container = document.getElementById('pastMistakesPanel');
    let pastByChapter = getPastWrongByChapter();
    if (Object.keys(pastByChapter).length === 0) {
        container.innerHTML = '<div class="card">📭 尚無錯題歷程</div>';
        return;
    }
    let html = '<div class="card"><h3>錯題歷程</h3>';
    for (let ch in pastByChapter) {
        html += `
            <div class="mistake-chapter-group">
                <div class="mistake-chapter-header" onclick="toggleMistakeChapter('${ch}', 'past')">
                    <span>📖 ${pastByChapter[ch][0].chapterName}</span>
                    <span class="unit-toggle" id="past-toggle-${ch}">▶</span>
                </div>
                <div class="mistake-questions" id="past-${ch}">
        `;
        for (let q of pastByChapter[ch]) {
            let isFav = userData.favorites.includes(q.id);
            html += `
                <div class="mistake-question-item">
                    <span>${q.text}</span>
                    <div>
                        <span class="btn-icon star ${isFav ? 'active' : ''}" data-qid="${q.id}" style="color:${isFav ? '#fbbf24' : '#ccc'}">★</span>
                        <button class="btn-icon redo-q" data-qid="${q.id}">🔄 重做</button>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    attachMistakeEvents();
}

function renderPinned() {
    const container = document.getElementById('pinnedPanel');
    let favs = userData.favorites;
    if (favs.length === 0) {
        container.innerHTML = '<div class="card">⭐ 尚無收藏題目</div>';
        return;
    }
    let html = '<div class="card"><h3>收藏題目</h3>';
    favs.forEach(qid => {
        let found = null, chapterName = '';
        for (let u in window.ALL_UNITS) {
            for (let c in window.ALL_UNITS[u].chapters) {
                let q = window.ALL_UNITS[u].chapters[c].questions.find(qq => qq.id === qid);
                if (q) {
                    found = q;
                    chapterName = window.ALL_UNITS[u].chapters[c].name;
                    break;
                }
            }
            if (found) break;
        }
        if (found) {
            html += `
                <div class="mistake-question-item">
                    <span><strong>${chapterName}</strong> ${found.text}</span>
                    <button class="btn-icon redo-q" data-qid="${qid}">🔄 重做</button>
                </div>
            `;
        }
    });
    html += '</div>';
    container.innerHTML = html;
    document.querySelectorAll('.redo-q').forEach(btn => btn.addEventListener('click', (e) => redoQuestion(btn.dataset.qid)));
}

function attachMistakeEvents() {
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            let qid = star.dataset.qid;
            if (userData.favorites.includes(qid)) {
                userData.favorites = userData.favorites.filter(id => id !== qid);
            } else {
                userData.favorites.push(qid);
            }
            saveUserData();
            renderMyMistakes();
            renderPastMistakes();
            renderPinned();
        });
    });
    document.querySelectorAll('.redo-q').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            redoQuestion(btn.dataset.qid);
        });
    });
}

function renderHistory() {
    const container = document.getElementById('historyPanel');
    if (!userData.practiceHistory || userData.practiceHistory.length === 0) {
        container.innerHTML = '<div class="card">📋 暫無做題紀錄，開始練習後會顯示在這裡。</div>';
        return;
    }
    let html = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <h3>📋 做題紀錄</h3>
                <button id="exportHistoryBtn" class="btn export-btn" style="background: #10b981;">📥 匯出 CSV</button>
            </div>
            <div style="overflow-x: auto;">
                <table class="history-table">
                    <thead>
                        <tr><th>日期</th><th>時間</th><th>單元</th><th>章節</th><th>星級</th><th>題數</th><th>正確率</th><th>模式</th></tr>
                    </thead>
                    <tbody>
    `;
    for (let h of userData.practiceHistory) {
        html += `<tr><td>${h.date}</td><td>${h.time}</td><td>${h.unitName}</td><td>${h.chapterName}</td><td>${h.difficulty}</td><td>${h.questionCount}</td><td>${h.accuracy}%</td><td>${h.mode === 'trial' ? '試煉' : '一般'}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
    document.getElementById('exportHistoryBtn')?.addEventListener('click', exportHistoryToCSV);
}

function exportHistoryToCSV() {
    let csvRows = [["日期", "時間", "單元", "章節", "星級", "題數", "正確數", "正確率", "模式"]];
    for (let h of userData.practiceHistory) {
        csvRows.push([h.date, h.time, h.unitName, h.chapterName, h.difficulty, h.questionCount, h.correctCount, `${h.accuracy}%`, h.mode === 'trial' ? '試煉' : '一般']);
    }
    let csvContent = csvRows.map(row => row.join(",")).join("\n");
    let blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    let link = document.createElement("a");
    let url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", `mastering_science_history_${currentUser.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function renderAchievements() {
    const container = document.getElementById('achievementsPanel');
    let totalUnlocked = 0;
    let totalPossible = 0;
    let achievementsHtml = '';

    for (let unit in window.ALL_UNITS) {
        let unitObj = window.ALL_UNITS[unit];
        let chapters = unitObj.chapters;
        let hasUnlocked = false;
        let unitHtml = '';
        for (let ch in chapters) {
            let key = `${unit}_${ch}`;
            let ach = userData.achievements[key] || {};
            let star1Unlocked = ach.star1?.unlocked || false;
            let star3Unlocked = ach.star3?.unlocked || false;
            let star5Unlocked = ach.star5?.unlocked || false;
            let trialUnlocked = ach.trial?.unlocked || false;
            totalPossible += 4;
            if (star1Unlocked) totalUnlocked++;
            if (star3Unlocked) totalUnlocked++;
            if (star5Unlocked) totalUnlocked++;
            if (trialUnlocked) totalUnlocked++;
            if (star1Unlocked || star3Unlocked || star5Unlocked || trialUnlocked) hasUnlocked = true;
            unitHtml += `
                <div class="achievement-item">
                    <div><span class="achievement-badge">${star1Unlocked ? '✅' : '🔒'}</span> ${chapters[ch].name} - 一星完成</div>
                    <div class="achievement-date">${star1Unlocked ? ach.star1.date : '未解鎖'}</div>
                </div>
                <div class="achievement-item">
                    <div><span class="achievement-badge">${star3Unlocked ? '🔥' : '🔒'}</span> ${chapters[ch].name} - 三星解鎖</div>
                    <div class="achievement-date">${star3Unlocked ? ach.star3.date : '未解鎖'}</div>
                </div>
                <div class="achievement-item">
                    <div><span class="achievement-badge">${star5Unlocked ? '💎' : '🔒'}</span> ${chapters[ch].name} - 五星解鎖</div>
                    <div class="achievement-date">${star5Unlocked ? ach.star5.date : '未解鎖'}</div>
                </div>
                <div class="achievement-item">
                    <div><span class="achievement-badge">${trialUnlocked ? '⚔️' : '🔒'}</span> ${chapters[ch].name} - 試煉完成</div>
                    <div class="achievement-date">${trialUnlocked ? ach.trial.date : '未解鎖'}</div>
                </div>
            `;
        }
        if (hasUnlocked) {
            achievementsHtml += `
                <div class="achievement-unit-group">
                    <div class="achievement-unit-header" onclick="toggleAchievementUnit('${unit}')">
                        <span>📖 ${unitObj.name}</span>
                        <span class="unit-toggle" id="achievement-toggle-${unit}">▶</span>
                    </div>
                    <div class="achievement-chapters" id="achievement-chapters-${unit}">
                        ${unitHtml}
                    </div>
                </div>
            `;
        }
    }

    let perfectUnlocked = userData.achievements.perfect?.unlocked || false;
    let dseUnlocked = userData.achievements.dse?.unlocked || false;
    let speedUnlocked = userData.achievements.speed?.unlocked || false;
    totalPossible += 3;
    if (perfectUnlocked) totalUnlocked++;
    if (dseUnlocked) totalUnlocked++;
    if (speedUnlocked) totalUnlocked++;
    let percent = totalPossible > 0 ? Math.round(totalUnlocked / totalPossible * 100) : 0;

    let specialHtml = `
        <div class="achievement-category">
            <div class="achievement-category-title">🎯 特殊成就</div>
            <div class="achievement-item">
                <div><span class="achievement-badge">${perfectUnlocked ? '🌟' : '🔒'}</span> 完美一課</div>
                <div class="achievement-date">${perfectUnlocked ? userData.achievements.perfect.date : '未解鎖'}</div>
            </div>
            <div class="achievement-item">
                <div><span class="achievement-badge">${dseUnlocked ? '📝' : '🔒'}</span> DSE模擬完成</div>
                <div class="achievement-date">${dseUnlocked ? userData.achievements.dse.date : '未解鎖'}</div>
            </div>
            <div class="achievement-item">
                <div><span class="achievement-badge">${speedUnlocked ? '⚡' : '🔒'}</span> 速度之星</div>
                <div class="achievement-date">${speedUnlocked ? userData.achievements.speed.date : '未解鎖'}</div>
            </div>
        </div>
    `;

    let html = `
        <div class="card">
            <div class="achievement-progress">
                <div style="display: flex; justify-content: space-between;">
                    <span>🏆 總解鎖進度</span>
                    <span>${totalUnlocked} / ${totalPossible} (${percent}%)</span>
                </div>
                <div class="achievement-bar">
                    <div class="achievement-fill" style="width: ${percent}%;"></div>
                </div>
            </div>
            ${achievementsHtml}
            ${specialHtml}
        </div>
    `;
    container.innerHTML = html;
}

// ==================== 練習邏輯 ====================
function startPracticeWithSettings() {
    let unit = pendingUnit;
    let chapter = pendingChapter;

    let allQuestions = [...window.ALL_UNITS[unit].chapters[chapter].questions];
    let total = allQuestions.length;
    let count = selectedCount;
    if (count > total) count = total;
    if (count < 1) count = 1;

    let selectedQuestions = selectQuestionsByDifficultyAndCount(allQuestions, count, selectedDifficulty, isTrialMode);
    selectedQuestions = shuffleArray(selectedQuestions);

    currentUnit = unit;
    currentChapter = chapter;
    currentQuestions = selectedQuestions;

    currentOptionsMapping = currentQuestions.map(q => {
        if (q.sf === 0) {
            let letters = ['A', 'B', 'C', 'D'];
            let map = {};
            for (let i = 0; i < 4; i++) {
                let optText = q.options[i].substring(3);
                map[letters[i]] = optText;
            }
            let correctLetter = q.correct;
            return { letterToText: map, correctLetter: correctLetter };
        } else {
            let texts = q.options.map(opt => opt.replace(/^[A-D]\.\s*/, ''));
            let shuffled = shuffleArray([...texts]);
            let letters = ['A', 'B', 'C', 'D'];
            let map = {};
            for (let i = 0; i < 4; i++) map[letters[i]] = shuffled[i];
            let correctText = q.options.find(opt => opt.startsWith(q.correct)).replace(/^[A-D]\.\s*/, '');
            let correctLetter = null;
            for (let [l, t] of Object.entries(map)) if (t === correctText) { correctLetter = l; break; }
            return { letterToText: map, correctLetter: correctLetter };
        }
    });
    currentAnswers = new Array(selectedQuestions.length).fill(null);
    currentQIndex = 0;

    let timePerQuestion = selectedDifficulty == 0 ? 108 : (selectedDifficulty == 2 ? 75 : 90);
    timeRemaining = selectedQuestions.length * timePerQuestion;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) submitAll();
        else { timeRemaining--; updateTimerDisplay(); }
    }, 1000);

    document.getElementById('settingsModal').style.display = 'none';
    showQuizModal();
}

function showExplainModal(question, userLetter, correctLetter, userText, correctText, isCorrect) {
    let optionsHtml = '<div class="explain-options">';
    for (let opt of question.options) {
        let optLetter = opt[0];
        let optText = opt.substring(3);
        let isUser = (optLetter === userLetter);
        let isCor = (optLetter === correctLetter);
        let cls = 'explain-option-normal';
        if (isCor) cls = 'explain-option-correct';
        else if (isUser && !isCor) cls = 'explain-option-wrong';
        optionsHtml += `<div class="${cls}">${optLetter}. ${optText}</div>`;
    }
    optionsHtml += '</div>';

    let answerClass = isCorrect ? 'answer-correct' : 'answer-wrong';
    let answerHtml = `<div class="answer-comparison">
        <span>你的答案: <span class="${answerClass}">${userLetter}</span></span>
        <span>正解: <span class="${answerClass}">${correctLetter}</span></span>
    </div>`;

    let html = `
        <div style="margin-bottom: 0.8rem;">
            <strong>題目:</strong> ${question.text}
        </div>
        ${optionsHtml}
        <div style="margin: 0.8rem 0; padding: 0.4rem; background: #f0f0f0; border-radius: 12px;">
            <strong>📖 題解:</strong> ${question.explanation || '無'}
        </div>
        ${answerHtml}
    `;
    document.getElementById('explainContent').innerHTML = html;
    document.getElementById('explainModal').style.display = 'flex';
}

function showQuizModal() {
    renderQuizNav();
    renderCurrentQuestion();
    document.getElementById('quizModal').style.display = 'flex';
}

function renderQuizNav() {
    let nav = document.getElementById('questionNav');
    let html = '';
    for (let i = 0; i < currentQuestions.length; i++) {
        let cls = '';
        if (i === currentQIndex) cls = 'current';
        else if (currentAnswers[i] !== null) cls = 'answered';
        else cls = 'unanswered';
        html += `<button class="q-nav-btn ${cls}" data-idx="${i}">${i + 1}</button>`;
    }
    nav.innerHTML = html;
    document.getElementById('quizCounter').innerHTML = `${currentQIndex + 1} / ${currentQuestions.length}`;
    document.querySelectorAll('.q-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentQIndex = parseInt(btn.dataset.idx);
            renderQuizNav();
            renderCurrentQuestion();
            updateNavButtons();
        });
    });
}

function renderCurrentQuestion() {
    let q = currentQuestions[currentQIndex];
    let map = currentOptionsMapping[currentQIndex];
    document.getElementById('modalQuestionText').innerHTML = q.text;
    document.getElementById('quizCounter').innerHTML = `${currentQIndex + 1} / ${currentQuestions.length}`;
    document.getElementById('quizDifficulty').innerHTML = q.difficulty;
    let imageArea = document.getElementById('modalImageArea');
    if (q.imageUrl) {
        imageArea.innerHTML = `<img src="${q.imageUrl}" class="quiz-image" id="quizImageThumb">`;
        document.getElementById('quizImageThumb')?.addEventListener('click', () => {
            document.getElementById('zoomImage').src = q.imageUrl;
            document.getElementById('imageZoomModal').style.display = 'flex';
        });
    } else {
        imageArea.innerHTML = '';
    }
    let optsDiv = document.getElementById('modalOptions');
    optsDiv.innerHTML = '';
    for (let letter of ['A', 'B', 'C', 'D']) {
        let btn = document.createElement('button');
        btn.className = 'option-btn';
        if (currentAnswers[currentQIndex] === letter) btn.classList.add('selected');
        btn.textContent = `${letter}. ${map.letterToText[letter]}`;
        btn.addEventListener('click', () => {
            currentAnswers[currentQIndex] = letter;
            renderCurrentQuestion();
            renderQuizNav();
        });
        optsDiv.appendChild(btn);
    }
    updateNavButtons();
}

function updateNavButtons() {
    let prev = document.getElementById('prevBtn');
    let next = document.getElementById('nextBtn');
    prev.disabled = (currentQIndex === 0);
    next.disabled = (currentQIndex === currentQuestions.length - 1);
}

function updateTimerDisplay() {
    let m = Math.floor(timeRemaining / 60);
    let s = timeRemaining % 60;
    document.getElementById('timerDisplay').innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function submitAll() {
    if (timerInterval) clearInterval(timerInterval);
    let results = [];
    let batch = [];
    let correctCount = 0;
    for (let i = 0; i < currentQuestions.length; i++) {
        let q = currentQuestions[i];
        let map = currentOptionsMapping[i];
        let userLetter = currentAnswers[i];
        let isCorrect = (userLetter === map.correctLetter);
        if (isCorrect) correctCount++;
        let userText = userLetter ? map.letterToText[userLetter] : '(未作答)';
        let correctText = map.letterToText[map.correctLetter];
        results.push({
            question: q,
            userLetter: userLetter || '?',
            correctLetter: map.correctLetter,
            userText: userText,
            correctText: correctText,
            isCorrect: isCorrect,
            qid: q.id
        });
        batch.push({ qid: q.id, isCorrect: isCorrect });
    }
    recordBatch(batch);
    let accuracy = Math.round(correctCount / currentQuestions.length * 100);
    let difficultyName = selectedDifficulty == 0 ? "★ 1星" : (selectedDifficulty == 1 ? "★★★ 3星" : "★★★★★ 5星");
    let mode = isTrialMode ? 'trial' : 'normal';
    let expectedTime = currentQuestions.length * (selectedDifficulty == 0 ? 108 : (selectedDifficulty == 2 ? 75 : 90));
    let timeSpentPercent = Math.round((expectedTime - timeRemaining) / expectedTime * 100);
    addPracticeHistory(currentUnit, currentChapter, difficultyName, currentQuestions.length, correctCount, accuracy, mode, timeSpentPercent);
    let isPerfect = accuracy === 100 && currentQuestions.length >= 10;
    let isDSE = selectedCount === 36;
    let isSpeed = timeSpentPercent <= 50;
    checkAndUnlockAchievements(currentUnit, currentChapter, accuracy, currentQuestions.length, isPerfect, isDSE, isSpeed);
    lastResults = results;
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
    let correctCount = results.filter(r => r.isCorrect).length;
    let percent = Math.round(correctCount / results.length * 100);
    let progressColor = '#10b981';
    if (percent < 40) progressColor = '#dc2626';
    else if (percent < 70) progressColor = '#f59e0b';

    let html = `
        <div class="result-summary-bar">
            <div class="result-progress">
                <span>✅ ${percent}% (${correctCount}/${results.length})</span>
                <div class="big-progress-bar">
                    <div class="big-progress-fill" style="width: ${percent}%; background: ${progressColor};"></div>
                </div>
            </div>
            <div class="result-buttons">
                <button id="toggleWrongBtn" class="btn btn-small ${showOnlyWrong ? 'btn-outline' : ''}">❌ 只顯示錯題</button>
                <button id="toggleAnswersBtn" class="btn btn-small ${showAnswers ? 'btn-outline' : ''}">📋 顯示答案</button>
            </div>
        </div>
        <table class="result-table">
            <thead>
                <tr><th>題號</th><th>題目</th>${showAnswers ? '<th>你的答案</th><th>正解</th>' : ''}<th>結果</th><th></th></tr>
            </thead>
            <tbody>
    `;
    for (let i = 0; i < results.length; i++) {
        let r = results[i];
        let rowClass = r.isCorrect ? 'result-row-correct' : 'result-row-wrong';
        let resultIcon = r.isCorrect ? '✅' : '❌';
        html += `<tr class="${rowClass}">
            <td>${i + 1}</td>
            <td style="text-align:left">${r.question.text}</td>
            ${showAnswers ? `<td>${r.userLetter}</td><td>${r.correctLetter}</td>` : ''}
            <td>${resultIcon}</td>
            <td><button class="btn-explain" data-idx="${i}">📖</button></td>
        </tr>`;
    }
    html += `</tbody></table>`;
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

function redoQuestion(qid) {
    for (let u in window.ALL_UNITS) {
        for (let c in window.ALL_UNITS[u].chapters) {
            let questions = window.ALL_UNITS[u].chapters[c].questions;
            let qIndex = questions.findIndex(q => q.id === qid);
            if (qIndex !== -1) {
                pendingUnit = u;
                pendingChapter = c;
                updateSettingsUnlockStatus();
                document.getElementById('settingsModal').style.display = 'flex';
                window._singleRedoQid = qid;
                return;
            }
        }
    }
}

function initTabs() {
    let tabs = document.querySelectorAll('.tab');
    let panels = {
        practice: document.getElementById('practicePanel'),
        myMistakes: document.getElementById('myMistakesPanel'),
        pastMistakes: document.getElementById('pastMistakesPanel'),
        pinned: document.getElementById('pinnedPanel'),
        history: document.getElementById('historyPanel'),
        achievements: document.getElementById('achievementsPanel')
    };
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            let target = tab.dataset.tab;
            Object.keys(panels).forEach(p => panels[p].style.display = 'none');
            panels[target].style.display = 'block';
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (target === 'myMistakes') renderMyMistakes();
            if (target === 'pastMistakes') renderPastMistakes();
            if (target === 'pinned') renderPinned();
            if (target === 'history') renderHistory();
            if (target === 'achievements') renderAchievements();
        });
    });
}

// ==================== 事件綁定 ====================
document.addEventListener('DOMContentLoaded', function() {
    // 難度選擇按鈕
    document.getElementById('diff-easy').addEventListener('click', () => {
        selectedDifficulty = 0;
        document.getElementById('diff-easy').classList.add('active');
        document.getElementById('diff-medium').classList.remove('active');
        document.getElementById('diff-hard').classList.remove('active');
        isTrialMode = false;
    });
    document.getElementById('diff-medium').addEventListener('click', () => {
        if (document.getElementById('diff-medium').disabled) return;
        selectedDifficulty = 1;
        document.getElementById('diff-easy').classList.remove('active');
        document.getElementById('diff-medium').classList.add('active');
        document.getElementById('diff-hard').classList.remove('active');
        isTrialMode = false;
    });
    document.getElementById('diff-hard').addEventListener('click', () => {
        if (document.getElementById('diff-hard').disabled) return;
        selectedDifficulty = 2;
        document.getElementById('diff-easy').classList.remove('active');
        document.getElementById('diff-medium').classList.remove('active');
        document.getElementById('diff-hard').classList.add('active');
        isTrialMode = false;
    });

    // 題目數量選擇
    document.getElementById('count-10').addEventListener('click', () => {
        selectedCount = 10;
        document.getElementById('count-10').classList.add('active');
        document.getElementById('count-20').classList.remove('active');
        document.getElementById('count-36').classList.remove('active');
    });
    document.getElementById('count-20').addEventListener('click', () => {
        if (document.getElementById('count-20').disabled) return;
        selectedCount = 20;
        document.getElementById('count-10').classList.remove('active');
        document.getElementById('count-20').classList.add('active');
        document.getElementById('count-36').classList.remove('active');
    });
    document.getElementById('count-36').addEventListener('click', () => {
        if (document.getElementById('count-36').disabled) return;
        selectedCount = 36;
        document.getElementById('count-10').classList.remove('active');
        document.getElementById('count-20').classList.remove('active');
        document.getElementById('count-36').classList.add('active');
    });

    // 試煉模式
    document.getElementById('trial-mode').addEventListener('click', () => {
        if (document.getElementById('trial-mode').disabled) return;
        isTrialMode = true;
        selectedDifficulty = 2;
        selectedCount = 50;
        document.getElementById('diff-easy').classList.remove('active');
        document.getElementById('diff-medium').classList.remove('active');
        document.getElementById('diff-hard').classList.add('active');
        document.getElementById('count-10').classList.remove('active');
        document.getElementById('count-20').classList.remove('active');
        document.getElementById('count-36').classList.remove('active');
    });

    // 開發模式按鈕
    document.getElementById('devUnlockBtn').addEventListener('click', () => {
        if (!pendingUnit || !pendingChapter) return;
        let questions = window.ALL_UNITS[pendingUnit].chapters[pendingChapter].questions;
        for (let q of questions) {
            if (q.difficulty_level === 0) userData.latestStatus[q.id] = true;
        }
        saveUserData();
        updateSettingsUnlockStatus();
        alert('開發模式：1星題目已全部標記為正確！');
    });

    // 登入按鈕
    document.getElementById('loginBtn').addEventListener('click', () => {
        let name = document.getElementById('studentName').value.trim();
        let cls = document.getElementById('studentClass').value.trim();
        if (!name || !cls) {
            alert('請輸入姓名與班級');
            return;
        }
        currentUser = { id: `${cls}_${name}`, name, class: cls };
        loadUserData();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userLabel').innerHTML = `👋 ${name} (${cls})`;
        renderPractice();
        initTabs();
        document.querySelector('.tab[data-tab="practice"]').click();
    });

    // 開始練習按鈕
    document.getElementById('startPracticeBtn').addEventListener('click', () => {
        if (window._singleRedoQid) {
            let qid = window._singleRedoQid;
            window._singleRedoQid = null;
            let unit = pendingUnit;
            let chapter = pendingChapter;
            let allQuestions = [...window.ALL_UNITS[unit].chapters[chapter].questions];
            let targetQ = allQuestions.find(q => q.id === qid);
            if (targetQ) {
                currentUnit = unit;
                currentChapter = chapter;
                currentQuestions = [targetQ];
                currentOptionsMapping = currentQuestions.map(q => {
                    let letters = ['A', 'B', 'C', 'D'];
                    let map = {};
                    for (let i = 0; i < 4; i++) {
                        let optText = q.options[i].substring(3);
                        map[letters[i]] = optText;
                    }
                    return { letterToText: map, correctLetter: q.correct };
                });
                currentAnswers = new Array(1).fill(null);
                currentQIndex = 0;
                timeRemaining = 90;
                updateTimerDisplay();
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    if (timeRemaining <= 0) submitAll();
                    else { timeRemaining--; updateTimerDisplay(); }
                }, 1000);
                document.getElementById('settingsModal').style.display = 'none';
                showQuizModal();
            }
        } else {
            startPracticeWithSettings();
        }
    });

    // 其他按鈕
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'none';
    });
    document.getElementById('closeExplainBtn').addEventListener('click', () => {
        document.getElementById('explainModal').style.display = 'none';
        if (lastResults) {
            displayResults(lastResults);
        }
    });
    document.getElementById('submitAllBtn').addEventListener('click', () => submitAll());
    document.getElementById('closeResultBtn').addEventListener('click', () => {
        document.getElementById('resultModal').style.display = 'none';
    });
    document.getElementById('closeZoomBtn').addEventListener('click', () => {
        document.getElementById('imageZoomModal').style.display = 'none';
    });
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (currentQIndex > 0) {
            currentQIndex--;
            renderQuizNav();
            renderCurrentQuestion();
            updateNavButtons();
        }
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (currentQIndex < currentQuestions.length - 1) {
            currentQIndex++;
            renderQuizNav();
            renderCurrentQuestion();
            updateNavButtons();
        }
    });

    // Enter 登入
    document.getElementById('studentName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
    document.getElementById('studentClass').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
});