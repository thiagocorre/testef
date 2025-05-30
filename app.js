
// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAMpX7aC_htDr7yTM1o7Ka9_RTNUKFnaBQ",
  authDomain: "roleta-ec488.firebaseapp.com",
  databaseURL: "https://roleta-ec488-default-rtdb.firebaseio.com",
  projectId: "roleta-ec488",
  storageBucket: "roleta-ec488.firebasestorage.app",
  messagingSenderId: "327594316381",
  appId: "1:327594316381:web:8bfbeba3cb36f9746573b4",
  measurementId: "G-ZCGKQ4DN7L"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

// DOM elements
const loginDiv = document.getElementById('loginDiv');
const quizDiv = document.getElementById('quizDiv');
const supportBtn = document.getElementById('supportBtn');
const logoutBtn = document.getElementById('logoutBtn');
const levelSelectDiv = document.getElementById('levelSelectDiv');
const questionDiv = document.getElementById('questionDiv');
const answersDiv = document.getElementById('answersDiv');
const timerDiv = document.getElementById('timerDiv');
const feedbackDiv = document.getElementById('feedbackDiv');
const progressDiv = document.getElementById('progressDiv');
const prizeDiv = document.getElementById('prizeDiv');
const countdownDiv = document.getElementById('countdownDiv');

let currentUser = null;
let currentLevel = null;
let questions = [];
let currentQuestionIndex = 0;
let timerInterval = null;
let countdownInterval = null;
let timePerQuestion = 10; // segundos
let countdownBetweenLevels = 20; // segundos

// Prêmios por nível
const levelPrizes = {
  facil: { curtidas: 100, seguidores: 100 },
  medio: { curtidas: 300, seguidores: 200 },
  dificil: { curtidas: 500, seguidores: 400 }
};

// Perguntas - só 3 níveis exemplo aqui, vc coloca as 20 completas
const questionsData = {
  facil: [
    {
      pergunta: "Quem criou o mundo?",
      respostas: ["Moisés", "Jesus", "Deus", "Abraão"],
      correta: 2
    },
    {
      pergunta: "Quem foi colocado em uma arca com muitos animais?",
      respostas: ["Adão", "Elias", "Noé", "Paulo"],
      correta: 2
    }
  ],
  medio: [
    {
      pergunta: "Qual era o nome do pai de João Batista?",
      respostas: ["Zacarias", "José", "Elias", "Ananias"],
      correta: 0
    },
    {
      pergunta: "Quem foi a mulher que escondeu os espias em Jericó?",
      respostas: ["Rute", "Raabe", "Ana", "Débora"],
      correta: 1
    }
  ],
  dificil: [
    {
      pergunta: "Qual era o nome da esposa do profeta Oséias?",
      respostas: ["Rute", "Gômer", "Ana", "Mical"],
      correta: 1
    },
    {
      pergunta: "Quantas vezes o povo de Israel rodeou Jericó antes dos muros caírem?",
      respostas: ["6", "7", "12", "13"],
      correta: 3
    }
  ]
};

// Sons (coloque os arquivos em /sounds)
const soundCorrect = new Audio('sounds/correct.mp3');
const soundWrong = new Audio('sounds/wrong.mp3');
const musicBg = new Audio('sounds/background.mp3');
musicBg.loop = true;
musicBg.volume = 0.1;

// Funções auxiliares
function show(element) { element.style.display = 'block'; }
function hide(element) { element.style.display = 'none'; }

// Inicialização
auth.onAuthStateChanged(user => {
  if(user){
    currentUser = user;
    showLogout(true);
    showLogin(false);
    showLevelSelect(true);
    musicBg.play();
  } else {
    currentUser = null;
    showLogout(false);
    showLogin(true);
    showLevelSelect(false);
    showQuiz(false);
    musicBg.pause();
  }
});

function showLogin(show){
  if(show) show(loginDiv); else hide(loginDiv);
}
function showLevelSelect(show){
  if(show) show(levelSelectDiv); else hide(levelSelectDiv);
}
function showQuiz(show){
  if(show) show(quizDiv); else hide(quizDiv);
}
function showLogout(show){
  if(show) show(logoutBtn); else hide(logoutBtn);
}

// Login e cadastro
document.getElementById('loginForm').addEventListener('submit', e=>{
  e.preventDefault();
  const email = e.target.email.value;
  const password = e.target.password.value;
  auth.signInWithEmailAndPassword(email,password)
    .then(()=> {
      e.target.reset();
    })
    .catch(err=>{
      alert('Erro no login: '+err.message);
    });
});
document.getElementById('registerForm').addEventListener('submit', e=>{
  e.preventDefault();
  const email = e.target.email.value;
  const password = e.target.password.value;
  auth.createUserWithEmailAndPassword(email,password)
    .then(()=>{
      e.target.reset();
      alert('Cadastro efetuado! Faça login.');
    })
    .catch(err=>{
      alert('Erro no cadastro: '+err.message);
    });
});

logoutBtn.onclick = () => auth.signOut();

// Verifica bloqueio 24h para o nível
async function isLevelBlocked(userId, level){
  const snapshot = await db.ref(`users/${userId}/levels/${level}`).once('value');
  const data = snapshot.val();
  if(!data) return false;
  const lastPlayed = data.lastPlayed;
  if(!lastPlayed) return false;
  const diff = Date.now() - lastPlayed;
  return diff < 24*60*60*1000;
}

// Registra último jogo para bloquear
async function registerLevelPlay(userId, level){
  await db.ref(`users/${userId}/levels/${level}`).set({
    lastPlayed: Date.now()
  });
}

// Salva progresso
async function saveProgress(userId, level, progress){
  await db.ref(`users/${userId}/progress/${level}`).set(progress);
}

// Começa o quiz de um nível
async function startLevel(level){
  if(!currentUser) return alert('Faça login primeiro.');
  const blocked = await isLevelBlocked(currentUser.uid, level);
  if(blocked){
    alert('Você já jogou esse nível hoje. Tente amanhã.');
    return;
  }
  currentLevel = level;
  questions = questionsData[level];
  currentQuestionIndex = 0;
  showLevelSelect(false);
  showQuiz(true);
  prizeDiv.innerHTML = '';
  feedbackDiv.innerHTML = '';
  startQuestion();
}

// Exibe pergunta e respostas
function startQuestion(){
  clearInterval(timerInterval);
  clearInterval(countdownInterval);
  if(currentQuestionIndex >= questions.length){
    finishLevel();
    return;
  }
  const q = questions[currentQuestionIndex];
  questionDiv.textContent = `(${currentQuestionIndex+1}/${questions.length}) ${q.pergunta}`;
  answersDiv.innerHTML = '';
  q.respostas.forEach((res, i) => {
    const btn = document.createElement('button');
    btn.textContent = res;
    btn.onclick = () => checkAnswer(i);
    answersDiv.appendChild(btn);
  });
  let timeLeft = timePerQuestion;
  timerDiv.textContent = `Tempo: ${timeLeft}s`;
  timerInterval = setInterval(()=>{
    timeLeft--;
    timerDiv.textContent = `Tempo: ${timeLeft}s`;
    if(timeLeft <= 0){
      clearInterval(timerInterval);
      soundWrong.play();
      alert('Tempo esgotado! Você precisa recomeçar o nível.');
      resetLevel();
    }
  }, 1000);
  updateProgress();
}

// Verifica resposta
function checkAnswer(answerIndex){
  clearInterval(timerInterval);
  const q = questions[currentQuestionIndex];
  if(answerIndex === q.correta){
    soundCorrect.play();
    currentQuestionIndex++;
    updateProgress();
    startQuestion();
  } else {
    soundWrong.play();
    alert('Resposta errada! Você precisa recomeçar o nível.');
    resetLevel();
  }
}

// Atualiza barra de progresso
function updateProgress(){
  progressDiv.textContent = `Perguntas restantes: ${questions.length - currentQuestionIndex}`;
}

// Reseta o nível para recomeçar
function resetLevel(){
  currentQuestionIndex = 0;
  startQuestion();
}

// Finaliza o nível
async function finishLevel(){
  clearInterval(timerInterval);
  showQuiz(false);
  await registerLevelPlay(currentUser.uid, currentLevel);

  const prize = levelPrizes[currentLevel];
  prizeDiv.innerHTML = `<h2>Parabéns! Você completou o nível ${currentLevel.toUpperCase()}!</h2>
  <p>Você ganhou ${prize.curtidas} curtidas e ${prize.seguidores} seguidores no Instagram!</p>
  <p>Por favor, tire um print desta tela e envie para o nosso suporte no WhatsApp.</p>`;

  feedbackDiv.innerHTML = '';
  // Animação de premiação simples
  prizeDiv.style.animation = 'pulse 1s infinite';

  // Botão suporte fica visível
  show(supportBtn);

  // Contagem regressiva 20s para voltar para seleção de níveis
  let countdown = countdownBetweenLevels;
  countdownDiv.textContent = `Voltando para seleção em ${countdown}s...`;
  countdownDiv.style.display = 'block';
  countdownInterval = setInterval(()=>{
    countdown--;
    countdownDiv.textContent = `Voltando para seleção em ${countdown}s...`;
    if(countdown <= 0){
      clearInterval(countdownInterval);
      countdownDiv.style.display = 'none';
      prizeDiv.style.animation = '';
      prizeDiv.innerHTML = '';
      showLevelSelect(true);
      hide(supportBtn);
    }
  }, 1000);
}

// Botão suporte abre WhatsApp
supportBtn.onclick = () => {
  window.open('https://wa.me/5579999875145?text=Ol%C3%A1%2C%20quero%20resgatar%20meus%20pr%C3%AAmios%20do%20Quiz%20B%C3%ADblico!', '_blank');
}

// Botões nível
document.getElementById('btnFacil').onclick = () => startLevel('facil');
document.getElementById('btnMedio').onclick = () => startLevel('medio');
document.getElementById('btnDificil').onclick = () => startLevel('dificil');
