/**
 * CHARADAS EXTREMAS - app.js (Refactorizado - Modular y Asíncrono)
 * Versión: 2.0 (Blindada)
 */

// ==========================================
// 1. CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const CONFIG = {
    folderPath: 'categorias/', // Asegúrate que esta carpeta existe
    categoryFiles: [
        'animales', 'peliculas_series', 'deportes', 'musica', 'comida_bebida',
        'geografia', 'historia_cultura', 'videojuegos', 'profesiones', 'famosos',
        'tecnologia', 'juguetes_juegos', 'superheroes', 'literatura',
        'tecnologia_ciencia', 'vehiculos', 'cuentos_fantasia',
        'videojuegos_retro', 'mitologia', 'redes_sociales', 'ciudades_mundo'
    ],
    turnDuration: 60,
    bonusTimeLimit: 10,
    cooldownSensor: 1500,
    tiltThreshold: 60,
    playerColors: ['#FF4D4D', '#4CAF50', '#2196F3', '#FFEB3B', '#00BCD4', '#FF9800', '#E91E63', '#9E9E9E']
};

window.DB_CATEGORIAS = {};

let state = {
    players: [],
    totalPlayers: 2,
    currentPlayerIndex: 0,
    activeDeck: [],
    currentCardIdx: 0,
    timeLeft: 60,
    timerInterval: null,
    isPaused: false,
    cardLoadedAt: 0,
    lastSensorTime: 0,
    sensorEnabled: false
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ==========================================
// 2. UTILIDADES DOM Y SISTEMA (Blindaje)
// ==========================================

/**
 * Obtiene un elemento del DOM de forma segura.
 * Si no existe, lanza una advertencia en consola pero no rompe la ejecución.
 */
function safeGet(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`[DOM Warning] El elemento con ID '${id}' no se encontró en el HTML.`);
        return null;
    }
    return el;
}

function toggleFullScreen(forceEnter = false) {
    const doc = window.document;
    const docEl = doc.documentElement;
    
    // Detección de API Cross-Browser
    const request = docEl.requestFullscreen || docEl.webkitRequestFullScreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    const fullscreenElement = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!request) {
        console.warn('Fullscreen API no soportada en este dispositivo/navegador.');
        return;
    }

    if (forceEnter && !fullscreenElement) {
        request.call(docEl).catch(err => console.error("Error al entrar en fullscreen:", err));
    } else if (!forceEnter) {
        if (!fullscreenElement) {
            request.call(docEl).catch(err => console.error("Error al entrar en fullscreen:", err));
        } else {
            if (exit) exit.call(doc);
        }
    }
}

// ==========================================
// 3. GESTOR DE DATOS (Carga Asíncrona)
// ==========================================

// Función global llamada por los archivos .js externos (JSONP style)
window.registrarCategoria = function(id, data) {
    if (!id || !data) {
        console.error("Intento de registrar categoría inválida:", id);
        return;
    }
    window.DB_CATEGORIAS[id] = data;
    console.log(`✅ Categoría cargada: ${data.nombre}`);
    // No renderizamos UI aquí, esperamos a que el Promise.all termine
};

/**
 * Carga un script individual envuelto en una Promesa.
 */
function loadScriptAsync(filename) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${CONFIG.folderPath}${filename}.js`;
        script.async = true;
        
        script.onload = () => {
            resolve({ status: 'ok', file: filename });
        };
        
        script.onerror = () => {
            console.warn(`❌ Error cargando archivo: ${filename}.js (Verifica la ruta 'categorias/')`);
            // Resolvemos en lugar de reject para permitir que la app continue sin este archivo
            resolve({ status: 'error', file: filename });
        };
        
        document.head.appendChild(script);
    });
}

async function initDataLoading() {
    const grid = safeGet('categories-grid');
    if (grid) grid.innerHTML = '<p>Cargando datos...</p>';

    console.log("🔄 Iniciando carga asíncrona de archivos...");

    // Crear array de promesas
    const loadPromises = CONFIG.categoryFiles.map(file => loadScriptAsync(file));

    try {
        // Esperar a que TODOS los intentos de carga finalicen
        const results = await Promise.all(loadPromises);
        
        // Filtrar estadísticas
        const successCount = results.filter(r => r.status === 'ok').length;
        console.log(`📊 Carga finalizada. Éxito: ${successCount} / ${results.length}`);
        
        renderCategoriesUI();

    } catch (error) {
        console.error("Error crítico en el sistema de carga:", error);
    }
}

function renderCategoriesUI() {
    const grid = safeGet('categories-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const ids = Object.keys(window.DB_CATEGORIAS);

    if (ids.length === 0) {
        grid.innerHTML = '<p style="color:red">No se cargaron categorías. Verifica la carpeta "categorias/".</p>';
        return;
    }

    ids.forEach(id => {
        const cat = window.DB_CATEGORIAS[id];
        if (!cat || !cat.nombre) return;

        const div = document.createElement('div');
        div.className = 'cat-option';
        div.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                const chk = div.querySelector('input');
                if (chk) {
                    chk.checked = !chk.checked;
                    div.classList.toggle('selected', chk.checked);
                }
            }
        };

        div.innerHTML = `
            <input type="checkbox" value="${id}" id="cat-${id}">
            <label for="cat-${id}">${cat.nombre}</label>
        `;
        
        const chk = div.querySelector('input');
        if (chk) {
            chk.addEventListener('change', (e) => div.classList.toggle('selected', e.target.checked));
        }
        grid.appendChild(div);
    });
}

function toggleAllCategories(select) {
    const grid = safeGet('categories-grid');
    if(!grid) return;

    const checkboxes = grid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(chk => {
        chk.checked = select;
        if (chk.parentElement) chk.parentElement.classList.toggle('selected', select);
    });
}

// ==========================================
// 4. SISTEMA DE SENSORES
// ==========================================

// Chequeo inicial de permisos iOS
if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const btn = safeGet('ios-permission-btn');
    if (btn) btn.style.display = 'block';
}

function requestSensorPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    const btn = safeGet('ios-permission-btn');
                    if (btn) btn.style.display = 'none';
                    initSensors();
                } else {
                    alert('Permiso denegado. Tendrás que jugar tocando la pantalla.');
                }
            })
            .catch(console.error);
    } else {
        initSensors();
    }
}

function initSensors() {
    state.sensorEnabled = true;
    window.addEventListener('deviceorientation', handleMotion);
    console.log("Sensores inicializados");
}

function handleMotion(event) {
    if (state.isPaused || !state.activeDeck || !state.activeDeck.length) return;
    
    const now = Date.now();
    if (now - state.lastSensorTime < CONFIG.cooldownSensor) return;

    const tilt = event.gamma; 
    if (tilt === null) return;

    if (tilt > CONFIG.tiltThreshold) {
        state.lastSensorTime = now;
        handleGuess(true);
    } else if (tilt < -CONFIG.tiltThreshold) {
        state.lastSensorTime = now;
        handleGuess(false);
    }
}

// ==========================================
// 5. LÓGICA DEL JUEGO (Game Loop)
// ==========================================

function adjustPlayers(delta) {
    let newVal = state.totalPlayers + delta;
    const display = safeGet('player-count-display');
    if (newVal >= 2 && newVal <= 8) {
        state.totalPlayers = newVal;
        if (display) display.textContent = newVal;
    }
}

function startGame() {
    // 1. Validar Categorías
    const checkboxes = document.querySelectorAll('#categories-grid input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        alert("¡Selecciona al menos una categoría!");
        return;
    }

    state.activeDeck = [];
    checkboxes.forEach(chk => {
        const catData = window.DB_CATEGORIAS[chk.value];
        if (catData && Array.isArray(catData.palabras)) {
            state.activeDeck = state.activeDeck.concat(catData.palabras);
        }
    });

    if (state.activeDeck.length === 0) {
        alert("Error: Las categorías seleccionadas están vacías.");
        return;
    }

    shuffle(state.activeDeck);

    // 2. Setup Jugadores
    state.players = Array.from({ length: state.totalPlayers }, (_, i) => ({
        id: i + 1,
        score: 0,
        color: CONFIG.playerColors[i % CONFIG.playerColors.length] 
    }));
    state.currentPlayerIndex = 0;
    
    // 3. Sensores Android Automáticos
    if (!state.sensorEnabled && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        initSensors();
    }

    switchScreen('game-screen');
    initInteraction();
    startTurn();
}

function startTurn() {
    const player = state.players[state.currentPlayerIndex];
    document.body.style.backgroundColor = player.color;
    
    const badge = safeGet('current-player-badge');
    if (badge) badge.textContent = `Jugador ${player.id}`;
    
    state.timeLeft = CONFIG.turnDuration;
    state.currentCardIdx = 0;
    state.isPaused = false;
    state.lastSensorTime = Date.now() + 1000;

    loadCard();
    startTimer();
}

function startTimer() {
    clearInterval(state.timerInterval);
    updateTimerUI(); 

    state.timerInterval = setInterval(() => {
        if (!state.isPaused) {
            state.timeLeft--;
            updateTimerUI();

            if (state.timeLeft <= 5 && state.timeLeft > 0) playTone(440, 'triangle', 0.1); 
            if (state.timeLeft <= 0) endTurn();
        }
    }, 1000);
}

function updateTimerUI() {
    const timeEl = safeGet('time-left');
    const progressEl = safeGet('progress-bar');
    
    if (timeEl) timeEl.textContent = state.timeLeft;
    if (progressEl) {
        const percentage = (state.timeLeft / CONFIG.turnDuration) * 100;
        progressEl.style.width = `${percentage}%`;
    }
}

function loadCard() {
    if (!state.activeDeck || state.activeDeck.length === 0) {
        endTurn(); 
        return;
    }

    if (state.currentCardIdx >= state.activeDeck.length) {
        shuffle(state.activeDeck);
        state.currentCardIdx = 0;
    }

    const rawContent = state.activeDeck[state.currentCardIdx];
    if (rawContent === null || rawContent === undefined) {
        nextCard(); 
        return;
    }

    const imgEl = safeGet('card-image');
    const textEl = safeGet('card-text');
    
    if (!imgEl || !textEl) return;

    const contentStr = String(rawContent);
    const lowerContent = contentStr.toLowerCase(); 
    const isImage = lowerContent.match(/\.(jpeg|jpg|gif|png)$/) != null;

    if (isImage) {
        textEl.classList.add('hidden');
        imgEl.classList.remove('hidden');
        imgEl.src = contentStr;
    } else {
        imgEl.classList.add('hidden');
        textEl.classList.remove('hidden');
        textEl.textContent = contentStr;
        textEl.style.fontSize = contentStr.length > 15 ? '2.5rem' : '3.5rem';
    }

    state.cardLoadedAt = state.timeLeft;
}

function handleGuess(isCorrect) {
    if (state.isPaused) return;
    if (!state.players[state.currentPlayerIndex]) return;

    if (isCorrect) {
        const timeSpent = state.cardLoadedAt - state.timeLeft;
        let points = 100;
        let isBonus = false;

        if (timeSpent <= CONFIG.bonusTimeLimit) {
            points = 400;
            isBonus = true;
        }

        state.players[state.currentPlayerIndex].score += points;
        playTone(880, 'sine', 0.2); 
        showFeedback(points, isBonus);
        flashBackground('#4ade80');
    } else {
        playTone(200, 'sawtooth', 0.3); 
        flashBackground('#f87171');
    }

    nextCard();
}

function nextCard() {
    state.currentCardIdx++;
    loadCard();
}

function showFeedback(points, isBonus) {
    const el = safeGet('feedback-animation');
    if (!el) return;

    el.textContent = `+${points}${isBonus ? ' 🔥' : ''}`;
    el.className = 'bonus-anim'; 
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 1000);
}

function flashBackground(color) {
    const player = state.players[state.currentPlayerIndex];
    if (!player) return;
    
    document.body.style.backgroundColor = color;
    setTimeout(() => {
        document.body.style.backgroundColor = player.color;
    }, 300);
}

function togglePause() {
    state.isPaused = !state.isPaused;
    const overlay = safeGet('pause-overlay');
    const cardArea = safeGet('card-area');
    
    if (!overlay || !cardArea) return;

    if (state.isPaused) {
        overlay.classList.remove('hidden');
        cardArea.classList.add('blur-effect');
        clearInterval(state.timerInterval);
    } else {
        overlay.classList.add('hidden');
        cardArea.classList.remove('blur-effect');
        startTimer();
    }
}

function endTurn() {
    clearInterval(state.timerInterval);
    playTone(150, 'square', 0.8); 
    
    const modal = safeGet('turn-modal');
    const player = state.players[state.currentPlayerIndex];
    
    if (modal && player) {
        const mTitle = safeGet('modal-title');
        const mMsg = safeGet('modal-message');
        const mPts = safeGet('modal-points');

        if (mTitle) mTitle.textContent = "¡TIEMPO!";
        if (mMsg) mMsg.textContent = `Terminó el turno de Jugador ${player.id}`;
        if (mPts) mPts.textContent = `${player.score}`;
        
        modal.classList.remove('hidden');
    }
}

function confirmEndTurn() {
    const modal = safeGet('turn-modal');
    if (modal) modal.classList.add('hidden');
    
    state.currentPlayerIndex++;
    
    if (state.currentPlayerIndex >= state.totalPlayers) {
        showResults();
    } else {
        startTurn();
    }
}

function showResults() {
    switchScreen('results-screen');
    document.body.style.backgroundColor = '#fff1f2'; 
    const list = safeGet('leaderboard-list');
    
    if (!list) return;
    list.innerHTML = '';
    
    const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
    
    sortedPlayers.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `<span>#${index + 1} Jugador ${p.id}</span><strong>${p.score} pts</strong>`;
        div.style.borderColor = p.color;
        list.appendChild(div);
    });
}

function resetGame() {
    switchScreen('setup-screen');
    document.body.style.backgroundColor = '#fff1f2';
    state.activeDeck = [];
    state.players = [];
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.classList.remove('active');
    });
    const target = safeGet(screenId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
}

function shuffle(array) {
    if (!Array.isArray(array)) return;
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function initInteraction() {
    toggleFullScreen(true);
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.log("Audio resume failed", e));
    }
}

function playTone(freq, type, duration) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type; 
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {
        console.warn("Error de audio (no crítico):", e);
    }
}

// INICIO DE LA APLICACIÓN
document.addEventListener('DOMContentLoaded', () => {
    initDataLoading();
});
