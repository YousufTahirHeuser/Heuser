/* -------------------------------------------------------------------------
   RETRO QUIZ ARCADE MACHINE - GAMEPLAY & API CLIENT
   ------------------------------------------------------------------------- */
(() => {
  // DOM Elements - Screens
  const screenGlass = document.getElementById('screenGlass');
  const screenStart = document.getElementById('screenStart');
  const screenLoading = document.getElementById('screenLoading');
  const screenError = document.getElementById('screenError');
  const screenGame = document.getElementById('screenGame');
  const screenGameOver = document.getElementById('screenGameOver');

  // DOM Elements - Setup Form
  const categorySelect = document.getElementById('categorySelect');
  const diffButtons = document.querySelectorAll('.diff-btn');
  const startBtn = document.getElementById('startBtn');
  const startHighScoreEl = document.getElementById('startHighScore');
  const retryBtn = document.getElementById('retryBtn');
  const errorMessageEl = document.getElementById('errorMessage');

  // DOM Elements - Gameplay HUD
  const hudQuestionNum = document.getElementById('hudQuestionNum');
  const hudScore = document.getElementById('hudScore');
  const hudStreak = document.getElementById('hudStreak');
  const hudLives = document.getElementById('hudLives');
  const timerBar = document.getElementById('timerBar');
  const questionCategory = document.getElementById('questionCategory');
  const questionText = document.getElementById('questionText');
  const answersGrid = document.getElementById('answersGrid');
  const answerButtons = document.querySelectorAll('.arcade-answer-btn');
  const scorePopup = document.getElementById('scorePopup');

  // DOM Elements - Game Over Screen
  const gameOverTitle = document.getElementById('gameOverTitle');
  const gameOverSub = document.getElementById('gameOverSub');
  const resCorrect = document.getElementById('resCorrect');
  const resScore = document.getElementById('resScore');
  const resHighScore = document.getElementById('resHighScore');
  const newRecordBadge = document.getElementById('newRecordBadge');
  const playAgainBtn = document.getElementById('playAgainBtn');

  // Audio Toggle
  const soundToggle = document.getElementById('soundToggle');
  const soundIcon = document.getElementById('soundIcon');
  let soundEnabled = true;

  // Game State Variables
  const TOTAL_QUESTIONS = 10;
  const QUESTION_TIME_SECONDS = 15;
  const STORAGE_HIGH_SCORE_KEY = 'trivia_arcade_highscore_v1';

  let currentDifficulty = 'medium';
  let questions = [];
  let currentIndex = 0;
  let score = 0;
  let lives = 3;
  let streak = 0;
  let correctCount = 0;
  let timerInterval = null;
  let timeLeftMs = 0;
  let isAnswerLocked = false;
  let currentCorrectAnswer = '';

  // -----------------------------------------------------------------------
  // RETRO 8-BIT SOUND SYNTHESIZER (Web Audio API)
  // -----------------------------------------------------------------------
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, delay = 0) {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const startTime = audioCtx.currentTime + delay;
      
      osc.type = type; // 'square', 'triangle', 'sawtooth'
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      // Audio fallback silent
    }
  }

  function sfxCoin() {
    initAudio();
    playTone(987.77, 'square', 0.08, 0);       // B5
    playTone(1318.51, 'square', 0.28, 0.08);   // E6
  }

  function sfxCorrect() {
    initAudio();
    playTone(523.25, 'triangle', 0.08, 0);     // C5
    playTone(659.25, 'triangle', 0.08, 0.07);  // E5
    playTone(783.99, 'triangle', 0.08, 0.14);  // G5
    playTone(1046.50, 'square', 0.22, 0.21);   // C6
  }

  function sfxWrong() {
    initAudio();
    playTone(220.00, 'sawtooth', 0.12, 0);     // A3
    playTone(146.83, 'sawtooth', 0.28, 0.10);  // D3
  }

  function sfxGameOver() {
    initAudio();
    playTone(392.00, 'sawtooth', 0.18, 0);
    playTone(329.63, 'sawtooth', 0.18, 0.18);
    playTone(261.63, 'sawtooth', 0.35, 0.36);
  }

  function sfxVictory() {
    initAudio();
    playTone(523.25, 'square', 0.1, 0);
    playTone(659.25, 'square', 0.1, 0.1);
    playTone(783.99, 'square', 0.1, 0.2);
    playTone(1046.50, 'square', 0.15, 0.3);
    playTone(1318.51, 'square', 0.35, 0.45);
  }

  // Toggle Sound Button
  soundToggle.addEventListener('click', () => {
    initAudio();
    soundEnabled = !soundEnabled;
    soundIcon.innerHTML = soundEnabled ? '&#128266;' : '&#128263;';
    soundToggle.innerHTML = `${soundIcon.outerHTML} SOUND: ${soundEnabled ? 'ON' : 'OFF'}`;
    if (soundEnabled) playTone(880, 'triangle', 0.1);
  });

  // -----------------------------------------------------------------------
  // HIGH SCORE HANDLING (localStorage)
  // -----------------------------------------------------------------------
  function getStoredHighScore() {
    try {
      const val = localStorage.getItem(STORAGE_HIGH_SCORE_KEY);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveHighScore(newScore) {
    try {
      const cur = getStoredHighScore();
      if (newScore > cur) {
        localStorage.setItem(STORAGE_HIGH_SCORE_KEY, newScore.toString());
        return true;
      }
    } catch (e) {}
    return false;
  }

  function formatScore(n) {
    return n.toString().padStart(6, '0');
  }

  function updateStartScreenHighScore() {
    const hs = getStoredHighScore();
    startHighScoreEl.textContent = formatScore(hs);
  }

  // -----------------------------------------------------------------------
  // SCREEN TRANSITIONS
  // -----------------------------------------------------------------------
  function switchScreen(target) {
    [screenStart, screenLoading, screenError, screenGame, screenGameOver].forEach(s => {
      s.classList.remove('active');
    });
    target.classList.add('active');
  }

  // -----------------------------------------------------------------------
  // DIFFICULTY BUTTONS
  // -----------------------------------------------------------------------
  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.dataset.diff;
      initAudio();
      playTone(440, 'triangle', 0.05);
    });
  });

  // -----------------------------------------------------------------------
  // LOAD CATEGORIES FROM BACKEND
  // -----------------------------------------------------------------------
  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      if (data && data.trivia_categories) {
        categorySelect.innerHTML = '<option value="">Any Category (Random)</option>';
        data.trivia_categories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat.id;
          opt.textContent = cat.name;
          categorySelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Could not load categories list, default selection will be used.');
    }
  }

  // -----------------------------------------------------------------------
  // FETCH QUESTIONS FROM BACKEND
  // -----------------------------------------------------------------------
  async function fetchQuestions() {
    switchScreen(screenLoading);
    const category = categorySelect.value;
    const url = `/api/questions?category=${encodeURIComponent(category)}&difficulty=${encodeURIComponent(currentDifficulty)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data.status === 'error' || !data.results || data.results.length === 0) {
        throw new Error(data.message || 'The arcade machine is out of order. Check your internet and try again');
      }

      questions = data.results.slice(0, TOTAL_QUESTIONS);
      startRound();
    } catch (err) {
      errorMessageEl.textContent = err.message || 'The arcade machine is out of order. Check your internet and try again';
      switchScreen(screenError);
      sfxWrong();
    }
  }

  // Retry Button on error screen
  retryBtn.addEventListener('click', () => {
    fetchQuestions();
  });

  // -----------------------------------------------------------------------
  // START ROUND
  // -----------------------------------------------------------------------
  function startRound() {
    currentIndex = 0;
    score = 0;
    lives = 3;
    streak = 0;
    correctCount = 0;
    updateHUD();
    switchScreen(screenGame);
    showQuestion();
  }

  function updateHUD() {
    hudQuestionNum.textContent = `${(currentIndex + 1).toString().padStart(2, '0')}/${TOTAL_QUESTIONS}`;
    hudScore.textContent = formatScore(score);
    hudStreak.textContent = `x${streak}`;
    
    // Render 3 hearts
    let hearts = '';
    for (let i = 0; i < 3; i++) {
      hearts += i < lives ? '❤️ ' : '🖤 ';
    }
    hudLives.textContent = hearts.trim();
  }

  // -----------------------------------------------------------------------
  // DISPLAY QUESTION
  // -----------------------------------------------------------------------
  function showQuestion() {
    if (currentIndex >= questions.length || lives <= 0) {
      endGame();
      return;
    }

    isAnswerLocked = false;
    updateHUD();

    const q = questions[currentIndex];
    currentCorrectAnswer = q.correct_answer;

    questionCategory.textContent = q.category.toUpperCase();
    questionText.textContent = q.question;

    // Combine & shuffle answers
    const answers = [q.correct_answer, ...q.incorrect_answers];
    shuffleArray(answers);

    // Populate buttons
    answerButtons.forEach((btn, idx) => {
      btn.className = `arcade-answer-btn btn-${['cyan', 'magenta', 'amber', 'lime'][idx]}`;
      btn.disabled = false;
      const textSpan = btn.querySelector('.btn-text');
      if (idx < answers.length) {
        btn.style.display = 'flex';
        textSpan.textContent = answers[idx];
        btn.dataset.answer = answers[idx];
      } else {
        btn.style.display = 'none';
      }
    });

    startTimer();
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // -----------------------------------------------------------------------
  // 15-SECOND COUNTDOWN TIMER
  // -----------------------------------------------------------------------
  function startTimer() {
    clearInterval(timerInterval);
    const totalDurationMs = QUESTION_TIME_SECONDS * 1000;
    timeLeftMs = totalDurationMs;

    timerBar.className = 'timer-bar';
    timerBar.style.width = '100%';

    const startTime = performance.now();

    timerInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      timeLeftMs = Math.max(0, totalDurationMs - elapsed);
      const pct = (timeLeftMs / totalDurationMs) * 100;
      timerBar.style.width = `${pct}%`;

      if (pct <= 25) {
        timerBar.className = 'timer-bar danger';
      } else if (pct <= 50) {
        timerBar.className = 'timer-bar warning';
      } else {
        timerBar.className = 'timer-bar';
      }

      if (timeLeftMs <= 0) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 50);
  }

  function stopTimer() {
    clearInterval(timerInterval);
  }

  // -----------------------------------------------------------------------
  // ANSWER HANDLING
  // -----------------------------------------------------------------------
  function handleAnswer(selectedBtn) {
    if (isAnswerLocked) return;
    isAnswerLocked = true;
    stopTimer();

    const chosen = selectedBtn.dataset.answer;
    const isCorrect = chosen === currentCorrectAnswer;

    // Lock all buttons
    answerButtons.forEach(b => (b.disabled = true));

    if (isCorrect) {
      handleCorrect(selectedBtn);
    } else {
      handleWrong(selectedBtn);
    }

    setTimeout(() => {
      currentIndex++;
      if (lives > 0 && currentIndex < questions.length) {
        showQuestion();
      } else {
        endGame();
      }
    }, 1450);
  }

  function handleTimeout() {
    if (isAnswerLocked) return;
    isAnswerLocked = true;
    answerButtons.forEach(b => (b.disabled = true));

    // Screen shake and red flash
    triggerScreenEffect('shake', 'flash-red');
    sfxWrong();

    streak = 0;
    lives = Math.max(0, lives - 1);
    updateHUD();

    // Reveal correct answer in green
    answerButtons.forEach(b => {
      if (b.dataset.answer === currentCorrectAnswer) {
        b.classList.add('correct-choice');
      }
    });

    setTimeout(() => {
      currentIndex++;
      if (lives > 0 && currentIndex < questions.length) {
        showQuestion();
      } else {
        endGame();
      }
    }, 1600);
  }

  function handleCorrect(btn) {
    btn.classList.add('correct-choice');
    triggerScreenEffect('flash-green');
    sfxCorrect();

    correctCount++;
    streak++;

    // Calculate score: Base (100) + Speed Bonus (remaining seconds * 10) + Streak Bonus
    const remainingSeconds = Math.ceil(timeLeftMs / 1000);
    const speedBonus = remainingSeconds * 10;
    const streakBonus = (streak - 1) * 25;
    const totalAward = 100 + speedBonus + streakBonus;

    score += totalAward;
    updateHUD();

    // Show floating score animation
    showScorePopup(`+${totalAward}`);
  }

  function handleWrong(btn) {
    btn.classList.add('wrong-choice');
    triggerScreenEffect('shake', 'flash-red');
    sfxWrong();

    streak = 0;
    lives = Math.max(0, lives - 1);
    updateHUD();

    // Highlight correct answer in green
    answerButtons.forEach(b => {
      if (b.dataset.answer === currentCorrectAnswer) {
        b.classList.add('correct-choice');
      }
    });
  }

  function triggerScreenEffect(...effectClasses) {
    effectClasses.forEach(cls => {
      screenGlass.classList.remove(cls);
      void screenGlass.offsetWidth; // Force reflow
      screenGlass.classList.add(cls);
    });
    setTimeout(() => {
      effectClasses.forEach(cls => screenGlass.classList.remove(cls));
    }, 550);
  }

  function showScorePopup(text) {
    scorePopup.textContent = text;
    scorePopup.classList.remove('pop');
    void scorePopup.offsetWidth;
    scorePopup.classList.add('pop');
  }

  // -----------------------------------------------------------------------
  // GAME OVER / END SCREEN
  // -----------------------------------------------------------------------
  function endGame() {
    stopTimer();
    const isWin = lives > 0 && correctCount >= 7;

    if (isWin) {
      gameOverTitle.textContent = 'STAGE CLEARED!';
      gameOverTitle.className = 'gameover-title win';
      gameOverSub.textContent = `EXCELLENT RUN // ${correctCount}/${TOTAL_QUESTIONS} CLEARED`;
      sfxVictory();
    } else {
      gameOverTitle.textContent = 'GAME OVER';
      gameOverTitle.className = 'gameover-title';
      gameOverSub.textContent = lives <= 0 ? 'ALL LIVES LOST // INSERT COIN' : 'ROUND FINISHED';
      sfxGameOver();
    }

    resCorrect.textContent = `${correctCount} / ${TOTAL_QUESTIONS}`;
    resScore.textContent = formatScore(score);

    const isNewHigh = saveHighScore(score);
    const finalHigh = getStoredHighScore();
    resHighScore.textContent = formatScore(finalHigh);

    if (isNewHigh && score > 0) {
      newRecordBadge.classList.remove('hidden');
    } else {
      newRecordBadge.classList.add('hidden');
    }

    switchScreen(screenGameOver);
  }

  // -----------------------------------------------------------------------
  // EVENT LISTENERS
  // -----------------------------------------------------------------------
  // Answer buttons click
  answerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      handleAnswer(btn);
    });
  });

  // Keyboard shortcut listeners (1-4 or A-D)
  window.addEventListener('keydown', e => {
    if (screenGame.classList.contains('active') && !isAnswerLocked) {
      const key = e.key.toUpperCase();
      let targetIndex = -1;
      if (key === '1' || key === 'A') targetIndex = 0;
      if (key === '2' || key === 'B') targetIndex = 1;
      if (key === '3' || key === 'C') targetIndex = 2;
      if (key === '4' || key === 'D') targetIndex = 3;

      if (targetIndex >= 0 && targetIndex < answerButtons.length) {
        const btn = answerButtons[targetIndex];
        if (btn.style.display !== 'none' && !btn.disabled) {
          handleAnswer(btn);
        }
      }
    }
  });

  // Start Button
  startBtn.addEventListener('click', () => {
    sfxCoin();
    fetchQuestions();
  });

  // Play Again Button
  playAgainBtn.addEventListener('click', () => {
    updateStartScreenHighScore();
    switchScreen(screenStart);
    sfxCoin();
  });

  // -----------------------------------------------------------------------
  // INITIALIZATION ON PAGE LOAD
  // -----------------------------------------------------------------------
  updateStartScreenHighScore();
  loadCategories();
})();
