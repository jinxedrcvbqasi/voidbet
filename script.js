/* ════════════════════════════════════════════════════════
   VOIDBET — Enhanced Casino Engine v4.0
   Architecture:
     1. State & Constants
     2. Audio System
     3. Ranks, Achievements & VIP
     4. Game Logging & XP
     5. UI Utilities & Animations
     6. Canvas Crash Graph
     7. Crash Game (with Ghost Players, Lucky Events, Auto-Cashout)
     8. HiLo Game
     9. Mines Game (Enhanced: Patterns, VIP Multipliers)
    10. Keno Game
    11. Video Poker (Jacks or Better)
    12. Classic Games (Coin, Dice, Roulette)
    13. Daily Quests System
    14. Rakeback System
    15. VIP Roadmap
    16. Fake / Social Systems
    17. Settings, Navigation, Profile
    18. Initialization
   ════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════
// 1. STATE & CONSTANTS
// ═══════════════════════════════════════

const DEFAULT_USER = {
    name: 'Игрок',
    balance: 1000,
    wins: 0,
    losses: 0,
    totalBets: 0,
    biggestWin: 0,
    xp: 0,
    level: 1,
    lastBonusDate: 0,
    lastSpinDate: 0,
    currentStreak: 0,
    history: [],
    achievements: [],
    usedPromos: []
};

const DEFAULT_STATE = {
    user: { ...DEFAULT_USER },
    settings: { soundEnabled: true, amoledMode: false },
    crash: {
        active: false, hasCashedOut: false, multiplier: 1.00,
        bet: 0, interval: null,
        history: [1.2, 5.4, 1.02, 2.1, 15.0],
        luckyEventActive: false, luckyEventBonus: 1.0
    },
    mines: { active: false, grid: [], bet: 0, opened: 0, bombs: 3, multiplier: 1.00, revealedPattern: [] },
    hilo: { active: false, bet: 0, multiplier: 1.00, currentCardValue: 0 },
    keno: { active: false, bet: 0, selected: [], drawn: [] },
    videoPoker: { phase: 'idle', bet: 0, deck: [], hand: [], held: [false,false,false,false,false] },
    jackpot: { pool: 12450 },
    rakeback: { totalWagered: 0, claimable: 0 },
    quests: { daily: [], lastRefresh: 0, progress: {} }
};

// Load saved state or use defaults, merging to prevent missing keys after updates
const saved = JSON.parse(localStorage.getItem('voidbet_state_v4') || 'null');
let gameState = saved ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), saved) : JSON.parse(JSON.stringify(DEFAULT_STATE));

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

const fakeNames = ["Alex_K", "CryptoKing", "LuckyDoge", "Ivan_777", "BetMaster", "MishaX", "VegasPro", "NightVoid", "StarBet", "DarkEdge"];
const RAKEBACK_RATE = 0.05; // Base 5%, increases with VIP level

function saveState() {
    // Don't save interval (functions aren't serializable)
    const toSave = { ...gameState, crash: { ...gameState.crash, interval: null } };
    localStorage.setItem('voidbet_state_v4', JSON.stringify(toSave));
    updateUI();
}

// ═══════════════════════════════════════
// 2. AUDIO SYSTEM
// ═══════════════════════════════════════

let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.body.addEventListener('click', initAudio, { once: true });

function playSound(type) {
    if (!gameState.settings.soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        switch (type) {
            case 'win':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
                gainNode.gain.setValueAtTime(0.08, t);
                gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.start(); osc.stop(t + 0.3); break;
            case 'loss':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
                gainNode.gain.setValueAtTime(0.08, t);
                gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                osc.start(); osc.stop(t + 0.25); break;
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(700, t);
                gainNode.gain.setValueAtTime(0.04, t);
                gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                osc.start(); osc.stop(t + 0.06); break;
            case 'bigwin':
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, t);
                osc.frequency.setValueAtTime(600, t + 0.15);
                osc.frequency.setValueAtTime(800, t + 0.3);
                osc.frequency.setValueAtTime(1000, t + 0.45);
                gainNode.gain.setValueAtTime(0.1, t);
                gainNode.gain.linearRampToValueAtTime(0, t + 0.8);
                osc.start(); osc.stop(t + 0.8); break;
            case 'crash_tick':
                osc.type = 'sine';
                const freq = 200 + Math.min(gameState.crash.multiplier * 30, 600);
                osc.frequency.setValueAtTime(freq, t);
                gainNode.gain.setValueAtTime(0.02, t);
                gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
                osc.start(); osc.stop(t + 0.03); break;
            case 'lucky':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
                gainNode.gain.setValueAtTime(0.1, t);
                gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.start(); osc.stop(t + 0.3); break;
        }
    } catch(e) {}
}

// ═══════════════════════════════════════
// 3. RANKS, ACHIEVEMENTS & VIP
// ═══════════════════════════════════════

function getRank(level) {
    if (level >= 50) return { name: "Void God", class: "rank-void" };
    if (level >= 20) return { name: "Diamond", class: "rank-diamond" };
    if (level >= 10) return { name: "Gold", class: "rank-gold" };
    if (level >= 5)  return { name: "Silver", class: "rank-silver" };
    return { name: "Bronze", class: "rank-bronze" };
}

/** Get rakeback rate based on VIP level */
function getRakebackRate() {
    const lvl = gameState.user.level;
    if (lvl >= 50) return 0.10;
    if (lvl >= 20) return 0.08;
    if (lvl >= 10) return 0.07;
    if (lvl >= 5)  return 0.06;
    return RAKEBACK_RATE;
}

const ACHIEVEMENTS_DICT = {
    first_win:  { title: "Первая победа",  desc: "Выиграть первую ставку",   icon: "🏅" },
    win_10:     { title: "Новичок",        desc: "Выиграть 10 раз",          icon: "⭐" },
    win_1000:   { title: "Богач",          desc: "Выиграть 1000+ за раз",    icon: "💰" },
    crash_10x:  { title: "Космонавт",      desc: "Поймать x10 в Crash",      icon: "🚀" },
    crash_50x:  { title: "Илон Маск",      desc: "Поймать x50 в Crash",      icon: "🌌" },
    lose_10:    { title: "Неудачник",      desc: "Проиграть 10 раз всего",   icon: "💸" },
    mines_10:   { title: "Сапёр",          desc: "Открыть 10 безопасных клеток подряд", icon: "💣" },
    keno_win:   { title: "Кено Мастер",    desc: "Выиграть в Keno",          icon: "🎱" },
    poker_rf:   { title: "Флеш Рояль",     desc: "Собрать Royal Flush",      icon: "👑" }
};

function checkAchievements(game, profit, multiplier) {
    const u = gameState.user;
    if (u.wins === 1  && !u.achievements.includes('first_win')) unlockAchievement('first_win');
    if (u.wins >= 10  && !u.achievements.includes('win_10'))    unlockAchievement('win_10');
    if (u.losses >= 10 && !u.achievements.includes('lose_10')) unlockAchievement('lose_10');
    if (profit >= 1000 && !u.achievements.includes('win_1000')) unlockAchievement('win_1000');
    if (game === 'Crash') {
        if (multiplier >= 10 && !u.achievements.includes('crash_10x')) unlockAchievement('crash_10x');
        if (multiplier >= 50 && !u.achievements.includes('crash_50x')) unlockAchievement('crash_50x');
    }
}

function unlockAchievement(id) {
    gameState.user.achievements.push(id);
    const a = ACHIEVEMENTS_DICT[id];
    showToast(`${a.icon} Достижение!`, a.title);
    playSound('bigwin');
}

// ═══════════════════════════════════════
// 4. GAME LOGGING, XP & ECONOMY
// ═══════════════════════════════════════

function calcLevel(xp) { return Math.floor(Math.sqrt(xp / 100)) + 1; }
function xpForNextLevel(lvl) { return Math.pow(lvl, 2) * 100; }

/**
 * Central game result logger.
 * Handles: balance, XP, stats, rakeback, jackpot, streaks, achievements.
 */
function logGame(game, detail, betAmount, profit, multiplier = 0) {
    const user = gameState.user;
    user.totalBets++;
    user.xp += Math.floor(betAmount * 0.5); // XP from wagering
    user.level = calcLevel(user.xp);

    // Rakeback accumulation
    const rakebackEarned = betAmount * getRakebackRate();
    gameState.rakeback.claimable += rakebackEarned;
    gameState.rakeback.totalWagered += betAmount;

    // Jackpot contribution (1% of every bet)
    gameState.jackpot.pool += betAmount * 0.01;

    // Apply profit to balance
    user.balance = Math.max(0, user.balance + profit);

    // Random jackpot trigger (0.1% chance on bets >= 10)
    if (betAmount >= 10 && Math.random() < 0.001) {
        const jackpotWin = Math.floor(gameState.jackpot.pool * 0.5);
        user.balance += jackpotWin;
        gameState.jackpot.pool -= jackpotWin;
        showBigWinModal(jackpotWin, "🌟 ГЛОБАЛЬНЫЙ ДЖЕКПОТ!");
        playSound('bigwin');
    }

    if (profit > 0) {
        user.wins++;
        if (profit > user.biggestWin) user.biggestWin = profit;
        user.currentStreak = (user.currentStreak || 0) + 1;

        // Win streak bonuses
        if (user.currentStreak === 3) { user.balance += 50;  showToast('🔥', 'Стрик 3 победы! +50 ₽'); }
        if (user.currentStreak === 5) { user.balance += 150; showToast('🔥🔥', 'Стрик 5 побед! +150 ₽'); }
        if (user.currentStreak === 10){ user.balance += 500; showToast('🌋', 'Стрик 10 побед! +500 ₽'); }

        if (multiplier >= 5 || profit >= betAmount * 5) {
            playSound('bigwin');
            showBigWinModal(profit, `${game}: ${detail}`);
        } else {
            playSound('win');
            showMessage('casino-msg', `+${Math.floor(profit)} ₽`, 'text-success');
        }
        showFloatingWinAnimation(profit);
    } else {
        user.losses++;
        user.currentStreak = 0;
        playSound('loss');
        showMessage('casino-msg', `-${betAmount} ₽`, 'text-danger');
    }

    user.history.unshift({ game, detail, amount: Math.floor(profit), date: new Date().toLocaleTimeString() });
    if (user.history.length > 10) user.history.pop();

    // Update quest progress
    updateQuestProgress(game, betAmount, multiplier, profit > 0);

    checkAchievements(game, profit, multiplier);
    renderLeaderboard();
    saveState();
}

// ═══════════════════════════════════════
// 5. UI UTILITIES & ANIMATIONS
// ═══════════════════════════════════════

function updateUI() {
    const u = gameState.user;
    const rank = getRank(u.level);

    // Header
    document.getElementById('nav-balance').innerText = Math.floor(u.balance);
    document.getElementById('header-level').innerText = `Ур. ${u.level}`;
    document.getElementById('home-greeting').innerText = `Привет, ${u.name}!`;
    document.getElementById('profile-name').value = u.name;
    document.getElementById('global-jackpot-val').innerText = Math.floor(gameState.jackpot.pool);

    // Rank badge
    const rankBadge = document.getElementById('header-rank');
    rankBadge.innerText = rank.name;
    rankBadge.className = `rank-badge ${rank.class}`;

    // XP progress
    const nextXp = xpForNextLevel(u.level);
    const prevXp = xpForNextLevel(u.level - 1);
    const progress = Math.min(100, Math.max(0, ((u.xp - prevXp) / (nextXp - prevXp)) * 100));
    document.getElementById('home-next-level').innerText = `До след. ур: ${Math.max(0, nextXp - u.xp)} XP`;
    document.getElementById('xp-progress').style.width = `${progress}%`;

    // Stats
    document.getElementById('stat-wins').innerText = u.wins;
    document.getElementById('stat-losses').innerText = u.losses;
    document.getElementById('stat-bets').innerText = u.totalBets;
    document.getElementById('stat-big-win').innerText = `${Math.floor(u.biggestWin)} ₽`;

    // Rakeback stats
    document.getElementById('stat-total-wagered').innerText = `${Math.floor(gameState.rakeback.totalWagered)} ₽`;
    document.getElementById('stat-rakeback-claimable').innerText = `${Math.floor(gameState.rakeback.claimable)} ₽`;
    document.getElementById('home-rakeback-claimable').innerText = Math.floor(gameState.rakeback.claimable);

    // Daily bonus button
    const btnBonus = document.getElementById('btn-daily-bonus');
    if (Date.now() - u.lastBonusDate > 86400000) {
        btnBonus.disabled = false;
        btnBonus.innerText = "🎁 Забрать ежедневный бонус (500 ₽)";
    } else {
        btnBonus.disabled = true;
        const hrs = Math.ceil((86400000 - (Date.now() - u.lastBonusDate)) / 3600000);
        btnBonus.innerText = `⏳ Бонус через ${hrs} ч.`;
    }

    // History list
    const histList = document.getElementById('history-list');
    histList.innerHTML = u.history.length === 0 ? '<li class="text-muted" style="padding:15px;">Нет ставок</li>' : '';
    u.history.forEach(h => {
        const isWin = h.amount > 0;
        histList.innerHTML += `<li><div class="list-item-left"><span class="item-title">${h.game}</span><span class="item-sub">${h.detail} • ${h.date}</span></div><div class="stat-value ${isWin ? 'text-success' : 'text-danger'}">${isWin ? '+' : ''}${h.amount}</div></li>`;
    });

    // Settings toggles
    document.getElementById('setting-sound').checked = gameState.settings.soundEnabled;
    document.getElementById('setting-amoled').checked = gameState.settings.amoledMode;

    // VIP tiers
    renderVIPRoadmap();
    renderQuests();
}

function showMessage(id, msg, className) {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = `<span class="${className}">${msg}</span>`;
    setTimeout(() => { if (box) box.innerHTML = ''; }, 3000);
}

function showToast(icon, message, sub = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-text"><h4>${message}</h4>${sub ? `<p>${sub}</p>` : ''}</div>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showFloatingWinAnimation(amount) {
    const container = document.getElementById('win-anim-container');
    const el = document.createElement('div');
    el.className = 'floating-win';
    el.innerText = `+${Math.floor(amount)} ₽`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

function showBigWinModal(amount, desc) {
    document.getElementById('modal-win-amount').innerText = `+${Math.floor(amount)} ₽`;
    document.getElementById('modal-win-desc').innerText = desc || '';
    document.getElementById('big-win-modal').classList.add('active');
    triggerConfetti();
}

function triggerConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    const shapes = ['■', '●', '▲', '♦', '★'];
    const colors = ['#ffd700', '#00e701', '#ff1a1a', '#00ffff', '#ff00ff', '#ffaa00'];
    for (let i = 0; i < 70; i++) {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.color = colors[Math.floor(Math.random() * colors.length)];
        el.style.fontSize = (Math.random() * 12 + 8) + 'px';
        el.style.animationDuration = (Math.random() * 2.5 + 1) + 's';
        el.style.animationDelay = (Math.random() * 0.5) + 's';
        el.innerText = shapes[Math.floor(Math.random() * shapes.length)];
        container.appendChild(el);
    }
    setTimeout(() => container.innerHTML = '', 4000);
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openSpinModal() { document.getElementById('lucky-spin-modal').classList.add('active'); }

// ═══════════════════════════════════════
// 6. CANVAS CRASH GRAPH
// ═══════════════════════════════════════

let crashCanvas, crashCtx, crashPoints = [], crashTick = 0;

function initCrashCanvas() {
    crashCanvas = document.getElementById('crash-canvas');
    if (!crashCanvas) return;
    const wrapper = document.getElementById('crash-graph-wrapper');
    // Set canvas resolution to match display size
    crashCanvas.width  = wrapper.offsetWidth  || 400;
    crashCanvas.height = wrapper.offsetHeight || 200;
    crashCtx = crashCanvas.getContext('2d');
}

/** Map multiplier value to a CSS color string (blue → cyan → yellow → orange → red) */
function getCrashColor(mult) {
    if (mult <= 1.5) return `rgb(0, 150, 255)`;                            // blue
    if (mult <= 3.0) {
        const t = (mult - 1.5) / 1.5;
        return `rgb(${Math.floor(t * 100)}, ${Math.floor(150 + t * 105)}, ${Math.floor(255 - t * 155)})`;
    }
    if (mult <= 7.0) {
        const t = (mult - 3.0) / 4.0;
        return `rgb(${Math.floor(100 + t * 155)}, ${Math.floor(255 - t * 55)}, ${Math.floor(100 - t * 100)})`;
    }
    if (mult <= 15.0) {
        const t = (mult - 7.0) / 8.0;
        return `rgb(255, ${Math.floor(200 - t * 200)}, 0)`;
    }
    return `rgb(255, 0, 0)`;  // deep red for extreme multipliers
}

/** Called on every crash tick to append a point and redraw the graph */
function drawCrashGraph(crashed = false) {
    if (!crashCtx || !crashCanvas) return;
    const W = crashCanvas.width, H = crashCanvas.height;
    const mult = gameState.crash.multiplier;

    // --- Map current state to canvas coords ---
    // X: tick-based, fills canvas over ~200 ticks
    const maxTicks = 250;
    const x = Math.min(W - 10, 8 + (crashTick / maxTicks) * (W - 20));
    // Y: logarithmic so early growth is visible, later growth is dramatic
    const logMax = Math.log(60);
    const logMult = Math.log(Math.max(1.001, mult));
    const y = H - 8 - Math.min(H - 20, (logMult / logMax) * (H - 20));
    crashPoints.push({ x, y });
    crashTick++;

    // --- Clear ---
    crashCtx.clearRect(0, 0, W, H);

    // --- Subtle grid ---
    crashCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    crashCtx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        crashCtx.beginPath();
        crashCtx.moveTo(0, H * i / 4);
        crashCtx.lineTo(W, H * i / 4);
        crashCtx.stroke();
    }

    if (crashPoints.length < 2) return;

    const color = crashed ? '#ff1a1a' : getCrashColor(mult);
    const lastPt = crashPoints[crashPoints.length - 1];

    // --- Gradient fill under curve ---
    const fillGrad = crashCtx.createLinearGradient(0, H, 0, 0);
    fillGrad.addColorStop(0, 'rgba(0, 100, 255, 0.0)');
    fillGrad.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ', 0.18)'));
    crashCtx.beginPath();
    crashCtx.moveTo(crashPoints[0].x, H);
    crashPoints.forEach(p => crashCtx.lineTo(p.x, p.y));
    crashCtx.lineTo(lastPt.x, H);
    crashCtx.closePath();
    crashCtx.fillStyle = fillGrad;
    crashCtx.fill();

    // --- Main curve line ---
    crashCtx.beginPath();
    crashCtx.moveTo(crashPoints[0].x, crashPoints[0].y);
    for (let i = 1; i < crashPoints.length; i++) {
        // Smooth curve using quadratic bezier if enough points
        if (i > 1) {
            const prev = crashPoints[i - 1];
            const curr = crashPoints[i];
            const cpx = (prev.x + curr.x) / 2;
            crashCtx.quadraticCurveTo(prev.x, prev.y, cpx, (prev.y + curr.y) / 2);
        } else {
            crashCtx.lineTo(crashPoints[i].x, crashPoints[i].y);
        }
    }
    crashCtx.lineTo(lastPt.x, lastPt.y);
    crashCtx.strokeStyle = color;
    crashCtx.lineWidth = 3;
    crashCtx.shadowBlur = 12;
    crashCtx.shadowColor = color;
    crashCtx.stroke();
    crashCtx.shadowBlur = 0;

    // --- Glowing dot at current position ---
    if (!crashed) {
        crashCtx.beginPath();
        crashCtx.arc(lastPt.x, lastPt.y, 5, 0, Math.PI * 2);
        crashCtx.fillStyle = color;
        crashCtx.shadowBlur = 20;
        crashCtx.shadowColor = color;
        crashCtx.fill();
        crashCtx.shadowBlur = 0;
    }

    // --- Screen shake at high multipliers ---
    if (mult >= 10 && !crashed) {
        const intensity = Math.min(6, (mult - 10) * 0.35);
        const dx = (Math.random() - 0.5) * intensity;
        const dy = (Math.random() - 0.5) * intensity;
        crashCanvas.style.transform = `translate(${dx}px, ${dy}px)`;
    } else {
        crashCanvas.style.transform = '';
    }
}

function resetCrashGraph() {
    crashPoints = [];
    crashTick = 0;
    if (crashCtx && crashCanvas) {
        crashCtx.clearRect(0, 0, crashCanvas.width, crashCanvas.height);
        crashCanvas.style.transform = '';
    }
}

// ═══════════════════════════════════════
// 7. CRASH GAME
// ═══════════════════════════════════════

// Lucky event types: icon, multiplier bonus, label, timeout
const LUCKY_EVENTS = [
    { icon: '⭐', bonus: 1.15, label: '+15% к выводу!', color: '#ffd700' },
    { icon: '💎', bonus: 1.30, label: '+30% к выводу!', color: '#00ffff' },
    { icon: '👑', bonus: 1.50, label: '+50% к выводу!', color: '#ff00ff' },
    { icon: '🌟', bonus: 2.00, label: 'ДВОЙНОЙ вывод!', color: '#ff8c00' },
];
let luckyEventTimer = null;

function spawnLuckyEvent() {
    if (gameState.crash.luckyEventActive || !gameState.crash.active) return;

    const event = LUCKY_EVENTS[Math.floor(Math.random() * LUCKY_EVENTS.length)];
    gameState.crash.luckyEventActive = true;
    gameState.crash.luckyEventBonus = event.bonus;

    const btn = document.getElementById('lucky-event-btn');
    // Random position within the graph wrapper
    btn.style.top  = (20 + Math.random() * 50) + '%';
    btn.style.left = (15 + Math.random() * 60) + '%';
    btn.style.display = 'block';
    btn.innerText = event.icon;
    btn.title = event.label;

    playSound('lucky');
    showToast(event.icon, `Удача! ${event.label}`, 'Нажми быстрее!');

    // Auto-hide after 3 seconds if not clicked
    luckyEventTimer = setTimeout(() => {
        hideLuckyEvent(false);
    }, 3000);
}

function claimLuckyEvent() {
    if (!gameState.crash.luckyEventActive) return;
    clearTimeout(luckyEventTimer);
    const bonus = gameState.crash.luckyEventBonus;
    showToast('🎉', `Бонус захвачен! x${bonus}`, 'Применится при выводе');
    playSound('bigwin');
    hideLuckyEvent(true);
}

function hideLuckyEvent(claimed) {
    gameState.crash.luckyEventActive = claimed; // keep true only if claimed (so cashout uses it)
    if (!claimed) gameState.crash.luckyEventBonus = 1.0;
    document.getElementById('lucky-event-btn').style.display = 'none';
}

function renderCrashHistory() {
    const c = document.getElementById('crash-history');
    c.innerHTML = gameState.crash.history.map(m => {
        const col = m >= 10 ? '#ff00ff' : m >= 5 ? 'var(--success-color)' : m >= 2 ? 'var(--warning-color)' : 'var(--danger-color)';
        return `<span class="crash-pill" style="color:${col};">${m.toFixed(2)}x</span>`;
    }).join('');
}

function generateGhostBots() {
    // Create ghost player markers on the graph layer
    const layer = document.getElementById('ghost-players-layer');
    layer.innerHTML = '';
    const activeGhosts = [];
    fakeNames.slice(0, 5).forEach(name => {
        if (Math.random() > 0.4) {
            const targetMult = +(1.2 + Math.random() * 8).toFixed(2);
            activeGhosts.push({ name, targetMult, cashedOut: false });
        }
    });
    gameState.crash._ghosts = activeGhosts;
}

function updateGhostMarkers(mult) {
    if (!gameState.crash._ghosts) return;
    const layer = document.getElementById('ghost-players-layer');
    gameState.crash._ghosts.forEach(ghost => {
        if (!ghost.cashedOut && mult >= ghost.targetMult) {
            ghost.cashedOut = true;
            const el = document.createElement('div');
            el.className = 'ghost-marker';
            el.style.top = (25 + Math.random() * 40) + '%';
            el.style.left = '5px';
            el.style.color = 'var(--success-color)';
            el.innerText = `${ghost.name}: ${ghost.targetMult}x ✓`;
            layer.appendChild(el);
            // Fade out after 3s
            setTimeout(() => el.remove(), 3000);
        }
    });
}

function renderCrashBotList() {
    const list = document.getElementById('crash-bots');
    list.innerHTML = '';
    if (!gameState.crash._ghosts || gameState.crash._ghosts.length === 0) {
        list.innerHTML = '<li class="text-muted text-center" style="padding:10px;">Ставок пока нет</li>';
        return;
    }
    gameState.crash._ghosts.forEach(ghost => {
        const bet = Math.floor(Math.random() * 5000) + 100;
        const li = document.createElement('li');
        li.className = 'bot-bet-row';
        li.id = `bot-row-${ghost.name}`;
        li.innerHTML = `
            <div><span class="item-title">${ghost.name}</span><span class="item-sub">${bet} ₽ • авто: ${ghost.targetMult}x</span></div>
            <div class="stat-value text-muted" id="bot-status-${ghost.name}">В игре...</div>`;
        list.appendChild(li);
    });
}

function updateBotStatusList(mult) {
    if (!gameState.crash._ghosts) return;
    gameState.crash._ghosts.forEach(ghost => {
        const el = document.getElementById(`bot-status-${ghost.name}`);
        if (!el) return;
        if (ghost.cashedOut) {
            el.innerText = `${ghost.targetMult}x 💚`;
            el.className = 'stat-value text-success';
        } else if (!gameState.crash.active) {
            el.innerText = '💥';
            el.className = 'stat-value text-danger';
        }
    });
}

function startCrash() {
    if (gameState.crash.active) return;
    gameState.crash.bet = getBetAmount('crash-bet');
    if (!gameState.crash.bet) return;

    gameState.user.balance -= gameState.crash.bet;
    updateUI();

    const btnStart   = document.getElementById('btn-crash-start');
    const btnCashout = document.getElementById('btn-crash-cashout');
    const elem       = document.getElementById('crash-multiplier');
    const status     = document.getElementById('crash-status');

    btnStart.disabled   = true;
    document.getElementById('crash-bet').disabled  = true;
    document.getElementById('crash-auto').disabled = true;
    btnCashout.disabled = true;

    // Reset graph
    resetCrashGraph();
    initCrashCanvas();

    // Countdown
    let countdown = 3;
    status.innerText = `Запуск через ${countdown}...`;
    elem.style.color = 'var(--text-primary)';

    const countInt = setInterval(() => {
        countdown--;
        if (countdown > 0) { status.innerText = `Запуск через ${countdown}...`; }
        else { clearInterval(countInt); runCrashFlight(); }
    }, 1000);
}

function runCrashFlight() {
    gameState.crash.active      = true;
    gameState.crash.hasCashedOut = false;
    gameState.crash.multiplier  = 1.00;
    gameState.crash.luckyEventActive = false;
    gameState.crash.luckyEventBonus  = 1.0;

    const elem   = document.getElementById('crash-multiplier');
    const status = document.getElementById('crash-status');
    const btnCashout = document.getElementById('btn-crash-cashout');

    status.innerText = '🚀 Летим...';
    btnCashout.disabled = false;
    btnCashout.classList.add('pulse-anim');

    // Crash point formula: biased toward low values but allows big multipliers
    const crashPoint = Math.max(1.01, parseFloat((99 / (Math.random() * 100)).toFixed(2)));
    const autoCashout = parseFloat(document.getElementById('crash-auto').value) || 0;

    // Generate ghost players
    generateGhostBots();
    renderCrashBotList();

    // Schedule lucky events at random multipliers between 2x–8x (if VIP-eligible)
    const luckyThreshold = 1.5 + Math.random() * 5;
    let luckySpawned = false;

    gameState.crash.interval = setInterval(() => {
        // Accelerating growth
        gameState.crash.multiplier += 0.01 + (gameState.crash.multiplier * 0.004);
        const mult = gameState.crash.multiplier;

        elem.innerText = mult.toFixed(2) + 'x';
        elem.style.color = getCrashColor(mult);

        // Update graph
        drawCrashGraph(false);

        // Update ghost players
        updateGhostMarkers(mult);
        updateBotStatusList(mult);

        // Periodic sound tick (every ~0.5x multiplier increase)
        if (Math.floor(mult * 2) % 1 === 0 && Math.random() < 0.1) playSound('crash_tick');

        // Spawn lucky event once
        if (!luckySpawned && mult >= luckyThreshold && gameState.crash.active) {
            luckySpawned = true;
            spawnLuckyEvent();
        }

        // Auto cashout
        if (!gameState.crash.hasCashedOut && autoCashout > 0 && mult >= autoCashout) {
            gameState.crash.multiplier = autoCashout;
            elem.innerText = autoCashout.toFixed(2) + 'x';
            cashoutCrash();
        }

        // Crash!
        if (mult >= crashPoint) {
            clearInterval(gameState.crash.interval);
            gameState.crash.multiplier = parseFloat(mult.toFixed(2));
            elem.innerText = gameState.crash.multiplier.toFixed(2) + 'x';
            elem.style.color = 'var(--danger-color)';
            status.innerText = '💥 КРАШ!';
            btnCashout.classList.remove('pulse-anim');
            drawCrashGraph(true);
            hideLuckyEvent(false);
            endCrash();
        }
    }, 50);
}

function cashoutCrash() {
    if (!gameState.crash.active || gameState.crash.hasCashedOut) return;
    gameState.crash.hasCashedOut = true;

    const btnCashout = document.getElementById('btn-crash-cashout');
    btnCashout.disabled = true;
    btnCashout.classList.remove('pulse-anim');

    // Apply lucky event bonus if claimed
    let finalMult = gameState.crash.multiplier;
    if (gameState.crash.luckyEventActive) {
        finalMult = parseFloat((finalMult * gameState.crash.luckyEventBonus).toFixed(2));
        gameState.crash.luckyEventActive = false;
        showToast('✨', `Бонус применён! x${gameState.crash.luckyEventBonus}`);
    }

    document.getElementById('crash-status').innerText = `✅ Вывели на ${finalMult.toFixed(2)}x`;
    document.getElementById('crash-multiplier').style.color = 'var(--success-color)';

    const profit = (gameState.crash.bet * finalMult) - gameState.crash.bet;
    gameState.user.balance += gameState.crash.bet;
    logGame('Crash', `Вывод ${finalMult.toFixed(2)}x`, gameState.crash.bet, profit, finalMult);
}

function endCrash() {
    gameState.crash.active = false;
    document.getElementById('btn-crash-start').disabled   = false;
    document.getElementById('btn-crash-cashout').disabled = true;
    document.getElementById('crash-bet').disabled  = false;
    document.getElementById('crash-auto').disabled = false;

    if (!gameState.crash.hasCashedOut) {
        logGame('Crash', `Сгорело на ${gameState.crash.multiplier.toFixed(2)}x`, gameState.crash.bet, -gameState.crash.bet, 0);
    }

    gameState.crash.history.unshift(parseFloat(gameState.crash.multiplier.toFixed(2)));
    if (gameState.crash.history.length > 10) gameState.crash.history.pop();
    renderCrashHistory();
    updateBotStatusList(0);
}

// ═══════════════════════════════════════
// 8. HILO GAME
// ═══════════════════════════════════════

const CARD_VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function drawRandomCard() { return Math.floor(Math.random() * 13) + 2; }

function getCardHTML(value) {
    const isRed = Math.random() > 0.5;
    const suit  = isRed ? (Math.random() > 0.5 ? '♥' : '♦') : (Math.random() > 0.5 ? '♠' : '♣');
    const label = CARD_VALUES[value - 2];
    return `<span class="${isRed ? 'hilo-card-red' : 'hilo-card-black'}">${label}${suit}</span>`;
}

function startHiLo() {
    if (gameState.hilo.active) return;
    const bet = getBetAmount('hilo-bet'); if (!bet) return;
    gameState.user.balance -= bet; updateUI();
    gameState.hilo = { active: true, bet, multiplier: 1.00, currentCardValue: drawRandomCard() };
    document.getElementById('hilo-mult').innerText = '1.00x';
    document.getElementById('hilo-card-display').innerHTML = getCardHTML(gameState.hilo.currentCardValue);
    document.getElementById('btn-hilo-start').style.display  = 'none';
    document.getElementById('hilo-presets').style.display    = 'none';
    document.getElementById('hilo-bet').disabled             = true;
    document.getElementById('hilo-controls').style.display   = 'flex';
    document.getElementById('btn-hilo-cashout').style.display = 'block';
    playSound('click');
}

function guessHiLo(guess) {
    if (!gameState.hilo.active) return;
    const oldCard = gameState.hilo.currentCardValue;
    const newCard = drawRandomCard();
    gameState.hilo.currentCardValue = newCard;
    document.getElementById('hilo-card-display').innerHTML = getCardHTML(newCard);
    let prob = guess === 'higher' ? (15 - oldCard) / 13 : (oldCard - 1) / 13;
    prob = Math.max(0.1, Math.min(0.9, prob));
    const won = (guess === 'higher') ? newCard >= oldCard : newCard <= oldCard;
    if (won) {
        playSound('click');
        gameState.hilo.multiplier = parseFloat((gameState.hilo.multiplier * (1 / prob) * 0.95).toFixed(2));
        document.getElementById('hilo-mult').innerText = gameState.hilo.multiplier.toFixed(2) + 'x';
    } else {
        endHiLo(false);
    }
}

function cashoutHiLo() { if (gameState.hilo.active) endHiLo(true); }

function endHiLo(won) {
    gameState.hilo.active = false;
    document.getElementById('btn-hilo-start').style.display   = 'block';
    document.getElementById('hilo-presets').style.display     = 'flex';
    document.getElementById('hilo-bet').disabled              = false;
    document.getElementById('hilo-controls').style.display    = 'none';
    document.getElementById('btn-hilo-cashout').style.display = 'none';
    if (won) {
        const profit = (gameState.hilo.bet * gameState.hilo.multiplier) - gameState.hilo.bet;
        gameState.user.balance += gameState.hilo.bet;
        logGame('HiLo', `Вывод ${gameState.hilo.multiplier.toFixed(2)}x`, gameState.hilo.bet, profit, gameState.hilo.multiplier);
    } else {
        logGame('HiLo', `Слив на ${gameState.hilo.multiplier.toFixed(2)}x`, gameState.hilo.bet, -gameState.hilo.bet, 0);
    }
}

// ═══════════════════════════════════════
// 9. MINES GAME (Enhanced)
// ═══════════════════════════════════════

// Secret patterns: each is a sorted array of tile indices
const SECRET_PATTERNS = [
    { name: 'Крест',      indices: [2, 10, 11, 12, 22],        bonus: 0.5 },
    { name: 'Углы',       indices: [0, 4, 20, 24],              bonus: 0.75 },
    { name: 'Диагональ',  indices: [0, 6, 12, 18, 24],          bonus: 1.0 },
    { name: 'X-Pattern',  indices: [0, 4, 12, 20, 24],          bonus: 1.5 },
];
let discoveredPattern = null;

function renderMinesGrid() {
    const grid = document.getElementById('mines-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const tile = document.createElement('div');
        tile.className = 'mine-tile';
        tile.dataset.index = i;
        tile.onclick = () => openMine(i);
        grid.appendChild(tile);
    }
}
renderMinesGrid();

function startMines() {
    if (gameState.mines.active) return;
    const bet = getBetAmount('mines-bet'); if (!bet) return;
    const bombs = parseInt(document.getElementById('mines-count').value) || 3;

    gameState.user.balance -= bet; updateUI();
    discoveredPattern = null;
    document.getElementById('mines-pattern-hint').innerText = '';

    gameState.mines = {
        active: true, bet, opened: 0, bombs, multiplier: 1.00,
        grid: Array(25).fill('safe'), revealedPattern: []
    };

    // Place bombs
    let placed = 0;
    while (placed < bombs) {
        const idx = Math.floor(Math.random() * 25);
        if (gameState.mines.grid[idx] === 'safe') { gameState.mines.grid[idx] = 'bomb'; placed++; }
    }

    document.getElementById('btn-mines-start').style.display   = 'none';
    document.getElementById('btn-mines-cashout').style.display = 'block';
    document.getElementById('mines-bet').disabled = true;
    document.getElementById('mines-mult').innerText = '1.00x';
    renderMinesGrid();
    playSound('click');
}

function openMine(index) {
    if (!gameState.mines.active) return;
    const tile = document.getElementById('mines-grid').children[index];
    if (tile.classList.contains('opened')) return;
    tile.classList.add('opened');

    if (gameState.mines.grid[index] === 'bomb') {
        tile.classList.add('bomb');
        tile.innerText = '💣';
        playSound('loss');
        endMines(false);
    } else {
        // Check if VIP hidden tile (Gold+ VIP, 10% chance)
        const isVipGem = gameState.user.level >= 10 && Math.random() < 0.1;
        tile.classList.add(isVipGem ? 'vip-gem' : 'gem');
        tile.innerText = isVipGem ? '🔮' : '💎';
        playSound('click');

        gameState.mines.opened++;
        gameState.mines.revealedPattern.push(index);

        // Multiplier formula: starts slow, accelerates with more opened gems
        const safeTotal = 25 - gameState.mines.bombs;
        const riskFactor = gameState.mines.bombs / 25;
        gameState.mines.multiplier = parseFloat(
            (1 + gameState.mines.opened * riskFactor * 2.5 + (gameState.mines.opened * gameState.mines.opened * riskFactor * 0.15)).toFixed(2)
        );

        // VIP gem bonus
        if (isVipGem) {
            gameState.mines.multiplier = parseFloat((gameState.mines.multiplier * 1.25).toFixed(2));
            showToast('🔮', 'VIP Гем! Множитель ×1.25');
        }

        document.getElementById('mines-mult').innerText = gameState.mines.multiplier.toFixed(2) + 'x';

        // Check secret patterns
        checkMinesPattern();
    }
}

function checkMinesPattern() {
    if (discoveredPattern) return;
    const revealed = gameState.mines.revealedPattern.sort((a, b) => a - b);
    for (const pattern of SECRET_PATTERNS) {
        const allFound = pattern.indices.every(idx => revealed.includes(idx));
        if (allFound) {
            discoveredPattern = pattern;
            gameState.mines.multiplier = parseFloat((gameState.mines.multiplier + pattern.bonus).toFixed(2));
            document.getElementById('mines-mult').innerText = gameState.mines.multiplier.toFixed(2) + 'x';
            document.getElementById('mines-pattern-hint').innerText = `🔮 ${pattern.name}!`;
            document.getElementById('mines-secret-bonus').innerText = `+${pattern.bonus}x`;
            document.getElementById('mines-secret-modal').classList.add('active');
            playSound('bigwin');
            break;
        }
    }
}

function cashoutMines() {
    if (!gameState.mines.active || gameState.mines.opened === 0) return;
    endMines(true);
}

function endMines(won) {
    gameState.mines.active = false;
    document.getElementById('btn-mines-start').style.display   = 'block';
    document.getElementById('btn-mines-cashout').style.display = 'none';
    document.getElementById('mines-bet').disabled = false;

    // Reveal all remaining tiles
    const tiles = document.getElementById('mines-grid').children;
    for (let i = 0; i < 25; i++) {
        if (!tiles[i].classList.contains('opened')) {
            tiles[i].innerText   = gameState.mines.grid[i] === 'bomb' ? '💣' : '💎';
            tiles[i].style.opacity = '0.4';
        }
    }

    if (won) {
        const profit = (gameState.mines.bet * gameState.mines.multiplier) - gameState.mines.bet;
        gameState.user.balance += gameState.mines.bet;
        logGame('Мины', `Вывод ${gameState.mines.multiplier.toFixed(2)}x`, gameState.mines.bet, profit, gameState.mines.multiplier);
    } else {
        logGame('Мины', `Взрыв на ${gameState.mines.multiplier.toFixed(2)}x`, gameState.mines.bet, -gameState.mines.bet, 0);
    }
}

// ═══════════════════════════════════════
// 10. KENO GAME
// ═══════════════════════════════════════

// Keno paytable: [picks][matches] = multiplier
// Sparse table — only matching pick counts yield wins
const KENO_PAYTABLE = {
    1:  [0, 3.5],
    2:  [0, 0, 10],
    3:  [0, 0, 2, 25],
    4:  [0, 0, 1, 5, 80],
    5:  [0, 0, 0, 2, 15, 200],
    6:  [0, 0, 0, 1, 5, 50, 500],
    7:  [0, 0, 0, 1, 3, 20, 150, 1000],
    8:  [0, 0, 0, 0, 2, 10, 75, 500, 2000],
    9:  [0, 0, 0, 0, 1, 5, 30, 200, 1000, 5000],
    10: [0, 0, 0, 0, 1, 3, 15, 100, 500, 2000, 10000],
};

function initKenoGrid() {
    const grid = document.getElementById('keno-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= 40; i++) {
        const cell = document.createElement('div');
        cell.className = 'keno-num';
        cell.innerText = i;
        cell.dataset.num = i;
        cell.onclick = () => toggleKenoNumber(i, cell);
        grid.appendChild(cell);
    }
}
initKenoGrid();

function toggleKenoNumber(num, el) {
    if (!el) el = document.querySelector(`.keno-num[data-num="${num}"]`);
    const sel = gameState.keno.selected;
    const idx = sel.indexOf(num);
    if (idx >= 0) {
        sel.splice(idx, 1);
        el.classList.remove('selected');
    } else {
        if (sel.length >= 10) { showToast('⚠️', 'Максимум 10 чисел'); return; }
        sel.push(num);
        el.classList.add('selected');
    }
    updateKenoInfo();
}

function updateKenoInfo() {
    const count = gameState.keno.selected.length;
    document.getElementById('keno-selected-count').innerText = count;
}

function clearKenoSelection() {
    gameState.keno.selected = [];
    document.querySelectorAll('.keno-num').forEach(el => el.classList.remove('selected', 'drawn', 'hit'));
    document.getElementById('keno-selected-count').innerText = '0';
    document.getElementById('keno-payout').innerText = '0x';
}

async function playKeno() {
    const picks = gameState.keno.selected.length;
    if (picks === 0) { showToast('⚠️', 'Выбери хотя бы 1 число'); return; }
    const bet = getBetAmount('keno-bet'); if (!bet) return;

    // Disable button during draw
    const btn = document.getElementById('btn-keno-play');
    btn.disabled = true;
    gameState.user.balance -= bet; updateUI();

    // Reset drawn state on grid
    document.querySelectorAll('.keno-num').forEach(el => el.classList.remove('drawn', 'hit'));
    document.getElementById('keno-payout').innerText = '0x';

    // Draw 20 unique numbers from 1–40
    const allNums = Array.from({length: 40}, (_, i) => i + 1);
    const drawn = [];
    while (drawn.length < 20) {
        const idx = Math.floor(Math.random() * allNums.length);
        drawn.push(allNums.splice(idx, 1)[0]);
    }
    gameState.keno.drawn = drawn;

    // Animate drawing numbers one by one
    for (let i = 0; i < drawn.length; i++) {
        await new Promise(res => setTimeout(res, 80));
        const num = drawn[i];
        const el  = document.querySelector(`.keno-num[data-num="${num}"]`);
        if (!el) continue;
        const isHit = gameState.keno.selected.includes(num);
        el.classList.add(isHit ? 'hit' : 'drawn');
        if (isHit) playSound('click');
    }

    // Calculate results
    const matches = gameState.keno.selected.filter(n => drawn.includes(n)).length;
    const table   = KENO_PAYTABLE[picks] || [];
    const mult    = table[matches] || 0;

    document.getElementById('keno-payout').innerText = `${mult}x`;

    if (mult > 0) {
        const profit = bet * mult - bet;
        gameState.user.balance += bet;
        logGame('Keno', `${matches}/${picks} попаданий (x${mult})`, bet, profit, mult);
        if (!gameState.user.achievements.includes('keno_win')) unlockAchievement('keno_win');
    } else {
        logGame('Keno', `${matches}/${picks} попаданий — мимо`, bet, -bet, 0);
    }

    btn.disabled = false;
}

// ═══════════════════════════════════════
// 11. VIDEO POKER — Jacks or Better
// ═══════════════════════════════════════

const SUITS_LIST  = ['♠', '♥', '♦', '♣'];
const RANKS_LIST  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RED_SUITS   = ['♥', '♦'];

function createDeck() {
    const deck = [];
    for (const suit of SUITS_LIST) {
        for (let i = 0; i < RANKS_LIST.length; i++) {
            deck.push({ rank: RANKS_LIST[i], suit, value: i });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function getHandResult(hand) {
    const vals  = hand.map(c => c.value).sort((a, b) => a - b);
    const suits = hand.map(c => c.suit);
    const counts = {};
    vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const freq  = Object.values(counts).sort((a, b) => b - a);
    const flush = new Set(suits).size === 1;
    // Straight check
    const straight = (vals[4] - vals[0] === 4 && freq[0] === 1) ||
        (JSON.stringify(vals) === JSON.stringify([0,1,2,3,12])); // Ace-low

    if (flush && straight) {
        const isRoyal = vals[4] === 12 && vals[3] === 11 && vals[0] === 8;
        if (isRoyal) return { label: 'Royal Flush', mult: 800 };
        return { label: 'Straight Flush', mult: 50 };
    }
    if (freq[0] === 4) return { label: 'Four of a Kind', mult: 25 };
    if (freq[0] === 3 && freq[1] === 2) return { label: 'Full House', mult: 9 };
    if (flush)    return { label: 'Flush',    mult: 6 };
    if (straight) return { label: 'Straight', mult: 4 };
    if (freq[0] === 3) return { label: 'Three of a Kind', mult: 3 };
    if (freq[0] === 2 && freq[1] === 2) return { label: 'Two Pair', mult: 2 };
    if (freq[0] === 2) {
        // Jacks or Better: pair of J(9), Q(10), K(11), A(12)
        const pairVal = parseInt(Object.keys(counts).find(k => counts[k] === 2));
        if (pairVal >= 9) return { label: 'Jacks or Better', mult: 1 };
    }
    return { label: 'No Win', mult: 0 };
}

function renderPokerHand() {
    const hand   = gameState.videoPoker.hand;
    const held   = gameState.videoPoker.held;
    const cards  = document.querySelectorAll('.poker-card');
    const heldRow = document.querySelectorAll('#poker-held-row span');

    cards.forEach((card, i) => {
        card.className = 'poker-card';
        if (!hand[i]) { card.className = 'poker-card empty'; card.innerHTML = '?'; return; }
        const c = hand[i];
        const isRed = RED_SUITS.includes(c.suit);
        if (isRed) card.classList.add('red-suit');
        if (held[i]) card.classList.add('held');
        card.innerHTML = `<div class="poker-card-inner"><span class="poker-card-rank">${c.rank}</span><span class="poker-card-suit">${c.suit}</span></div>`;
        card.onclick = () => {
            if (gameState.videoPoker.phase !== 'hold') return;
            gameState.videoPoker.held[i] = !gameState.videoPoker.held[i];
            renderPokerHand();
            playSound('click');
        };
        // Held indicators
        heldRow[i].innerText = held[i] ? 'HOLD' : '';
    });
}

function pokerAction() {
    const phase = gameState.videoPoker.phase;
    if (phase === 'idle') {
        // Deal phase
        const bet = getBetAmount('poker-bet'); if (!bet) return;
        gameState.user.balance -= bet; updateUI();
        gameState.videoPoker.bet  = bet;
        gameState.videoPoker.deck = createDeck();
        gameState.videoPoker.hand = gameState.videoPoker.deck.splice(0, 5);
        gameState.videoPoker.held = [false,false,false,false,false];
        gameState.videoPoker.phase = 'hold';
        document.getElementById('btn-poker-deal').innerText = '🔄 Заменить';
        document.getElementById('poker-result-label').innerText = '';
        // Clear paytable highlights
        document.querySelectorAll('.paytable-row').forEach(r => r.classList.remove('active-hand'));
        renderPokerHand();
        playSound('click');
    } else if (phase === 'hold') {
        // Draw phase: replace non-held cards
        for (let i = 0; i < 5; i++) {
            if (!gameState.videoPoker.held[i]) {
                gameState.videoPoker.hand[i] = gameState.videoPoker.deck.splice(0, 1)[0];
            }
        }
        gameState.videoPoker.phase = 'idle';
        document.getElementById('btn-poker-deal').innerText = '🃏 Сдать карты';
        renderPokerHand();

        // Evaluate
        const result = getHandResult(gameState.videoPoker.hand);
        document.getElementById('poker-result-label').innerText = result.label !== 'No Win'
            ? `${result.label} — ${result.mult}x` : 'No Win 😔';

        // Highlight paytable row
        document.querySelectorAll('.paytable-row').forEach(r => {
            r.classList.toggle('active-hand', r.querySelector('span')?.innerText === result.label);
        });

        if (result.mult > 0) {
            const profit = gameState.videoPoker.bet * result.mult - gameState.videoPoker.bet;
            gameState.user.balance += gameState.videoPoker.bet;
            logGame('Poker', result.label, gameState.videoPoker.bet, profit, result.mult);
            if (result.label === 'Royal Flush' && !gameState.user.achievements.includes('poker_rf')) {
                unlockAchievement('poker_rf');
            }
        } else {
            logGame('Poker', 'No Win', gameState.videoPoker.bet, -gameState.videoPoker.bet, 0);
        }
    }
}

// ═══════════════════════════════════════
// 12. CLASSIC GAMES
// ═══════════════════════════════════════

function playCoinflip(choice) {
    const bet = getBetAmount('coin-bet'); if (!bet) return;
    gameState.user.balance -= bet; updateUI();
    const elem = document.getElementById('coin-result');
    elem.innerText = '⏳'; elem.style.transform = 'scale(0.8)';
    setTimeout(() => {
        const heads  = Math.random() > 0.5;
        elem.innerText = heads ? '🦅' : '🪙';
        elem.style.transform = 'scale(1)';
        if (choice === (heads ? 'heads' : 'tails')) {
            gameState.user.balance += bet;
            logGame('Монетка', 'Победа', bet, bet, 2);
        } else {
            logGame('Монетка', 'Поражение', bet, -bet, 0);
        }
    }, 600);
}

function playDice() {
    const bet = getBetAmount('dice-bet'); if (!bet) return;
    gameState.user.balance -= bet; updateUI();
    const elem = document.getElementById('dice-result');
    let rolls = 0;
    const int = setInterval(() => {
        elem.innerText = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'][Math.floor(Math.random() * 6)];
        if (++rolls > 10) {
            clearInterval(int);
            const final = Math.floor(Math.random() * 6) + 1;
            const faces = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
            elem.innerText = faces[final - 1];
            if (final >= 4) { gameState.user.balance += bet; logGame('Кости', `Выпало ${final}`, bet, bet, 2); }
            else { logGame('Кости', `Выпало ${final}`, bet, -bet, 0); }
        }
    }, 50);
}

function playRoulette(choice) {
    const bet = getBetAmount('roulette-bet'); if (!bet) return;
    gameState.user.balance -= bet; updateUI();
    const elem = document.getElementById('roulette-result');
    let ticks = 0;
    const int = setInterval(() => {
        elem.innerText = Math.floor(Math.random() * 37);
        if (++ticks > 18) {
            clearInterval(int);
            const num   = Math.floor(Math.random() * 37);
            const color = num === 0 ? 'green' : (num % 2 === 0 ? 'black' : 'red');
            const colors = { red: 'var(--danger-color)', black: 'var(--text-primary)', green: 'var(--success-color)' };
            elem.innerHTML = `<span style="color:${colors[color]}">${num}</span>`;
            if (choice === color) {
                const mult = color === 'green' ? 14 : 2;
                gameState.user.balance += bet;
                logGame('Рулетка', `Угадал ${color}`, bet, bet * (mult - 1), mult);
            } else {
                logGame('Рулетка', `Мимо (${num})`, bet, -bet, 0);
            }
        }
    }, 55);
}

// ═══════════════════════════════════════
// 13. DAILY QUESTS SYSTEM
// ═══════════════════════════════════════

const QUEST_POOL = [
    { id: 'crash_5',     desc: 'Сыграй 5 раундов Crash',        target: 5,  key: 'crashRounds',    icon: '🚀', reward: 150 },
    { id: 'crash_cashout_3x', desc: 'Выведи 3x в Crash',        target: 1,  key: 'crashCashouts3x', icon: '💸', reward: 250 },
    { id: 'mines_10',    desc: 'Открой 10 безопасных клеток',    target: 10, key: 'minesSafeCells',  icon: '💎', reward: 200 },
    { id: 'keno_3',      desc: 'Сыграй 3 раунда Keno',           target: 3,  key: 'kenoRounds',      icon: '🎱', reward: 120 },
    { id: 'poker_win',   desc: 'Выиграй в Video Poker',          target: 1,  key: 'pokerWins',       icon: '🃏', reward: 300 },
    { id: 'hilo_x5',     desc: 'Набери 5x в HiLo',              target: 1,  key: 'hiloX5',          icon: '🎴', reward: 350 },
    { id: 'win_5',       desc: 'Выиграй 5 ставок подряд',        target: 5,  key: 'winStreak',       icon: '🏆', reward: 400 },
    { id: 'roulette_green', desc: 'Угадай Зеро в рулетке',      target: 1,  key: 'rouletteGreen',   icon: '🎡', reward: 500 },
];

function refreshQuestsIfNeeded() {
    const now = Date.now();
    const oneDayMs = 86400000;
    if (now - (gameState.quests.lastRefresh || 0) > oneDayMs) {
        // Pick 3 random quests
        const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5);
        gameState.quests.daily = shuffled.slice(0, 3).map(q => ({ ...q, progress: 0, claimed: false }));
        gameState.quests.lastRefresh = now;
        gameState.quests.progress = {};
    }
}

function renderQuests() {
    refreshQuestsIfNeeded();
    const list = document.getElementById('quests-list');
    if (!list) return;
    list.innerHTML = '';
    gameState.quests.daily.forEach(quest => {
        const pct = Math.min(100, (quest.progress / quest.target) * 100);
        const done = quest.progress >= quest.target;
        const div = document.createElement('div');
        div.className = `quest-item${done && quest.claimed ? ' completed' : ''}`;
        div.innerHTML = `
            <div class="quest-icon">${quest.icon}</div>
            <div class="quest-info">
                <div class="quest-desc">${quest.desc} (${Math.min(quest.progress, quest.target)}/${quest.target})</div>
                <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="quest-reward">+${quest.reward}₽</div>
        `;
        if (done && !quest.claimed) {
            div.style.cursor = 'pointer';
            div.onclick = () => claimQuest(quest.id);
            div.querySelector('.quest-reward').style.color = 'var(--success-color)';
        }
        list.appendChild(div);
    });
}

function updateQuestProgress(game, betAmount, multiplier, won) {
    if (!gameState.quests.daily) return;
    gameState.quests.daily.forEach(quest => {
        if (quest.claimed || quest.progress >= quest.target) return;
        switch (quest.key) {
            case 'crashRounds':     if (game === 'Crash') quest.progress++; break;
            case 'crashCashouts3x': if (game === 'Crash' && multiplier >= 3 && won) quest.progress++; break;
            case 'minesSafeCells':  if (game === 'Мины' && won) quest.progress += gameState.mines.opened; break;
            case 'kenoRounds':      if (game === 'Keno') quest.progress++; break;
            case 'pokerWins':       if (game === 'Poker' && won) quest.progress++; break;
            case 'hiloX5':         if (game === 'HiLo' && multiplier >= 5 && won) quest.progress++; break;
            case 'winStreak':       if (won) quest.progress = Math.min(quest.target, (quest.progress || 0) + 1);
                                    else quest.progress = 0; break;
            case 'rouletteGreen':   if (game === 'Рулетка' && won && multiplier === 14) quest.progress++; break;
        }
    });
}

function claimQuest(questId) {
    const quest = gameState.quests.daily.find(q => q.id === questId);
    if (!quest || quest.claimed || quest.progress < quest.target) return;
    quest.claimed = true;
    gameState.user.balance += quest.reward;
    document.getElementById('quest-complete-desc').innerText = quest.desc;
    document.getElementById('quest-complete-reward').innerText = `+${quest.reward} ₽`;
    document.getElementById('quest-complete-modal').classList.add('active');
    playSound('bigwin');
    saveState();
}

// ═══════════════════════════════════════
// 14. RAKEBACK SYSTEM
// ═══════════════════════════════════════

function claimRakeback() {
    const amount = Math.floor(gameState.rakeback.claimable);
    if (amount <= 0) { showToast('💰', 'Пока нечего забирать', 'Делайте ставки!'); return; }
    gameState.rakeback.claimable = 0;
    gameState.user.balance += amount;
    showToast('💸', `Ребэк получен! +${amount} ₽`, `Ставка: ${getRakebackRate() * 100}%`);
    playSound('win');
    showFloatingWinAnimation(amount);
    saveState();
}

// ═══════════════════════════════════════
// 15. VIP ROADMAP
// ═══════════════════════════════════════

const VIP_TIERS = [
    { id: 'bronze',  minLevel: 1,  label: '✅' },
    { id: 'silver',  minLevel: 5,  label: '✅' },
    { id: 'gold',    minLevel: 10, label: '✅' },
    { id: 'diamond', minLevel: 20, label: '✅' },
    { id: 'void',    minLevel: 50, label: '✅' },
];

function renderVIPRoadmap() {
    const lvl = gameState.user.level;
    VIP_TIERS.forEach(tier => {
        const el = document.getElementById(`vip-${tier.id}-status`);
        const row = document.querySelector(`.vip-tier[data-tier="${tier.id}"]`);
        if (!el || !row) return;
        if (lvl >= tier.minLevel) {
            el.innerText = tier.label;
            row.classList.remove('locked');
            row.classList.add('active');
        } else {
            el.innerText = `Ур. ${tier.minLevel}`;
            row.classList.add('locked');
            row.classList.remove('active');
        }
    });
}

// ═══════════════════════════════════════
// 16. FAKE / SOCIAL SYSTEMS
// ═══════════════════════════════════════

function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const fakePlayers = [
        { name: "CryptoKing",  balance: 245000 },
        { name: "LuckyDoge",   balance: 183000 },
        { name: "BetMaster",   balance: 120500 },
        { name: "VegasPro",    balance: 89000  },
        { name: "NightVoid",   balance: 54200  },
    ];
    const players = [...fakePlayers, { name: gameState.user.name, balance: gameState.user.balance, isUser: true }];
    players.sort((a, b) => b.balance - a.balance);
    list.innerHTML = players.slice(0, 6).map((p, i) => `
        <li style="${p.isUser ? 'background: rgba(255,215,0,0.08); border-left: 3px solid var(--warning-color);' : ''}">
            <div class="flex-row">
                <span class="lb-rank lb-rank-${i+1}">#${i+1}</span>
                <span class="item-title">${p.name} ${p.isUser ? '(Ты)' : ''}</span>
            </div>
            <div class="stat-value text-success">${Math.floor(p.balance).toLocaleString()} ₽</div>
        </li>`).join('');
}

function startFakeChat() {
    const msgs = [
        "Лол, опять слил 😅", "Crash дает x20 — инфа 100%", "Кто в мины?",
        "Хороший кэф!", "Пойду олл-ин 🤞", "Уф, отбил минус!", "Казино топ 🔥",
        "Промокод VOID2026 реально работает!", "x50 поймал в Crash!!!",
        "Keno новая любовь ❤️", "Покер — чистое везение", "Ставлю 1000 на краш",
    ];
    setInterval(() => {
        const box  = document.getElementById('chat-box');
        const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
        const text = msgs[Math.floor(Math.random() * msgs.length)];
        const el   = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `<span class="chat-user">${name}:</span> <span class="text-muted">${text}</span>`;
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
        if (box.children.length > 20) box.removeChild(box.firstChild);
    }, 4000);
}

function startOnlineCounter() {
    let base = Math.floor(Math.random() * 800) + 1400;
    document.getElementById('online-players').innerText = base;
    setInterval(() => {
        base += Math.floor(Math.random() * 15) - 7;
        base = Math.max(1200, Math.min(2500, base));
        document.getElementById('online-players').innerText = base;
    }, 3000);
}

function generateFakeBigWins() {
    const container = document.getElementById('fake-wins-container');
    const games = ["Crash", "Keno", "Video Poker", "Mines", "HiLo", "Roulette"];
    // Seed initial items
    for (let i = 0; i < 3; i++) {
        const el = document.createElement('div');
        el.className = 'win-item';
        const n = fakeNames[i], g = games[i], a = Math.floor(Math.random() * 20000) + 5000, m = (Math.random() * 20 + 2).toFixed(2);
        el.innerHTML = `<span class="text-primary">${n}</span> выиграл <span class="text-success">${a.toLocaleString()} ₽</span> на ${g} (x${m})`;
        container.appendChild(el);
    }
    setInterval(() => {
        const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
        const game = games[Math.floor(Math.random() * games.length)];
        const amt  = Math.floor(Math.random() * 30000) + 5000;
        const mult = (Math.random() * 20 + 2).toFixed(2);
        const el   = document.createElement('div');
        el.className = 'win-item';
        el.innerHTML = `<span class="text-primary">${name}</span> выиграл <span class="text-success">${amt.toLocaleString()} ₽</span> на ${game} (x${mult})`;
        container.prepend(el);
        if (container.children.length > 4) container.removeChild(container.lastChild);
    }, 5500);
}

function startJackpotFlicker() {
    setInterval(() => {
        gameState.jackpot.pool += Math.floor(Math.random() * 100) + 10;
        document.getElementById('global-jackpot-val').innerText = Math.floor(gameState.jackpot.pool);
    }, 2000);
}

// ═══════════════════════════════════════
// 17. SETTINGS, WHEEL, PROFILE, NAV
// ═══════════════════════════════════════

function switchTab(targetId) {
    playSound('click');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector(`.nav-item[data-target="${targetId}"]`).classList.add('active');
    document.getElementById(targetId).classList.add('active');
    window.scrollTo(0, 0);
    // Re-init canvas if switching to crash
    if (targetId === 'crash') setTimeout(initCrashCanvas, 100);
}
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', e => switchTab(e.currentTarget.dataset.target));
});

function toggleSound() {
    gameState.settings.soundEnabled = document.getElementById('setting-sound').checked;
    saveState();
}

function toggleAmoled() {
    gameState.settings.amoledMode = document.getElementById('setting-amoled').checked;
    document.body.classList.toggle('amoled-mode', gameState.settings.amoledMode);
    saveState();
}

function claimDailyBonus() {
    if (Date.now() - gameState.user.lastBonusDate > 86400000) {
        const bonus = 500 + (gameState.user.level * 10); // Scales with level
        gameState.user.balance += bonus;
        gameState.user.lastBonusDate = Date.now();
        playSound('bigwin');
        showFloatingWinAnimation(bonus);
        showToast('🎁', `Бонус получен! +${bonus} ₽`);
        saveState();
    }
}

const SPIN_PRIZES = [
    { text: "+100 ₽",      val: 100,   type: 'coin'  },
    { text: "+250 ₽",      val: 250,   type: 'coin'  },
    { text: "+500 ₽",      val: 500,   type: 'coin'  },
    { text: "+1000 ₽",     val: 1000,  type: 'coin'  },
    { text: "+5000 ₽",     val: 5000,  type: 'coin'  },
    { text: "ПУСТО 💨",    val: 0,     type: 'empty' },
    { text: "+50 ₽",       val: 50,    type: 'coin'  },
    { text: "РЕБЭК x2!",   val: 0,     type: 'rakeback' },
];

function spinWheel() {
    const spinsMs = Date.now() - (gameState.user.lastSpinDate || 0);
    // Gold VIP+ gets 12h cooldown
    const cooldown = gameState.user.level >= 10 ? 43200000 : 86400000;
    if (spinsMs <= cooldown) {
        const hrs = Math.ceil((cooldown - spinsMs) / 3600000);
        showToast('⏳', `Колесо через ${hrs} ч.`);
        return;
    }

    const btn = document.getElementById('btn-spin');
    const display = document.getElementById('spin-wheel-display');
    btn.disabled = true;

    let ticks = 0;
    const totalTicks = 25 + Math.floor(Math.random() * 10);
    const winIndex = Math.floor(Math.random() * SPIN_PRIZES.length);
    const icons = ['🎁','⭐','💎','🏆','💰','🎡','🌟','🎊'];

    const spinInt = setInterval(() => {
        display.innerText = icons[ticks % icons.length];
        playSound('click');
        ticks++;
        if (ticks >= totalTicks) {
            clearInterval(spinInt);
            gameState.user.lastSpinDate = Date.now();
            const prize = SPIN_PRIZES[winIndex];
            display.innerText = prize.text.startsWith('+') ? '🎉' : prize.val === 0 ? '😔' : '🎊';
            document.getElementById('spin-result-text').innerText = prize.text;

            if (prize.type === 'coin' && prize.val > 0) {
                gameState.user.balance += prize.val;
                playSound('bigwin');
                showFloatingWinAnimation(prize.val);
            } else if (prize.type === 'rakeback') {
                gameState.rakeback.claimable *= 2;
                showToast('💸', 'Ребэк удвоен!');
                playSound('bigwin');
            } else {
                playSound('loss');
            }
            btn.disabled = false;
            saveState();
        }
    }, 100);
}

function updateUsername() {
    const val = document.getElementById('profile-name').value.trim();
    if (val) { gameState.user.name = val; saveState(); showToast('✅', 'Никнейм обновлён'); renderLeaderboard(); }
}

function resetAccount() {
    if (confirm("Точно сбросить прогресс? (Действие необратимо)")) {
        localStorage.removeItem('voidbet_state_v4');
        location.reload();
    }
}

// Promo codes
const PROMO_CODES = {
    'VOID2026': { amount: 1000, desc: '1000 ₽' },
    'STAKE':    { amount: 500,  desc: '500 ₽' },
    'LUCKY':    { amount: 250,  desc: '250 ₽' },
    'KENO100':  { amount: 100,  desc: '100 ₽ (Keno bonus)' },
    'VIP500':   { amount: 500,  desc: '500 ₽ VIP bonus' },
};

function redeemPromo() {
    const input = document.getElementById('promo-input');
    const code  = input.value.trim().toUpperCase();
    if (!code) return;
    if (gameState.user.usedPromos.includes(code)) { showToast('⚠️', 'Код уже использован!'); return; }
    const promo = PROMO_CODES[code];
    if (promo) {
        gameState.user.balance += promo.amount;
        gameState.user.usedPromos.push(code);
        playSound('bigwin');
        showFloatingWinAnimation(promo.amount);
        input.value = '';
        saveState();
        showToast('🎉', `Промокод активирован!`, `+${promo.desc}`);
    } else {
        showToast('❌', 'Неверный промокод');
    }
}

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════

function getBetAmount(id) {
    const val = parseInt(document.getElementById(id)?.value);
    if (isNaN(val) || val <= 0) { showToast('⚠️', 'Некорректная ставка'); return null; }
    if (val > gameState.user.balance) { showToast('💸', 'Недостаточно баланса'); return null; }
    return val;
}

function setPreset(inputId, amount) {
    playSound('click');
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = amount === 'max' ? Math.floor(gameState.user.balance) : amount;
}

// ═══════════════════════════════════════
// 18. INITIALIZATION
// ═══════════════════════════════════════

window.onload = () => {
    // Apply AMOLED mode immediately if saved
    if (gameState.settings.amoledMode) document.body.classList.add('amoled-mode');

    // Ensure quests are initialized
    refreshQuestsIfNeeded();

    // Core UI
    updateUI();
    renderCrashHistory();
    renderLeaderboard();

    // Fake social features
    startFakeChat();
    startOnlineCounter();
    generateFakeBigWins();
    startJackpotFlicker();

    // Apply settings
    document.getElementById('setting-sound').checked = gameState.settings.soundEnabled;
    document.getElementById('setting-amoled').checked = gameState.settings.amoledMode;

    // Init crash canvas after layout settles
    setTimeout(initCrashCanvas, 200);

    // Init keno grid
    updateKenoInfo();

    // Handle window resize for canvas
    window.addEventListener('resize', () => {
        if (gameState.crash.active) return; // Don't resize mid-game
        setTimeout(initCrashCanvas, 100);
    });

    console.log('%c🚀 VOIDBET v4.0 Loaded', 'color:#ffd700;font-size:16px;font-weight:bold;');
    console.log('%cGameState Architecture Active | Modular | Mobile-first', 'color:#8b92a5;');
};

/* ════════════════════════════════════════════
   ARCHITECTURE NOTES FOR DEVELOPERS
   ════════════════════════════════════════════

   CORE (Must have):
   ✅ gameState — central state object, auto-saved to localStorage
   ✅ logGame() — all game results go through here (balance, XP, rakeback, streaks)
   ✅ saveState() + updateUI() — called after every state change
   ✅ Canvas Crash Graph — dynamic color + shake at high multipliers
   ✅ Lucky Events — clickable bonuses spawned at random mult thresholds
   ✅ Daily Quests — 3 tasks, refreshed every 24h, rewarded in coins
   ✅ Rakeback — 5% of all wagers, claimable from Stats or Home

   OPTIONAL ENHANCEMENTS:
   ⭐ Ghost players on crash graph (coordinates per mult threshold)
   ⭐ VIP roadmap tiers with progressive rakeback rates
   ⭐ Mines secret pattern detection
   ⭐ Video Poker / Keno (self-contained, use separate deck state)
   ⭐ AMOLED mode (CSS variable override via body class)

   ADDING NEW GAMES:
   1. Add state to DEFAULT_STATE
   2. Create startGame(), playGame(), endGame() functions
   3. Route through logGame() for all economy
   4. Track quest progress in updateQuestProgress()
   5. Add HTML card in the casino section

   ════════════════════════════════════════════ */

