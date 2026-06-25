import { ref, onBeforeUnmount } from 'vue'

export interface Player {
  id: string
  nickname: string
  score: number
  answered: boolean
  lastAnswerCorrect: boolean | null
  lastOptionIndex: number | null
  correctCount: number
  attemptedCount: number
  joinQuestionIndex: number
}

export interface Question {
  id: string
  text: string
  options: string[]
  correctIndex: number | null
}

export interface GameState {
  roomId: string
  phase: 'lobby' | 'creating_question' | 'voting' | 'selecting_answer' | 'revealed' | 'ended'
  players: Player[]
  currentQuestion: {
    id: string
    text: string
    options: string[]
  } | null
  revealAnswers: boolean
  correctOptionIndex: number | null
}

export function useQuizHost() {
  const peer = ref<any>(null)
  const connections = ref<{ [id: string]: any }>({})
  
  const roomId = ref('')
  const phase = ref<'lobby' | 'creating_question' | 'voting' | 'selecting_answer' | 'revealed' | 'ended'>('lobby')
  const players = ref<Player[]>([])
  const questions = ref<Question[]>([])
  const currentQuestionIndex = ref(-1)
  const isPeerReady = ref(false)
  const peerError = ref('')

  // If host wants to play too
  const hostNickname = ref('')
  const isHostPlaying = ref(false)

  // Save current host state to localStorage
  const saveStateToLocalStorage = () => {
    if (!process.client || !roomId.value) return
    const stateData = {
      phase: phase.value,
      players: players.value,
      questions: questions.value,
      currentQuestionIndex: currentQuestionIndex.value,
      isHostPlaying: isHostPlaying.value,
      hostNickname: hostNickname.value
    }
    localStorage.setItem(`livequiz-host-${roomId.value}`, JSON.stringify(stateData))
  }

  // Load host state from localStorage
  const loadStateFromLocalStorage = (roomName: string) => {
    if (!process.client) return false
    const saved = localStorage.getItem(`livequiz-host-${roomName}`)
    if (!saved) return false
    try {
      const stateData = JSON.parse(saved)
      phase.value = stateData.phase || 'lobby'
      players.value = stateData.players || []
      questions.value = stateData.questions || []
      currentQuestionIndex.value = stateData.currentQuestionIndex ?? -1
      isHostPlaying.value = stateData.isHostPlaying || false
      hostNickname.value = stateData.hostNickname || ''
      return true
    } catch (e) {
      console.error('Error loading state from localStorage:', e)
      return false
    }
  }

  // Initialize the PeerJS Host
  const initHost = async (customRoomId: string, hostPlay: boolean, hostNick: string) => {
    if (!process.client) return
    
    // Clean and set Room ID
    roomId.value = customRoomId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
    
    // Check if we can restore state from localStorage
    const hasRestored = loadStateFromLocalStorage(roomId.value)
    
    if (!hasRestored) {
      isHostPlaying.value = hostPlay
      hostNickname.value = hostNick
      
      // Initialize fresh player array
      if (isHostPlaying.value && hostNickname.value) {
        players.value.push({
          id: 'host-self',
          nickname: hostNickname.value,
          score: 0,
          answered: false,
          lastAnswerCorrect: null,
          lastOptionIndex: null,
          correctCount: 0,
          attemptedCount: 0,
          joinQuestionIndex: 0
        })
      }
      saveStateToLocalStorage()
    }

    const { Peer } = await import('peerjs')
    const peerId = `livequiz-${roomId.value}`
    
    try {
      peer.value = new Peer(peerId, {
        debug: 1
      })

      peer.value.on('open', () => {
        isPeerReady.value = true
        peerError.value = ''
        broadcastState()
      })

      peer.value.on('error', (err: any) => {
        console.error('PeerJS Host error:', err)
        if (err.type === 'unavailable-id') {
          peerError.value = 'Ce nom d\'événement est déjà utilisé. Choisis-en un autre.'
        } else {
          peerError.value = `Erreur de connexion: ${err.message || err.type}`
        }
        isPeerReady.value = false
      })

      peer.value.on('connection', (conn: any) => {
        conn.on('open', () => {
          connections.value[conn.peer] = conn
        })

        conn.on('data', (data: any) => {
          handleIncomingMessage(conn.peer, data)
        })

        conn.on('close', () => {
          // Keep player record but clean up connection
          delete connections.value[conn.peer]
          broadcastState()
        })
        
        conn.on('error', () => {
          delete connections.value[conn.peer]
          broadcastState()
        })
      })
    } catch (err: any) {
      peerError.value = `Une erreur est survenue: ${err.message}`
    }
  }

  // Handle messages from players
  const handleIncomingMessage = (peerId: string, message: any) => {
    if (!message || typeof message !== 'object') return

    switch (message.type) {
      case 'JOIN':
        // Check if player by nickname already exists (reconnection case)
        const existingPlayer = players.value.find(p => p.nickname === message.nickname)
        if (existingPlayer) {
          existingPlayer.id = peerId
        } else {
          // New player
          players.value.push({
            id: peerId,
            nickname: message.nickname || 'Anonyme',
            score: 0,
            answered: false,
            lastAnswerCorrect: null,
            lastOptionIndex: null,
            correctCount: 0,
            attemptedCount: 0,
            joinQuestionIndex: Math.max(0, currentQuestionIndex.value)
          })
        }
        saveStateToLocalStorage()
        broadcastState()
        break

      case 'SUBMIT_ANSWER':
        if (phase.value !== 'voting') return
        const player = players.value.find(p => p.id === peerId)
        if (player && !player.answered) {
          // Late-join safety check
          if (currentQuestionIndex.value < player.joinQuestionIndex) return

          player.answered = true
          player.lastOptionIndex = message.optionIndex
          player.lastAnswerCorrect = null
          
          saveStateToLocalStorage()
          broadcastState()
        }
        break
    }
  }

  // Send state update to all connected players
  const broadcastState = () => {
    const currentQ = getCurrentQuestionForPlayers()
    const currentQData = currentQuestionIndex.value >= 0 ? questions.value[currentQuestionIndex.value] : null
    
    const state: GameState = {
      roomId: roomId.value,
      phase: phase.value,
      // Map players to obscure current options during voting
      players: players.value.map(p => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        answered: p.answered,
        lastAnswerCorrect: phase.value === 'revealed' ? p.lastAnswerCorrect : null,
        lastOptionIndex: phase.value === 'revealed' ? p.lastOptionIndex : null,
        correctCount: p.correctCount,
        attemptedCount: p.attemptedCount,
        joinQuestionIndex: p.joinQuestionIndex
      })),
      currentQuestion: currentQ,
      revealAnswers: phase.value === 'revealed',
      correctOptionIndex: (phase.value === 'revealed' && currentQData) ? currentQData.correctIndex : null
    }

    Object.values(connections.value).forEach((conn: any) => {
      if (conn.open) {
        conn.send({
          type: 'STATE_UPDATE',
          state
        })
      }
    })
  }

  const getCurrentQuestionForPlayers = () => {
    if (currentQuestionIndex.value < 0 || currentQuestionIndex.value >= questions.value.length) return null
    const q = questions.value[currentQuestionIndex.value]
    return {
      id: q.id,
      text: q.text,
      options: q.options
    }
  }

  // Host Action: Add a new question in real time
  const addQuestion = (text: string, options: string[]) => {
    const newQ: Question = {
      id: Math.random().toString(36).substring(2, 9),
      text,
      options,
      correctIndex: null
    }
    questions.value.push(newQ)
    
    // Transition to creating_question state for others if not in lobby
    if (phase.value !== 'lobby') {
      phase.value = 'creating_question'
    }
    
    saveStateToLocalStorage()
    broadcastState()
  }

  // Host Action: Go to the creation screen of next question
  const prepareNextQuestion = () => {
    phase.value = 'creating_question'
    saveStateToLocalStorage()
    broadcastState()
  }

  // Host Action: Launch voting for the newly created question
  const launchVoting = () => {
    if (questions.value.length === 0) return
    
    // Set index to the latest question in the list
    currentQuestionIndex.value = questions.value.length - 1
    phase.value = 'voting'
    
    // Reset player active answer statuses for the voting round
    players.value.forEach(p => {
      p.answered = false
      p.lastAnswerCorrect = null
      p.lastOptionIndex = null
    })
    
    saveStateToLocalStorage()
    broadcastState()
  }

  // Host Action: Close voting phase and move to answer selection
  const closeVoting = () => {
    if (phase.value !== 'voting') return
    phase.value = 'selecting_answer'
    saveStateToLocalStorage()
    broadcastState()
  }

  // Host Action: Validate/confirm the correct answer
  const revealQuestionAnswers = (correctIndex: number) => {
    if (phase.value !== 'selecting_answer' && phase.value !== 'voting') return
    
    const currentQ = questions.value[currentQuestionIndex.value]
    if (currentQ) {
      currentQ.correctIndex = correctIndex
    }

    phase.value = 'revealed'
    
    // Update scores, correct and attempted counts for all active players
    players.value.forEach(p => {
      // Skip players who joined after this question was launched
      if (currentQuestionIndex.value < p.joinQuestionIndex) return

      if (p.answered) {
        p.attemptedCount += 1
        if (p.lastOptionIndex === correctIndex) {
          p.lastAnswerCorrect = true
          p.correctCount += 1
          p.score += 100
        } else {
          p.lastAnswerCorrect = false
        }
      } else {
        // Did not answer, counts as attempted (missed) if they were in the game
        p.attemptedCount += 1
        p.lastAnswerCorrect = false
      }
    })
    
    saveStateToLocalStorage()
    broadcastState()
  }

  // Host Action: End game
  const endGame = () => {
    phase.value = 'ended'
    saveStateToLocalStorage()
    broadcastState()
  }

  // Host self answering mechanism
  const submitHostSelfAnswer = (optionIndex: number) => {
    if (phase.value !== 'voting' || !isHostPlaying.value) return
    const hostPlayer = players.value.find(p => p.id === 'host-self')
    if (hostPlayer && !hostPlayer.answered) {
      // Join index protection
      if (currentQuestionIndex.value < hostPlayer.joinQuestionIndex) return

      hostPlayer.answered = true
      hostPlayer.lastOptionIndex = optionIndex
      hostPlayer.lastAnswerCorrect = null
      
      saveStateToLocalStorage()
      broadcastState()
    }
  }

  // Host Action: Reset everything
  const restartQuiz = () => {
    phase.value = 'lobby'
    currentQuestionIndex.value = -1
    questions.value = []
    players.value.forEach(p => {
      p.score = 0
      p.answered = false
      p.lastAnswerCorrect = null
      p.lastOptionIndex = null
      p.correctCount = 0
      p.attemptedCount = 0
      p.joinQuestionIndex = 0
    })
    saveStateToLocalStorage()
    broadcastState()
  }

  // Cleanup peer connection on unmount
  onBeforeUnmount(() => {
    if (peer.value) {
      peer.value.destroy()
    }
  })

  return {
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
  }
}
