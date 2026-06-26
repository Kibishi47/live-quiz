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
            <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
              <button class="btn btn-secondary btn-sm" @click="copyShareLink">
                {{ copied ? 'Copié !' : 'Copier le lien' }}
              </button>
              <button class="btn btn-danger btn-sm" @click="handleLeave">
                Quitter le salon
              </button>
            </div>
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
              Lancer la question suivante
            </button>
          </div>

          <!-- PHASE: CREATING QUESTION -->
          <div v-else-if="phase === 'creating_question'" class="action-bar">
            <p class="warning-text">Remplissez le formulaire ci-dessous pour lancer la prochaine question.</p>
            <button v-if="hasUnplayedQuestions" class="btn btn-success" @click="launchVoting">
              Lancer la question suivante
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
              <button class="btn btn-secondary" @click="cancelQuestion">
                Annuler la question
              </button>
              <button class="btn btn-danger" @click="endGame">
                Terminer le Quiz
              </button>
            </div>
          </div>

          <!-- PHASE: SELECTING ANSWER -->
          <div v-else-if="phase === 'selecting_answer'" class="action-bar">
            <div class="current-q-preview">
              <span class="label">Sélection de la bonne réponse :</span>
              <h3>{{ currentQuestion?.text }}</h3>
            </div>
            <div class="validation-panel mt-2">
              <p><strong>Choisissez une ou plusieurs bonnes réponses ci-dessous :</strong></p>
              <div class="validation-options mt-2">
                <button 
                  v-for="(option, idx) in currentQuestion?.options" 
                  :key="idx" 
                  class="btn option-val-btn"
                  :class="selectedCorrectIndices.includes(idx) ? 'btn-success' : 'btn-secondary'"
                  @click="selectCorrectAnswer(idx)"
                >
                  <span style="margin-right: 0.5rem; font-family: monospace;">{{ selectedCorrectIndices.includes(idx) ? '☑' : '☐' }}</span>
                  {{ ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][idx] }}. {{ option }}
                </button>
              </div>
            </div>
            <div class="actions mt-4" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-success" :disabled="selectedCorrectIndices.length === 0" @click="confirmCorrectAnswer">
                Confirmer la/les réponse(s) et clore
              </button>
              <button class="btn btn-primary" @click="selectMostVotedOptionAndConfirm">
                🏆 Valider l'option la plus votée
              </button>
              <button class="btn btn-secondary" @click="cancelQuestion">
                Annuler la question
              </button>
            </div>
          </div>

          <!-- PHASE: REVEALED -->
          <div v-else-if="phase === 'revealed'" class="action-bar">
            <div class="current-q-preview">
              <h3>Réponses révélées. Bonne réponse: <span class="correct-text">{{ currentQuestionCorrectOption }}</span></h3>
            </div>
            <div class="actions">
              <button v-if="hasUnplayedQuestions" class="btn btn-success" @click="launchVoting">
                Lancer la question suivante
              </button>
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

        <!-- Section: Résumé des Résultats du Tour -->
        <section v-if="phase === 'revealed'" class="glass-panel results-summary-card mt-4 animate-fade-in">
          <div class="results-grid">
            <!-- Liste des vainqueurs -->
            <div class="winners-section">
              <h3>🏆 Joueurs ayant bien répondu ({{ winningPlayers.length }})</h3>
              <div v-if="winningPlayers.length > 0" class="winners-list">
                <span v-for="p in winningPlayers" :key="p.id" class="winner-pill">
                  🎉 {{ p.nickname }}
                </span>
              </div>
              <div v-else class="no-winners">
                <p>😢 Personne n'a trouvé la bonne réponse pour cette question !</p>
              </div>
            </div>

            <!-- Distribution des votes -->
            <div class="votes-section">
              <h3>📊 Distribution des votes</h3>
              <div class="votes-chart">
                <div v-for="vc in voteCounts" :key="vc.index" class="vote-bar-row">
                  <div class="vote-bar-info">
                    <span class="option-badge" :class="{ 'is-correct': correctOptionIndices && correctOptionIndices.includes(vc.index) }">
                      {{ vc.letter }}
                    </span>
                    <span class="option-text" :class="{ 'is-correct': correctOptionIndices && correctOptionIndices.includes(vc.index) }">{{ vc.text }}</span>
                  </div>
                  <div class="vote-bar-container">
                    <div 
                      class="vote-bar-fill" 
                      :class="{ 'is-correct': correctOptionIndices && correctOptionIndices.includes(vc.index) }"
                      :style="{ width: getVotePercentage(vc.count) + '%' }"
                    ></div>
                    <span class="vote-count">{{ vc.count }} vote{{ vc.count > 1 ? 's' : '' }} ({{ getVotePercentage(vc.count) }}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Question Creator (Shown in Lobby or Creating Question phases) -->
        <section v-if="phase === 'lobby' || phase === 'creating_question'" class="glass-panel creator-section mt-4 animate-fade-in">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 1.5rem;">
            <h2 style="margin: 0;">➕ Créer une Question</h2>
            <div style="display: flex; gap: 0.5rem;">
              <button 
                class="btn btn-secondary btn-sm" 
                style="padding: 0.35rem 0.6rem; font-size: 0.8rem; opacity: 0.85;"
                @click="openManageModal"
                title="Gérer les questionnaires"
              >
                📂 Questionnaires
              </button>
            </div>
          </div>
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
                {{ editingQuestionId ? 'Modifier la question' : 'Ajouter la question' }}
              </button>
              <button 
                v-if="editingQuestionId" 
                type="button" 
                class="btn btn-secondary" 
                @click="cancelEdit"
                style="margin-left: 0.5rem;"
              >
                Annuler la modification
              </button>
            </div>
          </div>

          <div class="questions-list mt-4" v-if="questions.length > 0">
            <h3>Questions créées ({{ questions.length }})</h3>
            <div class="questions-scroll">
              <div v-for="(q, index) in questions" :key="q.id" class="q-item" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                <div class="q-details" style="flex: 1;">
                  <span class="q-num">Q{{ index + 1 }}</span>
                  <p class="q-text" style="display: inline-block; margin-left: 0.5rem; font-weight: 600;">{{ q.text }}</p>
                  <p class="q-ans-hint" v-if="q.correctIndex !== null">Réponse correcte: {{ q.options[q.correctIndex] }}</p>
                  <p class="q-ans-hint pending" v-else>En attente de validation</p>
                </div>
                <div class="q-actions" style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                  <button 
                    v-if="q.correctIndex === null && (phase === 'lobby' || phase === 'creating_question' || phase === 'revealed')" 
                    class="btn btn-success btn-sm" 
                    @click="launchVoting(q.id)"
                    title="Lancer cette question"
                    style="padding: 0.35rem 0.6rem; font-size: 0.8rem; line-height: 1;"
                  >
                    ▶️ Lancer
                  </button>
                  <button 
                    v-if="q.correctIndex === null" 
                    class="btn btn-secondary btn-sm" 
                    @click="startEditQuestion(q)"
                    title="Modifier la question"
                    style="padding: 0.35rem 0.6rem; font-size: 0.8rem; line-height: 1; background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2);"
                  >
                    ✏️
                  </button>
                  <button 
                    v-if="q.correctIndex === null" 
                    class="btn btn-danger btn-sm" 
                    @click="deleteQuestion(q.id)"
                    title="Supprimer la question"
                    style="padding: 0.35rem 0.6rem; font-size: 0.8rem; line-height: 1; background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4);"
                  >
                    🗑️
                  </button>
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
                <span class="player-name">
                  <span class="status-indicator" :class="player.connected ? 'online' : 'offline'" :title="player.connected ? 'Actif' : 'Inactif'"></span>
                  {{ player.nickname }}
                </span>
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
              <button 
                v-if="player.id !== 'host-self'" 
                class="btn-kick" 
                @click="kickPlayer(player.id)" 
                title="Exclure ce joueur"
              >
                🚫
              </button>
            </div>
            
            <div v-if="players.length === 0" class="no-players">
              <p>Aucun participant pour le moment.</p>
              <p class="desc">Partagez le code ci-dessus pour qu'ils rejoignent.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- MODAL: MANAGE QUESTIONNAIRES -->
    <div v-if="showManageModal" class="modal-overlay animate-fade-in" @click.self="showManageModal = false">
      <div class="glass-panel modal-card large">
        <div class="modal-header">
          <h2>📂 Gestion des questionnaires</h2>
          <button class="btn-close" @click="showManageModal = false">×</button>
        </div>
        
        <div class="modal-body unified-grid">
          <!-- Save Current Section -->
          <div class="modal-section save-section">
            <h3>💾 Enregistrer le questionnaire actuel</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
              Enregistrez les {{ questions.length }} questions de ce salon pour pouvoir les réutiliser plus tard.
            </p>
            <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left; width: 100%;">
              <label for="save-name" style="font-size: 0.85rem; color: var(--text-muted);">Nom du questionnaire</label>
              <input 
                id="save-name" 
                v-model="saveNameInput" 
                type="text" 
                placeholder="Ex: Quiz de culture générale..." 
                class="input-text"
                :disabled="questions.length === 0"
                @keyup.enter="confirmSaveQuestionnaire"
              />
              <button 
                class="btn btn-primary mt-3" 
                :disabled="!saveNameInput.trim() || questions.length === 0" 
                @click="confirmSaveQuestionnaire"
              >
                Sauvegarder dans la liste
              </button>
              <p v-if="questions.length === 0" class="warning-text mt-2" style="font-size: 0.8rem; text-align: center;">
                Ajoutez des questions pour pouvoir sauvegarder ce questionnaire.
              </p>
            </div>
          </div>

          <!-- Saved List Section -->
          <div class="modal-section list-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="margin: 0;">📋 Questionnaires enregistrés</h3>
              <div>
                <button 
                  class="btn btn-secondary btn-sm" 
                  style="padding: 0.25rem 0.5rem; font-size: 0.8rem;"
                  @click="triggerFileInput"
                >
                  📥 Importer .json
                </button>
                <input 
                  id="import-file-input" 
                  type="file" 
                  accept=".json" 
                  style="display: none;" 
                  @change="handleFileImport"
                />
              </div>
            </div>

            <div v-if="Object.keys(savedQuestionnaires).length === 0" class="no-saved" style="padding: 2rem 0; text-align: center;">
              <p style="font-size: 0.9rem; color: var(--text-muted); margin: 0;">Aucun questionnaire enregistré dans ce navigateur.</p>
            </div>
            <div v-else class="saved-list" style="max-height: 240px; overflow-y: auto;">
              <div 
                v-for="(qs, name) in savedQuestionnaires" 
                :key="name" 
                class="saved-item"
                style="margin-bottom: 0.5rem;"
              >
                <div class="saved-item-info" @click="confirmLoadQuestionnaire(name)" title="Charger ce questionnaire dans le salon" style="cursor: pointer; flex: 1;">
                  <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600;">{{ name }}</h4>
                  <p style="margin: 0 0 0.15rem 0; font-size: 0.75rem; color: var(--text-muted);">{{ qs.length }} question(s)</p>
                </div>
                <div style="display: flex; gap: 0.25rem;">
                  <button 
                    class="btn-delete-saved" 
                    @click="exportQuestionnaireFile(name)"
                    title="Exporter ce questionnaire en JSON"
                  >
                    📤
                  </button>
                  <button 
                    class="btn-delete-saved" 
                    @click="deleteSavedQuestionnaire(name)"
                    title="Supprimer ce questionnaire"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer mt-4">
          <button class="btn btn-secondary" @click="showManageModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- MODAL: CONFIRM DELETE -->
    <div v-if="questionnaireToDelete" class="modal-overlay animate-fade-in" style="z-index: 1100;" @click.self="questionnaireToDelete = null">
      <div class="glass-panel modal-card">
        <div class="modal-header">
          <h2>🗑️ Supprimer le questionnaire</h2>
          <button class="btn-close" @click="questionnaireToDelete = null">×</button>
        </div>
        <div class="modal-body text-center">
          <p>Voulez-vous vraiment supprimer le questionnaire <strong>"{{ questionnaireToDelete }}"</strong> ?</p>
          <p class="warning-text mt-2" style="font-size: 0.9rem; color: var(--text-muted);">Cette action est définitive.</p>
        </div>
        <div class="modal-footer mt-4">
          <button class="btn btn-secondary" @click="questionnaireToDelete = null">Annuler</button>
          <button class="btn btn-danger" @click="confirmDeleteQuestionnaire">Supprimer</button>
        </div>
      </div>
    </div>

    <!-- MODAL: IMPORT CONFIGURATION -->
    <div v-if="showImportModal" class="modal-overlay animate-fade-in" style="z-index: 1100;" @click.self="showImportModal = false">
      <div class="glass-panel modal-card">
        <div class="modal-header">
          <h2>📥 Importer un questionnaire</h2>
          <button class="btn-close" @click="showImportModal = false">×</button>
        </div>
        <div class="modal-body">
          <div v-if="importError" class="alert-error mt-2 mb-4" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.75rem; border-radius: 6px; color: #ef4444; font-size: 0.9rem; text-align: left;">
            ⚠️ {{ importError }}
          </div>
          <div v-else>
            <p>Le fichier contient <strong>{{ importedData?.length }}</strong> question(s).</p>
            <div class="form-group mt-4" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left; width: 100%;">
              <label for="import-name" style="font-size: 0.9rem; color: var(--text-muted);">Nom du questionnaire importé</label>
              <input 
                id="import-name" 
                v-model="importNameInput" 
                type="text" 
                placeholder="Nom du questionnaire..." 
                class="input-text"
                @keyup.enter="confirmImportQuestionnaire"
              />
            </div>
          </div>
        </div>
        <div class="modal-footer mt-4">
          <button class="btn btn-secondary" @click="showImportModal = false">Annuler</button>
          <button class="btn btn-primary" :disabled="!importNameInput.trim() || !!importError" @click="confirmImportQuestionnaire">Importer</button>
        </div>
      </div>
    </div>

    <!-- CHAT DRAWER TOGGLE BUTTON -->
    <button 
      class="btn-chat-toggle" 
      @click="toggleChatDrawer"
      title="Ouvrir le chat"
    >
      💬
      <span v-if="unreadChatCount > 0" class="chat-badge">{{ unreadChatCount }}</span>
    </button>

    <!-- CHAT DRAWER -->
    <div class="chat-drawer" :class="{ 'open': showChatDrawer }">
      <div class="chat-header">
        <h3>💬 Discussion</h3>
        <button class="btn-close-chat" @click="showChatDrawer = false">×</button>
      </div>
      <div class="chat-messages" ref="chatScrollContainer">
        <div v-if="chat.length === 0" class="no-messages">
          Aucun message. Envoyez le premier message !
        </div>
        <div 
          v-else 
          v-for="(msg, idx) in chat" 
          :key="idx" 
          class="chat-bubble-wrapper"
          :class="{ 'is-me': msg.sender === 'Hôte', 'is-host': msg.sender === 'Hôte' }"
        >
          <div class="chat-bubble-meta">
            <span class="chat-bubble-sender">{{ msg.sender }}</span>
            <span class="chat-bubble-time">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="chat-bubble">
            {{ msg.text }}
          </div>
        </div>
      </div>
      <div class="chat-footer">
        <input 
          v-model="chatInput" 
          type="text" 
          placeholder="Écrire un message..." 
          class="input-text chat-input" 
          @keyup.enter="sendChatMessageLocal"
        />
        <button class="btn btn-primary btn-send-chat" :disabled="!chatInput.trim()" @click="sendChatMessageLocal">
          ➤
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuizHost } from '~/composables/useQuizHost'

const route = useRoute()
const router = useRouter()

const {
  roomId,
  phase,
  players,
  questions,
  chat,
  currentQuestion,
  currentQuestionIndex,
  correctOptionIndex,
  correctOptionIndices,
  isPeerReady,
  peerError,
  isHostPlaying,
  hostNickname,
  initHost,
  addQuestion,
  editQuestion,
  prepareNextQuestion,
  launchVoting,
  closeVoting,
  revealQuestionAnswers,
  revealMostVotedAnswer,
  submitHostSelfAnswer,
  endGame,
  cancelQuestion,
  kickPlayer,
  leaveRoom,
  deleteQuestion,
  restartQuiz,
  sendChatMessage
} = useQuizHost()

const showChatDrawer = ref(false)
const chatInput = ref('')
const unreadChatCount = ref(0)
const chatScrollContainer = ref(null)

const toggleChatDrawer = () => {
  showChatDrawer.value = !showChatDrawer.value
  if (showChatDrawer.value) {
    unreadChatCount.value = 0
    scrollToBottom()
  }
}

const sendChatMessageLocal = () => {
  const text = chatInput.value.trim()
  if (!text) return
  sendChatMessage(text)
  chatInput.value = ''
  scrollToBottom()
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatScrollContainer.value) {
      chatScrollContainer.value.scrollTop = chatScrollContainer.value.scrollHeight
    }
  })
}

// Watch chat array updates to handle unread count and auto-scroll
watch(chat, (newChat, oldChat) => {
  if (!showChatDrawer.value) {
    const diff = newChat.length - (oldChat?.length || 0)
    if (diff > 0) {
      unreadChatCount.value += diff
    }
  } else {
    scrollToBottom()
  }
}, { deep: true })

const formatTime = (ts) => {
  const date = new Date(ts * 1000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const handleLeave = () => {
  leaveRoom()
  router.push('/')
}

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
const editingQuestionId = ref(null)

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

const startEditQuestion = (q) => {
  newQText.value = q.text
  const opts = [...q.options]
  while (opts.length < 4) {
    opts.push('')
  }
  newQOptions.value = opts
  editingQuestionId.value = q.id
  
  // Smooth scroll to the form
  const creatorSection = document.querySelector('.creator-section')
  creatorSection?.scrollIntoView({ behavior: 'smooth' })
}

const cancelEdit = () => {
  editingQuestionId.value = null
  newQText.value = ''
  newQOptions.value = ['', '', '', '']
}

const submitNewQuestion = () => {
  const validOpts = newQOptions.value.map(o => o.trim()).filter(o => o !== '')
  if (!newQText.value.trim() || validOpts.length < 2) return
  
  if (editingQuestionId.value) {
    editQuestion(editingQuestionId.value, newQText.value.trim(), validOpts)
    editingQuestionId.value = null
  } else {
    addQuestion(newQText.value.trim(), validOpts)
  }
  
  // Reset fields
  newQText.value = ''
  newQOptions.value = ['', '', '', '']
}

// Modal states for import/export
const showManageModal = ref(false)
const saveNameInput = ref('')
const savedQuestionnaires = ref({})

const questionnaireToDelete = ref(null)
const showImportModal = ref(false)
const importNameInput = ref('')
const importedData = ref(null)
const importError = ref('')

const openManageModal = () => {
  if (!process.client) return
  saveNameInput.value = ''
  try {
    const saved = localStorage.getItem("live-quiz-questionnaires")
    savedQuestionnaires.value = saved ? JSON.parse(saved) : {}
  } catch (e) {
    console.error(e)
    savedQuestionnaires.value = {}
  }
  showManageModal.value = true
}

const confirmSaveQuestionnaire = () => {
  const name = saveNameInput.value.trim()
  if (!name || questions.value.length === 0) return
  try {
    const saved = localStorage.getItem("live-quiz-questionnaires")
    const questionnaires = saved ? JSON.parse(saved) : {}
    questionnaires[name] = questions.value.map(q => ({
      text: q.text,
      options: q.options
    }))
    localStorage.setItem("live-quiz-questionnaires", JSON.stringify(questionnaires))
    savedQuestionnaires.value = questionnaires
    saveNameInput.value = ''
  } catch (err) {
    console.error("Error saving questionnaire:", err)
  }
}

const confirmLoadQuestionnaire = (name) => {
  const loadedQuestions = savedQuestionnaires.value[name]
  if (loadedQuestions && Array.isArray(loadedQuestions)) {
    for (const q of loadedQuestions) {
      addQuestion(q.text, q.options)
    }
    showManageModal.value = false
  }
}

const deleteSavedQuestionnaire = (name) => {
  questionnaireToDelete.value = name
}

const confirmDeleteQuestionnaire = () => {
  const name = questionnaireToDelete.value
  if (!name) return
  try {
    delete savedQuestionnaires.value[name]
    localStorage.setItem("live-quiz-questionnaires", JSON.stringify(savedQuestionnaires.value))
    questionnaireToDelete.value = null
  } catch (err) {
    console.error("Error deleting questionnaire:", err)
  }
}

const exportQuestionnaireFile = (name) => {
  const qs = savedQuestionnaires.value[name]
  if (!qs) return
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(qs, null, 2))
  const downloadAnchor = document.createElement('a')
  downloadAnchor.setAttribute("href", dataStr)
  downloadAnchor.setAttribute("download", `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  downloadAnchor.remove()
}

const triggerFileInput = () => {
  const fileInput = document.getElementById('import-file-input')
  fileInput?.click()
}

const handleFileImport = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (!Array.isArray(data) || data.some(q => !q.text || !Array.isArray(q.options))) {
        importError.value = "Format de fichier invalide. Il doit s'agir d'un tableau JSON contenant des questions."
        importedData.value = null
      } else {
        importError.value = ""
        importedData.value = data
      }
      
      importNameInput.value = file.name.replace(/\.json$/i, '')
      showImportModal.value = true
    } catch (err) {
      console.error(err)
      importError.value = "Erreur lors de la lecture du fichier JSON."
      importedData.value = null
      importNameInput.value = ""
      showImportModal.value = true
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

const confirmImportQuestionnaire = () => {
  const name = importNameInput.value.trim()
  if (!name || !importedData.value) return
  
  try {
    savedQuestionnaires.value[name] = importedData.value.map(q => ({
      text: q.text,
      options: q.options
    }))
    localStorage.setItem("live-quiz-questionnaires", JSON.stringify(savedQuestionnaires.value))
    showImportModal.value = false
    importedData.value = null
    importNameInput.value = ""
  } catch (err) {
    console.error("Error importing questionnaire:", err)
  }
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


const currentQuestionCorrectOption = computed(() => {
  if (!currentQuestion.value || !correctOptionIndices.value || correctOptionIndices.value.length === 0) return ''
  return correctOptionIndices.value.map(idx => currentQuestion.value.options[idx]).join(', ')
})

const winningPlayers = computed(() => {
  return players.value.filter(p => p.lastAnswerCorrect === true)
})

const voteCounts = computed(() => {
  if (!currentQuestion.value || !currentQuestion.value.options) return []
  
  const counts = currentQuestion.value.options.map((option, idx) => ({
    index: idx,
    text: option,
    letter: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][idx] || '',
    count: 0
  }))

  players.value.forEach(p => {
    if (p.lastOptionIndex !== null && p.lastOptionIndex !== undefined && p.lastOptionIndex >= 0 && p.lastOptionIndex < counts.length) {
      counts[p.lastOptionIndex].count++
    }
  })

  // Sort descending order of votes
  return counts.sort((a, b) => b.count - a.count)
})

const getVotePercentage = (count) => {
  const total = players.value.length
  if (total === 0) return 0
  return Math.round((count / total) * 100)
}

const isLastQuestion = computed(() => {
  return !hasUnplayedQuestions.value
})

const hasUnplayedQuestions = computed(() => {
  return questions.value.some(q => q.correctIndex == null)
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
const selectedCorrectIndices = ref([])
const selectCorrectAnswer = (idx) => {
  const foundIdx = selectedCorrectIndices.value.indexOf(idx)
  if (foundIdx > -1) {
    selectedCorrectIndices.value.splice(foundIdx, 1)
  } else {
    selectedCorrectIndices.value.push(idx)
  }
}
const confirmCorrectAnswer = () => {
  if (selectedCorrectIndices.value.length > 0) {
    revealQuestionAnswers(selectedCorrectIndices.value)
    selectedCorrectIndices.value = []
  }
}

const selectMostVotedOptionAndConfirm = () => {
  revealMostVotedAnswer()
  selectedCorrectIndices.value = []
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

.player-name {
  display: flex;
  align-items: center;
}

.status-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  flex-shrink: 0;
}
.status-indicator.online {
  background-color: var(--color-success, #10b981);
  box-shadow: 0 0 8px var(--color-success, #10b981);
}
.status-indicator.offline {
  background-color: var(--color-danger, #ef4444);
  box-shadow: 0 0 8px var(--color-danger, #ef4444);
}

.btn-kick {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  margin-left: 0.75rem;
  font-size: 1.1rem;
  opacity: 0.5;
  transition: opacity var(--transition-smooth);
}

.btn-kick:hover {
  opacity: 1;
}

/* Modals styling */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 1.5rem;
}

.modal-card {
  width: 100%;
  max-width: 500px;
  padding: 2rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal-card.large {
  max-width: 800px;
}

.unified-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  text-align: left;
}

@media (min-width: 768px) {
  .unified-grid {
    grid-template-columns: 1fr 1.2fr;
    align-items: start;
  }
  
  .save-section {
    border-right: 1px solid var(--glass-border);
    padding-right: 2rem;
  }
}

.modal-section h3 {
  font-size: 1.15rem;
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 1rem;
}

.modal-header h2 {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 2rem;
  cursor: pointer;
  line-height: 0.5;
  transition: color var(--transition-smooth);
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  border-top: 1px solid var(--glass-border);
  padding-top: 1rem;
}

.no-saved {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}

.saved-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.saved-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: transform var(--transition-smooth), background var(--transition-smooth);
}

.saved-item:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-1px);
}

.saved-item-info {
  flex: 1;
  cursor: pointer;
}

.saved-item-info h3 {
  font-size: 1.05rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.saved-item-info p {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.btn-delete-saved {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  font-size: 1.1rem;
  opacity: 0.5;
  transition: opacity var(--transition-smooth);
}

.btn-delete-saved:hover {
  opacity: 1;
}

/* Chat drawer styles */
.btn-chat-toggle {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--btn-primary-bg, #6366f1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  font-size: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  z-index: 999;
  transition: transform 0.2s, background 0.2s;
}
.btn-chat-toggle:hover {
  transform: scale(1.05);
  background: #4f46e5;
}
.chat-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ef4444;
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
  border-radius: 50%;
  padding: 0.2rem 0.5rem;
  line-height: 1;
}

.chat-drawer {
  position: fixed;
  top: 0;
  right: -360px;
  width: 360px;
  height: 100%;
  background: rgba(15, 15, 20, 0.9);
  backdrop-filter: blur(20px);
  border-left: 1px solid var(--glass-border);
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
  z-index: 1001;
  transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}
@media (max-width: 480px) {
  .chat-drawer {
    width: 100%;
    right: -100%;
  }
}
.chat-drawer.open {
  right: 0;
}

.chat-header {
  padding: 1.25rem;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chat-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}
.btn-close-chat {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.8rem;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s;
}
.btn-close-chat:hover {
  color: var(--text-primary);
}

.chat-messages {
  flex: 1;
  padding: 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.no-messages {
  text-align: center;
  color: var(--text-muted);
  margin-top: 2rem;
  font-size: 0.9rem;
}

.chat-bubble-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 85%;
}
.chat-bubble-wrapper.is-me {
  align-self: flex-end;
  align-items: flex-end;
}

.chat-bubble-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
  margin-bottom: 0.2rem;
  color: var(--text-muted);
}
.chat-bubble-sender {
  font-weight: 600;
}
.chat-bubble-wrapper.is-host .chat-bubble-sender {
  color: #fbbf24;
}

.chat-bubble {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  border-top-left-radius: 2px;
  padding: 0.6rem 0.8rem;
  font-size: 0.9rem;
  line-height: 1.4;
  word-break: break-word;
}
.chat-bubble-wrapper.is-me .chat-bubble {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.3);
  border-top-left-radius: 12px;
  border-top-right-radius: 2px;
}

.chat-footer {
  padding: 1rem;
  border-top: 1px solid var(--glass-border);
  display: flex;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
}
.chat-input {
  flex: 1;
  border-radius: 20px !important;
  padding: 0.5rem 1rem !important;
  font-size: 0.9rem !important;
}
.btn-send-chat {
  border-radius: 50% !important;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 !important;
  font-size: 1rem !important;
}
</style>
