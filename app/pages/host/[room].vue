<template>
  <div class="host-layout">
    <!-- Peer Setup / Loading States -->
    <div v-if="!isPeerReady && !peerError" class="setup-container animate-fade-in">
      <div class="glass-panel status-card">
        <div class="spinner"></div>
        <h2>Initialisation de l'événement...</h2>
        <p>Génération de votre canal de communication peer-to-peer sécurisé.</p>
      </div>
    </div>

    <div v-else-if="peerError" class="setup-container animate-fade-in">
      <div class="glass-panel status-card error-border">
        <div class="error-icon">⚠️</div>
        <h2>Impossible de créer le salon</h2>
        <p class="error-msg">{{ peerError }}</p>
        <button class="btn btn-primary mt-4" @click="goHome">Retour à l'accueil</button>
      </div>
    </div>

    <!-- Active Host Workspace -->
    <div v-else class="host-grid">
      <!-- CONTROL BOARD (LEFT / TOP) -->
      <main class="control-panel">
        <!-- Room Info Header -->
        <header class="glass-panel room-header">
          <div class="room-title">
            <span class="badge">HOST</span>
            <h1>Salon: <span class="highlight">{{ roomId }}</span></h1>
          </div>
          <div class="share-info">
            <p>Code de connexion: <strong>{{ roomId }}</strong></p>
            <button class="btn btn-secondary btn-sm" @click="copyShareLink">
              {{ copied ? 'Copié !' : 'Copier le lien' }}
            </button>
          </div>
        </header>

        <!-- Current Quiz Phase Status -->
        <section class="glass-panel phase-manager mt-4">
          <div class="section-header">
            <h2>Gestion de la Partie</h2>
            <div class="game-phase-badge" :class="phase">Phase: {{ phaseLabels[phase] }}</div>
          </div>

          <!-- PHASE: LOBBY -->
          <div v-if="phase === 'lobby'" class="action-bar">
            <p v-if="questions.length === 0" class="warning-text">Ajoutez votre première question ci-dessous pour démarrer.</p>
            <button v-else class="btn btn-success" @click="launchVoting">
              Lancer la première question
            </button>
          </div>

          <!-- PHASE: CREATING QUESTION -->
          <div v-else-if="phase === 'creating_question'" class="action-bar">
            <p class="warning-text">Remplissez le formulaire ci-dessous pour lancer la prochaine question.</p>
            <button v-if="questions.length > 0" class="btn btn-success" @click="launchVoting">
              Lancer la question créée
            </button>
          </div>

          <!-- PHASE: VOTING -->
          <div v-else-if="phase === 'voting'" class="action-bar">
            <div class="current-q-preview">
              <span class="label">Votes ouverts pour:</span>
              <h3>{{ currentQuestion?.text }}</h3>
              <p class="answer-count-track mt-2">Réponses reçues : {{ answeredPlayersCount }} / {{ players.length }}</p>
            </div>
            <div class="actions">
              <button class="btn btn-warning" @click="closeVoting">
                Clore les votes & Choisir la réponse
              </button>
              <button class="btn btn-danger" @click="endGame">
                Terminer le Quiz
              </button>
            </div>
          </div>

          <!-- PHASE: SELECTING ANSWER -->
          <div v-else-if="phase === 'selecting_answer'" class="action-bar">
            <div class="current-q-preview">
              <span class="label">Sélection de la bonne réponse:</span>
              <h3>{{ currentQuestion?.text }}</h3>
            </div>
            <div class="validation-panel mt-2">
              <p><strong>Cliquez sur la bonne réponse ci-dessous :</strong></p>
              <div class="validation-options mt-2">
                <button 
                  v-for="(option, idx) in currentQuestion?.options" 
                  :key="idx" 
                  class="btn option-val-btn"
                  :class="selectedCorrectIndex === idx ? 'btn-success' : 'btn-secondary'"
                  @click="selectCorrectAnswer(idx)"
                >
                  {{ ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][idx] }}. {{ option }}
                </button>
              </div>
            </div>
            <div class="actions mt-4" v-if="selectedCorrectIndex !== null">
              <button class="btn btn-success" @click="confirmCorrectAnswer">
                Confirmer la bonne réponse et clore
              </button>
            </div>
          </div>

          <!-- PHASE: REVEALED -->
          <div v-else-if="phase === 'revealed'" class="action-bar">
            <div class="current-q-preview">
              <h3>Réponses révélées. Bonne réponse: <span class="correct-text">{{ currentQuestionCorrectOption }}</span></h3>
            </div>
            <div class="actions">
              <button class="btn btn-primary" @click="prepareNextQuestion">
                Créer la question suivante
              </button>
              <button class="btn btn-danger" @click="endGame">
                Terminer le Quiz
              </button>
            </div>
          </div>

          <!-- PHASE: ENDED -->
          <div v-else-if="phase === 'ended'" class="action-bar">
            <div class="current-q-preview">
              <h3>Le Quiz est terminé ! Découvrez le classement final.</h3>
            </div>
            <button class="btn btn-danger" @click="restartQuiz">
              Réinitialiser tout le Quiz
            </button>
          </div>
        </section>

        <!-- Question Creator (Shown in Lobby or Creating Question phases) -->
        <section v-if="phase === 'lobby' || phase === 'creating_question'" class="glass-panel creator-section mt-4 animate-fade-in">
          <h2>➕ Créer une Question</h2>
          <div class="creator-form">
            <div class="form-group">
              <label>Intitulé de la question</label>
              <input v-model="newQText" type="text" placeholder="Ex: Quelle est la capitale de la France ?" class="input-text" />
            </div>

            <div class="options-grid">
              <div v-for="idx in newQOptions.length" :key="idx" class="form-group opt-item">
                <label>Option {{ idx }}</label>
                <div class="option-input-wrapper">
                  <input v-model="newQOptions[idx - 1]" type="text" :placeholder="'Option ' + idx + (idx > 2 ? ' (Optionnelle)' : '')" class="input-text" />
                  <button 
                    v-if="newQOptions.length > 2" 
                    type="button" 
                    class="btn-remove-option" 
                    @click="removeOption(idx - 1)"
                    title="Retirer l'option"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            <div class="creator-actions mt-4">
              <button 
                v-if="newQOptions.length < 8"
                type="button" 
                class="btn btn-secondary btn-sm" 
                @click="addOptionField"
              >
                + Ajouter une option
              </button>
              <button class="btn btn-primary" :disabled="!isValidQuestion" @click="submitNewQuestion">
                Ajouter la question
              </button>
            </div>
          </div>

          <div class="questions-list mt-4" v-if="questions.length > 0">
            <h3>Questions créées ({{ questions.length }})</h3>
            <div class="questions-scroll">
              <div v-for="(q, index) in questions" :key="q.id" class="q-item">
                <span class="q-num">Q{{ index + 1 }}</span>
                <div class="q-details">
                  <p class="q-text">{{ q.text }}</p>
                  <p class="q-ans-hint" v-if="q.correctIndex !== null">Réponse correcte: {{ q.options[q.correctIndex] }}</p>
                  <p class="q-ans-hint pending" v-else>En attente de validation</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Host Play Arena (When Host participates and votes are open) -->
        <section v-if="isHostPlaying && phase === 'voting'" class="glass-panel play-arena mt-4 animate-fade-in">
          <div class="arena-header">
            <span class="badge badge-player">🎮 Mon arène joueur</span>
            <h3>{{ currentQuestion?.text }}</h3>
          </div>
          
          <div v-if="hasHostAnswered" class="answered-splash">
            <div class="pulse-ring"></div>
            <p>Réponse enregistrée ! En attente des autres joueurs...</p>
          </div>
          
          <div v-else class="arena-options-container">
            <div class="arena-options">
              <button 
                v-for="(option, idx) in currentQuestion?.options" 
                :key="idx" 
                class="btn option-btn"
                :class="hostSelectedOptionIdx === idx ? 'btn-primary' : 'btn-secondary'"
                @click="selectHostAnswer(idx)"
              >
                {{ option }}
              </button>
            </div>
            <div class="confirm-vote-action mt-4" v-if="hostSelectedOptionIdx !== null">
              <button class="btn btn-success w-full" @click="confirmHostAnswer">
                Valider mon vote pour : {{ currentQuestion?.options[hostSelectedOptionIdx] }}
              </button>
            </div>
          </div>
        </section>

        <!-- Host Play Arena results -->
        <section v-if="isHostPlaying && phase === 'revealed'" class="glass-panel play-arena mt-4 animate-fade-in">
          <div class="arena-header">
            <span class="badge badge-player">🎮 Mon arène joueur</span>
            <h3>{{ currentQuestion?.text }}</h3>
          </div>
          
          <div class="result-splash" :class="isHostAnswerCorrect ? 'correct' : 'wrong'">
            <h2>{{ isHostAnswerCorrect ? '🎉 Correct !' : '❌ Incorrect' }}</h2>
            <p v-if="hostSelectedOptionText">Tu as choisi: <strong>{{ hostSelectedOptionText }}</strong></p>
            <p v-else>Tu n'as pas répondu à temps.</p>
            <p>La bonne réponse était: <strong>{{ currentQuestionCorrectOption }}</strong></p>
          </div>
        </section>
      </main>

      <!-- PLAYERS & LEADERBOARD (RIGHT / BOTTOM) -->
      <aside class="sidebar-panel">
        <div class="glass-panel players-card">
          <div class="sidebar-header">
            <h2>Classement</h2>
            <span class="player-count">{{ players.length }} 👥</span>
          </div>

          <div class="players-list">
            <div 
              v-for="(player, idx) in sortedPlayers" 
              :key="player.id" 
              class="player-row"
              :class="{
                'is-self': player.id === 'host-self',
                'has-answered': player.answered && phase === 'voting',
                'correct-answer': phase === 'revealed' && player.lastAnswerCorrect,
                'wrong-answer': phase === 'revealed' && player.lastAnswerCorrect === false
              }"
            >
              <div class="player-rank">#{{ idx + 1 }}</div>
              <div class="player-info">
                <span class="player-name">{{ player.nickname }}</span>
                <span class="player-stats-detail">
                  {{ player.correctCount }} / {{ player.attemptedCount }} correct{{ player.attemptedCount > 1 ? 's' : '' }}
                </span>
                <span class="player-status" v-if="phase === 'voting'">
                  {{ player.answered ? '✅ Répondu' : '⏳ En attente...' }}
                </span>
                <span class="player-status-reveal" v-if="phase === 'revealed'">
                  {{ player.lastAnswerCorrect ? '✨ Correct (+100)' : '❌ Faux / Pas répondu' }}
                </span>
              </div>
              <div class="player-score">{{ player.score }} pts</div>
            </div>
            
            <div v-if="players.length === 0" class="no-players">
              <p>Aucun participant pour le moment.</p>
              <p class="desc">Partagez le code ci-dessus pour qu'ils rejoignent.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuizHost } from '~/composables/useQuizHost'

const route = useRoute()
const router = useRouter()

const {
  roomId,
  phase,
  players,
  questions,
  currentQuestionIndex,
  isPeerReady,
  peerError,
  isHostPlaying,
  hostNickname,
  initHost,
  addQuestion,
  prepareNextQuestion,
  launchVoting,
  closeVoting,
  revealQuestionAnswers,
  submitHostSelfAnswer,
  endGame,
  restartQuiz
} = useQuizHost()

// Phase labels mapping
const phaseLabels = {
  lobby: 'Lobby (Attente)',
  creating_question: 'Création de question',
  voting: 'Votes en cours',
  selecting_answer: 'Sélection de la bonne réponse',
  revealed: 'Résultats de la question',
  ended: 'Fin du quiz'
}

// Question Creator States
const newQText = ref('')
const newQOptions = ref(['', '', '', ''])

const isValidQuestion = computed(() => {
  if (!newQText.value.trim()) return false
  const validOpts = newQOptions.value.map(o => o.trim()).filter(o => o !== '')
  return validOpts.length >= 2
})

const addOptionField = () => {
  if (newQOptions.value.length < 8) {
    newQOptions.value.push('')
  }
}

const removeOption = (index) => {
  if (newQOptions.value.length > 2) {
    newQOptions.value.splice(index, 1)
  }
}

const submitNewQuestion = () => {
  const validOpts = newQOptions.value.map(o => o.trim()).filter(o => o !== '')
  if (!newQText.value.trim() || validOpts.length < 2) return
  
  addQuestion(newQText.value.trim(), validOpts)
  
  // Reset fields
  newQText.value = ''
  newQOptions.value = ['', '', '', '']
}

// Share mechanism
const copied = ref(false)
const copyShareLink = () => {
  if (!process.client) return
  const joinUrl = `${window.location.origin}/player/${roomId.value}`
  navigator.clipboard.writeText(joinUrl).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}

// Computed helper states
const currentQuestion = computed(() => {
  if (currentQuestionIndex.value < 0 || currentQuestionIndex.value >= questions.value.length) return null
  return questions.value[currentQuestionIndex.value]
})

const currentQuestionCorrectOption = computed(() => {
  if (!currentQuestion.value || currentQuestion.value.correctIndex == null) return ''
  return currentQuestion.value.options[currentQuestion.value.correctIndex]
})

const isLastQuestion = computed(() => {
  return currentQuestionIndex.value >= questions.value.length - 1
})

const sortedPlayers = computed(() => {
  return [...players.value].sort((a, b) => b.score - a.score)
})

const answeredPlayersCount = computed(() => {
  return players.value.filter(p => p.answered).length
})

// Host Player Helpers
const hostPlayerObj = computed(() => {
  return players.value.find(p => p.id === 'host-self')
})

const hasHostAnswered = computed(() => {
  return hostPlayerObj.value?.answered || false
})

const isHostAnswerCorrect = computed(() => {
  return hostPlayerObj.value?.lastAnswerCorrect || false
})

const hostSelectedOptionText = computed(() => {
  if (!currentQuestion.value || hostPlayerObj.value?.lastOptionIndex == null) return ''
  return currentQuestion.value.options[hostPlayerObj.value.lastOptionIndex]
})

// Host Voting Confirmation States
const hostSelectedOptionIdx = ref(null)
const selectHostAnswer = (idx) => {
  hostSelectedOptionIdx.value = idx
}
const confirmHostAnswer = () => {
  if (hostSelectedOptionIdx.value !== null) {
    submitHostSelfAnswer(hostSelectedOptionIdx.value)
    hostSelectedOptionIdx.value = null
  }
}

// Correct Answer Validation States
const selectedCorrectIndex = ref(null)
const selectCorrectAnswer = (idx) => {
  selectedCorrectIndex.value = idx
}
const confirmCorrectAnswer = () => {
  if (selectedCorrectIndex.value !== null) {
    revealQuestionAnswers(selectedCorrectIndex.value)
    selectedCorrectIndex.value = null
  }
}

const goHome = () => {
  router.push('/')
}

onMounted(() => {
  const room = route.params.room
  const play = route.query.play === 'true'
  const nick = route.query.nick || 'Organisateur'
  
  if (room) {
    initHost(room, play, nick)
  }
})
</script>

<style scoped>
.host-layout {
  min-height: 100vh;
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.setup-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 70vh;
}

.status-card {
  padding: 3rem;
  text-align: center;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.error-border {
  border-color: var(--color-danger);
}

.error-icon {
  font-size: 3rem;
}

.error-msg {
  color: #fca5a5;
  font-size: 0.95rem;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-left-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.host-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

@media (min-width: 992px) {
  .host-grid {
    grid-template-columns: 3fr 1fr;
  }
}

/* Room Header */
.room-header {
  padding: 1.5rem 2rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
}

.room-title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.room-title h1 {
  font-size: 1.75rem;
  font-weight: 700;
}

.highlight {
  color: var(--color-secondary);
}

.badge {
  background: var(--color-primary);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  letter-spacing: 0.05em;
}

.share-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

/* Phase Manager */
.phase-manager {
  padding: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.game-phase-badge {
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.game-phase-badge.lobby { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; }
.game-phase-badge.creating_question { background: rgba(139, 92, 246, 0.2); color: #c084fc; }
.game-phase-badge.voting { background: rgba(245, 158, 11, 0.2); color: #fde047; }
.game-phase-badge.selecting_answer { background: rgba(236, 72, 153, 0.2); color: #f472b6; }
.game-phase-badge.revealed { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
.game-phase-badge.ended { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }

.action-bar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.current-q-preview h3 {
  font-size: 1.4rem;
  font-weight: 600;
  margin-top: 0.25rem;
}

.correct-text {
  color: var(--color-success);
}

.actions {
  display: flex;
  gap: 1rem;
}

.warning-text {
  color: #fca5a5;
  font-size: 0.95rem;
}

.answer-count-track {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Creator Form */
.creator-section {
  padding: 2rem;
}

.creator-section h2 {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
}

.creator-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 768px) {
  .options-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* Questions list scrollable */
.questions-list h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: var(--text-muted);
}

.questions-scroll {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.5rem;
}

.q-item {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  align-items: center;
}

.q-num {
  font-weight: 800;
  color: var(--color-primary);
  background: rgba(99, 102, 241, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.q-details {
  display: flex;
  flex-direction: column;
}

.q-text {
  font-weight: 500;
}

.q-ans-hint {
  font-size: 0.85rem;
  color: var(--color-success);
}

.q-ans-hint.pending {
  color: var(--color-warning);
}

/* Leaderboard Sidebar */
.players-card {
  padding: 2rem;
  height: 100%;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 1rem;
}

.player-count {
  font-size: 0.9rem;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.player-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: var(--transition-smooth);
}

.player-row.is-self {
  border-color: rgba(236, 72, 153, 0.4);
  background: rgba(236, 72, 153, 0.03);
}

.player-row.has-answered {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.05);
}

.player-row.correct-answer {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.05);
}

.player-row.wrong-answer {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.05);
}

.player-rank {
  font-weight: 700;
  width: 2.5rem;
  color: var(--text-muted);
}

.player-info {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.player-name {
  font-weight: 600;
}

.player-stats-detail {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.player-status {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.player-status-reveal {
  font-size: 0.75rem;
  font-weight: 500;
}

.player-row.correct-answer .player-status-reveal { color: var(--color-success); }
.player-row.wrong-answer .player-status-reveal { color: var(--color-danger); }

.player-score {
  font-weight: 700;
  color: var(--color-primary);
}

.no-players {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
}

.no-players .desc {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

/* Play Arena for Host */
.play-arena {
  padding: 2rem;
  border-color: var(--color-secondary);
}

.arena-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.badge-player {
  background: var(--color-secondary);
  margin-bottom: 0.25rem;
}

.arena-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-top: 1.5rem;
}

@media (min-width: 576px) {
  .arena-options {
    grid-template-columns: 1fr 1fr;
  }
}

.option-btn {
  height: 3.5rem;
  font-size: 1.1rem;
}

.answered-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}

.pulse-ring {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-secondary);
  box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7);
  animation: pulse 1.5s infinite;
  margin-bottom: 1.5rem;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 15px rgba(236, 72, 153, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(236, 72, 153, 0);
  }
}

.result-splash {
  padding: 2rem;
  border-radius: var(--radius-md);
  text-align: center;
  margin-top: 1.5rem;
}

.result-splash.correct {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.result-splash.wrong {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.validation-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 576px) {
  .validation-options {
    grid-template-columns: 1fr 1fr;
  }
}

.option-val-btn {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 1rem;
}

.w-full {
  width: 100%;
}

.mt-4 { margin-top: 1rem; }
.mt-2 { margin-top: 0.5rem; }

.option-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.option-input-wrapper .input-text {
  padding-right: 2.25rem;
}

.btn-remove-option {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.4;
  transition: var(--transition-smooth);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove-option:hover {
  opacity: 1;
  color: var(--color-danger);
}

.creator-actions {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
}
</style>
