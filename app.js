/**
 * NumberOrder Quest - Core Educational Game Engine
 * Implements Singapore MOE P1 Syllabus: Ordering Numbers up to 200.
 * Designed with a premium custom Audio Synth, TTS Speech, 5 narrative scenes, and a 100-question practice engine.
 */

// --- GLOBAL GAME STATE & CONSTANTS ---
const GAME_STATE = {
  explorerName: "Alex",
  currentStars: 0,
  currentStreak: 0,
  bestScore: 0,
  totalSessionsPlayed: 0,
  unlockedBadges: [],
  scenesCompleted: {
    scene_1: false,
    scene_2: false,
    scene_3: false,
    scene_4: false,
    scene_5: false
  },
  
  // Active state
  activeScreen: "screenLanding",
  activeSceneId: null,
  activeSceneStep: 1,
  
  // Practice session state
  practiceQuestions: [],
  currentQuestionIndex: 0,
  currentQuestionAttempts: 0,
  answersRecord: {}, // Keyed by question ID
  selectedAnswer: null, // For MCQ or clicks
  draggedElement: null, // For DND
  
  // Settings
  audioMuted: false,
  sfxMuted: false,
  ttsEnabled: true,
  
  // API Syncing
  apiServerUrl: "http://localhost:5000",
  isOnline: false
};

// Badges specification matching the milestones
const BADGES = [
  { id: "scene_1", title: "River Builder", desc: "Completed the River Crossing Scene!", icon: "🌉" },
  { id: "scene_2", title: "Peak Climber", desc: "Safely descended the Mountain Climb Scene!", icon: "🏔️" },
  { id: "scene_3", title: "Stone Finder", desc: "Located the Missing Stepping Stone Scene!", icon: "🔍" },
  { id: "scene_4", title: "Gem Master", desc: "Sorted the Cave Gems in Scene 4!", icon: "💎" },
  { id: "scene_5", title: "Tower Emperor", desc: "Mastered place value up to 200 in Scene 5!", icon: "🏰" },
  { id: "milestone_10", title: "Number Apprentice", desc: "Completed 10 practice questions!", icon: "⭐" },
  { id: "milestone_30", title: "Sequence Explorer", desc: "Completed 30 practice questions!", icon: "🧭" },
  { id: "milestone_50", title: "Order Hero", desc: "Completed 50 practice questions!", icon: "🛡️" },
  { id: "milestone_80", title: "Place Value Knight", desc: "Completed 80 practice questions!", icon: "⚔️" },
  { id: "milestone_100", title: "NumberOrder Sage", desc: "Conquered all 100 questions of the Quest!", icon: "👑" },
  { id: "streak_5", title: "Hot Streak", desc: "Answered 5 questions correctly in a row!", icon: "🔥" }
];

// Seeded Random Number Generator for reproducible question sets
class SeededRNG {
  constructor(seedStr) {
    this.seed = this.hashString(seedStr || String(Math.random()));
  }
  hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }
}

// --- WEB AUDIO API GRAPHIC SYNTHESIZER ---
let audioCtx = null;
let bgMusicInterval = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Synth engine for cute 8-bit sound effects
const SynthEngine = {
  playTone(freq, type, duration, delay = 0, volume = 0.15) {
    if (GAME_STATE.sfxMuted) return;
    initAudioContext();
    
    setTimeout(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }, delay * 1000);
  },
  
  playClick() {
    this.playTone(600, 'sine', 0.1, 0, 0.1);
  },
  
  playCorrect() {
    // Joyous arpeggio C4 -> E4 -> G4 -> C5
    this.playTone(261.63, 'sine', 0.15, 0, 0.15);
    this.playTone(329.63, 'sine', 0.15, 0.08, 0.15);
    this.playTone(392.00, 'sine', 0.15, 0.16, 0.15);
    this.playTone(523.25, 'sine', 0.3, 0.24, 0.2);
  },
  
  playWrong() {
    // Low buzzer slide down
    if (GAME_STATE.sfxMuted) return;
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.4);
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  },
  
  playBadgeUnlock() {
    // Majestic fanfare
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.2, idx * 0.08, 0.15);
    });
  },

  playMiniTick() {
    this.playTone(800, 'sine', 0.05, 0, 0.05);
  },
  
  startBackgroundMusic() {
    if (bgMusicInterval) clearInterval(bgMusicInterval);
    if (GAME_STATE.audioMuted) return;
    
    // Playful, soft marimba chord progression loop using Web Audio API
    let step = 0;
    const melody = [
      [261.63, 329.63], // C, E
      [293.66, 349.23], // D, F
      [329.63, 392.00], // E, G
      [349.23, 440.00], // F, A
      [392.00, 493.88], // G, B
      [349.23, 440.00], // F, A
      [329.63, 392.00], // E, G
      [293.66, 349.23], // D, F
    ];
    
    bgMusicInterval = setInterval(() => {
      if (GAME_STATE.audioMuted) return;
      const notes = melody[step % melody.length];
      // Play a soft bell synth arpeggio
      this.playTone(notes[0], 'sine', 0.6, 0, 0.04);
      this.playTone(notes[1], 'sine', 0.6, 0.15, 0.04);
      step++;
    }, 800);
  },
  
  stopBackgroundMusic() {
    if (bgMusicInterval) {
      clearInterval(bgMusicInterval);
      bgMusicInterval = null;
    }
  }
};

// --- TEXT TO SPEECH (TTS) NARRATION SYSTEM ---
const TTSEngine = {
  currentAudio: null,

  speak(text) {
    if (!GAME_STATE.ttsEnabled) return;
    
    // Stop any playing audio
    this.stop();
    
    // Build target route relative to host
    const ttsUrl = `/api/tts?text=${encodeURIComponent(text)}`;
    this.currentAudio = new Audio(ttsUrl);
    
    // Set fallback on error
    this.currentAudio.onerror = (e) => {
      console.warn("ElevenLabs cloud TTS failed. Falling back to native SpeechSynthesis.", e);
      this.speakNative(text);
    };
    
    this.currentAudio.play().catch(err => {
      console.warn("Audio auto-play failed. Falling back to native SpeechSynthesis.", err);
      this.speakNative(text);
    });
  },

  speakNative(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // Prefer bright, friendly female voices for kids
    let bestVoice = 
      voices.find(v => v.name.includes("Samantha")) ||          // macOS/iOS - warm & clear
      voices.find(v => v.name.includes("Karen")) ||              // Australian - friendly
      voices.find(v => v.name.includes("Google UK English Female")) ||
      voices.find(v => v.name.includes("Microsoft Zira")) ||     // Windows friendly female
      voices.find(v => v.name.includes("Google US English")) ||
      voices.find(v => v.lang.includes("en-SG")) ||
      voices.find(v => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ||
      voices.find(v => v.lang.startsWith("en"));
    
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    utterance.rate = 0.80;   // Slower — easier for 6-7 year olds to follow
    utterance.pitch = 1.35;  // Higher & more cheerful / child-friendly
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  },

  stop() {
    if (this.currentAudio) {
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio.load();
      this.currentAudio = null;
    }
    window.speechSynthesis.cancel();
  }
};

// Proactively load voices
window.speechSynthesis.onvoiceschanged = () => {};

// --- API SYNCING ENGINE ---
const ApiService = {
  async checkConnection() {
    try {
      const response = await fetch(`${GAME_STATE.apiServerUrl}/`, { method: 'GET' });
      if (response.ok) {
        GAME_STATE.isOnline = true;
        document.getElementById("apiStatus").innerHTML = `
          <span class="status-dot online"></span>
          <span class="status-text">Intellia SG Cloud Connected</span>
        `;
      } else {
        throw new Error();
      }
    } catch (e) {
      GAME_STATE.isOnline = false;
      document.getElementById("apiStatus").innerHTML = `
        <span class="status-dot"></span>
        <span class="status-text">Local Sync Mode</span>
      `;
    }
  },

  async getProgress(userId) {
    if (!GAME_STATE.isOnline) {
      this.loadLocalProgress(userId);
      return;
    }
    try {
      const response = await fetch(`${GAME_STATE.apiServerUrl}/api/get-progress?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        GAME_STATE.scenesCompleted = data.scenesCompleted || GAME_STATE.scenesCompleted;
        GAME_STATE.unlockedBadges = data.badgesUnlocked || [];
        GAME_STATE.totalSessionsPlayed = data.totalSessionsPlayed || 0;
        GAME_STATE.bestScore = data.bestScore || 0;
        this.saveLocalBackup(userId);
      }
    } catch (error) {
      this.loadLocalProgress(userId);
    }
  },

  async saveScore(userId, score, seed, answers) {
    GAME_STATE.totalSessionsPlayed += 1;
    GAME_STATE.bestScore = Math.max(GAME_STATE.bestScore, score);
    this.saveLocalBackup(userId);
    
    if (!GAME_STATE.isOnline) return;
    try {
      await fetch(`${GAME_STATE.apiServerUrl}/api/save-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, score, seed, answers })
      });
    } catch (e) {
      console.warn("Could not save score to cloud API, cached locally.");
    }
  },

  async logEvent(userId, eventName, data = {}) {
    if (!GAME_STATE.isOnline) return;
    try {
      await fetch(`${GAME_STATE.apiServerUrl}/api/log-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, event: eventName, data })
      });
    } catch (e) {}
  },

  saveLocalBackup(userId) {
    const key = `numberorder_quest_${userId}`;
    const payload = {
      scenesCompleted: GAME_STATE.scenesCompleted,
      unlockedBadges: GAME_STATE.unlockedBadges,
      totalSessionsPlayed: GAME_STATE.totalSessionsPlayed,
      bestScore: GAME_STATE.bestScore,
      currentStars: GAME_STATE.currentStars
    };
    localStorage.setItem(key, JSON.stringify(payload));
  },

  loadLocalProgress(userId) {
    const key = `numberorder_quest_${userId}`;
    const local = localStorage.getItem(key);
    if (local) {
      try {
        const data = JSON.parse(local);
        GAME_STATE.scenesCompleted = data.scenesCompleted || GAME_STATE.scenesCompleted;
        GAME_STATE.unlockedBadges = data.unlockedBadges || [];
        GAME_STATE.totalSessionsPlayed = data.totalSessionsPlayed || 0;
        GAME_STATE.bestScore = data.bestScore || 0;
        GAME_STATE.currentStars = data.currentStars || 0;
      } catch (e) {}
    }
  }
};

// --- PRACTICE QUESTION GENERATION ENGINE (100 Scaffolded Questions) ---
const QuestionGenerator = {
  generateSession(studentName) {
    const rngObj = new SeededRNG(studentName + "_" + Date.now());
    const rng = rngObj.seed;
    const questions = [];
    
    // Distribution matching the PRD syllabus count
    // 100 questions rotated by type
    const types = [
      "DRAG_ORDER_3_ASC", "DRAG_ORDER_3_DESC", "NUMBER_LINE_BLANK",
      "IDENTIFY_SMALLEST", "IDENTIFY_GREATEST", "BEFORE_AFTER",
      "DRAG_ORDER_4_ASC", "DRAG_ORDER_4_DESC", "MCQ_ASC_LIST", "WORD_PROBLEM"
    ];
    
    // Generate 100 questions sequentially rotating type to ensure zero adjacent duplicates
    for (let i = 1; i <= 100; i++) {
      const type = types[(i - 1) % types.length];
      
      // Map index to difficulty level
      let level = 1;
      let minVal = 1, maxVal = 99;
      if (i > 30 && i <= 70) {
        level = 2;
        minVal = 50;
        maxVal = 150;
      } else if (i > 70) {
        level = 3;
        minVal = 100;
        maxVal = 200;
      }
      
      const q = this.createQuestion(i, type, level, minVal, maxVal, rng);
      questions.push(q);
    }
    
    return questions;
  },
  
  createQuestion(index, type, level, minVal, maxVal, rng) {
    const id = `q_${index}`;
    let numbers = [];
    let prompt = "";
    let answerType = "mcq";
    let correctAnswer = null;
    let options = [];
    let hint = "";
    let explanation = "";
    
    // Helper to generate N random unique numbers in a range
    function getUniqueNumbers(count, min, max) {
      const set = new Set();
      while (set.size < count) {
        set.add(Math.floor(rng() * (max - min + 1)) + min);
      }
      return Array.from(set);
    }

    switch(type) {
      case "DRAG_ORDER_3_ASC":
        numbers = getUniqueNumbers(3, minVal, maxVal);
        prompt = "Arrange these stones from smallest to greatest (ascending order)!";
        answerType = "drag-order";
        correctAnswer = [...numbers].sort((a,b) => a - b);
        hint = "Look at the first digit (Hundreds) then the Tens. Find the smallest first!";
        explanation = `The correct ascending order is ${correctAnswer.join(", ")} because ${correctAnswer[0]} is less than ${correctAnswer[1]}, which is less than ${correctAnswer[2]}.`;
        break;
        
      case "DRAG_ORDER_3_DESC":
        numbers = getUniqueNumbers(3, minVal, maxVal);
        prompt = "Arrange these stones from greatest to smallest (descending order)!";
        answerType = "drag-order";
        correctAnswer = [...numbers].sort((a,b) => b - a);
        hint = "Find the biggest number first and place it in the first slot!";
        explanation = `The correct descending order is ${correctAnswer.join(", ")} because ${correctAnswer[0]} is greater than ${correctAnswer[1]}, which is greater than ${correctAnswer[2]}.`;
        break;
        
      case "NUMBER_LINE_BLANK":
        // Generate an arithmetic progression (steps of 1, 2, 5, or 10)
        const step = [1, 2, 5, 10][Math.floor(rng() * 4)];
        const start = Math.floor(rng() * (maxVal - minVal - 4 * step)) + minVal;
        numbers = Array.from({length: 5}, (_, idx) => start + idx * step);
        const blankIdx = 2 + Math.floor(rng() * 3); // Blank spot (index 2, 3, or 4)
        correctAnswer = numbers[blankIdx];
        numbers[blankIdx] = null; // Blank it out
        
        prompt = `What is the missing number on this sequence path?`;
        answerType = "fill-blank";
        hint = `Count the jump step! The difference between visible stones is ${step}.`;
        explanation = `The sequence goes up by ${step} each step. So, ${numbers[blankIdx-1]} + ${step} = ${correctAnswer}.`;
        break;
        
      case "IDENTIFY_SMALLEST":
        numbers = getUniqueNumbers(4, minVal, maxVal);
        prompt = "Which of these numbers is the smallest?";
        answerType = "click-select";
        correctAnswer = Math.min(...numbers);
        hint = "Compare the Tens column first. If they are equal, compare the Ones column!";
        explanation = `${correctAnswer} is the smallest among ${numbers.join(", ")} because it has the lowest value.`;
        break;
        
      case "IDENTIFY_GREATEST":
        numbers = getUniqueNumbers(4, minVal, maxVal);
        prompt = "Which of these numbers is the greatest?";
        answerType = "click-select";
        correctAnswer = Math.max(...numbers);
        hint = "Look for the number with the most Hundreds, Tens, and Ones!";
        explanation = `${correctAnswer} is the greatest among ${numbers.join(", ")} because it has the highest value.`;
        break;
        
      case "BEFORE_AFTER":
        const target = Math.floor(rng() * (maxVal - minVal - 2)) + minVal + 1;
        const isBefore = rng() > 0.5;
        if (isBefore) {
          prompt = `What number comes just before ${target}?`;
          correctAnswer = target - 1;
          hint = `Subtract 1 from ${target} to find the number that comes just before.`;
          explanation = `${correctAnswer} comes just before ${target} when counting.`;
        } else {
          prompt = `What number comes just after ${target}?`;
          correctAnswer = target + 1;
          hint = `Add 1 to ${target} to find the number that comes just after.`;
          explanation = `${correctAnswer} comes just after ${target} when counting.`;
        }
        answerType = "mcq";
        //distractors
        options = [correctAnswer, correctAnswer + 2, correctAnswer - 2, target + 5].sort(() => rng() - 0.5);
        break;
        
      case "DRAG_ORDER_4_ASC":
        numbers = getUniqueNumbers(4, minVal, maxVal);
        prompt = "Put these 4 numbers in order, from smallest to greatest!";
        answerType = "drag-order";
        correctAnswer = [...numbers].sort((a,b) => a - b);
        hint = "Start by picking the absolute smallest, then find the smallest of the remaining ones.";
        explanation = `Ordered ascendingly: ${correctAnswer.join(", ")}.`;
        break;
        
      case "DRAG_ORDER_4_DESC":
        numbers = getUniqueNumbers(4, minVal, maxVal);
        prompt = "Put these 4 numbers in order, from greatest to smallest!";
        answerType = "drag-order";
        correctAnswer = [...numbers].sort((a,b) => b - a);
        hint = "Start with the biggest number, then fill down to the smallest.";
        explanation = `Ordered descendingly: ${correctAnswer.join(", ")}.`;
        break;
        
      case "MCQ_ASC_LIST":
        // Ascending list vs descending/jumbled lists
        const listCorrect = getUniqueNumbers(3, minVal, maxVal).sort((a,b) => a - b);
        const listWrong1 = [...listCorrect].sort((a,b) => b - a); // Descending
        const listWrong2 = [listCorrect[1], listCorrect[0], listCorrect[2]]; // Jumbled
        
        prompt = "Which lists of numbers is correctly arranged in ascending order?";
        answerType = "mcq";
        correctAnswer = listCorrect.join(" → ");
        options = [
          listCorrect.join(" → "),
          listWrong1.join(" → "),
          listWrong2.join(" → ")
        ].sort(() => rng() - 0.5);
        
        hint = "Check each list from left to right. The numbers must get bigger each step.";
        explanation = `The list ${correctAnswer} is ascending because each number is larger than the previous one.`;
        break;
        
      case "WORD_PROBLEM":
        // Child friendly Singapore theme
        const names = ["Raju", "Mei", "Siti", "Dan"];
        const fruits = ["mangosteens", "rambutans", "durians", "coconuts"];
        const chosenFruits = fruits[Math.floor(rng() * fruits.length)];
        numbers = getUniqueNumbers(3, minVal, maxVal);
        
        prompt = `${names[0]} has ${numbers[0]} ${chosenFruits}. ${names[1]} has ${numbers[1]} ${chosenFruits}. ${names[2]} has ${numbers[2]} ${chosenFruits}. Arrange their fruit count in ascending order!`;
        answerType = "drag-order";
        correctAnswer = [...numbers].sort((a,b) => a - b);
        hint = "Arrange the counts from the smallest fruit stack to the largest stack!";
        explanation = `Ascending fruit counts: ${correctAnswer.join(", ")} ${chosenFruits}.`;
        break;
    }
    
    return { id, type, level, numbers, prompt, answerType, correctAnswer, options, hint, explanation };
  }
};

// --- CONFETTI ANIMATION SYSTEM ---
const ConfettiEffect = {
  canvas: null,
  ctx: null,
  particles: [],
  active: false,
  
  init() {
    this.canvas = document.getElementById("confettiCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },
  
  resize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  },
  
  burst() {
    this.initAudioContext();
    this.active = true;
    this.particles = [];
    const colors = ["#FFD600", "#FF6B6B", "#29B6F6", "#66BB6A", "#7E57C2"];
    
    for (let i = 0; i < 150; i++) {
      this.particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight + 20,
        vx: (Math.random() - 0.5) * 15,
        vy: -Math.random() * 20 - 10,
        size: Math.random() * 8 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 10
      });
    }
    
    if (!this.animating) {
      this.animate();
    }
  },
  
  initAudioContext() {
    initAudioContext();
  },
  
  animate() {
    this.animating = true;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let alive = false;
    
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // gravity
      p.rotation += p.rSpeed;
      
      if (p.y < window.innerHeight + 20) {
        alive = true;
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        this.ctx.restore();
      }
    });
    
    if (alive && this.active) {
      requestAnimationFrame(() => this.animate());
    } else {
      this.animating = false;
    }
  }
};

// --- SCREEN NAVIGATION HANDLERS ---
function showScreen(screenId) {
  GAME_STATE.activeScreen = screenId;
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
  });
  const activeS = document.getElementById(screenId);
  activeS.classList.add("active");
  
  // Custom actions per screen
  if (screenId === "screenHub") {
    renderJourneyHub();
    TTSEngine.speak("Welcome to Zara's Journey Map! Pick an adventure and let's go! Each scene teaches you something new about ordering numbers. You're going to be amazing!");
  } else if (screenId === "screenPractice") {
    GAME_STATE.currentQuestionIndex = 0;
    GAME_STATE.currentStars = 0;
    GAME_STATE.currentStreak = 0;
    GAME_STATE.practiceQuestions = QuestionGenerator.generateSession(GAME_STATE.explorerName);
    loadQuestion(0);
    TTSEngine.speak("Practice time! Let's see how many you can get right! Answer 100 fun questions and win the golden trophy. Ready? Here we go!");
  }
}

// --- LANDING SCREEN INITS ---
document.getElementById("btnStartGame").addEventListener("click", () => {
  const nameInput = document.getElementById("studentName").value.trim();
  GAME_STATE.explorerName = nameInput || "Alex";
  
  SynthEngine.playClick();
  initAudioContext();
  SynthEngine.startBackgroundMusic();
  
  // Load progress
  ApiService.getProgress(GAME_STATE.explorerName).then(() => {
    showScreen("screenHub");
  });
});

document.getElementById("btnBackToLanding").addEventListener("click", () => {
  SynthEngine.playClick();
  SynthEngine.stopBackgroundMusic();
  showScreen("screenLanding");
});

document.getElementById("btnSkipToPractice").addEventListener("click", () => {
  SynthEngine.playClick();
  showScreen("screenPractice");
});

// --- AUDIO MUTING CONTROLS ---
document.getElementById("musicToggle").addEventListener("click", function() {
  GAME_STATE.audioMuted = !GAME_STATE.audioMuted;
  this.classList.toggle("muted", GAME_STATE.audioMuted);
  if (GAME_STATE.audioMuted) {
    SynthEngine.stopBackgroundMusic();
  } else {
    SynthEngine.startBackgroundMusic();
  }
});

document.getElementById("sfxToggle").addEventListener("click", function() {
  GAME_STATE.sfxMuted = !GAME_STATE.sfxMuted;
  this.classList.toggle("muted", GAME_STATE.sfxMuted);
});

document.getElementById("ttsToggle").addEventListener("click", function() {
  GAME_STATE.ttsEnabled = !GAME_STATE.ttsEnabled;
  this.classList.toggle("muted", !GAME_STATE.ttsEnabled);
  if (!GAME_STATE.ttsEnabled) {
    TTSEngine.stop();
  }
});

// --- JOURNEY HUB (LEARNING HUB) BUILDER ---
function renderJourneyHub() {
  document.getElementById("hubStars").innerText = GAME_STATE.currentStars;
  
  // Set locks on cards sequentially
  const sequence = ["scene_1", "scene_2", "scene_3", "scene_4", "scene_5"];
  
  sequence.forEach((sceneId, index) => {
    const card = document.getElementById(`cardScene${index + 1}`);
    const isCompleted = GAME_STATE.scenesCompleted[sceneId];
    
    // Determine lock state: first is unlocked, or previous sequence item is completed
    let isUnlocked = index === 0 || GAME_STATE.scenesCompleted[sequence[index - 1]];
    
    card.className = "scene-card";
    if (isCompleted) {
      card.classList.add("completed");
      card.querySelector(".scene-status").innerHTML = `<span class="status-badge"><i class="fas fa-check-circle"></i> Completed</span>`;
    } else if (isUnlocked) {
      card.classList.add("unlocked");
      card.querySelector(".scene-status").innerHTML = `<span class="status-badge"><i class="fas fa-unlock"></i> Play Now</span>`;
    } else {
      card.classList.add("locked");
      card.querySelector(".scene-status").innerHTML = `<span class="status-badge"><i class="fas fa-lock"></i> Locked</span>`;
    }
    
    // Add Click listener if unlocked
    card.onclick = () => {
      if (isUnlocked || isCompleted) {
        SynthEngine.playClick();
        startScene(index + 1);
      } else {
        SynthEngine.playWrong();
        TTSEngine.speak("This scene is locked. Complete the previous scenes first!");
      }
    };
  });
}

// --- SCENE PLAYER ENGINE ---
function startScene(sceneNum) {
  GAME_STATE.activeSceneId = `scene_${sceneNum}`;
  GAME_STATE.activeSceneStep = 1;
  
  showScreen("screenScenePlayer");
  loadSceneStep();
}

function loadSceneStep() {
  const step = GAME_STATE.activeSceneStep;
  const num = GAME_STATE.activeSceneId.split("_")[1];
  
  document.getElementById("sceneStepCurrent").innerText = step;
  document.getElementById("btnNextSceneStep").disabled = true;
  document.getElementById("sceneExplanation").innerHTML = `<span style="color:#64748b; font-style:italic;">💡 Complete the activity above to see what you learned here!</span>`;
  
  const stage = document.getElementById("sceneStage");
  stage.innerHTML = "";
  
  // Render based on Scene & Step
  if (num == "1") {
    document.getElementById("scenePlayerTitle").innerText = "Scene 1: River of Numbers";
    playScene1(step, stage);
  } else if (num == "2") {
    document.getElementById("scenePlayerTitle").innerText = "Scene 2: Mountain Climb";
    playScene2(step, stage);
  } else if (num == "3") {
    document.getElementById("scenePlayerTitle").innerText = "Scene 3: Missing Stepping Stone";
    playScene3(step, stage);
  } else if (num == "4") {
    document.getElementById("scenePlayerTitle").innerText = "Scene 4: The 4-Gem Sort";
    playScene4(step, stage);
  } else if (num == "5") {
    document.getElementById("scenePlayerTitle").innerText = "Scene 5: The Hundred-Tower";
    playScene5(step, stage);
  }
}

// Exit scene confirmation
document.getElementById("btnExitScene").onclick = () => {
  SynthEngine.playClick();
  TTSEngine.stop();
  showScreen("screenHub");
};

// --- NARRATIVE SCENE IMPLEMENTATIONS ---

// --- SCENE 1: River Crossing ---
function playScene1(step, stage) {
  stage.className = "interactive-stage river-stage";
  stage.innerHTML = `
    <div class="bank bank-top"><span>Target Bank</span></div>
    <div class="river-path">
      <div class="drop-slot" data-slot="0" data-label="Smallest"></div>
      <div class="drop-slot" data-slot="1" data-label="Middle"></div>
      <div class="drop-slot" data-slot="2" data-label="Greatest"></div>
    </div>
    <div class="bank bank-bottom"><span>Start Bank</span></div>
  `;
  
  let instructions = "";
  let stones = [];
  
  if (step === 1) {
    instructions = "Oh no! 🌊 The river is blocking our way! Drag the stepping stones from the SMALLEST number to the BIGGEST number to build our bridge! Let's go, explorer! 🪨➡️🪨➡️🪨";
    stones = [45, 12, 89];
  } else if (step === 2) {
    instructions = "Wow, you are SO good at this! 🌟 Here comes another river! Remember — smallest stone goes FIRST! Can you do it again? You've got this! 💪";
    stones = [91, 23, 67];
  } else {
    instructions = "Last river — you're nearly across! 🎉 Put the stones in order from the TINIEST number to the BIGGEST number. Zara believes in you! 🦁";
    stones = [54, 76, 5];
  }
  
  updateZaraSpeech(instructions);
  
  // Render Tiles
  const tray = document.createElement("div");
  tray.className = "number-tiles-container";
  tray.style.position = "absolute";
  tray.style.bottom = "85px";
  
  stones.forEach(num => {
    const tile = createDragTile(num);
    tray.appendChild(tile);
  });
  stage.appendChild(tray);
  
  setupDndOrderLogic(stones.sort((a,b)=>a-b), () => {
    document.getElementById("sceneExplanation").innerHTML = `🌟 <strong>Amazing bridge building!</strong> When we go from the <em>smallest</em> to the <em>biggest</em> number, that's called <strong>Ascending Order</strong> — just like climbing UP the stairs! ⬆️🪜`;
    document.getElementById("btnNextSceneStep").disabled = false;
  });
}

// --- SCENE 2: Mountain Descent ---
function playScene2(step, stage) {
  stage.className = "interactive-stage mountain-stage";
  stage.innerHTML = `
    <div class="mountain-peak"></div>
    <div class="mountain-slots">
      <div class="mountain-slot-row"><div class="drop-slot" data-slot="0" data-label="Greatest (Top)"></div></div>
      <div class="mountain-slot-row"><div class="drop-slot" data-slot="1" data-label="Middle"></div></div>
      <div class="mountain-slot-row"><div class="drop-slot" data-slot="2" data-label="Smallest (Bottom)"></div></div>
    </div>
  `;
  
  let instructions = "";
  let tiles = [];
  
  if (step === 1) {
    instructions = "Whoa, we're at the top of a mountain! 🏔️ To climb DOWN safely, we need to put the BIGGEST number at the top and the SMALLEST at the bottom. Let's help Zara get down! 🐾";
    tiles = [19, 78, 52];
  } else if (step === 2) {
    instructions = "You're going great! 🌈 Remember — biggest number goes at the TOP of the mountain, and we go DOWN to the smallest! Drag the numbers into the right spots! 🎒";
    tiles = [63, 95, 41];
  } else {
    instructions = "Almost at the bottom — nearly safe! 🎊 One more time: BIGGEST number first at the top, then go DOWN to the smallest. You're a mountain champion! ⛰️🏆";
    tiles = [7, 82, 49];
  }
  
  updateZaraSpeech(instructions);
  
  const tray = document.createElement("div");
  tray.className = "number-tiles-container";
  tray.style.position = "absolute";
  tray.style.bottom = "20px";
  
  tiles.forEach(num => {
    const tile = createDragTile(num);
    tray.appendChild(tile);
  });
  stage.appendChild(tray);
  
  setupDndOrderLogic(tiles.sort((a,b)=>b-a), () => {
    document.getElementById("sceneExplanation").innerHTML = `🏔️ <strong>Superstar descending!</strong> Going from the <em>biggest</em> to the <em>smallest</em> is called <strong>Descending Order</strong> — like going DOWN a mountain or a slide! ⬇️🛝`;
    document.getElementById("btnNextSceneStep").disabled = false;
  });
}

// --- SCENE 3: Missing Stepping Stone ---
function playScene3(step, stage) {
  stage.className = "interactive-stage forest-stage";
  
  let sequence = [];
  let stepVal = 0;
  let missingIdx = 2;
  
  if (step === 1) {
    stepVal = 2;
    sequence = [12, 14, null, 18, 20];
  } else if (step === 2) {
    stepVal = 5;
    sequence = [25, 30, 35, null, 45];
    missingIdx = 3;
  } else {
    stepVal = 10;
    sequence = [60, null, 80, 90, 100];
    missingIdx = 1;
  }
  
  const correctVal = sequence[missingIdx] = sequence[0] + missingIdx * stepVal;
  sequence[missingIdx] = null; // Blank out
  
  updateZaraSpeech(`Uh-oh! 😮 One of our stepping stones has gone missing! Look at the path — the numbers are jumping by ${stepVal} each time. Can you figure out the missing number and tap it? 🔍🪨`);
  
  const pathDiv = document.createElement("div");
  pathDiv.className = "forest-path";
  
  sequence.forEach((val, idx) => {
    const stone = document.createElement("div");
    if (val === null) {
      stone.className = "path-stone missing";
      stone.innerText = "?";
      stone.id = "targetMissingStone";
    } else {
      stone.className = "path-stone";
      stone.innerText = val;
    }
    pathDiv.appendChild(stone);
  });
  stage.appendChild(pathDiv);
  
  // Options
  const optionsDiv = document.createElement("div");
  optionsDiv.className = "path-options";
  
  const candidates = [correctVal, correctVal + stepVal, correctVal - stepVal].sort(() => Math.random() - 0.5);
  candidates.forEach(num => {
    const btn = document.createElement("button");
    btn.className = "btn-option-stone";
    btn.innerText = num;
    btn.onclick = () => {
      if (num === correctVal) {
        SynthEngine.playCorrect();
        document.getElementById("targetMissingStone").innerText = correctVal;
        document.getElementById("targetMissingStone").classList.remove("missing");
        document.getElementById("targetMissingStone").style.background = "#bbf7d0";
        document.getElementById("targetMissingStone").style.borderColor = "var(--color-success)";
        document.getElementById("sceneExplanation").innerHTML = `🎉 <strong>You found it!</strong> The stones jump by <strong>${stepVal}</strong> each time. So the missing stone is <strong>${correctVal}</strong>! Counting in steps like this is called a <em>number pattern</em>! 🐾`;
        document.getElementById("btnNextSceneStep").disabled = false;
        document.querySelectorAll(".btn-option-stone").forEach(b => b.disabled = true);
      } else {
        SynthEngine.playWrong();
        TTSEngine.speak("Hmm, not that one! Look at the stones next to the gap — count the jump and try again! You can do it!");
      }
    };
    optionsDiv.appendChild(btn);
  });
  stage.appendChild(optionsDiv);
}

// --- SCENE 4: The 4-Gem Sort ---
function playScene4(step, stage) {
  stage.className = "interactive-stage cave-stage";
  stage.innerHTML = `
    <div class="gem-tray">
      <div class="gem-slot" data-slot="0"></div>
      <div class="gem-slot" data-slot="1"></div>
      <div class="gem-slot" data-slot="2"></div>
      <div class="gem-slot" data-slot="3"></div>
    </div>
  `;
  
  let gems = [];
  let isAscending = step !== 2; // Steps 1 and 3 ascending, Step 2 descending
  
  if (step === 1) {
    gems = [56, 12, 84, 43];
  } else if (step === 2) {
    gems = [72, 91, 15, 47];
  } else {
    gems = [99, 8, 37, 65];
  }
  
  const sortDirectionText = isAscending ? "smallest to biggest (ascending — going UP! ⬆️)" : "biggest to smallest (descending — going DOWN! ⬇️)";
  updateZaraSpeech(`Sparkly treasure gems! 💎✨ Drag and drop all 4 gems into the tray from ${sortDirectionText} Let's sort these beauties!`);
  
  // Render Gems
  const tray = document.createElement("div");
  tray.className = "number-tiles-container";
  tray.style.position = "absolute";
  tray.style.bottom = "30px";
  
  gems.forEach(val => {
    const gem = document.createElement("div");
    gem.className = "gem-tile";
    gem.innerText = val;
    gem.draggable = true;
    gem.id = `gem_${val}`;
    
    gem.addEventListener("dragstart", (e) => {
      GAME_STATE.draggedElement = gem;
    });
    
    tray.appendChild(gem);
  });
  stage.appendChild(tray);
  
  // Setup Drop Logic
  const slots = stage.querySelectorAll(".gem-slot");
  const currentSlots = Array(4).fill(null);
  
  slots.forEach(slot => {
    slot.addEventListener("dragover", (e) => e.preventDefault());
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      const gem = GAME_STATE.draggedElement;
      if (!gem) return;
      
      const val = parseInt(gem.innerText);
      const idx = parseInt(slot.getAttribute("data-slot"));
      
      slot.appendChild(gem);
      currentSlots[idx] = val;
      SynthEngine.playMiniTick();
      
      // Validate
      const placedCount = currentSlots.filter(x => x !== null).length;
      if (placedCount === 4) {
        const sorted = isAscending ? [...gems].sort((a,b)=>a-b) : [...gems].sort((a,b)=>b-a);
        const correct = currentSlots.every((val, i) => val === sorted[i]);
        
        if (correct) {
          SynthEngine.playCorrect();
          document.getElementById("sceneExplanation").innerHTML = `💎 <strong>Gem sorting master!</strong> All 4 gems are perfectly sorted! You're a true treasure hunter — you can sort numbers in both directions now! 🏆✨`;
          document.getElementById("btnNextSceneStep").disabled = false;
        } else {
          SynthEngine.playWrong();
          TTSEngine.speak("Hmm, the gems are a little mixed up! Try again — you can do it! Remember which direction we're sorting!");
          // Return gems to tray
          setTimeout(() => {
            currentSlots.fill(null);
            slots.forEach(s => s.innerHTML = "");
            tray.innerHTML = "";
            gems.forEach(v => {
              const g = document.createElement("div");
              g.className = "gem-tile";
              g.innerText = v;
              g.draggable = true;
              g.addEventListener("dragstart", () => GAME_STATE.draggedElement = g);
              tray.appendChild(g);
            });
          }, 1500);
        }
      }
    });
  });
}

// --- SCENE 5: The Hundred-Tower ---
function playScene5(step, stage) {
  stage.className = "interactive-stage tower-stage";
  
  let numbers = [];
  if (step === 1) {
    numbers = [123, 142, 105];
  } else if (step === 2) {
    numbers = [164, 182, 139];
  } else {
    numbers = [198, 112, 155];
  }
  
  updateZaraSpeech("Welcome to the Number Tower! 🏰✨ These big numbers all start with 1 hundred! Look at the blocks — the tall flat ones are HUNDREDS, the long rods are TENS, and the little cubes are ONES. Now drag them in order from smallest to biggest!");
  
  const blocksArea = document.createElement("div");
  blocksArea.className = "place-value-interactive";
  
  const display = document.createElement("div");
  display.className = "place-value-display";
  
  numbers.forEach(num => {
    const col = document.createElement("div");
    col.className = "tower-column";
    
    // Hundreds, Tens, Ones counts
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const o = num % 10;
    
    col.innerHTML = `
      <div style="display:flex; gap: 4px; align-items: flex-end;">
        ${Array(h).fill('<div class="block-hundred"></div>').join("")}
        <div style="display:flex; flex-direction:column; gap:2px;">
          ${Array(t).fill('<div class="block-ten"></div>').join("")}
        </div>
        <div style="display:flex; flex-direction:column; gap:2px;">
          ${Array(o).fill('<div class="block-one"></div>').join("")}
        </div>
      </div>
      <div class="tower-title">${num}</div>
    `;
    display.appendChild(col);
  });
  
  blocksArea.appendChild(display);
  stage.appendChild(blocksArea);
  
  // Arrange elements slots
  const slotsDiv = document.createElement("div");
  slotsDiv.style.display = "flex";
  slotsDiv.style.flexDirection = "column";
  slotsDiv.style.justifyContent = "center";
  slotsDiv.style.gap = "15px";
  
  slotsDiv.innerHTML = `
    <div style="display:flex; gap:10px;">
      <div class="drop-slot" data-slot="0" data-label="Smallest"></div>
      <div class="drop-slot" data-slot="1" data-label="Middle"></div>
      <div class="drop-slot" data-slot="2" data-label="Greatest"></div>
    </div>
  `;
  stage.appendChild(slotsDiv);
  
  // Tiles to drag
  const tray = document.createElement("div");
  tray.className = "number-tiles-container";
  tray.style.position = "absolute";
  tray.style.bottom = "20px";
  tray.style.left = "20px";
  
  numbers.forEach(val => {
    const tile = createDragTile(val);
    tray.appendChild(tile);
  });
  stage.appendChild(tray);
  
  setupDndOrderLogic(numbers.sort((a,b)=>a-b), () => {
    document.getElementById("sceneExplanation").innerHTML = `🏰 <strong>Tower champion!</strong> Big numbers like these all have HUNDREDS, TENS, and ONES. By comparing the blocks, you can always figure out which is bigger! You're a <strong>Place Value Pro</strong> now! 🌟`;
    document.getElementById("btnNextSceneStep").disabled = false;
  });
}

// Drag & Drop helper creators
function createDragTile(val) {
  const tile = document.createElement("div");
  tile.className = "number-tile";
  tile.innerText = val;
  tile.draggable = true;
  tile.id = `tile_${val}`;
  
  tile.addEventListener("dragstart", (e) => {
    GAME_STATE.draggedElement = tile;
    tile.classList.add("selected");
  });
  
  tile.addEventListener("dragend", () => {
    tile.classList.remove("selected");
  });
  
  return tile;
}

function setupDndOrderLogic(sortedCorrect, onCompleteCallback) {
  const slots = document.querySelectorAll(".drop-slot");
  const slotsState = Array(sortedCorrect.length).fill(null);
  
  slots.forEach(slot => {
    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      slot.classList.add("hovered");
    });
    
    slot.addEventListener("dragleave", () => {
      slot.classList.remove("hovered");
    });
    
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("hovered");
      
      const tile = GAME_STATE.draggedElement;
      if (!tile) return;
      
      const val = parseInt(tile.innerText);
      const slotIdx = parseInt(slot.getAttribute("data-slot"));
      
      slot.appendChild(tile);
      slotsState[slotIdx] = val;
      SynthEngine.playMiniTick();
      
      // Verify
      const placedCount = slotsState.filter(x => x !== null).length;
      if (placedCount === sortedCorrect.length) {
        const isCorrect = slotsState.every((val, idx) => val === sortedCorrect[idx]);
        if (isCorrect) {
          SynthEngine.playCorrect();
          // Lock them
          document.querySelectorAll(".number-tile").forEach(t => {
            t.draggable = false;
            t.classList.add("correct-tile");
          });
          onCompleteCallback();
        } else {
          SynthEngine.playWrong();
          TTSEngine.speak("Oops! Not quite right — let's try again! Look carefully at the numbers and find the smallest one first. You've got this! 💪");
          
          setTimeout(() => {
            // Reset tiles back to container
            slotsState.fill(null);
            slots.forEach(s => s.innerHTML = "");
            
            const container = document.querySelector(".number-tiles-container");
            container.innerHTML = "";
            sortedCorrect.sort(()=>Math.random() - 0.5).forEach(v => {
              container.appendChild(createDragTile(v));
            });
          }, 1500);
        }
      }
    });
  });
}

function updateZaraSpeech(text) {
  document.getElementById("zaraSpeech").innerText = text;
  TTSEngine.speak(text);
  
  // Re-bind repeat click
  document.getElementById("btnRepeatVoice").onclick = () => {
    TTSEngine.speak(text);
  };
}

// --- NEXT SCENE STEP HANDLER ---
document.getElementById("btnNextSceneStep").onclick = () => {
  SynthEngine.playClick();
  if (GAME_STATE.activeSceneStep < 3) {
    GAME_STATE.activeSceneStep++;
    loadSceneStep();
  } else {
    // Scene fully completed!
    const idx = parseInt(GAME_STATE.activeSceneId.split("_")[1]);
    GAME_STATE.scenesCompleted[GAME_STATE.activeSceneId] = true;
    GAME_STATE.currentStars += 5; // Reward stars for completing scene
    
    // Unlock Badge
    unlockBadge(`scene_${idx}`);
    
    // Back to map
    ConfettiEffect.burst();
    setTimeout(() => {
      showScreen("screenHub");
    }, 2000);
  }
};

// --- PRACTICE ENGINE CONTROLLER ---
function loadQuestion(index) {
  const q = GAME_STATE.practiceQuestions[index];
  if (!q) return;
  
  GAME_STATE.currentQuestionAttempts = 0;
  GAME_STATE.selectedAnswer = null;
  
  // Header indicators
  document.getElementById("questionNumber").innerText = index + 1;
  document.getElementById("practiceProgressBar").style.width = `${(index + 1)}%`;
  document.getElementById("practiceStars").innerText = GAME_STATE.currentStars;
  document.getElementById("currentStreak").innerText = GAME_STATE.currentStreak;
  
  // Difficulty text & scale
  const diffLabel = document.getElementById("difficultyLevel");
  if (q.level === 1) {
    diffLabel.innerText = "Level 1 (Numbers 1 - 99)";
    diffLabel.style.color = "var(--color-success)";
  } else if (q.level === 2) {
    diffLabel.innerText = "Level 2 (Numbers 50 - 150)";
    diffLabel.style.color = "var(--color-primary-light)";
  } else {
    diffLabel.innerText = "Level 3 (Numbers 100 - 200)";
    diffLabel.style.color = "var(--color-warning)";
  }
  
  // Audio instructions
  document.getElementById("practiceZaraSpeech").innerText = q.prompt;
  TTSEngine.speak(q.prompt);
  document.getElementById("btnRepeatPracticeVoice").onclick = () => {
    TTSEngine.speak(q.prompt);
  };
  
  // Check/Submit action resets
  document.getElementById("btnSubmitAnswer").disabled = true;
  document.getElementById("btnShowHint").disabled = true;
  document.getElementById("attemptsTracker").innerHTML = `Attempts left: <span class="attempt-dot active"></span><span class="attempt-dot active"></span>`;
  
  // Close open hints
  document.getElementById("hintPopup").classList.remove("active");
  
  // Render Dynamic Canvas
  const canvas = document.getElementById("questionCanvas");
  canvas.innerHTML = "";
  
  renderQuestionTypeLayout(q, canvas);
}

// Render dynamic forms based on Question Type
function renderQuestionTypeLayout(q, canvas) {
  if (q.answerType === "drag-order") {
    // DRAG ORDER LAYOUT
    const wrapper = document.createElement("div");
    wrapper.className = "drag-order-container";
    
    // Drop zone targets
    const dropZones = document.createElement("div");
    dropZones.style.display = "flex";
    dropZones.style.gap = "15px";
    
    q.numbers.forEach((_, idx) => {
      const slot = document.createElement("div");
      slot.className = "drop-slot";
      slot.setAttribute("data-slot", idx);
      
      const label = q.type.includes("ASC") ? 
        (idx === 0 ? "Smallest" : idx === q.numbers.length - 1 ? "Greatest" : "Middle") :
        (idx === 0 ? "Greatest" : idx === q.numbers.length - 1 ? "Smallest" : "Middle");
        
      slot.setAttribute("data-label", label);
      dropZones.appendChild(slot);
    });
    wrapper.appendChild(dropZones);
    
    // Tiles tray
    const tray = document.createElement("div");
    tray.className = "number-tiles-container";
    
    // Jumbled numbers
    const jumbled = [...q.numbers].sort(() => Math.random() - 0.5);
    jumbled.forEach(num => {
      tray.appendChild(createDragTile(num));
    });
    wrapper.appendChild(tray);
    canvas.appendChild(wrapper);
    
    // Set up dragging validation triggers Check button
    const slots = canvas.querySelectorAll(".drop-slot");
    const state = Array(q.numbers.length).fill(null);
    
    slots.forEach(slot => {
      slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("hovered"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("hovered"));
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("hovered");
        const tile = GAME_STATE.draggedElement;
        if (!tile) return;
        
        slot.appendChild(tile);
        SynthEngine.playMiniTick();
        
        const idx = parseInt(slot.getAttribute("data-slot"));
        state[idx] = parseInt(tile.innerText);
        
        GAME_STATE.selectedAnswer = state;
        
        // Enable check button if all slots filled
        const filled = state.filter(x => x !== null).length;
        if (filled === q.numbers.length) {
          document.getElementById("btnSubmitAnswer").disabled = false;
        }
      });
    });
    
  } else if (q.answerType === "fill-blank") {
    // SEQUENCING LINE FILL BLANK
    const wrapper = document.createElement("div");
    wrapper.className = "blank-fill-container";
    
    // Renders path sequence
    const path = document.createElement("div");
    path.style.display = "flex";
    path.style.gap = "12px";
    
    q.numbers.forEach(val => {
      const stone = document.createElement("div");
      if (val === null) {
        stone.className = "path-stone missing";
        
        const input = document.createElement("input");
        input.type = "number";
        input.className = "blank-fill-input";
        input.oninput = (e) => {
          GAME_STATE.selectedAnswer = parseInt(e.target.value);
          document.getElementById("btnSubmitAnswer").disabled = !e.target.value;
        };
        stone.appendChild(input);
      } else {
        stone.className = "path-stone";
        stone.innerText = val;
      }
      path.appendChild(stone);
    });
    
    wrapper.appendChild(path);
    canvas.appendChild(wrapper);
    
  } else if (q.answerType === "click-select") {
    // CLICK HIGHLIGHT GRID SELECT
    const grid = document.createElement("div");
    grid.className = "grid-select-4";
    
    q.numbers.forEach(num => {
      const tile = document.createElement("button");
      tile.className = "btn-select-tile";
      tile.innerText = num;
      
      tile.onclick = () => {
        SynthEngine.playClick();
        grid.querySelectorAll(".btn-select-tile").forEach(b => b.classList.remove("selected"));
        tile.classList.add("selected");
        
        GAME_STATE.selectedAnswer = num;
        document.getElementById("btnSubmitAnswer").disabled = false;
      };
      
      grid.appendChild(tile);
    });
    canvas.appendChild(grid);
    
  } else if (q.answerType === "mcq") {
    // MULTIPLE CHOICE OPTIONS
    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";
    wrapper.className = "mcq-options-container";
    
    const bulletLabels = ["A", "B", "C", "D"];
    
    q.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn-mcq-option";
      
      btn.innerHTML = `
        <div class="mcq-badge-bullet">${bulletLabels[idx]}</div>
        <div>${opt}</div>
      `;
      
      btn.onclick = () => {
        SynthEngine.playClick();
        wrapper.querySelectorAll(".btn-mcq-option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        
        GAME_STATE.selectedAnswer = opt;
        document.getElementById("btnSubmitAnswer").disabled = false;
      };
      
      wrapper.appendChild(btn);
    });
    
    canvas.appendChild(wrapper);
  }
}

// --- SUBMIT PRACTICE ANSWER HANDLER ---
document.getElementById("btnSubmitAnswer").onclick = () => {
  const index = GAME_STATE.currentQuestionIndex;
  const q = GAME_STATE.practiceQuestions[index];
  
  let isCorrect = false;
  
  if (q.answerType === "drag-order") {
    // Compare arrays
    isCorrect = GAME_STATE.selectedAnswer.every((val, idx) => val === q.correctAnswer[idx]);
  } else {
    isCorrect = GAME_STATE.selectedAnswer === q.correctAnswer;
  }
  
  GAME_STATE.currentQuestionAttempts++;
  
  if (isCorrect) {
    // Correct!
    SynthEngine.playCorrect();
    GAME_STATE.currentStars += (GAME_STATE.currentQuestionAttempts === 1) ? 2 : 1; // 2 stars for 1st attempt, 1 for 2nd
    GAME_STATE.currentStreak++;
    
    // Check for streak milestones
    if (GAME_STATE.currentStreak === 5) {
      unlockBadge("streak_5");
    }
    
    showFeedbackModal(true, q.explanation);
    
    // Log Answers
    GAME_STATE.answersRecord[q.id] = {
      attempts: GAME_STATE.currentQuestionAttempts,
      isCorrect: true,
      userResponse: GAME_STATE.selectedAnswer,
      timestamp: new Date().toISOString()
    };
    
  } else {
    // Wrong!
    SynthEngine.playWrong();
    
    if (GAME_STATE.currentQuestionAttempts === 1) {
      // 1 attempt left
      document.getElementById("attemptsTracker").innerHTML = `Attempts left: <span class="attempt-dot active"></span><span class="attempt-dot"></span>`;
      document.getElementById("btnShowHint").disabled = false;
      GAME_STATE.currentStreak = 0;
      TTSEngine.speak("Hmm, not quite! Don't worry — you have one more try! Use the hint bulb if you need a little help. You can do it! 🌟");
    } else {
      // Out of attempts, show correct answer & move on
      GAME_STATE.currentStreak = 0;
      showFeedbackModal(false, q.explanation);
      
      GAME_STATE.answersRecord[q.id] = {
        attempts: GAME_STATE.currentQuestionAttempts,
        isCorrect: false,
        userResponse: GAME_STATE.selectedAnswer,
        timestamp: new Date().toISOString()
      };
    }
  }
};

// --- HINT BUTTON AND POPUP CONTROL ---
document.getElementById("btnShowHint").onclick = () => {
  const index = GAME_STATE.currentQuestionIndex;
  const q = GAME_STATE.practiceQuestions[index];
  
  SynthEngine.playClick();
  document.getElementById("hintText").innerText = q.hint;
  document.getElementById("hintPopup").classList.add("active");
  TTSEngine.speak("Hint: " + q.hint);
};

document.getElementById("btnCloseHint").onclick = () => {
  SynthEngine.playClick();
  document.getElementById("hintPopup").classList.remove("active");
};

// --- FEEDBACK MODAL OVERLAY CONTROL ---
function showFeedbackModal(isCorrect, explanationText) {
  const overlay = document.getElementById("feedbackOverlay");
  const card = document.getElementById("feedbackCard");
  const iconBox = document.getElementById("feedbackIconContainer");
  const status = document.getElementById("feedbackStatus");
  
  overlay.classList.add("active");
  
  if (isCorrect) {
    iconBox.className = "feedback-icon-container correct";
    iconBox.innerHTML = `<i class="fas fa-check"></i>`;
    status.innerText = "🌟 Brilliant! You got it!";
    status.style.color = "var(--color-success)";
    card.style.borderColor = "var(--color-success)";
    ConfettiEffect.burst();
  } else {
    iconBox.className = "feedback-icon-container wrong";
    iconBox.innerHTML = `<i class="fas fa-times"></i>`;
    status.innerText = "Good try! Let's learn together! 🤗";
    status.style.color = "var(--color-danger)";
    card.style.borderColor = "var(--color-danger)";
  }
  
  document.getElementById("feedbackExplanationText").innerHTML = explanationText;
  TTSEngine.speak(status.innerText + ". " + explanationText);
}

// Next question trigger in Practice Mode
document.getElementById("btnNextQuestion").onclick = () => {
  SynthEngine.playClick();
  document.getElementById("feedbackOverlay").classList.remove("active");
  
  const nextIdx = GAME_STATE.currentQuestionIndex + 1;
  
  // Unlocked milestone badges checks (Every 10 questions)
  if (nextIdx > 0 && nextIdx % 10 === 0) {
    unlockBadge(`milestone_${nextIdx}`);
  }
  
  if (nextIdx < 100) {
    GAME_STATE.currentQuestionIndex = nextIdx;
    loadQuestion(nextIdx);
  } else {
    // Quest completely conquered!
    finishQuest();
  }
};

// --- FINISH QUEST: RESULTS SCREEN & PRINT CERTIFICATE ---
function finishQuest() {
  // Sync score with backend api server
  ApiService.saveScore(GAME_STATE.explorerName, GAME_STATE.currentStars, "seed_" + GAME_STATE.explorerName, GAME_STATE.answersRecord);
  ApiService.logEvent(GAME_STATE.explorerName, "session_complete", { finalStars: GAME_STATE.currentStars });
  
  showScreen("screenResults");
  
  document.getElementById("explorerNameText").innerText = GAME_STATE.explorerName;
  document.getElementById("finalStars").innerText = GAME_STATE.currentStars;
  document.getElementById("finalSessions").innerText = GAME_STATE.totalSessionsPlayed || 1;
  
  const accuracy = Math.round((GAME_STATE.currentStars / 200) * 100);
  document.getElementById("finalAccuracy").innerText = `${accuracy}%`;
  
  // Render earned badges
  const badgesBox = document.getElementById("resultsBadgesFlex");
  badgesBox.innerHTML = "";
  
  BADGES.forEach(badge => {
    const isUnlocked = GAME_STATE.unlockedBadges.includes(badge.id);
    const badgeEl = document.createElement("div");
    badgeEl.className = `badge-item ${isUnlocked ? "" : "locked-badge"}`;
    badgeEl.setAttribute("data-title", badge.title);
    badgeEl.innerText = badge.icon;
    
    badgeEl.onclick = () => {
      if (isUnlocked) {
        SynthEngine.playTone(523, "sine", 0.2);
        TTSEngine.speak(`You unlocked the ${badge.title} badge! ${badge.desc}`);
      } else {
        SynthEngine.playWrong();
        TTSEngine.speak("Keep playing the quest challenge to unlock this badge!");
      }
    };
    badgesBox.appendChild(badgeEl);
  });
  
  ConfettiEffect.burst();
}

// Pause menu triggers
document.getElementById("btnPausePractice").onclick = () => {
  SynthEngine.playClick();
  document.getElementById("pauseDialog").classList.add("active");
};

document.getElementById("btnResumePractice").onclick = () => {
  SynthEngine.playClick();
  document.getElementById("pauseDialog").classList.remove("active");
};

document.getElementById("btnExitToHub").onclick = () => {
  SynthEngine.playClick();
  document.getElementById("pauseDialog").classList.remove("active");
  showScreen("screenHub");
};

document.getElementById("btnRestartQuest").onclick = () => {
  SynthEngine.playClick();
  showScreen("screenLanding");
};

// --- CERTIFICATE GENERATION SYSTEM (PRINTING SUPPORT) ---
document.getElementById("btnDownloadCertificate").onclick = () => {
  SynthEngine.playClick();
  
  // Open modern, elegant printable page in a window
  const printWindow = window.open('', '_blank');
  
  const badgeIcons = BADGES
    .filter(b => GAME_STATE.unlockedBadges.includes(b.id))
    .map(b => `<div style="font-size:30px; margin: 5px;">${b.icon}</div>`)
    .join("");
    
  const printContent = `
    <html>
    <head>
      <title>Certificate of Completion - ${GAME_STATE.explorerName}</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&family=Fredoka:wght@600&display=swap" rel="stylesheet">
      <style>
        body {
          background: #f8fafc;
          font-family: 'Outfit', sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .cert-container {
          background: white;
          border: 15px solid #1a237e;
          border-image: linear-gradient(135deg, #1a237e 0%, #29b6f6 100%) 15;
          padding: 60px;
          text-align: center;
          width: 800px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          position: relative;
        }
        .cert-container::after {
          content: '⭐';
          position: absolute;
          top: 20px;
          left: 20px;
          font-size: 30px;
        }
        .cert-container::before {
          content: '⭐';
          position: absolute;
          bottom: 20px;
          right: 20px;
          font-size: 30px;
        }
        h1 {
          font-family: 'Fredoka', sans-serif;
          color: #1a237e;
          font-size: 3.2rem;
          margin-bottom: 5px;
        }
        h2 {
          color: #29b6f6;
          font-weight: 500;
          font-size: 1.6rem;
          margin-bottom: 30px;
        }
        .body-text {
          font-size: 1.25rem;
          color: #334155;
          line-height: 1.6;
          margin-bottom: 40px;
        }
        .student-name {
          font-size: 2.8rem;
          font-weight: 700;
          color: #1a237e;
          border-bottom: 3px solid #ffbb00;
          display: inline-block;
          padding: 0 20px;
          margin-bottom: 20px;
        }
        .medals-box {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 40px;
        }
        .cert-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          border-top: 2px dashed #cbd5e1;
          padding-top: 20px;
        }
        .sign-block {
          text-align: center;
        }
        .signature {
          font-family: cursive;
          font-size: 1.4rem;
          color: #475569;
        }
        @media print {
          body { background: white; }
          .cert-container { box-shadow: none; border-width: 10px; }
        }
      </style>
    </head>
    <body>
      <div class="cert-container">
        <h1>NumberOrder Quest</h1>
        <h2>CERTIFICATE OF CONQUEST</h2>
        <p class="body-text">This proudly certifies that the explorer</p>
        <div class="student-name">${GAME_STATE.explorerName}</div>
        <p class="body-text">has successfully completed all 5 narrative learning scenes and conquered the 100-Question Practice Quest in ordering numbers up to 200, achieving curriculum alignment with Singapore MOE Mathematics Primary 1.</p>
        
        <div style="font-weight:700; color:#475569; margin-bottom:10px;">BADGES EARNED:</div>
        <div class="medals-box">${badgeIcons}</div>
        
        <div class="cert-footer">
          <div class="sign-block">
            <div class="signature">Zara the Explorer</div>
            <div style="font-size:0.85rem; color:#64748b; font-weight:700;">Quest Guide</div>
          </div>
          <div class="sign-block">
            <div class="signature">Intellia SG</div>
            <div style="font-size:0.85rem; color:#64748b; font-weight:700;">Learning Platform</div>
          </div>
        </div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
};

// --- BADGE UNLOCK SYSTEM TRIGGER ---
function unlockBadge(badgeId) {
  if (GAME_STATE.unlockedBadges.includes(badgeId)) return;
  
  GAME_STATE.unlockedBadges.push(badgeId);
  ApiService.saveLocalBackup(GAME_STATE.explorerName);
  
  // Show popover dialogue
  const badge = BADGES.find(b => b.id === badgeId);
  if (!badge) return;
  
  SynthEngine.playBadgeUnlock();
  
  document.getElementById("unlockedBadgeIcon").innerText = badge.icon;
  document.getElementById("unlockedBadgeTitle").innerText = badge.title;
  document.getElementById("unlockedBadgeDesc").innerText = badge.desc;
  
  const popup = document.getElementById("badgeUnlockOverlay");
  popup.classList.add("active");
  
  TTSEngine.speak(`Wow! Congratulations, ${GAME_STATE.explorerName}! You unlocked the ${badge.title} badge! ${badge.desc}`);
}

document.getElementById("btnCloseBadgeUnlock").onclick = () => {
  SynthEngine.playClick();
  document.getElementById("badgeUnlockOverlay").classList.remove("active");
};

// --- RUN INITIALIZATIONS ON LOAD ---
window.addEventListener("load", () => {
  ApiService.checkConnection();
  // Repeated check connection every 10s
  setInterval(() => ApiService.checkConnection(), 10000);
  
  ConfettiEffect.init();
});
