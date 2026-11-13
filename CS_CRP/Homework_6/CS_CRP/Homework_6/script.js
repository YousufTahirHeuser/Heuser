    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Prevent default context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Game constants
    const CANVAS_WIDTH = 480;
    const CANVAS_HEIGHT = 640;
    const BASKET_WIDTH = 100;
    const BASKET_HEIGHT = 20;
    const BASKET_SPEED = 6;
    const ITEM_SIZE = 30;
    const BASKET_Y = CANVAS_HEIGHT - 40;

    // ── Sky Temple Palette ──────────────────────────────────
    const CLR_SKY_TOP     = '#87CEEB'; // light cerulean — top of sky gradient
    const CLR_SKY_BOT     = '#D4EEFF'; // pale ice-blue  — bottom of sky gradient
    const CLR_CLOUD       = '#F5F0EB'; // warm off-white  — clouds, stone highlights
    const CLR_STONE       = '#E8E0D4'; // light sandstone — platform, temple stone
    const CLR_STONE_DARK  = '#C4B8A8'; // muted tan       — stone shadow / outline
    const CLR_MOSS        = '#7EC8A0'; // soft sage-green  — moss, vines, UI accents
    const CLR_MOSS_DARK   = '#5DA87A'; // deeper green     — moss shadow / outline
    const CLR_MOSS_LIGHT  = '#96D4B4'; // lighter sage      — button hover
    const CLR_GOLD        = '#FFD666'; // warm sunlight    — collectibles, glow
    const CLR_GOLD_BRIGHT = '#FFE59E'; // pale gold        — highlight / sparkle
    const CLR_STORM       = '#8B8FAA'; // muted lavender-gray — bad items
    const CLR_STORM_DARK  = '#5C5F75'; // dark slate       — bad item outline
    const CLR_TEXT_SHADOW = 'rgba(0,0,0,0.35)'; // text drop-shadow
    const CLR_OVERLAY     = 'rgba(0,0,0,0.45)'; // game over dim overlay

    // Pre-computed Sky Gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGradient.addColorStop(0, CLR_SKY_TOP);
    skyGradient.addColorStop(1, CLR_SKY_BOT);

    // ── Storage Architecture (§1 of plan4 & plan5) ─────────
    const STORAGE_KEY = 'skytemple_v1';
    const DEFAULT_STORAGE = {
      version: 1,
      highScore: 0,
      bestCombo: 0,
      gamesPlayed: 0,
      settings: {
        muted: false,
        volume: 0.3
      }
    };

    let storageData = JSON.parse(JSON.stringify(DEFAULT_STORAGE));
    let highScore = 0;
    let audioMuted = false;

    function loadStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            storageData.version = 1;
            storageData.highScore = (typeof parsed.highScore === 'number' && Number.isFinite(parsed.highScore))
              ? Math.max(0, Math.min(999999, Math.floor(parsed.highScore)))
              : 0;
            storageData.bestCombo = (typeof parsed.bestCombo === 'number' && Number.isFinite(parsed.bestCombo))
              ? Math.max(0, Math.min(9999, Math.floor(parsed.bestCombo)))
              : 0;
            storageData.gamesPlayed = (typeof parsed.gamesPlayed === 'number' && Number.isFinite(parsed.gamesPlayed))
              ? Math.max(0, Math.min(999999, Math.floor(parsed.gamesPlayed)))
              : 0;
            if (parsed.settings && typeof parsed.settings === 'object') {
              storageData.settings.muted = Boolean(parsed.settings.muted);
              storageData.settings.volume = (typeof parsed.settings.volume === 'number' && Number.isFinite(parsed.settings.volume))
                ? Math.max(0, Math.min(1, parsed.settings.volume))
                : 0.3;
            }
          }
        } else {
          // Migration from legacy key
          const legacyMuted = localStorage.getItem('skyTemple_muted');
          if (legacyMuted !== null) {
            storageData.settings.muted = legacyMuted === '1';
            try { localStorage.removeItem('skyTemple_muted'); } catch (e) {}
          }
          saveStorage();
        }
      } catch (e) {
        console.warn('Storage unavailable or blocked, falling back to memory:', e);
      }
      audioMuted = storageData.settings.muted;
      highScore = storageData.highScore;
    }

    function saveStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
      } catch (e) {
        // Safe fallback in memory
      }
    }

    function resetData() {
      storageData = JSON.parse(JSON.stringify(DEFAULT_STORAGE));
      highScore = 0;
      audioMuted = false;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('skyTemple_muted');
        saveStorage();
      } catch (e) {}

      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(storageData.settings.volume, audioCtx.currentTime);
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    }

    loadStorage();

    // ── Audio Engine (§8 & Bug 1 fix) ───────────────────────
    const MASTER_VOLUME = 0.3;
    const ENABLE_SPEECH = true;
    let audioCtx = null;
    let masterGain = null;
    let sfxGain = null;
    let audioInitialised = false;

    function initAudio() {
      if (audioInitialised) {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        return;
      }
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        masterGain = audioCtx.createGain();
        masterGain.gain.value = audioMuted ? 0 : storageData.settings.volume;
        masterGain.connect(audioCtx.destination);
        sfxGain = audioCtx.createGain();
        sfxGain.gain.value = 1.0;
        sfxGain.connect(masterGain);
        audioInitialised = true;
      } catch (e) {
        console.warn('AudioContext init error:', e);
      }
    }

    function playTone(frequency, type, gainValue, durationMs, delayMs = 0) {
      if (!audioInitialised || !audioCtx) return null;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime + delayMs / 1000;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(gainValue, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t);
      osc.stop(t + durationMs / 1000 + 0.05);
      return osc;
    }

    function playNoise(durationSec, filterType, filterFreq, gainValue) {
      if (!audioInitialised || !audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const sampleRate = audioCtx.sampleRate;
      const buffer = audioCtx.createBuffer(1, Math.floor(sampleRate * durationSec), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationSec);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      src.start();
      src.stop(audioCtx.currentTime + durationSec + 0.05);
    }

    function playThunder() {
      if (!audioInitialised || !audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const duration = 0.4;
      const sampleRate = audioCtx.sampleRate;
      const buffer = audioCtx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      filter.Q.value = 1.0;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      src.start();
      src.stop(audioCtx.currentTime + duration + 0.05);
    }

    function playSadJingle() {
      if (!audioInitialised || !audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const notes = [
        { freq: 440, delay: 0 },
        { freq: 370, delay: 0.25 },
        { freq: 294, delay: 0.50 }
      ];
      notes.forEach(n => {
        const t = audioCtx.currentTime + n.delay;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, t);

        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.setValueAtTime(5, t);
        lfoGain.gain.setValueAtTime(8, t);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + 0.25);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    }

    function playSpokenLose() {
      if (!ENABLE_SPEECH || audioMuted) return;
      if ('speechSynthesis' in window) {
        try {
          const utterance = new SpeechSynthesisUtterance('You lose');
          utterance.pitch = 0.7;
          utterance.rate = 0.8;
          utterance.volume = 0.5;
          window.speechSynthesis.speak(utterance);
        } catch (e) {}
      }
    }

    // ── Drifting Clouds ─────────────────────────────────────
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const w = 80 + Math.random() * 80;
      clouds.push({
        x: Math.random() * (CANVAS_WIDTH + w) - w,
        y: 20 + Math.random() * 360,
        w: w,
        h: w * 0.4,
        speed: 0.15 + Math.random() * 0.25,
        opacity: 0.3 + Math.random() * 0.4
      });
    }

    // ── Enhanced Particle & FX Systems ──────────────────────
    let particles = [];
    let floatingTexts = [];

    function burstParticles(x, y, count, options) {
      for (let i = 0; i < count && particles.length < 150; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = options.speedMin + Math.random() * (options.speedMax - options.speedMin);
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: options.radiusMin + Math.random() * (options.radiusMax - options.radiusMin),
          color: options.colors[Math.floor(Math.random() * options.colors.length)],
          alpha: 1,
          fade: options.fadeMin + Math.random() * (options.fadeMax - options.fadeMin),
          gravity: options.gravity || 0
        });
      }
    }

    function updateFloatingTexts() {
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y -= 0.7;
        ft.alpha -= 1 / 48;
        ft.timer--;
        if (ft.alpha <= 0 || ft.timer <= 0) {
          floatingTexts.splice(i, 1);
        }
      }
    }

    function drawFloatingTexts() {
      for (const ft of floatingTexts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawTextWithShadow(ft.text, ft.x, ft.y, 'bold 18px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW);
        ctx.restore();
      }
    }

    // ── Combo System State ──────────────────────────────────
    let comboCount = 0;
    let comboMultiplier = 1;
    let comboDisplayTimer = 0;
    let comboLostTimer = 0;
    let comboLostValue = 0;
    let comboShatterFragments = [];
    let comboMilestoneFlash = 0;

    function getMultiplier(combo) {
      if (combo >= 20) return 5;
      if (combo >= 15) return 4;
      if (combo >= 10) return 3;
      if (combo >= 5)  return 2;
      return 1;
    }

    // ── Game State Variables ────────────────────────────────
    let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'dying' | 'over'
    let score = 0;
    let lives = 3;
    let lastSpawnTime = 0;
    let items = [];
    let pauseStartTime = 0;
    let hasCelebratedHighScore = false;
    let isResetConfirmOpen = false;

    // Screen Shake & Death Sequence State
    let shakeX = 0;
    let shakeY = 0;
    let deathSequenceStart = 0;
    let deathDarkFactor = 1.0;
    let boltPoints = [];
    let boltBranches = [];
    let fragments = [];
    let basketDestroyed = false;
    let hasPlayedThunder = false;
    let hasPlayedSadJingle = false;
    let hasSpokenLose = false;

    // Basket object
    const basket = {
      x: (CANVAS_WIDTH - BASKET_WIDTH) / 2,
      y: BASKET_Y,
      width: BASKET_WIDTH,
      height: BASKET_HEIGHT,
      bounceTimer: 0,
      recoilTimer: 0
    };

    let heartShakeTimer = 0;
    let basketDimTimer = 0;

    // Keyboard state
    const keys = {
      left: false,
      right: false
    };

    // ── Button Abstraction ──────────────────────────────────
    let activeButtons = [];
    let focusedButtonIndex = -1;

    function createButton(label, onClick) {
      return {
        x: 0, y: 0, width: 0, height: 0,
        label,
        hovered: false,
        pressed: false,
        focused: false,
        currentScale: 1.0,
        ripple: null,
        onClick
      };
    }

    function toggleMute() {
      audioMuted = !audioMuted;
      storageData.settings.muted = audioMuted;
      saveStorage();
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(audioMuted ? 0 : storageData.settings.volume, audioCtx.currentTime);
      }
      muteButton.currentScale = 1.3;
    }

    function togglePause(forcePause = null) {
      const shouldPause = forcePause !== null ? forcePause : (gameState !== 'paused');
      if (shouldPause) {
        if (gameState === 'playing') {
          gameState = 'paused';
          pauseStartTime = performance.now();
          playNoise(0.03, 'highpass', 2000, 0.04);
        }
      } else {
        if (gameState === 'paused') {
          const pausedDuration = performance.now() - pauseStartTime;
          lastSpawnTime += pausedDuration;
          gameState = 'playing';
          playNoise(0.03, 'highpass', 2000, 0.04);
        }
      }
    }

    // Button instances
    const startButton = createButton('Begin', () => startGame());
    const restartButton = createButton('Play Again', () => startGame());
    const muteButton = createButton('', toggleMute);
    const pauseButton = createButton('', () => togglePause());
    const titleResetButton = createButton('Reset Data', () => { isResetConfirmOpen = true; });
    const resumeButton = createButton('Resume', () => togglePause(false));
    const pauseRestartButton = createButton('Restart', () => startGame());
    const pauseResetButton = createButton('Reset Data', () => { isResetConfirmOpen = true; });
    const cancelResetButton = createButton('Cancel', () => { isResetConfirmOpen = false; });
    const confirmResetButton = createButton('Confirm Reset', () => { resetData(); isResetConfirmOpen = false; });

    function drawMuteIcon(x, y, size, muted) {
      ctx.save();
      // Speaker body
      ctx.fillStyle = CLR_CLOUD;
      ctx.fillRect(x + 5, y + size / 2 - 4, 6, 8);

      // Speaker cone
      ctx.beginPath();
      ctx.moveTo(x + 11, y + size / 2 - 4);
      ctx.lineTo(x + 19, y + size / 2 - 8);
      ctx.lineTo(x + 19, y + size / 2 + 8);
      ctx.lineTo(x + 11, y + size / 2 + 4);
      ctx.closePath();
      ctx.fill();

      if (!muted) {
        // Sound waves
        ctx.strokeStyle = CLR_CLOUD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 16, y + size / 2, 6, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 16, y + size / 2, 11, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
      } else {
        // High contrast muted slash with shadow (Polish item 1)
        ctx.strokeStyle = CLR_TEXT_SHADOW;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 22, y + 9);
        ctx.lineTo(x + 31, y + 27);
        ctx.moveTo(x + 31, y + 9);
        ctx.lineTo(x + 22, y + 27);
        ctx.stroke();

        ctx.strokeStyle = CLR_CLOUD;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 22, y + 9);
        ctx.lineTo(x + 31, y + 27);
        ctx.moveTo(x + 31, y + 9);
        ctx.lineTo(x + 22, y + 27);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawPauseIcon(x, y, size) {
      ctx.save();
      ctx.fillStyle = CLR_CLOUD;
      ctx.fillRect(x + 11, y + 10, 4, 16);
      ctx.fillRect(x + 21, y + 10, 4, 16);
      ctx.restore();
    }

    function drawButton(btn, now) {
      const targetScale = btn.pressed ? 0.95 : (btn.hovered ? 1.05 : 1.0);
      btn.currentScale += (targetScale - btn.currentScale) * 0.2;

      ctx.save();
      const cx = btn.x + btn.width / 2;
      const cy = btn.y + btn.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(btn.currentScale, btn.currentScale);
      ctx.translate(-cx, -cy);

      let fill = CLR_MOSS;
      if (btn.pressed) fill = CLR_MOSS_DARK;
      else if (btn.hovered) fill = CLR_MOSS_LIGHT;

      ctx.fillStyle = fill;
      ctx.strokeStyle = CLR_GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(btn.x, btn.y, btn.width, btn.height, 8);
      } else {
        ctx.rect(btn.x, btn.y, btn.width, btn.height);
      }
      ctx.fill();
      ctx.stroke();

      // Dual-layer golden focus ring for accessibility (Polish item 6)
      if (btn.focused) {
        ctx.save();
        ctx.strokeStyle = CLR_TEXT_SHADOW;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = CLR_GOLD_BRIGHT;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      if (btn.label) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawTextWithShadow(btn.label, cx, cy, 'bold 18px system-ui, sans-serif', CLR_CLOUD, CLR_TEXT_SHADOW);
      } else if (btn === muteButton) {
        drawMuteIcon(btn.x, btn.y, btn.width, audioMuted);
      } else if (btn === pauseButton) {
        drawPauseIcon(btn.x, btn.y, btn.width);
      }

      if (btn.ripple) {
        ctx.beginPath();
        ctx.arc(btn.ripple.x, btn.ripple.y, btn.ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = CLR_GOLD;
        ctx.globalAlpha = btn.ripple.alpha;
        ctx.lineWidth = 2;
        ctx.stroke();
        btn.ripple.radius += 2;
        btn.ripple.alpha -= 0.03;
        if (btn.ripple.alpha <= 0) btn.ripple = null;
      }

      ctx.restore();
    }

    // Difficulty settings based on score
    function getDifficulty(currentScore) {
      if (currentScore >= 300) {
        return { fallSpeed: 5, spawnInterval: 600 };
      } else if (currentScore >= 150) {
        return { fallSpeed: 4, spawnInterval: 800 };
      } else if (currentScore >= 50) {
        return { fallSpeed: 3, spawnInterval: 1000 };
      } else {
        return { fallSpeed: 2, spawnInterval: 1200 };
      }
    }

    // Reset game state for a new round (with 250ms debounce guard)
    let lastStartTime = 0;
    function startGame() {
      const now = performance.now();
      if (now - lastStartTime < 250) return;
      lastStartTime = now;

      score = 0;
      lives = 3;
      items = [];
      particles = [];
      floatingTexts = [];
      comboCount = 0;
      comboMultiplier = 1;
      comboDisplayTimer = 0;
      comboLostTimer = 0;
      comboLostValue = 0;
      comboShatterFragments = [];
      comboMilestoneFlash = 0;
      basket.bounceTimer = 0;
      basket.recoilTimer = 0;
      basket.x = (CANVAS_WIDTH - BASKET_WIDTH) / 2;
      basketDestroyed = false;
      heartShakeTimer = 0;
      basketDimTimer = 0;
      deathSequenceStart = 0;
      deathDarkFactor = 1.0;
      boltPoints = [];
      boltBranches = [];
      fragments = [];
      shakeX = 0;
      shakeY = 0;
      hasPlayedThunder = false;
      hasPlayedSadJingle = false;
      hasSpokenLose = false;
      hasCelebratedHighScore = false;
      isResetConfirmOpen = false;

      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }

      storageData.gamesPlayed++;
      saveStorage();

      lastSpawnTime = performance.now();
      gameState = 'playing';
    }

    // ── Input Handlers ──────────────────────────────────────
    window.addEventListener('keydown', (e) => {
      // Prevent key repeat spamming (Bug 5)
      if (e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape')) return;

      // Prevent page scrolling on game controls
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) {
        e.preventDefault();
      }

      initAudio();

      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (gameState === 'playing' || gameState === 'paused') {
          togglePause();
          return;
        }
      }

      if (e.key === 'Tab') {
        if (activeButtons.length > 0) {
          focusedButtonIndex = (focusedButtonIndex + 1) % activeButtons.length;
          activeButtons.forEach((btn, idx) => {
            btn.focused = (idx === focusedButtonIndex);
          });
        }
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (focusedButtonIndex >= 0 && focusedButtonIndex < activeButtons.length) {
          const btn = activeButtons[focusedButtonIndex];
          btn.pressed = true;
          setTimeout(() => { btn.pressed = false; }, 100);
          playNoise(0.03, 'highpass', 2000, 0.04);
          btn.onClick();
          return;
        }
      }

      if (e.key === 'Enter') {
        if (gameState === 'menu' || gameState === 'over') {
          playNoise(0.03, 'highpass', 2000, 0.04);
          startGame();
          return;
        }
      }

      if (gameState === 'dying' || gameState === 'paused') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = false;
      }
    });

    // Window blur safety & auto-pause (Bug 2 & Plan 4)
    window.addEventListener('blur', () => {
      keys.left = false;
      keys.right = false;
      if (gameState === 'playing') {
        togglePause(true);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && gameState === 'playing') {
        keys.left = false;
        keys.right = false;
        togglePause(true);
      }
    });

    function getCanvasCoords(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function updateBasketToPointer(clientX, clientY) {
      const pos = getCanvasCoords(clientX, clientY);
      if (pos.y < 55) return; // Ignore pointer near top-bar buttons
      basket.x = pos.x - basket.width / 2;
      clampBasket();
    }

    canvas.addEventListener('mousemove', (e) => {
      // NOTE: Do NOT call initAudio() on mousemove (Bug 1 fix)
      const pos = getCanvasCoords(e.clientX, e.clientY);

      let anyHovered = false;
      for (const btn of activeButtons) {
        if (pos.x >= btn.x && pos.x <= btn.x + btn.width &&
            pos.y >= btn.y && pos.y <= btn.y + btn.height) {
          btn.hovered = true;
          anyHovered = true;
        } else {
          btn.hovered = false;
        }
      }
      canvas.style.cursor = anyHovered ? 'pointer' : 'default';

      if (gameState === 'playing') {
        updateBasketToPointer(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('click', (e) => {
      initAudio();
      const pos = getCanvasCoords(e.clientX, e.clientY);

      for (const btn of activeButtons) {
        if (pos.x >= btn.x && pos.x <= btn.x + btn.width &&
            pos.y >= btn.y && pos.y <= btn.y + btn.height) {
          btn.pressed = true;
          btn.ripple = { x: pos.x, y: pos.y, radius: 0, alpha: 0.5 };
          playNoise(0.03, 'highpass', 2000, 0.04);
          setTimeout(() => { btn.pressed = false; }, 80);
          btn.onClick();
          return;
        }
      }
    });

    canvas.addEventListener('touchstart', (e) => {
      initAudio();
      e.preventDefault();
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const pos = getCanvasCoords(touch.clientX, touch.clientY);

      for (const btn of activeButtons) {
        if (pos.x >= btn.x && pos.x <= btn.x + btn.width &&
            pos.y >= btn.y && pos.y <= btn.y + btn.height) {
          btn.pressed = true;
          btn.ripple = { x: pos.x, y: pos.y, radius: 0, alpha: 0.5 };
          playNoise(0.03, 'highpass', 2000, 0.04);
          setTimeout(() => { btn.pressed = false; }, 80);
          btn.onClick();
          return;
        }
      }

      if (gameState === 'playing') {
        updateBasketToPointer(touch.clientX, touch.clientY);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (gameState === 'playing' && e.touches.length > 0) {
        const touch = e.touches[0];
        const pos = getCanvasCoords(touch.clientX, touch.clientY);
        const onButton = activeButtons.some(btn =>
          pos.x >= btn.x && pos.x <= btn.x + btn.width &&
          pos.y >= btn.y && pos.y <= btn.y + btn.height
        );
        if (!onButton) {
          updateBasketToPointer(touch.clientX, touch.clientY);
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      for (const btn of activeButtons) {
        btn.hovered = false;
        btn.pressed = false;
      }
    });

    function clampBasket() {
      if (basket.x < 0) basket.x = 0;
      if (basket.x + basket.width > CANVAS_WIDTH) {
        basket.x = CANVAS_WIDTH - basket.width;
      }
    }

    // Spawning logic (3 good : 1 bad ratio)
    function spawnItem() {
      const type = Math.random() < 0.75 ? 'good' : 'bad';
      const x = Math.random() * (CANVAS_WIDTH - ITEM_SIZE);
      items.push({
        x: x,
        y: -ITEM_SIZE,
        width: ITEM_SIZE,
        height: ITEM_SIZE,
        type: type
      });
    }

    // Cloud animation (ambient)
    function updateClouds() {
      for (const cloud of clouds) {
        cloud.x += cloud.speed;
        if (cloud.x > CANVAS_WIDTH + cloud.w) {
          cloud.x = -cloud.w;
          cloud.y = 20 + Math.random() * 360;
        }
      }
    }

    // Particle animation
    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.gravity) p.vy += p.gravity;
        p.alpha -= p.fade;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      for (let i = comboShatterFragments.length - 1; i >= 0; i--) {
        const frag = comboShatterFragments[i];
        frag.x += frag.vx;
        frag.y += frag.vy;
        frag.vy += frag.gravity;
        frag.rot += frag.vrot;
        frag.alpha -= 1 / 30;
        if (frag.alpha <= 0) {
          comboShatterFragments.splice(i, 1);
        }
      }
    }

    // Generate Lightning Bolt Geometry (§1)
    function generateBolt() {
      boltPoints = [{ x: CANVAS_WIDTH / 2, y: 0 }];
      boltBranches = [];
      const targetX = basket.x + basket.width / 2;
      const targetY = basket.y;
      let currX = CANVAS_WIDTH / 2;
      let currY = 0;
      const segCount = 18;
      const yStep = targetY / segCount;

      for (let i = 1; i <= segCount; i++) {
        currY += yStep;
        if (i === segCount) {
          currX = targetX;
        } else {
          currX += (Math.random() - 0.5) * 60;
          currX = Math.max(CANVAS_WIDTH * 0.2, Math.min(CANVAS_WIDTH * 0.8, currX));
        }
        boltPoints.push({ x: currX, y: currY });

        // Branching forks
        if (i > 3 && i < segCount - 3 && Math.random() < 0.35 && boltBranches.length < 4) {
          const branch = [{ x: currX, y: currY }];
          let bx = currX;
          let by = currY;
          const dir = Math.random() < 0.5 ? -1 : 1;
          for (let b = 0; b < 3; b++) {
            bx += dir * (15 + Math.random() * 20);
            by += 15 + Math.random() * 15;
            branch.push({ x: bx, y: by });
          }
          boltBranches.push(branch);
        }
      }
    }

    // Generate Basket Crumble Fragments (§1)
    function generateFragments() {
      fragments = [];
      const fw = basket.width / 4;
      const fh = basket.height / 2;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          fragments.push({
            x: basket.x + col * fw + fw / 2,
            y: basket.y + row * fh + fh / 2,
            w: fw,
            h: fh,
            vx: (Math.random() - 0.5) * 4,
            vy: -1.5 + Math.random() * 2,
            gravity: 0.15,
            rot: 0,
            vrot: (Math.random() - 0.5) * 0.1,
            alpha: 1.0
          });
        }
      }
    }

    // ── Main Update Function ────────────────────────────────
    function update(now) {
      updateClouds();

      if (gameState === 'paused') {
        return; // Physics and timers completely frozen while paused
      }

      updateParticles();
      updateFloatingTexts();

      // Timers decrement
      if (comboDisplayTimer > 0) comboDisplayTimer--;
      if (comboLostTimer > 0) comboLostTimer--;
      if (comboMilestoneFlash > 0) comboMilestoneFlash--;
      if (basket.bounceTimer > 0) basket.bounceTimer--;
      if (basket.recoilTimer > 0) basket.recoilTimer--;
      if (heartShakeTimer > 0) heartShakeTimer--;
      if (basketDimTimer > 0) basketDimTimer--;

      // ── Dying State (Lightning Loss Sequence, §1) ──────────
      if (gameState === 'dying') {
        const elapsed = now - deathSequenceStart;

        // 0-300ms: Sky darken
        if (elapsed <= 300) {
          deathDarkFactor = 1.0 - 0.6 * (elapsed / 300);
        } else {
          deathDarkFactor = 0.4;
        }

        // 300ms: Lightning strikes + Thunder
        if (elapsed >= 300 && !hasPlayedThunder) {
          hasPlayedThunder = true;
          playThunder();
          generateBolt();
        }

        // 300-500ms: Screen shake
        if (elapsed >= 300 && elapsed <= 500) {
          const decay = 1 - (elapsed - 300) / 200;
          shakeX = (Math.random() - 0.5) * 12 * decay;
          shakeY = (Math.random() - 0.5) * 8 * decay;
        } else {
          shakeX = 0;
          shakeY = 0;
        }

        // 500-900ms: Embers from basket
        if (elapsed >= 500 && elapsed <= 900 && Math.random() < 0.25) {
          particles.push({
            x: basket.x + basket.width / 2 + (Math.random() - 0.5) * 30,
            y: basket.y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -1 - Math.random() * 1.5,
            r: 2 + Math.random() * 1.5,
            color: Math.random() < 0.5 ? CLR_GOLD : CLR_STORM_DARK,
            alpha: 1,
            fade: 1 / 25,
            gravity: 0.03
          });
        }

        // 900-1400ms: Basket crumble
        if (elapsed >= 900 && !basketDestroyed) {
          basketDestroyed = true;
          generateFragments();
        }

        if (basketDestroyed && elapsed <= 1500) {
          for (const frag of fragments) {
            frag.x += frag.vx;
            frag.y += frag.vy;
            frag.vy += frag.gravity;
            frag.rot += frag.vrot;
            frag.alpha -= 1 / 30;
          }
        }

        // 1400ms: Sad jingle
        if (elapsed >= 1400 && !hasPlayedSadJingle) {
          hasPlayedSadJingle = true;
          playSadJingle();
        }

        // 2120ms: Optional speech
        if (elapsed >= 2120 && !hasSpokenLose) {
          hasSpokenLose = true;
          playSpokenLose();
        }

        // 2200ms: Transition to game over (Bug 8 fix: keep basketDestroyed = true)
        if (elapsed >= 2200) {
          gameState = 'over';
          boltPoints = [];
          boltBranches = [];
          fragments = [];
          deathDarkFactor = 1.0;
        }
        return;
      }

      if (gameState !== 'playing') return;

      const difficulty = getDifficulty(score);

      // Keyboard movement
      if (keys.left) {
        basket.x -= BASKET_SPEED;
      }
      if (keys.right) {
        basket.x += BASKET_SPEED;
      }
      clampBasket();

      // Spawn check
      if (now - lastSpawnTime >= difficulty.spawnInterval) {
        spawnItem();
        lastSpawnTime = now;
      }

      // Move items and check collisions
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += difficulty.fallSpeed;

        const horizontalOverlap = (item.x + item.width >= basket.x) && (item.x <= basket.x + basket.width);
        const verticalOverlap = (item.y + item.height >= basket.y) && (item.y <= basket.y + basket.height);

        if (horizontalOverlap && verticalOverlap) {
          const cx = item.x + item.width / 2;
          const cy = item.y + item.height / 2;

          if (item.type === 'good') {
            comboCount++;
            comboMultiplier = getMultiplier(comboCount);
            const gainedScore = 10 * comboMultiplier;
            score += gainedScore;

            // Continuous high score check & celebration
            if (score > highScore) {
              if (highScore > 0 && !hasCelebratedHighScore) {
                hasCelebratedHighScore = true;
                if (floatingTexts.length < 10) {
                  floatingTexts.push({
                    text: 'NEW HIGH SCORE!',
                    x: CANVAS_WIDTH / 2,
                    y: CANVAS_HEIGHT / 2 - 80,
                    alpha: 1.5,
                    timer: 60
                  });
                }
                burstParticles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80, 20, {
                  colors: [CLR_GOLD, CLR_GOLD_BRIGHT],
                  speedMin: 2,
                  speedMax: 4,
                  radiusMin: 3,
                  radiusMax: 5,
                  fadeMin: 1 / 40,
                  fadeMax: 1 / 25,
                  gravity: 0.05
                });
              }
              highScore = score;
              storageData.highScore = highScore;
              saveStorage();
            }

            if (comboCount > storageData.bestCombo) {
              storageData.bestCombo = comboCount;
              saveStorage();
            }

            comboDisplayTimer = 18;
            basket.bounceTimer = 12;

            const pitch = 660 + Math.min(comboCount * 40, 400);
            playTone(pitch, 'sine', 0.18, 200);
            playTone(pitch * 1.5, 'sine', 0.06, 200);

            burstParticles(cx, cy, 12, {
              colors: [CLR_GOLD, CLR_GOLD_BRIGHT],
              speedMin: 1.2,
              speedMax: 3.2,
              radiusMin: 2,
              radiusMax: 4,
              fadeMin: 1 / 25,
              fadeMax: 1 / 18,
              gravity: 0.08
            });

            if (floatingTexts.length < 10) {
              floatingTexts.push({
                text: `+${gainedScore}`,
                x: cx,
                y: cy,
                alpha: 1,
                timer: 48
              });
            }

            if (comboCount === 5 || comboCount === 10 || comboCount === 15 || comboCount === 20) {
              playTone(660, 'sine', 0.15, 80, 0);
              playTone(830, 'sine', 0.15, 80, 50);
              playTone(1046, 'sine', 0.15, 80, 100);

              burstParticles(CANVAS_WIDTH - 60, 70, 25, {
                colors: [CLR_GOLD, CLR_GOLD_BRIGHT],
                speedMin: 2,
                speedMax: 4.5,
                radiusMin: 3,
                radiusMax: 5,
                fadeMin: 1 / 35,
                fadeMax: 1 / 25,
                gravity: 0.06
              });

              for (let s = 0; s < 15 && particles.length < 150; s++) {
                particles.push({
                  x: Math.random() * CANVAS_WIDTH,
                  y: 0,
                  vx: (Math.random() - 0.5) * 1.5,
                  vy: 1.0 + Math.random() * 0.8,
                  r: 2 + Math.random(),
                  color: CLR_GOLD_BRIGHT,
                  alpha: 0.6,
                  fade: 1 / 60,
                  gravity: 0.01
                });
              }
              comboMilestoneFlash = 6;
            }
          } else {
            lives -= 1;
            heartShakeTimer = 18;
            basket.recoilTimer = 9;

            playTone(150, 'square', 0.15, 120);

            if (comboCount >= 2) {
              comboLostValue = comboCount;
              comboLostTimer = 30;
              const osc = playTone(300, 'triangle', 0.12, 200);
              if (osc && audioCtx) {
                osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 0.2);
              }
              for (let f = 0; f < 6; f++) {
                comboShatterFragments.push({
                  x: CANVAS_WIDTH - 60 + (Math.random() - 0.5) * 20,
                  y: 70 + (Math.random() - 0.5) * 15,
                  w: 10,
                  h: 8,
                  vx: (Math.random() - 0.5) * 3,
                  vy: (Math.random() - 0.5) * 2 - 1,
                  rot: Math.random() * Math.PI * 2,
                  vrot: (Math.random() - 0.5) * 0.1,
                  alpha: 1.0,
                  gravity: 0.08
                });
              }
              basketDimTimer = 18;
            }
            comboCount = 0;
            comboMultiplier = 1;

            burstParticles(cx, cy, 5, {
              colors: [CLR_STORM, CLR_STORM_DARK],
              speedMin: 1,
              speedMax: 2.5,
              radiusMin: 3,
              radiusMax: 5,
              fadeMin: 1 / 18,
              fadeMax: 1 / 12,
              gravity: 0.05
            });
          }
          items.splice(i, 1);
          continue;
        }

        if (item.y > CANVAS_HEIGHT) {
          if (item.type === 'good') {
            lives -= 1;
            heartShakeTimer = 18;

            playTone(80, 'sine', 0.10, 100);

            if (comboCount >= 2) {
              comboLostValue = comboCount;
              comboLostTimer = 30;
              const osc = playTone(300, 'triangle', 0.12, 200);
              if (osc && audioCtx) {
                osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 0.2);
              }
              for (let f = 0; f < 6; f++) {
                comboShatterFragments.push({
                  x: CANVAS_WIDTH - 60 + (Math.random() - 0.5) * 20,
                  y: 70 + (Math.random() - 0.5) * 15,
                  w: 10,
                  h: 8,
                  vx: (Math.random() - 0.5) * 3,
                  vy: (Math.random() - 0.5) * 2 - 1,
                  rot: Math.random() * Math.PI * 2,
                  vrot: (Math.random() - 0.5) * 0.1,
                  alpha: 1.0,
                  gravity: 0.08
                });
              }
              basketDimTimer = 18;
            }
            comboCount = 0;
            comboMultiplier = 1;

            for (let p = 0; p < 7 && particles.length < 150; p++) {
              particles.push({
                x: item.x + item.width / 2,
                y: CANVAS_HEIGHT - 6,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.8) * 3.5,
                r: 2.5 + Math.random() * 2,
                color: CLR_CLOUD,
                alpha: 1,
                fade: 1 / 18,
                gravity: 0.12
              });
            }
          } else {
            for (let p = 0; p < 3 && particles.length < 150; p++) {
              particles.push({
                x: item.x + item.width / 2,
                y: CANVAS_HEIGHT - 5,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -0.5 - Math.random() * 0.8,
                r: 2.5,
                color: CLR_STORM,
                alpha: 0.5,
                fade: 1 / 12,
                gravity: 0.02
              });
            }
          }
          items.splice(i, 1);
          continue;
        }
      }

      // Check life condition & Trigger Lightning Sequence (§1)
      if (lives <= 0) {
        lives = 0;
        gameState = 'dying';
        deathSequenceStart = now;
        items = [];
        deathDarkFactor = 1.0;
        boltPoints = [];
        boltBranches = [];
        fragments = [];
        basketDestroyed = false;
        hasPlayedThunder = false;
        hasPlayedSadJingle = false;
        hasSpokenLose = false;
      }
    }

    // Helper: text with drop-shadow
    function drawTextWithShadow(text, x, y, font, fillColor, shadowColor = CLR_TEXT_SHADOW, offsetX = 1, offsetY = 1) {
      ctx.font = font;
      ctx.fillStyle = shadowColor;
      ctx.fillText(text, x + offsetX, y + offsetY);
      ctx.fillStyle = fillColor;
      ctx.fillText(text, x, y);
    }

    // Drawing: Drifting Clouds
    function drawClouds() {
      for (const cloud of clouds) {
        ctx.save();
        ctx.fillStyle = CLR_CLOUD;
        ctx.globalAlpha = cloud.opacity;

        ctx.beginPath();
        ctx.ellipse(cloud.x, cloud.y, cloud.w * 0.5, cloud.h * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(cloud.x - cloud.w * 0.3, cloud.y + cloud.h * 0.05, cloud.w * 0.5 * 0.7, cloud.h * 0.5 * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(cloud.x + cloud.w * 0.3, cloud.y + cloud.h * 0.05, cloud.w * 0.5 * 0.8, cloud.h * 0.5 * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // Drawing: Distant Temple Silhouette
    function drawTemple() {
      ctx.save();
      ctx.fillStyle = CLR_STONE;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();

      ctx.rect(180, 180, 120, 60);

      ctx.moveTo(190, 180);
      ctx.lineTo(210, 150);
      ctx.lineTo(270, 150);
      ctx.lineTo(290, 180);
      ctx.closePath();

      ctx.moveTo(235, 150);
      ctx.lineTo(240, 110);
      ctx.lineTo(245, 150);
      ctx.closePath();

      ctx.fill();
      ctx.restore();
    }

    // Drawing: Ground Platform
    function drawPlatform() {
      const platY = BASKET_Y - 10;
      const platH = CANVAS_HEIGHT - platY;

      ctx.fillStyle = CLR_STONE;
      ctx.fillRect(0, platY, CANVAS_WIDTH, platH);

      ctx.fillStyle = CLR_CLOUD;
      ctx.beginPath();
      ctx.arc(80, platY, 6, Math.PI, 0);
      ctx.arc(190, platY, 8, Math.PI, 0);
      ctx.arc(310, platY, 5, Math.PI, 0);
      ctx.arc(410, platY, 7, Math.PI, 0);
      ctx.fill();

      ctx.strokeStyle = CLR_MOSS;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, platY);
      ctx.lineTo(CANVAS_WIDTH, platY);
      ctx.stroke();

      ctx.save();
      ctx.strokeStyle = CLR_STONE_DARK;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, platY + 16);
      ctx.lineTo(CANVAS_WIDTH, platY + 16);
      ctx.moveTo(0, platY + 32);
      ctx.lineTo(CANVAS_WIDTH, platY + 32);
      ctx.stroke();
      ctx.restore();
    }

    // Drawing: Catcher Offering Bowl
    function drawBasket(now) {
      if (basketDestroyed) return;

      ctx.save();

      let offsetY = 0;
      if (basket.bounceTimer > 0) {
        offsetY = Math.sin(basket.bounceTimer / 12 * Math.PI) * -8;
      } else if (basket.recoilTimer > 0) {
        offsetY = 5;
      } else if (gameState === 'playing') {
        offsetY = Math.sin(now / 1000 * Math.PI) * 2;
      }
      ctx.translate(0, offsetY);

      if (basketDimTimer > 0) {
        ctx.globalAlpha = 0.6;
      }

      const cx = basket.x + basket.width / 2;
      const cy = basket.y + 4;
      const rx = basket.width / 2;
      const ry = basket.height * 0.9;

      let bodyColor = CLR_STONE;
      if (basket.recoilTimer > 3) {
        bodyColor = CLR_STORM;
      } else if (gameState === 'dying') {
        const elapsed = now - deathSequenceStart;
        if (elapsed >= 500 && elapsed <= 900) {
          bodyColor = Math.floor(elapsed / 60) % 2 === 0 ? CLR_STONE_DARK : CLR_STONE;
        }
      }

      // 1. Bowl body
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
      ctx.fill();

      // 3. Inner glow
      ctx.save();
      ctx.fillStyle = CLR_GOLD_BRIGHT;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx - 8, Math.max(2, ry - 4), 0, 0, Math.PI);
      ctx.fill();
      ctx.restore();

      // 2. Bowl rim
      ctx.fillStyle = CLR_MOSS;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 4. Rim highlight
      ctx.save();
      ctx.strokeStyle = CLR_CLOUD;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, 4, 0, Math.PI, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    // Drawing: Basket Fragments
    function drawFragments() {
      for (const frag of fragments) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, frag.alpha);
        ctx.translate(frag.x, frag.y);
        ctx.rotate(frag.rot);
        ctx.fillStyle = CLR_STONE;
        ctx.strokeStyle = CLR_STONE_DARK;
        ctx.lineWidth = 1;
        ctx.fillRect(-frag.w / 2, -frag.h / 2, frag.w, frag.h);
        ctx.strokeRect(-frag.w / 2, -frag.h / 2, frag.w, frag.h);
        ctx.restore();
      }
    }

    // Drawing: Sun Gem
    function drawSunGem(cx, cy, r, now, scale = 1) {
      ctx.save();

      ctx.fillStyle = CLR_GOLD;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, (r + 4) * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = CLR_GOLD_BRIGHT;
      ctx.beginPath();
      ctx.arc(cx - 3 * scale, cy - 3 * scale, r * 0.55 * scale, 0, Math.PI * 2);
      ctx.fill();

      const sparkleAngle = now * 0.003;
      const spX = cx + r * 0.5 * scale;
      const spY = cy - r * 0.5 * scale;
      const spLen = 4 * scale;

      ctx.save();
      ctx.translate(spX, spY);
      ctx.rotate(sparkleAngle);
      ctx.strokeStyle = CLR_CLOUD;
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(-spLen, 0);
      ctx.lineTo(spLen, 0);
      ctx.moveTo(0, -spLen);
      ctx.lineTo(0, spLen);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    // Drawing: Storm Wisp
    function drawStormWisp(cx, cy) {
      ctx.save();

      ctx.fillStyle = CLR_STORM;
      ctx.beginPath();
      ctx.arc(cx - 6, cy, 6, 0, Math.PI * 2);
      ctx.arc(cx, cy - 2, 8, 0, Math.PI * 2);
      ctx.arc(cx + 6, cy, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = CLR_STORM_DARK;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = CLR_GOLD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - 3, cy + 5);
      ctx.lineTo(cx + 2, cy + 8);
      ctx.lineTo(cx - 1, cy + 13);
      ctx.stroke();

      ctx.restore();
    }

    // Drawing: Items
    function drawItems(now) {
      for (const item of items) {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        if (item.type === 'good') {
          drawSunGem(cx, cy, ITEM_SIZE / 2 - 2, now, 1);
        } else {
          drawStormWisp(cx, cy);
        }
      }
    }

    // Drawing: Particles & Shatter Pieces
    function drawParticles() {
      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const frag of comboShatterFragments) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, frag.alpha);
        ctx.translate(frag.x, frag.y);
        ctx.rotate(frag.rot);
        ctx.fillStyle = CLR_STORM_DARK;
        ctx.fillRect(-frag.w / 2, -frag.h / 2, frag.w, frag.h);
        ctx.restore();
      }
    }

    // Drawing: HUD & Combo Counter (Polish item 5: explicit padding & heart spacing)
    function drawHUD() {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // Coin icon before score
      ctx.fillStyle = CLR_GOLD;
      ctx.beginPath();
      ctx.arc(26, 36, 4, 0, Math.PI * 2);
      ctx.fill();

      // Score text with shadow
      drawTextWithShadow(`Score: ${score}`, 36, 24, 'bold 22px system-ui, sans-serif', CLR_CLOUD, CLR_TEXT_SHADOW);

      // Lives hearts with shake effect
      let heartOffX = 0;
      let heartOffY = 0;
      if (heartShakeTimer > 0) {
        const factor = heartShakeTimer / 18;
        heartOffX = (Math.random() - 0.5) * 6 * factor;
        heartOffY = (Math.random() - 0.5) * 4 * factor;
      }

      ctx.textAlign = 'right';
      const hearts = '♥ '.repeat(lives).trim();
      drawTextWithShadow(hearts || 'None', CANVAS_WIDTH - 24 + heartOffX, 50 + heartOffY, 'bold 22px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW);
    }

    function drawComboCounter(now) {
      if (comboCount < 2) return;

      const anchorX = CANVAS_WIDTH - 60;
      const anchorY = 82;

      ctx.save();
      let scale = 1.0;
      if (comboDisplayTimer > 0) {
        scale = 1.0 + 0.4 * (comboDisplayTimer / 18);
      }
      ctx.translate(anchorX, anchorY);
      ctx.scale(scale, scale);

      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';

      const numColor = comboMilestoneFlash > 0 ? CLR_CLOUD : CLR_GOLD;
      drawTextWithShadow(`×${comboCount}`, 0, 0, 'bold 28px system-ui, sans-serif', numColor, CLR_TEXT_SHADOW);
      drawTextWithShadow('COMBO', 0, 30, 'bold 14px system-ui, sans-serif', CLR_MOSS, CLR_TEXT_SHADOW);

      if (comboMultiplier > 1) {
        drawTextWithShadow(`(${comboMultiplier}× pts)`, 0, 48, '13px system-ui, sans-serif', CLR_CLOUD, CLR_TEXT_SHADOW);
      }

      ctx.restore();
    }

    // Drawing: Title Screen
    function drawTitleScreen(now) {
      const centerY = CANVAS_HEIGHT / 2;

      drawSunGem(CANVAS_WIDTH / 2, centerY - 130, 13, now, 2);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      drawTextWithShadow('SKY TEMPLE', CANVAS_WIDTH / 2, centerY - 50, 'bold 40px system-ui, sans-serif', CLR_CLOUD, CLR_TEXT_SHADOW, 2, 2);
      drawTextWithShadow('Catch the Light', CANVAS_WIDTH / 2, centerY - 10, '22px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW, 1, 1);

      // Begin Button
      startButton.x = CANVAS_WIDTH / 2 - 80;
      startButton.y = centerY + 25;
      startButton.width = 160;
      startButton.height = 40;
      activeButtons.push(startButton);
      drawButton(startButton, now);

      // Best Score and Best Combo
      drawTextWithShadow(`Best: ${highScore}`, CANVAS_WIDTH / 2, centerY + 85, '20px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW);
      if (storageData.bestCombo >= 2) {
        drawTextWithShadow(`Best Streak: ×${storageData.bestCombo}`, CANVAS_WIDTH / 2, centerY + 112, '15px system-ui, sans-serif', CLR_MOSS, CLR_TEXT_SHADOW);
      }

      // Reset Data Button (low-profile stone button)
      titleResetButton.x = CANVAS_WIDTH / 2 - 65;
      titleResetButton.y = CANVAS_HEIGHT - 48;
      titleResetButton.width = 130;
      titleResetButton.height = 32;
      activeButtons.push(titleResetButton);
      drawButton(titleResetButton, now);
    }

    // Drawing: Game Over Screen
    function drawGameOverScreen(now) {
      const centerY = CANVAS_HEIGHT / 2;
      const panelW = 280;
      const panelH = 210;
      const panelX = (CANVAS_WIDTH - panelW) / 2;
      const panelY = (CANVAS_HEIGHT - panelH) / 2;

      ctx.fillStyle = CLR_OVERLAY;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = CLR_STONE;
      ctx.strokeStyle = CLR_STONE_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(panelX, panelY, panelW, panelH, 12);
      } else {
        ctx.rect(panelX, panelY, panelW, panelH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      drawTextWithShadow('Temple Closed', CANVAS_WIDTH / 2, centerY - 60, 'bold 32px system-ui, sans-serif', CLR_STORM_DARK, CLR_TEXT_SHADOW, 1, 1);
      drawTextWithShadow(`Score: ${score}`, CANVAS_WIDTH / 2, centerY - 15, '22px system-ui, sans-serif', CLR_CLOUD, CLR_TEXT_SHADOW, 1, 1);

      if (score >= highScore && score > 0) {
        drawTextWithShadow('★ NEW HIGH SCORE! ★', CANVAS_WIDTH / 2, centerY + 15, 'bold 18px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW, 1, 1);
      } else {
        drawTextWithShadow(`Best: ${highScore}`, CANVAS_WIDTH / 2, centerY + 15, '18px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW, 1, 1);
      }

      // Play Again Button (only interactive if gameover is fully settled, Bug 4 fix)
      if (gameState === 'over') {
        restartButton.x = CANVAS_WIDTH / 2 - 90;
        restartButton.y = centerY + 45;
        restartButton.width = 180;
        restartButton.height = 40;
        activeButtons.push(restartButton);
        drawButton(restartButton, now);
      }
    }

    // Drawing: Pause Screen (Plan 4 & Plan 5)
    function drawPauseScreen(now) {
      const centerY = CANVAS_HEIGHT / 2;
      const panelW = 280;
      const panelH = 240;
      const panelX = (CANVAS_WIDTH - panelW) / 2;
      const panelY = (CANVAS_HEIGHT - panelH) / 2;

      ctx.fillStyle = 'rgba(30, 40, 50, 0.6)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = CLR_STONE;
      ctx.strokeStyle = CLR_STONE_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(panelX, panelY, panelW, panelH, 12);
      } else {
        ctx.rect(panelX, panelY, panelW, panelH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawTextWithShadow('PAUSED', CANVAS_WIDTH / 2, centerY - 80, 'bold 32px system-ui, sans-serif', CLR_GOLD, CLR_TEXT_SHADOW, 1, 1);

      // Resume Button
      resumeButton.x = CANVAS_WIDTH / 2 - 80;
      resumeButton.y = centerY - 45;
      resumeButton.width = 160;
      resumeButton.height = 38;
      activeButtons.push(resumeButton);
      drawButton(resumeButton, now);

      // Restart Button
      pauseRestartButton.x = CANVAS_WIDTH / 2 - 80;
      pauseRestartButton.y = centerY + 5;
      pauseRestartButton.width = 160;
      pauseRestartButton.height = 38;
      activeButtons.push(pauseRestartButton);
      drawButton(pauseRestartButton, now);

      // Reset Data Button in Pause menu
      pauseResetButton.x = CANVAS_WIDTH / 2 - 70;
      pauseResetButton.y = centerY + 55;
      pauseResetButton.width = 140;
      pauseResetButton.height = 34;
      activeButtons.push(pauseResetButton);
      drawButton(pauseResetButton, now);
    }

    // Drawing: Reset Confirmation Modal (Plan 4 & Plan 5)
    function drawResetConfirmModal(now) {
      const centerY = CANVAS_HEIGHT / 2;
      const panelW = 320;
      const panelH = 190;
      const panelX = (CANVAS_WIDTH - panelW) / 2;
      const panelY = (CANVAS_HEIGHT - panelH) / 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = CLR_STONE;
      ctx.strokeStyle = CLR_STONE_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(panelX, panelY, panelW, panelH, 12);
      } else {
        ctx.rect(panelX, panelY, panelW, panelH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawTextWithShadow('Reset All Records?', CANVAS_WIDTH / 2, centerY - 55, 'bold 22px system-ui, sans-serif', CLR_STORM_DARK, CLR_TEXT_SHADOW, 1, 1);
      drawTextWithShadow('Clear high scores and settings?', CANVAS_WIDTH / 2, centerY - 25, '15px system-ui, sans-serif', CLR_STONE_DARK, CLR_TEXT_SHADOW);
      drawTextWithShadow('This cannot be undone.', CANVAS_WIDTH / 2, centerY - 5, '13px system-ui, sans-serif', CLR_STORM, CLR_TEXT_SHADOW);

      // Cancel Button
      cancelResetButton.x = CANVAS_WIDTH / 2 - 120;
      cancelResetButton.y = centerY + 30;
      cancelResetButton.width = 110;
      cancelResetButton.height = 36;
      activeButtons.push(cancelResetButton);
      drawButton(cancelResetButton, now);

      // Confirm Button
      confirmResetButton.x = CANVAS_WIDTH / 2 + 10;
      confirmResetButton.y = centerY + 30;
      confirmResetButton.width = 120;
      confirmResetButton.height = 36;
      activeButtons.push(confirmResetButton);
      drawButton(confirmResetButton, now);
    }

    // Drawing: Lightning Bolt & Flash
    function drawLightning(now) {
      if (boltPoints.length < 2) return;
      const elapsed = now - deathSequenceStart;
      let alpha = 1.0;
      if (elapsed > 500) {
        alpha = Math.max(0, 1 - (elapsed - 500) / 200);
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.strokeStyle = CLR_CLOUD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(boltPoints[0].x, boltPoints[0].y);
      for (let i = 1; i < boltPoints.length; i++) {
        ctx.lineTo(boltPoints[i].x, boltPoints[i].y);
      }
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = 1.5;
      for (const branch of boltBranches) {
        ctx.beginPath();
        ctx.moveTo(branch[0].x, branch[0].y);
        for (let i = 1; i < branch.length; i++) {
          ctx.lineTo(branch[i].x, branch[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    // ── Render Function ─────────────────────────────────────
    function render(now) {
      activeButtons = [];

      // Top bar buttons
      muteButton.x = CANVAS_WIDTH - 44;
      muteButton.y = 8;
      muteButton.width = 36;
      muteButton.height = 36;
      activeButtons.push(muteButton);

      if (gameState === 'playing' || gameState === 'paused') {
        pauseButton.x = CANVAS_WIDTH - 86;
        pauseButton.y = 8;
        pauseButton.width = 36;
        pauseButton.height = 36;
        activeButtons.push(pauseButton);
      }

      // Apply screen shake
      ctx.save();
      if (shakeX !== 0 || shakeY !== 0) {
        ctx.translate(shakeX, shakeY);
      }

      // 1. Sky Gradient
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Dying sky darken overlay
      if (gameState === 'dying' && deathDarkFactor < 1.0) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 1 - deathDarkFactor;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }

      // 2. Drifting Clouds
      drawClouds();

      // 3. Distant Temple Silhouette
      drawTemple();

      if (gameState === 'menu') {
        drawTitleScreen(now);
      } else if (gameState === 'playing') {
        drawPlatform();
        drawBasket(now);
        drawItems(now);
        drawParticles();
        drawFloatingTexts();
        drawHUD();
        drawComboCounter(now);
      } else if (gameState === 'paused') {
        drawPlatform();
        drawBasket(now);
        drawItems(now);
        drawParticles();
        drawFloatingTexts();
        drawHUD();
        drawComboCounter(now);
        drawPauseScreen(now);
      } else if (gameState === 'dying') {
        const elapsed = now - deathSequenceStart;

        drawPlatform();
        if (!basketDestroyed) {
          drawBasket(now);
        } else {
          drawFragments();
        }
        drawItems(now);
        drawParticles();

        if (elapsed >= 300 && elapsed <= 700) {
          drawLightning(now);
        }

        if (elapsed >= 300 && elapsed <= 500) {
          const flashAlpha = 0.9 * (1 - (elapsed - 300) / 200);
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = flashAlpha;
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.restore();
        }

        if (elapsed >= 1800) {
          const fadeAlpha = Math.min(1, (elapsed - 1800) / 400);
          ctx.save();
          ctx.globalAlpha = fadeAlpha;
          drawGameOverScreen(now);
          ctx.restore();
        }
      } else if (gameState === 'over') {
        drawPlatform();
        // Basket remains destroyed on game over (Bug 8 fix)
        if (!basketDestroyed) {
          drawBasket(now);
        }
        drawParticles();
        drawGameOverScreen(now);
      }

      ctx.restore(); // End screen shake translation

      // Reset Confirmation Modal overlay (if active)
      if (isResetConfirmOpen) {
        // Only confirm/cancel buttons and mute button should be active
        activeButtons = [cancelResetButton, confirmResetButton, muteButton];
        drawResetConfirmModal(now);
      }

      // Draw top bar buttons on top
      drawButton(muteButton, now);
      if (gameState === 'playing' || gameState === 'paused') {
        drawButton(pauseButton, now);
      }
    }

    // Main Game Loop
    function gameLoop(now) {
      update(now);
      render(now);
      requestAnimationFrame(gameLoop);
    }

    // Start loop
    requestAnimationFrame(gameLoop);
