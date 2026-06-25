<template>
  <div class="player-layout">
    <!-- Nickname Prompt State -->
    <div v-if="!nickname" class="setup-container animate-fade-in">
      <div class="glass-panel status-card">
        <h2>🎮 Rejoindre le salon {{ roomId }}</h2>
        <p>Entrez votre pseudo pour participer à la partie.</p>
        
        <div class="form-group w-full" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left; width: 100%;">
          <label for="prompt-nick" style="font-size: 0.9rem; color: var(--text-muted);">Pseudo</label>
          <input 
            id="prompt-nick" 
            v-model="inputNickname" 
            type="text" 
            placeholder="Ton pseudo de compétiteur" 
            class="input-text"
            @keyup.enter="submitNickname"
          />
        </div>

        <button class="btn btn-primary w-full mt-4" :disabled="!inputNickname.trim()" @click="submitNickname">
          Rejoindre le salon
        </button>
        <button class="btn btn-secondary w-full mt-2" @click="goHome">
          Retour à l'accueil
        </button>
      </div>
    </div>

    <!-- Connecting / Error States -->
    <div v-else-if="isConnecting" class="setup-container animate-fade-in">
      <div class="glass-panel status-card">
        <div class="spinner"></div>
        <h2>Connexion au salon...</h2>
        <p>Recherche du host et synchronisation de la partie.</p>
      </div>
    </div>

    <div v-else-if="error" class="setup-container animate-fade-in">
      <div class="glass-panel status-card error-border">
        <div class="error-icon">⚠️</div>
        <h2>Erreur de connexion</h2>
        <p class="error-msg">{{ error }}</p>
        <button class="btn btn-primary mt-4" @click="goHome">Retour à l'accueil</button>
      </div>
    </div>

    <!-- Active Player Workspace -->
    <div v-else-if="isConnected && gameState" class="game-container animate-fade-in">
      <!-- Player Status Header -->
      <header class="glass-panel status-header">
        <div class="player-profile">
          <span class="avatar">👤</span>
          <div>
            <h3>{{ nickname }}</h3>
            <p class="header-stats-row">
              Score: <span class="highlight">{{ myScore }} pts</span>
              <span class="stats-divider">|</span>
              Stats: <span class="highlight">{{ myCorrectCount }} / {{ myAttemptedCount }}</span>
            </p>
          </div>
        </div>
        <div class="room-indicator" style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
          <div>Salon: <strong>{{ roomId }}</strong></div>
          <button class="btn btn-danger btn-sm" @click="handleLeave" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
            Quitter
          </button>
        </div>
      </header>

      <!-- PHASE: LOBBY -->
      <main v-if="gameState.phase === 'lobby'" class="glass-panel lobby-panel mt-4 animate-fade-in">
        <div class="lobby-icon">🛋️</div>
        <h2>Bienvenue dans le salon</h2>
        <p>En attente du lancement de la partie par l'organisateur...</p>
        
        <div class="players-counter mt-4">
          <h3>Joueurs connectés: {{ gameState.players.length }}</h3>
          <div class="players-grid">
            <span v-for="p in gameState.players" :key="p.id" class="player-pill" :class="{'is-me': p.nickname === nickname}">
              {{ p.nickname }}
            </span>
          </div>
        </div>
      </main>

      <!-- PHASE: CREATING QUESTION -->
      <main v-else-if="gameState.phase === 'creating_question'" class="glass-panel lobby-panel mt-4 animate-fade-in">
        <div class="lobby-icon">✍️</div>
        <h2>Prochaine question...</h2>
        <p>L'organisateur est en train de créer la prochaine question. Préparez-vous !</p>
        
        <div class="leaderboard-preview mt-4">
          <h3>Classeboard en direct</h3>
          <div class="preview-rows">
            <div 
              v-for="(player, idx) in sortedPlayers" 
              :key="player.id" 
              class="preview-row"
              :class="{'is-me': player.nickname === nickname}"
            >
              <span class="rank">#{{ idx + 1 }}</span>
              <span class="name">{{ player.nickname }}</span>
              <span class="score-details">{{ player.correctCount }} / {{ player.attemptedCount }} correct(s)</span>
              <span class="score">{{ player.score }} pts</span>
            </div>
          </div>
        </div>
      </main>

      <!-- PHASE: VOTING -->
      <main v-else-if="gameState.phase === 'voting'" class="mt-4 animate-fade-in">
        <div class="glass-panel question-panel">
          <div class="question-header">
            <span class="q-badge">Question en cours</span>
          </div>
          <h2>{{ gameState.currentQuestion?.text }}</h2>
        </div>

        <!-- Late joiner block -->
        <div v-if="isLateJoiner" class="glass-panel answered-splash mt-4">
          <div class="late-joiner-icon">⏳</div>
          <p>Vous avez rejoint pendant cette question. Vous pourrez répondre à la suivante !</p>
        </div>

        <!-- Answered splash -->
        <div v-else-if="hasAnswered" class="glass-panel answered-splash mt-4 animate-fade-in">
          <div class="pulse-ring"></div>
          <p>Vote enregistré ! En attente des autres joueurs...</p>
        </div>

        <!-- Options voting grid -->
        <div v-else class="options-container mt-4">
          <div class="options-grid">
            <button 
              v-for="(option, idx) in gameState.currentQuestion?.options" 
              :key="idx" 
              class="glass-panel option-card"
              :class="{'selected-option': selectedOptionIdx === idx}"
              @click="selectOption(idx)"
            >
              <span class="option-letter">{{ ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][idx] }}</span>
              <span class="option-text">{{ option }}</span>
            </button>
          </div>
          
          <div class="confirm-vote-action mt-4" v-if="selectedOptionIdx !== null">
            <button class="btn btn-success w-full" @click="confirmAnswer">
              Valider mon vote pour : {{ gameState.currentQuestion?.options[selectedOptionIdx] }}
            </button>
          </div>
        </div>
      </main>

      <!-- PHASE: SELECTING ANSWER -->
      <main v-else-if="gameState.phase === 'selecting_answer'" class="glass-panel lobby-panel mt-4 animate-fade-in">
        <div class="lobby-icon">🔒</div>
        <h2>Votes terminés !</h2>
        <p>L'organisateur est en train de déterminer la bonne réponse...</p>
      </main>

      <!-- PHASE: REVEALED -->
      <main v-else-if="gameState.phase === 'revealed'" class="glass-panel result-panel mt-4 animate-fade-in" :class="isAnswerCorrect ? 'correct-bg' : 'wrong-bg'">
        <!-- Late joiner result display -->
        <div v-if="isLateJoiner" class="result-header">
          <span class="result-emoji">👀</span>
          <h2>Résultats de la question</h2>
          <p>Vous observez cette manche.</p>
        </div>

        <div v-else class="result-header">
          <span class="result-emoji">{{ isAnswerCorrect ? '🎉' : '❌' }}</span>
          <h2>{{ isAnswerCorrect ? 'Excellent !' : 'Oups, mauvaise réponse' }}</h2>
          <p class="score-addition" v-if="isAnswerCorrect">+100 points</p>
        </div>

        <div class="result-details mt-4">
          <div class="detail-item" v-if="!isLateJoiner">
            <span>Votre réponse:</span>
            <strong>{{ mySelectedOptionText || 'Aucune réponse' }}</strong>
          </div>
          <div class="detail-item">
            <span>Bonne réponse:</span>
            <strong class="correct-text">{{ correctOptionText }}</strong>
          </div>
        </div>

        <div class="leaderboard-preview mt-4">
          <h3>Classement en direct</h3>
          <div class="preview-rows">
            <div 
              v-for="(player, idx) in sortedPlayers" 
              :key="player.id" 
              class="preview-row"
              :class="{'is-me': player.nickname === nickname}"
            >
              <span class="rank">#{{ idx + 1 }}</span>
              <span class="name">{{ player.nickname }}</span>
              <span class="score-details">{{ player.correctCount }} / {{ player.attemptedCount }} correct(s)</span>
              <span class="score">{{ player.score }} pts</span>
            </div>
          </div>
        </div>
      </main>

      <!-- PHASE: ENDED -->
      <main v-else-if="gameState.phase === 'ended'" class="glass-panel final-panel mt-4 animate-fade-in">
        <div class="final-emoji">🏆</div>
        <h2>Quiz Terminé !</h2>
        <p>Voici le classement final de la partie.</p>

        <div class="podium mt-4" v-if="sortedPlayers.length > 0">
          <div class="podium-item second" v-if="sortedPlayers[1]">
            <div class="avatar-circle">🥈</div>
            <div class="podium-name">{{ sortedPlayers[1].nickname }}</div>
            <div class="podium-score">{{ sortedPlayers[1].score }} pts</div>
            <div class="podium-stats">{{ sortedPlayers[1].correctCount }} / {{ sortedPlayers[1].attemptedCount }}</div>
          </div>
          
          <div class="podium-item first" v-if="sortedPlayers[0]">
            <div class="avatar-circle">👑</div>
            <div class="podium-name">{{ sortedPlayers[0].nickname }}</div>
            <div class="podium-score">{{ sortedPlayers[0].score }} pts</div>
            <div class="podium-stats">{{ sortedPlayers[0].correctCount }} / {{ sortedPlayers[0].attemptedCount }}</div>
          </div>
          
          <div class="podium-item third" v-if="sortedPlayers[2]">
            <div class="avatar-circle">🥉</div>
            <div class="podium-name">{{ sortedPlayers[2].nickname }}</div>
            <div class="podium-score">{{ sortedPlayers[2].score }} pts</div>
            <div class="podium-stats">{{ sortedPlayers[2].correctCount }} / {{ sortedPlayers[2].attemptedCount }}</div>
          </div>
        </div>

        <div class="final-leaderboard mt-4">
          <div 
            v-for="(player, idx) in sortedPlayers" 
            :key="player.id" 
            class="final-row"
            :class="{'is-me': player.nickname === nickname}"
          >
            <span class="rank">#{{ idx + 1 }}</span>
            <span class="name">{{ player.nickname }}</span>
            <span class="score-details">{{ player.correctCount }} / {{ player.attemptedCount }} correct(s)</span>
            <span class="score">{{ player.score }} pts</span>
          </div>
        </div>

        <button class="btn btn-primary mt-4" @click="goHome">Retour à l'accueil</button>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuizPlayer } from '~/composables/useQuizPlayer'

const route = useRoute()
const router = useRouter()

const {
  isConnected,
  isConnecting,
  error,
  gameState,
  joinRoom,
  submitAnswer,
  leaveRoom,
  disconnect
} = useQuizPlayer()

const handleLeave = () => {
  leaveRoom()
  router.push('/')
}

const roomId = ref('')
const nickname = ref('')
const inputNickname = ref('')

const submitNickname = () => {
  if (inputNickname.value.trim()) {
    nickname.value = inputNickname.value.trim()
    router.replace({ query: { nick: nickname.value } })
    joinRoom(roomId.value, nickname.value)
  }
}

const mePlayerState = computed(() => {
  return gameState.value?.players.find(p => p.nickname === nickname.value)
})

const localAnswered = ref(false)
const hasAnswered = computed(() => {
  return localAnswered.value || mePlayerState.value?.answered || false
})
const selectedOptionIdx = ref(null)

const mySelectedOptionText = computed(() => {
  if (selectedOptionIdx.value !== null && gameState.value?.currentQuestion) {
    return gameState.value.currentQuestion.options[selectedOptionIdx.value]
  }
  if (mePlayerState.value && mePlayerState.value.lastOptionIndex != null && gameState.value?.currentQuestion) {
    return gameState.value.currentQuestion.options[mePlayerState.value.lastOptionIndex]
  }
  return ''
})

onMounted(() => {
  const room = route.params.room
  const nick = route.query.nick
  
  if (room) {
    roomId.value = room
    if (nick) {
      nickname.value = nick
      joinRoom(room, nick)
    }
  } else {
    router.push('/')
  }
})

const goHome = () => {
  disconnect()
  router.push('/')
}

// Reset answer statuses on new questions
const currentQuestionId = computed(() => gameState.value?.currentQuestion?.id)
watch(currentQuestionId, () => {
  localAnswered.value = false
  selectedOptionIdx.value = null
})

const selectOption = (idx) => {
  selectedOptionIdx.value = idx
}

const confirmAnswer = () => {
  if (selectedOptionIdx.value !== null && gameState.value?.currentQuestion) {
    localAnswered.value = true
    submitAnswer(gameState.value.currentQuestion.id, selectedOptionIdx.value)
  }
}

// Player state helpers
const myScore = computed(() => {
  return mePlayerState.value?.score || 0
})

const myCorrectCount = computed(() => {
  return mePlayerState.value?.correctCount || 0
})

const myAttemptedCount = computed(() => {
  return mePlayerState.value?.attemptedCount || 0
})

const isAnswerCorrect = computed(() => {
  return mePlayerState.value?.lastAnswerCorrect || false
})

const isLateJoiner = computed(() => {
  // Late joiner if the host's current question index is less than their join index
  if (!gameState.value || !mePlayerState.value) return false
  // Since we don't have currentQuestionIndex in GameState directly, we compare with stats
  // Actually, we can check if joinQuestionIndex is set.
  // Wait, does the host check the joinQuestionIndex?
  // Yes! The host doesn't let them submit or increments their stats if currentQuestionIndex < joinQuestionIndex.
  // But wait! If they join *after* voting ended, they miss it.
  // To display it nicely in the UI, we can broadcast an active question index or just compare.
  // Wait, let's see if we can check if they are permitted to answer.
  // If the host is in voting phase, and the host has recorded this player's join index.
  // How does player know the current index?
  // Let's check `useQuizHost.ts` line 214 `broadcastState`:
  // We map player objects with `joinQuestionIndex: p.joinQuestionIndex`.
  // Wait, is there current question index in state?
  // In `useQuizHost.ts` broadcastState:
  // state: GameState
  // Wait, let's look at GameState in `useQuizHost.ts` line 25:
  // GameState doesn't explicitly broadcast `currentQuestionIndex`.
  // BUT we broadcast `players` array, so the player can check their own player object `joinQuestionIndex`.
  // Wait! If they can't know `currentQuestionIndex` they don't know if they joined late relative to the current question.
  // Wait, let's look: when the player joins, the current question index is X. The player's `joinQuestionIndex` is X.
  // During this question X, `currentQuestionIndex` is X. `joinQuestionIndex` is X. They are equal!
  // If they are equal, they can answer this question!
  // If they join during `revealed` or `creating_question` phase, `currentQuestionIndex` is X, their join index is X.
  // In the next question, `currentQuestionIndex` becomes X + 1. Their join index is X. They can also answer it.
  // When would a player be a late joiner for the current question?
  // A player is a late joiner if they joined *after* the voting phase for the current question started,
  // or if the host sets their join index higher than the current index.
  // In our `useQuizHost.ts`:
  // `joinQuestionIndex: Math.max(0, currentQuestionIndex.value)`
  // If a player joins during `voting` phase of question 2, their `joinQuestionIndex` is set to 2.
  // In this case, `currentQuestionIndex` is 2, so they *can* answer it!
  // Wait, if they join during `selecting_answer` or `revealed` phase of question 2, their `joinQuestionIndex` is set to 2.
  // They don't vote anyway because the phase is not `voting`.
  // When next question starts (`creating_question`), the host increases `currentQuestionIndex` to 3 (when launching voting).
  // So they can answer question 3.
  // Therefore, they are *never* locked out of voting for the active question unless they joined when voting was already closed!
  // So `isLateJoiner` is simple: if they joined and the current question is already closed/selecting answer/revealed, they can't answer. But the page phase takes care of that!
  // So we don't strictly need a complicated `isLateJoiner` computed check that compares indexes.
  // Let's simplify `isLateJoiner`:
  // If they joined, and their join index is equal to the current question index, and they didn't have time to answer (e.g. it is already in selecting_answer or revealed phase), they just see that phase's screen.
  // Let's just remove the `isLateJoiner` block or make it always false to avoid UI bugs, and let the normal phase screen render!
  return false
})

const correctOptionText = computed(() => {
  if (!gameState.value || !gameState.value.currentQuestion || gameState.value.correctOptionIndex == null) return ''
  return gameState.value.currentQuestion.options[gameState.value.correctOptionIndex]
})

const sortedPlayers = computed(() => {
  return [...(gameState.value?.players || [])].sort((a, b) => b.score - a.score)
})
</script>

<style scoped>
.player-layout {
  min-height: 100vh;
  padding: 2rem;
  max-width: 600px;
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
  width: 100%;
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

/* Status Header */
.status-header {
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.player-profile {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar {
  font-size: 1.5rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.5rem;
  border-radius: 50%;
}

.player-profile h3 {
  font-size: 1.1rem;
  font-weight: 700;
}

.header-stats-row {
  font-size: 0.85rem;
  color: var(--text-muted);
  display: flex;
  gap: 0.5rem;
}

.stats-divider {
  color: var(--glass-border);
}

.highlight {
  color: var(--color-secondary);
  font-weight: 700;
}

.room-indicator {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Lobby Phase */
.lobby-panel {
  padding: 3rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.lobby-icon {
  font-size: 4rem;
}

.players-counter {
  width: 100%;
  border-top: 1px solid var(--glass-border);
  padding-top: 1.5rem;
}

.players-counter h3 {
  font-size: 1rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.players-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.player-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.9rem;
}

.player-pill.is-me {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--color-primary);
}

/* Question Phase */
.question-panel {
  padding: 2.5rem 2rem;
  text-align: center;
}

.q-badge {
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--color-primary);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.question-panel h2 {
  font-size: 1.6rem;
  margin-top: 1rem;
  line-height: 1.4;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.option-card {
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: var(--transition-smooth);
  color: var(--text-primary);
}

.option-card:hover {
  background: var(--glass-hover);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.option-card.selected-option {
  border-color: var(--color-primary);
  background: rgba(99, 102, 241, 0.1);
}

.option-letter {
  font-weight: 800;
  font-size: 1.25rem;
  color: var(--color-secondary);
  background: rgba(236, 72, 153, 0.1);
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.option-text {
  font-size: 1.1rem;
  font-weight: 600;
}

.confirm-vote-action {
  width: 100%;
}

.answered-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
  text-align: center;
}

.late-joiner-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.pulse-ring {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
  animation: pulse 1.5s infinite;
  margin-bottom: 1.5rem;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 15px rgba(99, 102, 241, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

/* Result Phase */
.result-panel {
  padding: 2.5rem 2rem;
  text-align: center;
}

.result-emoji {
  font-size: 4rem;
}

.score-addition {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-success);
  margin-top: 0.5rem;
}

.result-details {
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: left;
}

.detail-item {
  display: flex;
  justify-content: space-between;
}

.detail-item span {
  color: var(--text-muted);
}

.correct-bg {
  border-color: rgba(16, 185, 129, 0.3);
  background: radial-gradient(circle at top right, rgba(16, 185, 129, 0.05), var(--glass-bg));
}

.wrong-bg {
  border-color: rgba(239, 68, 68, 0.3);
  background: radial-gradient(circle at top right, rgba(239, 68, 68, 0.05), var(--glass-bg));
}

.correct-text {
  color: var(--color-success);
}

.leaderboard-preview {
  width: 100%;
}

.leaderboard-preview h3 {
  font-size: 1.1rem;
  color: var(--text-muted);
  text-align: left;
  margin-bottom: 0.75rem;
}

.preview-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  font-size: 0.9rem;
}

.preview-row .score-details {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.preview-row.is-me {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

/* Final Phase */
.final-panel {
  padding: 3rem 2rem;
  text-align: center;
}

.final-emoji {
  font-size: 4rem;
}

.podium {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 1rem;
  margin: 3rem 0;
  height: 180px;
}

.podium-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 90px;
}

.avatar-circle {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  border: 2px solid var(--glass-border);
}

.first .avatar-circle {
  border-color: #f59e0b;
  transform: scale(1.2);
  background: rgba(245, 158, 11, 0.1);
}

.second .avatar-circle {
  border-color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
}

.third .avatar-circle {
  border-color: #b45309;
  background: rgba(180, 83, 9, 0.1);
}

.podium-name {
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.podium-score {
  font-size: 0.75rem;
  color: var(--color-primary);
  font-weight: 700;
}

.podium-stats {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.final-leaderboard {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.final-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-md);
}

.final-row .score-details {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.final-row.is-me {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.w-full {
  width: 100%;
}

.mt-4 { margin-top: 1rem; }
</style>
