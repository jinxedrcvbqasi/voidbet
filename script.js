// --- АРХИТЕКТУРА И СОСТОЯНИЕ (STATE) ---
const DEFAULT_USER = {
    name: 'Игрок', balance: 1000, wins: 0, losses: 0, totalBets: 0, biggestWin: 0,
    xp: 0, level: 1, lastBonusDate: 0, lastSpinDate: 0, currentStreak: 0, history: [], achievements: []
};

const DEFAULT_STATE = {
    user: { ...DEFAULT_USER },
    settings: { soundEnabled: true },
    crash: { active: false, hasCashedOut: false, multiplier: 1.00, bet: 0, interval: null, history: [1.2, 5.4, 1.02, 2.1, 15.0] },
    mines: { active: false, grid: [], bet: 0, opened: 0, bombs: 3, multiplier: 1.00 },
    jackpot: { pool: 12450 }
};

// Загрузка или создание стейта
let gameState = JSON.parse(localStorage.getItem('voidbet_state_v2')) || JSON.parse(JSON.stringify(DEFAULT_STATE));
const fakeNames = ["Alex", "CryptoKing", "LuckyDoge", "Ivan_777", "BetMaster", "MishaX", "VegasPro"];

// Сохранение
function saveState() {
    localStorage.setItem('voidbet_state_v2', JSON.stringify(gameState));
    updateUI();
}

// --- ИНИЦИАЛИЗАЦИЯ ---
window.onload = () => {
    updateUI();
    startFakeChat();
    startOnlineCounter();
    generateFakeBigWins();
    renderLeaderboard();
    renderCrashHistory();
    document.getElementById('setting-sound').checked = gameState.settings.soundEnabled;
};

// --- ЗВУКОВАЯ СИСТЕМА (ИСПРАВЛЕННАЯ) ---
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
        
        if (type === 'win') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3);
        } else if (type === 'loss') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'click') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05);
        } else if (type === 'bigwin') {
            osc.type = 'square'; osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.2); osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.4); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8); osc.start(); osc.stop(audioCtx.currentTime + 0.8);
        }
    } catch(e) {}
}

// --- СИСТЕМА РАНГОВ ---
function getRank(level) {
    if (level >= 50) return { name: "Void God", class: "rank-void" };
    if (level >= 20) return { name: "Diamond", class: "rank-diamond" };
    if (level >= 10) return { name: "Gold", class: "rank-gold" };
    if (level >= 5) return { name: "Silver", class: "rank-silver" };
    return { name: "Bronze", class: "rank-bronze" };
}

// --- АЧИВКИ (ACHIEVEMENTS) ---
const ACHIEVEMENTS_DICT = {
    first_win: { title: "Первая победа", desc: "Выиграть первую ставку" },
    win_10: { title: "Новичок", desc: "Выиграть 10 раз" },
    win_1000: { title: "Богач", desc: "Выиграть 1000+ за раз" },
    crash_10x: { title: "Космонавт", desc: "Поймать x10 в Crash" },
    crash_50x: { title: "Илон Маск", desc: "Поймать x50 в Crash" },
    lose_10: { title: "Неудачник", desc: "Проиграть 10 раз всего" }
};

function checkAchievements(game, profit, multiplier) {
    const user = gameState.user;
    if (user.wins === 1 && !user.achievements.includes('first_win')) unlockAchievement('first_win');
    if (user.wins >= 10 && !user.achievements.includes('win_10')) unlockAchievement('win_10');
    if (user.losses >= 10 && !user.achievements.includes('lose_10')) unlockAchievement('lose_10');
    if (profit >= 1000 && !user.achievements.includes('win_1000')) unlockAchievement('win_1000');
    if (game === 'Crash') {
        if (multiplier >= 10 && !user.achievements.includes('crash_10x')) unlockAchievement('crash_10x');
        if (multiplier >= 50 && !user.achievements.includes('crash_50x')) unlockAchievement('crash_50x');
    }
}

function unlockAchievement(id) {
    gameState.user.achievements.push(id);
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-icon">🏆</div><div class="toast-text"><h4>Достижение!</h4><p>${ACHIEVEMENTS_DICT[id].title}</p></div>`;
    toastContainer.appendChild(toast);
    playSound('bigwin');
    setTimeout(() => toast.remove(), 4000);
}

// --- ЛОГИКА ИГР И УЧЕТА (CORE) ---
function calcLevel(xp) { return Math.floor(Math.sqrt(xp / 100)) + 1; }
function xpForNextLevel(lvl) { return Math.pow(lvl, 2) * 100; }

function logGame(game, detail, betAmount, profit, multiplier = 0) {
    let user = gameState.user;
    user.totalBets++;
    user.xp += Math.floor(betAmount);
    user.level = calcLevel(user.xp);
    user.balance += profit;
    
    // Система Джекпота (1% в пул)
    const jackpotContribution = betAmount * 0.01;
    gameState.jackpot.pool += jackpotContribution;
    
    // Шанс выиграть джекпот (0.1% для ставок больше 10)
    if (betAmount >= 10 && Math.random() < 0.001) {
        const winAmount = Math.floor(gameState.jackpot.pool * 0.5);
        user.balance += winAmount;
        gameState.jackpot.pool -= winAmount;
        showBigWinModal(winAmount, "ГЛОБАЛЬНЫЙ ДЖЕКПОТ!");
        playSound('bigwin');
    }
    
    if (profit > 0) {
        user.wins++;
        if (profit > user.biggestWin) user.biggestWin = profit;
        
        user.currentStreak = (user.currentStreak || 0) + 1;
        if(user.currentStreak === 3) { user.balance += 50; showMessage('casino-msg', '🔥 Стрик 3 победы! +50 ₽', 'text-warning'); }
        if(user.currentStreak === 5) { user.balance += 150; showMessage('casino-msg', '🔥🔥 Стрик 5 побед! +150 ₽', 'text-warning'); }

        if (multiplier >= 5 || profit >= betAmount * 5) { 
            playSound('bigwin'); showBigWinModal(profit, `${game}: ${detail}`); 
        } else { 
            playSound('win'); showMessage('casino-msg', `+${Math.floor(profit)} ₽`, 'text-success'); 
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
    
    checkAchievements(game, profit, multiplier);
    renderLeaderboard(); // Обновляем топ после ставки
    saveState();
}

// --- UI УТИЛИТЫ И АНИМАЦИИ ---
function updateUI() {
    let user = gameState.user;
    document.getElementById('nav-balance').innerText = Math.floor(user.balance);
    document.getElementById('header-level').innerText = `Ур. ${user.level}`;
    document.getElementById('home-greeting').innerText = `Привет, ${user.name}!`;
    document.getElementById('profile-name').value = user.name;
    document.getElementById('global-jackpot-val').innerText = Math.floor(gameState.jackpot.pool);
    
    const rank = getRank(user.level);
    const rankBadge = document.getElementById('header-rank');
    rankBadge.innerText = rank.name;
    rankBadge.className = `rank-badge ${rank.class}`;

    const nextXp = xpForNextLevel(user.level);
    const prevXp = xpForNextLevel(user.level - 1);
    const progress = ((user.xp - prevXp) / (nextXp - prevXp)) * 100;
    document.getElementById('home-next-level').innerText = `До след. ур: ${nextXp - user.xp} XP`;
    document.getElementById('xp-progress').style.width = `${Math.min(100, Math.max(0, progress))}%`;

    document.getElementById('stat-wins').innerText = user.wins;
    document.getElementById('stat-losses').innerText = user.losses;
    document.getElementById('stat-bets').innerText = user.totalBets;
    document.getElementById('stat-big-win').innerText = `${Math.floor(user.biggestWin)} ₽`;

    const btnBonus = document.getElementById('btn-daily-bonus');
    if (Date.now() - user.lastBonusDate > 86400000) {
        btnBonus.disabled = false; btnBonus.innerText = "🎁 Забрать бонус (500 ₽)";
    } else {
        btnBonus.disabled = true;
        const hrs = Math.ceil((86400000 - (Date.now() - user.lastBonusDate)) / 3600000);
        btnBonus.innerText = `⏳ Бонус через ${hrs} ч.`;
    }

    const histList = document.getElementById('history-list');
    histList.innerHTML = user.history.length === 0 ? '<li class="text-muted">Нет ставок</li>' : '';
    user.history.forEach(h => {
        let isWin = h.amount > 0;
        histList.innerHTML += `<li><div class="list-item-left"><span class="item-title">${h.game}</span><span class="item-sub">${h.detail} • ${h.date}</span></div><div class="stat-value ${isWin ? 'text-success' : 'text-danger'}">${isWin ? '+' : ''}${h.amount}</div></li>`;
    });
}

function showMessage(id, msg, className) {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = `<span class="${className}">${msg}</span>`;
    setTimeout(() => box.innerHTML = '', 3000);
}

function showFloatingWinAnimation(amount) {
    const container = document.getElementById('win-anim-container');
    const el = document.createElement('div');
    el.className = 'floating-win';
    el.innerText = `💰 +${Math.floor(amount)}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

function showBigWinModal(amount, desc) {
    document.getElementById('modal-win-amount').innerText = `+${Math.floor(amount)} ₽`;
    document.getElementById('modal-win-desc').innerText = desc || '';
    document.getElementById('big-win-modal').classList.add('active');
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openSpinModal() { document.getElementById('lucky-spin-modal').classList.add('active'); }

// --- НАВИГАЦИЯ И ПРОФИЛЬ ---
function switchTab(targetId) {
    playSound('click');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector(`.nav-item[data-target="${targetId}"]`).classList.add('active');
    document.getElementById(targetId).classList.add('active');
    window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.target));
});

function toggleSound() {
    gameState.settings.soundEnabled = document.getElementById('setting-sound').checked;
    saveState();
}

function claimDailyBonus() {
    if (Date.now() - gameState.user.lastBonusDate > 86400000) {
        gameState.user.balance += 500; 
        gameState.user.lastBonusDate = Date.now();
        playSound('win'); saveState(); showFloatingWinAnimation(500);
    }
}
function updateUsername() {
    const val = document.getElementById('profile-name').value.trim();
    if (val) { gameState.user.name = val; saveState(); alert('Никнейм обновлен'); renderLeaderboard(); }
}
function resetAccount() {
    if (confirm("Точно сбросить прогресс? (Действие необратимо)")) { localStorage.removeItem('voidbet_state_v2'); location.reload(); }
}
function getBetAmount(id) {
    const val = parseInt(document.getElementById(id).value);
    if (isNaN(val) || val <= 0) { alert('Некорректная ставка'); return null; }
    if (val > gameState.user.balance) { alert('Недостаточно баланса'); return null; }
    return val;
}
function setPreset(inputId, amount) {
    playSound('click');
    const input = document.getElementById(inputId);
    input.value = amount === 'max' ? Math.floor(gameState.user.balance) : amount;
}

// --- WHEEL BONUS ---
function spinWheel() {
    if (Date.now() - (gameState.user.lastSpinDate || 0) <= 86400000) {
        alert("Колесо можно крутить раз в 24 часа!"); return;
    }
    
    const btn = document.getElementById('btn-spin');
    const res = document.getElementById('spin-result');
    btn.disabled = true;
    
    let ticks = 0;
    const prizes = [
        {text: "+100 ₽", val: 100}, {text: "+250 ₽", val: 250}, 
        {text: "+500 ₽", val: 500}, {text: "+1000 ₽", val: 1000}, 
        {text: "ПУСТО", val: 0}
    ];

    const spinInt = setInterval(() => {
        res.innerText = prizes[ticks % prizes.length].text;
        playSound('click');
        ticks++;
        if(ticks > 20) {
            clearInterval(spinInt);
            gameState.user.lastSpinDate = Date.now();
            const win = prizes[Math.floor(Math.random() * prizes.length)];
            res.innerText = win.text;
            
            if (win.val > 0) {
                gameState.user.balance += win.val;
                playSound('bigwin');
                showFloatingWinAnimation(win.val);
            } else {
                playSound('loss');
            }
            saveState();
        }
    }, 100);
}

// --- CRASH СОБЫТИЯ ---
function renderCrashHistory() {
    const historyContainer = document.getElementById('crash-history');
    historyContainer.innerHTML = gameState.crash.history.map(m => {
        let color = m >= 5 ? 'var(--success-color)' : (m >= 2 ? 'var(--warning-color)' : 'var(--danger-color)');
        return `<span class="crash-pill" style="color: ${color};">${m.toFixed(2)}x</span>`;
    }).join('');
}

function generateFakeBots(cashoutVal = null) {
    const list = document.getElementById('crash-bots');
    if(!gameState.crash.active && !cashoutVal) list.innerHTML = '';
    
    if(gameState.crash.active && !cashoutVal) {
        fakeNames.forEach(name => {
            if(Math.random() > 0.3) {
                let botBet = Math.floor(Math.random() * 5000) + 100;
                let target = (Math.random() * 5 + 1.1).toFixed(2);
                list.innerHTML += `<li id="bot-${name}"><div><span class="item-title">${name}</span><span class="item-sub">${botBet} ₽</span></div><div class="stat-value text-muted" id="bot-status-${name}">В игре</div></li>`;
                
                setTimeout(() => {
                    if(gameState.crash.active && gameState.crash.multiplier >= target) {
                        const el = document.getElementById(`bot-status-${name}`);
                        if(el) { el.innerText = `${target}x`; el.className = 'stat-value text-success'; }
                    }
                }, Math.random() * 8000 + 1000);
            }
        });
    }
}

function startCrash() {
    if(gameState.crash.active) return;
    gameState.crash.bet = getBetAmount('crash-bet');
    if (!gameState.crash.bet) return;
    
    gameState.user.balance -= gameState.crash.bet; updateUI();
    
    document.getElementById('btn-crash-start').disabled = true;
    document.getElementById('crash-bet').disabled = true;
    document.getElementById('crash-auto').disabled = true;
    
    let countdown = 3;
    const status = document.getElementById('crash-status');
    const elem = document.getElementById('crash-multiplier');
    const line = document.getElementById('crash-line');
    
    line.style.width = '0%';
    elem.style.color = 'var(--text-primary)';
    status.innerText = `Запуск через ${countdown}...`;
    
    const countInt = setInterval(() => {
        countdown--;
        if(countdown > 0) {
            status.innerText = `Запуск через ${countdown}...`;
        } else {
            clearInterval(countInt);
            runCrashFlight();
        }
    }, 1000);
}

function runCrashFlight() {
    gameState.crash.active = true; 
    gameState.crash.hasCashedOut = false; 
    gameState.crash.multiplier = 1.00;
    
    document.getElementById('btn-crash-cashout').disabled = false;
    document.getElementById('btn-crash-cashout').classList.add('pulse-anim');
    const status = document.getElementById('crash-status');
    const elem = document.getElementById('crash-multiplier');
    const line = document.getElementById('crash-line');
    status.innerText = 'Летим...';
    
    generateFakeBots();
    
    const crashPoint = Math.max(1.01, (100 / (Math.random() * 100)).toFixed(2));
    const autoCashout = parseFloat(document.getElementById('crash-auto').value);
    
    gameState.crash.interval = setInterval(() => {
        gameState.crash.multiplier += 0.01 + (gameState.crash.multiplier * 0.005);
        elem.innerText = gameState.crash.multiplier.toFixed(2) + 'x';
        line.style.width = `${Math.min(100, gameState.crash.multiplier * 5)}%`;
        
        // Автовывод (ЖЕСТКАЯ ПРОВЕРКА)
        if(!gameState.crash.hasCashedOut && autoCashout && gameState.crash.multiplier >= autoCashout) {
            gameState.crash.multiplier = autoCashout; // Фиксируем точно на значении
            elem.innerText = gameState.crash.multiplier.toFixed(2) + 'x';
            cashoutCrash();
        }
        
        if(gameState.crash.multiplier >= crashPoint) {
            clearInterval(gameState.crash.interval);
            elem.innerText = gameState.crash.multiplier.toFixed(2) + 'x';
            elem.style.color = 'var(--danger-color)';
            status.innerText = 'КРАШ!';
            document.getElementById('btn-crash-cashout').classList.remove('pulse-anim');
            endCrash(); 
        }
    }, 50);
}

function cashoutCrash() {
    if(!gameState.crash.active || gameState.crash.hasCashedOut) return;
    gameState.crash.hasCashedOut = true;
    
    document.getElementById('btn-crash-cashout').disabled = true;
    document.getElementById('btn-crash-cashout').classList.remove('pulse-anim');
    
    const elem = document.getElementById('crash-multiplier');
    document.getElementById('crash-status').innerText = `Вывели на ${gameState.crash.multiplier.toFixed(2)}x`;
    elem.style.color = 'var(--success-color)';
    
    const profit = (gameState.crash.bet * gameState.crash.multiplier) - gameState.crash.bet;
    gameState.user.balance += gameState.crash.bet; // Возврат ставки
    logGame('Crash', `Вывод ${gameState.crash.multiplier.toFixed(2)}x`, gameState.crash.bet, profit, gameState.crash.multiplier);
}

function endCrash() {
    gameState.crash.active = false;
    document.getElementById('btn-crash-start').disabled = false;
    document.getElementById('btn-crash-cashout').disabled = true;
    document.getElementById('crash-bet').disabled = false;
    document.getElementById('crash-auto').disabled = false;
    
    if(!gameState.crash.hasCashedOut) {
        logGame('Crash', `Сгорело ${gameState.crash.multiplier.toFixed(2)}x`, gameState.crash.bet, -gameState.crash.bet, 0);
    }
    
    gameState.crash.history.unshift(gameState.crash.multiplier);
    if(gameState.crash.history.length > 10) gameState.crash.history.pop();
    renderCrashHistory();
    
    document.querySelectorAll('[id^="bot-status-"]').forEach(el => {
        if(el.innerText === 'В игре') { el.innerText = '💥'; el.className = 'stat-value text-danger'; }
    });
}

// --- MINES ---
function renderMinesGrid() {
    const grid = document.getElementById('mines-grid');
    grid.innerHTML = '';
    for(let i=0; i<25; i++) {
        let tile = document.createElement('div');
        tile.className = 'mine-tile';
        tile.onclick = () => openMine(i);
        grid.appendChild(tile);
    }
}
renderMinesGrid();

function startMines() {
    if(gameState.mines.active) return;
    const bet = getBetAmount('mines-bet'); if (!bet) return;
    
    gameState.user.balance -= bet; updateUI();
    gameState.mines = { active: true, bet: bet, opened: 0, bombs: 3, multiplier: 1.00, grid: Array(25).fill('safe') };
    
    let bombsPlaced = 0;
    while(bombsPlaced < 3) {
        let idx = Math.floor(Math.random() * 25);
        if(gameState.mines.grid[idx] === 'safe') { gameState.mines.grid[idx] = 'bomb'; bombsPlaced++; }
    }
    
    document.getElementById('btn-mines-start').style.display = 'none';
    document.getElementById('btn-mines-cashout').style.display = 'block';
    document.getElementById('mines-bet').disabled = true;
    document.getElementById('mines-mult').innerText = '1.00x';
    
    renderMinesGrid(); playSound('click');
}

function openMine(index) {
    if(!gameState.mines.active) return;
    const tile = document.getElementById('mines-grid').children[index];
    if(tile.classList.contains('opened')) return;
    
    tile.classList.add('opened');
    
    if(gameState.mines.grid[index] === 'bomb') {
        tile.classList.add('bomb'); tile.innerText = '💣';
        endMines(false);
    } else {
        tile.classList.add('gem'); tile.innerText = '💎';
        playSound('click');
        gameState.mines.opened++;
        gameState.mines.multiplier = +(1 + (gameState.mines.opened * 0.2) + (gameState.mines.opened * gameState.mines.opened * 0.02)).toFixed(2);
        document.getElementById('mines-mult').innerText = gameState.mines.multiplier.toFixed(2) + 'x';
    }
}

function cashoutMines() {
    if(!gameState.mines.active || gameState.mines.opened === 0) return;
    endMines(true);
}

function endMines(won) {
    gameState.mines.active = false;
    document.getElementById('btn-mines-start').style.display = 'block';
    document.getElementById('btn-mines-cashout').style.display = 'none';
    document.getElementById('mines-bet').disabled = false;
    
    const tiles = document.getElementById('mines-grid').children;
    for(let i=0; i<25; i++) {
        if(!tiles[i].classList.contains('opened')) {
            tiles[i].innerText = gameState.mines.grid[i] === 'bomb' ? '💣' : '💎';
            tiles[i].style.opacity = '0.5';
        }
    }
    
    if(won) {
        const profit = (gameState.mines.bet * gameState.mines.multiplier) - gameState.mines.bet;
        gameState.user.balance += gameState.mines.bet;
        logGame('Мины', `Вывод ${gameState.mines.multiplier.toFixed(2)}x`, gameState.mines.bet, profit, gameState.mines.multiplier);
    } else {
        logGame('Мины', `Взрыв на ${gameState.mines.multiplier.toFixed(2)}x`, gameState.mines.bet, -gameState.mines.bet, 0);
    }
}

// --- КЛАССИКА (COINFLIP, DICE, ROULETTE) ---
function playCoinflip(choice) {
    const bet = getBetAmount('coin-bet'); if (!bet) return;
    gameState.user.balance -= bet; updateUI(); 
    const elem = document.getElementById('coin-result');
    elem.innerText = "⏳";
    setTimeout(() => {
        const isHeads = Math.random() > 0.5;
        elem.innerText = isHeads ? 'ОРЕЛ' : 'РЕШКА';
        if(choice === (isHeads ? 'heads' : 'tails')) {
            gameState.user.balance += bet; 
            logGame('Монетка', `Победа`, bet, bet, 2);
        } else {
            logGame('Монетка', `Поражение`, bet, -bet, 0); 
        }
    }, 500);
}

function playDice() {
    const bet = getBetAmount('dice-bet'); if (!bet) return;
    gameState.user.balance -= bet; updateUI();
    const elem = document.getElementById('dice-result');
    let rolls = 0;
    const int = setInterval(() => {
        elem.innerText = Math.floor(Math.random() * 6) + 1;
        rolls++;
        if(rolls > 10) {
            clearInterval(int);
            const final = Math.floor(Math.random() * 6) + 1;
            elem.innerText = final;
            if(final >= 4) {
                gameState.user.balance += bet;
                logGame('Кости', `Выпало ${final}`, bet, bet, 2);
            } else {
                logGame('Кости', `Выпало ${final}`, bet, -bet, 0);
            }
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
        ticks++;
        if(ticks > 15) {
            clearInterval(int);
            const num = Math.floor(Math.random() * 37);
            let color = num === 0 ? 'green' : (num % 2 === 0 ? 'black' : 'red');
            elem.innerHTML = `<span style="color: var(--${color === 'green' ? 'success' : (color === 'red' ? 'danger' : 'text-primary')}-color)">${num}</span>`;
            
            if(choice === color) {
                const mult = color === 'green' ? 14 : 2;
                gameState.user.balance += bet;
                logGame('Рулетка', `Угадал ${color}`, bet, bet * (mult - 1), mult);
            } else {
                logGame('Рулетка', `Мимо (${num})`, bet, -bet, 0);
            }
        }
    }, 50);
}

// --- ФЕЙК СИСТЕМЫ И ЛИДЕРБОРД ---
function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    let players = [
        { name: "CryptoKing", balance: 245000 },
        { name: "LuckyDoge", balance: 183000 },
        { name: "BetMaster", balance: 120500 },
        { name: "VegasPro", balance: 89000 },
        { name: gameState.user.name, balance: gameState.user.balance, isUser: true }
    ];
    
    players.sort((a, b) => b.balance - a.balance);
    
    list.innerHTML = players.map((p, i) => `
        <li style="${p.isUser ? 'background: rgba(255, 215, 0, 0.1); border-left: 3px solid var(--warning-color);' : ''}">
            <div class="flex-row">
                <span class="lb-rank lb-rank-${i+1}">#${i+1}</span>
                <span class="item-title">${p.name} ${p.isUser ? '(Ты)' : ''}</span>
            </div>
            <div class="stat-value text-success">${Math.floor(p.balance)} ₽</div>
        </li>
    `).join('');
}

function startFakeChat() {
    const msgs = ["Лол, опять слил", "Crash дает x20 инфа сотка", "Кто в мины?", "Хороший кэф!", "Пойду олл-ин", "Уф, отбил минус", "Казино топ"];
    setInterval(() => {
        const box = document.getElementById('chat-box');
        const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
        const text = msgs[Math.floor(Math.random() * msgs.length)];
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `<span class="chat-user">${name}:</span> <span class="text-muted">${text}</span>`;
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
        if(box.children.length > 20) box.removeChild(box.firstChild);
    }, 4500);
}

function startOnlineCounter() {
    let base = Math.floor(Math.random() * 1000) + 1500;
    document.getElementById('online-players').innerText = base;
    setInterval(() => {
        base += Math.floor(Math.random() * 11) - 5;
        document.getElementById('online-players').innerText = base;
    }, 3000);
}

function generateFakeBigWins() {
    const container = document.getElementById('fake-wins-container');
    const games = ["Crash", "Dice", "Roulette", "Mines"];
    setInterval(() => {
        const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
        const game = games[Math.floor(Math.random() * games.length)];
        const amount = Math.floor(Math.random() * 20000) + 5000;
        const mult = (Math.random() * 15 + 5).toFixed(2);
        const el = document.createElement('div');
        el.className = 'win-item';
        el.innerHTML = `<span class="text-primary">${name}</span> выиграл <span class="text-success">${amount} ₽</span> на ${game} (x${mult})`;
        container.prepend(el);
        if(container.children.length > 4) container.removeChild(container.lastChild);
    }, 6000);
    
    for(let i=0; i<3; i++) {
        container.innerHTML += `<div class="win-item"><span class="text-primary">${fakeNames[i]}</span> выиграл <span class="text-success">${Math.floor(Math.random() * 10000) + 2000} ₽</span> на Crash</div>`;
    }
}

