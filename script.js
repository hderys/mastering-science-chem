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
let excludeTranslate = true;
let blinkInterval = null;
let customCount = 10;

// 成績總表控制變量
let showOnlyWrong = false;
let showAnswers = false;

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

// ==================== 成就系統 ====================
function showUnlockCard(title, message, date, points) {
    // 全螢幕閃光效果（僅在積分 > 0 時顯示，代表正式解鎖）
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
    
    // 只計算 Basic(1)、Advanced(2)、Challenge(3)，排除 Translate(0)
    let s1 = getChapterDifficultyMastery(unit, chapter, 1);  // Basic 題
    let s3 = getChapterDifficultyMastery(unit, chapter, 2);  // Advanced 題
    let s5 = getChapterDifficultyMastery(unit, chapter, 3);  // Challenge 題

    if (isBlankPaper) {
        addPenaltyAchievement('blankPaper', '📄', -10, '提交空白答案卷');
    }

    if (previousAccuracy !== null && previousAccuracy - accuracy > 20) {
        addPenaltyAchievement('downwardTrend', '📉', -10, '連續兩次正確率下降超過20%');
    }

    // 一星完成 (Basic ≥ 80%)
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

    // 三星解鎖 (Basic ≥ 80% 且 Advanced ≥ 80%)
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

    // 五星解鎖 (Basic ≥ 80% 且 Advanced ≥ 80% 且 Challenge ≥ 80%)
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

    // 試煉完成 (使用試煉模式且正確率≥80%)
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

function addPracticeHistory(unit, chapter, difficultyName, questionCount, correctCount, accuracy, mode, timeSpentPercent, consecutiveCorrectCount, isBlankPaper) {
    let now = new Date(), date = now.toISOString().slice(0, 10), time = now.toTimeString().slice(0, 5);
    let unitObj = window.ALL_UNITS[unit], chapterName = unitObj ? unitObj.chapters[chapter].name : chapter, unitName = unitObj ? unitObj.name : unit;
    userData.practiceHistory.unshift({ id: Date.now(), date, time, unitId: unit, unitName, chapterId: chapter, chapterName, difficulty: difficultyName, questionCount, correctCount, accuracy, mode });
    if (userData.practiceHistory.length > 100) userData.practiceHistory = userData.practiceHistory.slice(0, 100);

    let totalQuestions = (userData.stats?.totalQuestionsAnswered || 0) + questionCount;
    if (!userData.stats) userData.stats = { totalQuestionsAnswered: 0, totalCorrect: 0, consecutiveCorrect: 0, maxConsecutive: 0, dailyPracticeDates: [], lastAccuracy: null };
    userData.stats.totalQuestionsAnswered = totalQuestions;
    userData.stats.totalCorrect = (userData.stats.totalCorrect || 0) + correctCount;

    let previousAccuracy = userData.stats.lastAccuracy;
    userData.stats.lastAccuracy = accuracy;
    
    // 速度之星條件：提前50%時間完成 且 正確率≥70%
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

function selectQuestionsByDifficultyAndCount(questions, count, preference, isTrial) {
    // 先過濾掉翻譯題（如果 excludeTranslate 為 true）
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

    let candidates = [];
    
    if (preference == 0) {
        // 1 星：Translate + Basic
        for (let q of filteredQuestions) {
            if (q.difficulty_level == 0 || q.difficulty_level == 1) {
                candidates.push(q);
            }
        }
    } else if (preference == 1) {
        // 3 星：優先 Advanced，其次錯過的 Basic，最後 Challenge
        let advancedQuestions = [];
        let wrongBasicQuestions = [];
        let challengeQuestions = [];
        
        for (let q of filteredQuestions) {
            if (q.difficulty_level == 2) {
                advancedQuestions.push(q);
            } else if (q.difficulty_level == 1 && userData.latestStatus[q.id] === false) {
                wrongBasicQuestions.push(q);
            } else if (q.difficulty_level == 3) {
                challengeQuestions.push(q);
            }
        }
        
        candidates = [...advancedQuestions, ...wrongBasicQuestions, ...challengeQuestions];
        
        if (candidates.length < count) {
            let otherBasic = filteredQuestions.filter(q => q.difficulty_level == 1 && userData.latestStatus[q.id] !== false);
            candidates.push(...otherBasic);
        }
    } else {
        // 5 星：Advanced + Challenge
        for (let q of filteredQuestions) {
            if (q.difficulty_level == 2 || q.difficulty_level == 3) {
                candidates.push(q);
            }
        }
    }
    
    if (candidates.length < count) {
        candidates = [...filteredQuestions];
    }
    
    // 去重
    candidates = [...new Map(candidates.map(q => [q.id, q])).values()];
    
    // 隨機排序（保持優先級組內的隨機）
    if (preference == 1) {
        let advanced = candidates.filter(q => q.difficulty_level == 2);
        let wrongBasic = candidates.filter(q => q.difficulty_level == 1 && userData.latestStatus[q.id] === false);
        let challenge = candidates.filter(q => q.difficulty_level == 3);
        let otherBasic = candidates.filter(q => q.difficulty_level == 1 && userData.latestStatus[q.id] !== false);
        
        advanced = shuffleArray(advanced);
        wrongBasic = shuffleArray(wrongBasic);
        challenge = shuffleArray(challenge);
        otherBasic = shuffleArray(otherBasic);
        
        candidates = [...advanced, ...wrongBasic, ...challenge, ...otherBasic];
    } else {
        candidates = shuffleArray(candidates);
    }
    
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

function renderPractice() {
    const container = document.getElementById('practicePanel');
    if (!container) return;
    if (!window.ALL_UNITS) { container.innerHTML = '<div class="card">題庫未載入</div>'; return; }
    let html = '';
    for (let unit in window.ALL_UNITS) {
        let unitObj = window.ALL_UNITS[unit], chapters = unitObj.chapters;
        if (Object.keys(chapters).length === 0) continue;
        let mastery = getUnitMastery(unit);
        html += `<div class="unit-group"><div class="unit-header" onclick="toggleUnit('${unit}')"><div class="unit-header-left"><span class="unit-toggle" id="toggle-${unit}">▶</span><span>${unitObj.name}</span></div><div class="mastery-wrapper"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:${mastery}%;"></div></div><span class="mastery-text">完成度 ${mastery}%</span></div></div><div class="chapters-container" id="chapters-${unit}">`;
        for (let ch in chapters) {
            let chMastery = getChapterMastery(unit, ch), chTotal = getChapterTotalQuestions(unit, ch);
            html += `<div class="chapter-item"><span class="chapter-name">${chapters[ch].name} (${chTotal} 題)</span><div class="mastery-wrapper"><div class="progress-bar-container"><div class="progress-bar-fill" style="width:${chMastery}%;"></div></div><span class="mastery-text">完成度 ${chMastery}%</span></div><div class="chapter-actions"><button class="btn btn-small practice-chapter" data-unit="${unit}" data-chapter="${ch}">✏️ 練習</button><button class="btn btn-danger btn-small clear-chapter" data-unit="${unit}" data-chapter="${ch}">🗑️ 重置</button></div></div>`;
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;
    document.querySelectorAll('.practice-chapter').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation(); pendingUnit = btn.dataset.unit; pendingChapter = btn.dataset.chapter; updateSettingsUnlockStatus(); document.getElementById('settingsModal').style.display = 'flex';
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

// ========== updateSettingsUnlockStatus 函數 ==========
function updateSettingsUnlockStatus() {
    if (!pendingUnit || !pendingChapter) return;
    
    let questions = window.ALL_UNITS[pendingUnit].chapters[pendingChapter].questions;
    
    // 計算各難度完成情況（排除 Translate）
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
    
    // 解鎖狀態
    let star3Unlocked = basicPercent >= 80;
    let star5Unlocked = star3Unlocked && advancedPercent >= 80;
    let trialUnlocked = star5Unlocked && challengePercent >= 80;
    
    // 決定當前進度條目標
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
    
    // 計算還需要多少題
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
    
    // 更新難度按鈕
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
    
    // ========== 題目數量區域（核心修改） ==========
    let count10 = document.getElementById('count-10');
    let count20 = document.getElementById('count-20');
    let count36 = document.getElementById('count-36');
    let customInput = document.getElementById('customCount');
    let countHint = document.getElementById('countHint');
    
    // 10題和20題始終可用
    if (count10) {
        count10.disabled = false;
        count10.classList.remove('locked');
    }
    if (count20) {
        count20.disabled = false;
        count20.classList.remove('locked');
    }
    
    // 計算自訂輸入框的最大值（根據當前難度和排除翻譯設定）
    let maxCustom = 0;
    if (selectedDifficulty === 0) {
        // 1 星
        if (excludeTranslate) {
            maxCustom = basicTotal;
        } else {
            maxCustom = questions.filter(q => q.difficulty_level === 0 || q.difficulty_level === 1).length;
        }
    } else if (selectedDifficulty === 1) {
        // 3 星
        maxCustom = availableQuestions.length;
    } else if (selectedDifficulty === 2) {
        // 5 星
        maxCustom = advancedTotal + challengeTotal;
    } else if (isTrialMode) {
        // 試煉模式
        maxCustom = Math.min(availableQuestions.length, 50);
    }
    maxCustom = Math.min(maxCustom, 50);
    if (maxCustom < 1) maxCustom = 1;
    
    // 36題和自訂輸入框：一星解鎖後才啟用
    if (count36 && customInput) {
        if (star3Unlocked) {
            // 一星解鎖後：啟用
            count36.disabled = false;
            count36.classList.remove('locked');
            count36.innerHTML = '36 題';
            customInput.disabled = false;
            customInput.style.opacity = '1';
            customInput.max = maxCustom;
            
            // 如果當前值超過最大值，自動調整
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
            // 未解鎖：禁用
            count36.disabled = true;
            count36.classList.add('locked');
            count36.innerHTML = '36 題 🔒';
            customInput.disabled = true;
            customInput.style.opacity = '0.5';
            if (countHint) countHint.innerHTML = `🔒 36題及自訂題數需Basic正確率達80%解鎖 (目前 ${basicPercent}%)`;
        }
    }
    
    // 更新簡短提示
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
    
    // 更新進度條
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
            html += `<div class="mistake-question-item"><span>${q.text}</span><div><button class="btn-icon star" data-qid="${q.id}" style="color:${isFav ? '#fbbf24' : '#ccc'}">★</button><button class="btn-icon redo-q" data-qid="${q.id}">🔄</button></div></div>`;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    attachMistakeEvents();
}

function renderPastMistakes() {
    let wrongQids = new Set(); for (let att of userData.allAttempts) if (!att.isCorrect) wrongQids.add(att.qid);
    let pastByChapter = {};
    for (let u in window.ALL_UNITS) for (let c in window.ALL_UNITS[u].chapters) for (let q of window.ALL_UNITS[u].chapters[c].questions) if (wrongQids.has(q.id)) { if (!pastByChapter[c]) pastByChapter[c] = []; pastByChapter[c].push({ ...q, chapterName: window.ALL_UNITS[u].chapters[c].name }); }
    let container = document.getElementById('pastMistakesPanel');
    if (Object.keys(pastByChapter).length === 0) { container.innerHTML = '<div class="card">📭 尚無錯題歷程</div>'; return; }
    let html = '<div class="card"><h3>錯題歷程</h3>';
    for (let ch in pastByChapter) {
        html += `<div class="mistake-chapter-group"><div class="mistake-chapter-header" onclick="toggleMistakeChapter('${ch}','past')"><span>📖 ${pastByChapter[ch][0].chapterName}</span><span class="unit-toggle" id="past-toggle-${ch}">▶</span></div><div class="mistake-questions" id="past-${ch}">`;
        for (let q of pastByChapter[ch]) {
            let isFav = userData.favorites.includes(q.id);
            html += `<div class="mistake-question-item"><span>${q.text}</span><div><button class="btn-icon star" data-qid="${q.id}" style="color:${isFav ? '#fbbf24' : '#ccc'}">★</button><button class="btn-icon redo-q" data-qid="${q.id}">🔄</button></div></div>`;
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    attachMistakeEvents();
}

function renderPinned() {
    let container = document.getElementById('pinnedPanel');
    if (userData.favorites.length === 0) { container.innerHTML = '<div class="card">⭐ 尚無收藏題目</div>'; return; }
    let html = '<div class="card"><h3>收藏題目</h3>';
    for (let qid of userData.favorites) {
        let found = null, chapterName = '';
        for (let u in window.ALL_UNITS) for (let c in window.ALL_UNITS[u].chapters) { let q = window.ALL_UNITS[u].chapters[c].questions.find(qq => qq.id === qid); if (q) { found = q; chapterName = window.ALL_UNITS[u].chapters[c].name; break; } }
        if (found) html += `<div class="mistake-question-item"><span><strong>${chapterName}</strong> ${found.text}</span><button class="btn-icon redo-q" data-qid="${qid}">🔄</button></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
    document.querySelectorAll('.redo-q').forEach(btn => btn.addEventListener('click', (e) => redoQuestion(btn.dataset.qid)));
}

function attachMistakeEvents() {
    document.querySelectorAll('.star').forEach(star => star.addEventListener('click', (e) => { let qid = star.dataset.qid; if (userData.favorites.includes(qid)) userData.favorites = userData.favorites.filter(id => id !== qid); else userData.favorites.push(qid); saveUserData(); renderMyMistakes(); renderPastMistakes(); renderPinned(); }));
    document.querySelectorAll('.redo-q').forEach(btn => btn.addEventListener('click', (e) => redoQuestion(btn.dataset.qid)));
}

function renderHistory() {
    let container = document.getElementById('historyPanel');
    if (!userData.practiceHistory || userData.practiceHistory.length === 0) { container.innerHTML = '<div class="card">📋 暫無做題紀錄</div>'; return; }
    let html = `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;"><h3>📋 做題紀錄</h3><button id="exportHistoryBtn" class="btn export-btn">📥 匯出 CSV</button></div><div style="overflow-x:auto;"><table class="history-table"><thead><tr><th>日期</th><th>時間</th><th>單元</th><th>章節</th><th>題數</th><th>正確率</th><th>模式</th></tr></thead><tbody>`;
    for (let h of userData.practiceHistory) {
        html += `<tr><td>${h.date}</td><td>${h.time}侧<td>${h.unitName}侧<td>${h.chapterName}侧<td>${h.questionCount}侧<td>${h.accuracy}%侧<td>${h.mode === 'trial' ? '試煉' : '一般'}侧</tr>`;
    }
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
    document.getElementById('exportHistoryBtn')?.addEventListener('click', () => {
        let csv = [["日期", "時間", "單元", "章節", "題數", "正確數", "正確率", "模式"]];
        for (let h of userData.practiceHistory) csv.push([h.date, h.time, h.unitName, h.chapterName, h.questionCount, h.correctCount, `${h.accuracy}%`, h.mode === 'trial' ? '試煉' : '一般']);
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
    let selectedQuestions = selectQuestionsByDifficultyAndCount(allQuestions, count, selectedDifficulty, isTrialMode);
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
    showQuizModal();
}

function showExplainModal(question, userLetter, correctLetter, userText, correctText, isCorrect) {
    let opts = '<div class="explain-options">';
    for (let opt of question.options) {
        let l = opt[0], t = opt.substring(3), isUser = (l === userLetter), isCor = (l === correctLetter);
        let cls = 'explain-option-normal';
        if (isCor) cls = 'explain-option-correct';
        else if (isUser && !isCor) cls = 'explain-option-wrong';
        opts += `<div class="${cls}">${l}. ${t}</div>`;
    }
    opts += '</div>';
    let ansClass = isCorrect ? 'answer-correct' : 'answer-wrong';
    let ansHtml = `<div class="answer-comparison"><span>你的答案: <span class="${ansClass}">${userLetter}</span></span><span>正解: <span class="${ansClass}">${correctLetter}</span></span></div>`;
    let html = `<div style="margin-bottom:0.8rem;"><strong>題目:</strong> ${question.text}</div>${opts}<div style="margin:0.8rem 0; padding:0.4rem; background:#f0f0f0; border-radius:12px;"><strong>📖 題解:</strong> ${question.explanation || '無'}</div>${ansHtml}`;
    document.getElementById('explainContent').innerHTML = html;
    document.getElementById('explainModal').style.display = 'flex';
}

function showQuizModal() { renderQuizNav(); renderCurrentQuestion(); document.getElementById('quizModal').style.display = 'flex'; }

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

function renderCurrentQuestion() {
    let q = currentQuestions[currentQIndex];
    let map = currentOptionsMapping[currentQIndex];
    let hasImage = q.imageUrl !== null;
    
    document.getElementById('modalQuestionText').innerHTML = q.text;
    document.getElementById('quizCounter').innerHTML = `${currentQIndex + 1} / ${currentQuestions.length}`;
    document.getElementById('quizDifficulty').innerHTML = q.difficulty;
    
    let imgArea = document.getElementById('modalImageArea');
    let quizLayout = document.querySelector('.quiz-layout');
    
    if (!quizLayout) {
        const quizBody = document.querySelector('.quiz-body');
        const originalOptions = document.getElementById('modalOptions');
        const originalImgArea = imgArea;
        
        const layoutDiv = document.createElement('div');
        layoutDiv.className = 'quiz-layout';
        
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options-area';
        optionsDiv.id = 'options-area-container';
        
        const imageDiv = document.createElement('div');
        imageDiv.className = 'image-area';
        imageDiv.id = 'image-area-container';
        
        if (originalOptions && originalOptions.parentNode) {
            originalOptions.parentNode.insertBefore(layoutDiv, originalOptions);
            layoutDiv.appendChild(optionsDiv);
            layoutDiv.appendChild(imageDiv);
            optionsDiv.appendChild(originalOptions);
        }
        if (originalImgArea) {
            imageDiv.appendChild(originalImgArea);
        }
        
        quizLayout = layoutDiv;
    }
    
    const imageAreaContainer = document.getElementById('image-area-container');
    const optionsArea = document.getElementById('options-area-container');
    
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

function submitAll() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        const submitBtn = document.getElementById('submitAllBtn');
        if (submitBtn) submitBtn.style.animation = '';
    }
    if (timerInterval) clearInterval(timerInterval);
    let results = [], batch = [], correctCount = 0;
    let consecutiveCorrect = userData.stats.consecutiveCorrect || 0;
    let answeredCount = currentAnswers.filter(a => a !== null).length;
    let isBlankPaper = (answeredCount === 0);

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
    addPracticeHistory(currentUnit, currentChapter, diffName, currentQuestions.length, correctCount, accuracy, mode, timeSpent, consecutiveCorrect, isBlankPaper);
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

function redoQuestion(qid) {
    for (let u in window.ALL_UNITS) for (let c in window.ALL_UNITS[u].chapters) {
        let idx = window.ALL_UNITS[u].chapters[c].questions.findIndex(q => q.id === qid);
        if (idx !== -1) { pendingUnit = u; pendingChapter = c; updateSettingsUnlockStatus(); document.getElementById('settingsModal').style.display = 'flex'; window._singleRedoQid = qid; return; }
    }
}

function initTabs() {
    let tabs = document.querySelectorAll('.tab'), panels = { practice: document.getElementById('practicePanel'), myMistakes: document.getElementById('myMistakesPanel'), pastMistakes: document.getElementById('pastMistakesPanel'), pinned: document.getElementById('pinnedPanel'), history: document.getElementById('historyPanel'), achievements: document.getElementById('achievementsPanel') };
    tabs.forEach(tab => tab.addEventListener('click', () => {
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
    }));
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('diff-easy').addEventListener('click', () => { selectedDifficulty = 0; document.getElementById('diff-easy').classList.add('active'); document.getElementById('diff-medium').classList.remove('active'); document.getElementById('diff-hard').classList.remove('active'); isTrialMode = false; updateSettingsUnlockStatus(); });
    document.getElementById('diff-medium').addEventListener('click', () => { if (document.getElementById('diff-medium').disabled) return; selectedDifficulty = 1; document.getElementById('diff-easy').classList.remove('active'); document.getElementById('diff-medium').classList.add('active'); document.getElementById('diff-hard').classList.remove('active'); isTrialMode = false; updateSettingsUnlockStatus(); });
    document.getElementById('diff-hard').addEventListener('click', () => { if (document.getElementById('diff-hard').disabled) return; selectedDifficulty = 2; document.getElementById('diff-easy').classList.remove('active'); document.getElementById('diff-medium').classList.remove('active'); document.getElementById('diff-hard').classList.add('active'); isTrialMode = false; updateSettingsUnlockStatus(); });
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
    document.getElementById('devUnlockBtn').addEventListener('click', () => { if (!pendingUnit || !pendingChapter) return; let qs = window.ALL_UNITS[pendingUnit].chapters[pendingChapter].questions; for (let q of qs) if (q.difficulty_level === 0) userData.latestStatus[q.id] = true; saveUserData(); updateSettingsUnlockStatus(); alert('開發模式：1星題目已全部標記為正確！'); });
    document.getElementById('loginBtn').addEventListener('click', () => { let name = document.getElementById('studentName').value.trim(), cls = document.getElementById('studentClass').value.trim(); if (!name || !cls) { alert('請輸入姓名與班級'); return; } currentUser = { id: `${cls}_${name}`, name, class: cls }; loadUserData(); document.getElementById('loginScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'block'; document.getElementById('userLabel').innerHTML = `👋 ${name} (${cls})`; renderPractice(); initTabs(); document.querySelector('.tab[data-tab="practice"]').click(); });
    
    const excludeTranslateCheckbox = document.getElementById('excludeTranslate');
    if (excludeTranslateCheckbox) {
        excludeTranslateCheckbox.addEventListener('change', (e) => {
            excludeTranslate = e.target.checked;
            updateSettingsUnlockStatus();
        });
    }
    
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
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => document.getElementById('settingsModal').style.display = 'none');
    document.getElementById('closeExplainBtn').addEventListener('click', () => { document.getElementById('explainModal').style.display = 'none'; if (lastResults) displayResults(lastResults); });
    document.getElementById('submitAllBtn').addEventListener('click', () => submitAll());
    document.getElementById('closeResultBtn').addEventListener('click', () => document.getElementById('resultModal').style.display = 'none');
    document.getElementById('closeZoomBtn').addEventListener('click', () => document.getElementById('imageZoomModal').style.display = 'none');
    document.getElementById('prevBtn').addEventListener('click', () => { if (currentQIndex > 0) { currentQIndex--; renderQuizNav(); renderCurrentQuestion(); updateNavButtons(); } });
    document.getElementById('nextBtn').addEventListener('click', () => { if (currentQIndex < currentQuestions.length - 1) { currentQIndex++; renderQuizNav(); renderCurrentQuestion(); updateNavButtons(); } });
    document.getElementById('studentName').addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
    document.getElementById('studentClass').addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
});