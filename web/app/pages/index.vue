<template>
  <div class="welcome-container animate-fade-in">
    <header class="header">
      <div class="logo">⚡ LiveQuiz</div>
      <p class="tagline">Le quiz interactif en temps réel, ultra rapide et 100% serverless.</p>
    </header>

    <div class="choices-grid">
      <!-- HOST PANEL -->
      <div class="glass-panel card">
        <h2>👑 Créer une Partie</h2>
        <p class="card-desc">Lance ton salon de jeu, crée des questions en direct et supervise les scores.</p>
        
        <div class="form-group">
          <label for="host-room">Nom de l'événement</label>
          <input 
            id="host-room" 
            v-model="hostRoom" 
            type="text" 
            placeholder="ex: pixel-quiz, team-building..." 
            class="input-text"
          />
        </div>

        <div class="form-group checkbox-group">
          <label class="checkbox-container">
            <input v-model="hostParticipates" type="checkbox" />
            <span class="checkmark"></span>
            Je veux participer en même temps
          </label>
        </div>

        <div v-if="hostParticipates" class="form-group animate-fade-in">
          <label for="host-nick">Mon Pseudo</label>
          <input 
            id="host-nick" 
            v-model="hostNickname" 
            type="text" 
            placeholder="Ton super pseudo" 
            class="input-text"
          />
        </div>

        <button class="btn btn-primary w-full" :disabled="!hostRoom || (hostParticipates && !hostNickname)" @click="createGame">
          Créer le salon
        </button>
      </div>

      <!-- PLAYER PANEL -->
      <div class="glass-panel card">
        <h2>🎮 Rejoindre une Partie</h2>
        <p class="card-desc">Entre le code de l'événement fourni par l'organisateur pour participer.</p>

        <div class="form-group">
          <label for="player-room">Code de l'événement</label>
          <input 
            id="player-room" 
            v-model="playerRoom" 
            type="text" 
            placeholder="Entrez le code" 
            class="input-text"
          />
        </div>

        <div class="form-group">
          <label for="player-nick">Pseudo</label>
          <input 
            id="player-nick" 
            v-model="playerNickname" 
            type="text" 
            placeholder="Ton pseudo de compétiteur" 
            class="input-text"
          />
        </div>

        <button class="btn btn-secondary w-full" :disabled="!playerRoom || !playerNickname" @click="joinGame">
          Rejoindre le salon
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const hostRoom = ref('')
const hostParticipates = ref(false)
const hostNickname = ref('')

const playerRoom = ref('')
const playerNickname = ref('')

const createGame = () => {
  if (!hostRoom.value) return
  const cleanRoom = hostRoom.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
  router.push({
    path: `/host/${cleanRoom}`,
    query: {
      play: hostParticipates.value ? 'true' : 'false',
      nick: hostNickname.value
    }
  })
}

const joinGame = () => {
  if (!playerRoom.value || !playerNickname.value) return
  const cleanRoom = playerRoom.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
  router.push({
    path: `/player/${cleanRoom}`,
    query: {
      nick: playerNickname.value
    }
  })
}
</script>

<style scoped>
.welcome-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 4rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3rem;
}

.header {
  text-align: center;
}

.logo {
  font-size: 3.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #a5b4fc, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 0.5rem;
}

.tagline {
  font-size: 1.25rem;
  color: var(--text-muted);
  max-width: 600px;
  margin: 0 auto;
}

.choices-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  width: 100%;
}

@media (min-width: 768px) {
  .choices-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.card {
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  position: relative;
  overflow: hidden;
}

.card h2 {
  font-size: 1.75rem;
  font-weight: 700;
}

.card-desc {
  font-size: 0.95rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted);
}

.w-full {
  width: 100%;
}

/* Custom Checkbox */
.checkbox-group {
  margin-top: -0.5rem;
}

.checkbox-container {
  display: flex;
  align-items: center;
  position: relative;
  padding-left: 2rem;
  cursor: pointer;
  font-size: 0.95rem;
  user-select: none;
  color: var(--text-primary) !important;
}

.checkbox-container input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  height: 1.25rem;
  width: 1.25rem;
  background-color: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--glass-border);
  border-radius: 4px;
  transition: var(--transition-smooth);
}

.checkbox-container:hover input ~ .checkmark {
  background-color: var(--glass-hover);
  border-color: rgba(255, 255, 255, 0.2);
}

.checkbox-container input:checked ~ .checkmark {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.checkmark:after {
  content: "";
  position: absolute;
  display: none;
}

.checkbox-container input:checked ~ .checkmark:after {
  display: block;
}

.checkbox-container .checkmark:after {
  left: 6px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
</style>
