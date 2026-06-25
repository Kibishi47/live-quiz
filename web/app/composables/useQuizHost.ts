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
  connected: boolean
}

export interface Question {
  id: string
  text: string
  options: string[]
  correctIndex: number | null
}

export interface ChatMessage {
  sender: string
  text: string
  timestamp: number
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
  questions?: Question[]
  chat?: ChatMessage[]
}

export function useQuizHost() {
  const ws = ref<WebSocket | null>(null)
  
  const roomId = ref('')
  const phase = ref<'lobby' | 'creating_question' | 'voting' | 'selecting_answer' | 'revealed' | 'ended'>('lobby')
  const players = ref<Player[]>([])
  const questions = ref<Question[]>([])
  const chat = ref<ChatMessage[]>([])
  const currentQuestion = ref<{ id: string; text: string; options: string[] } | null>(null)
  const currentQuestionIndex = ref(-1)
  const isPeerReady = ref(false)
  const peerError = ref('')

  // If host wants to play too
  const hostNickname = ref('')
  const isHostPlaying = ref(false)

  // Initialize the WebSocket Host
  const initHost = async (customRoomId: string, hostPlay: boolean, hostNick: string) => {
    if (!process.client) return
    
    // Clean and set Room ID
    roomId.value = customRoomId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
    isHostPlaying.value = hostPlay
    hostNickname.value = hostNick

    try {
      const config = useRuntimeConfig()
      let baseWsUrl = config.public.wsUrl
      if (baseWsUrl) {
        if (baseWsUrl.startsWith('https://')) {
          baseWsUrl = 'wss://' + baseWsUrl.slice(8)
        } else if (baseWsUrl.startsWith('http://')) {
          baseWsUrl = 'ws://' + baseWsUrl.slice(7)
        } else if (!baseWsUrl.startsWith('ws://') && !baseWsUrl.startsWith('wss://')) {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          baseWsUrl = `${protocol}//${baseWsUrl}`
        }
        if (baseWsUrl.endsWith('/')) {
          baseWsUrl = baseWsUrl.slice(0, -1)
        }
      } else {
        const loc = window.location
        let wsHost = loc.host
        if (wsHost.includes('localhost:') || wsHost.includes('127.0.0.1:')) {
          wsHost = 'localhost:8080'
        }
        const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
        baseWsUrl = `${protocol}//${wsHost}`
      }

      const wsUrl = `${baseWsUrl}/ws?room=${roomId.value}&role=host&nickname=${encodeURIComponent(hostNickname.value)}&play=${isHostPlaying.value}`

      ws.value = new WebSocket(wsUrl)

      ws.value.onopen = () => {
        isPeerReady.value = true
        peerError.value = ''
      }

      ws.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data && data.type === 'STATE_UPDATE') {
            const state = data.state
            roomId.value = state.roomId
            phase.value = state.phase
            players.value = state.players || []
            questions.value = state.questions || []
            chat.value = state.chat || []
            currentQuestion.value = state.currentQuestion || null
            currentQuestionIndex.value = state.currentQuestionIndex ?? -1
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e)
        }
      }

      ws.value.onclose = () => {
        isPeerReady.value = false
        peerError.value = 'Connexion avec le serveur perdue.'
      }

      ws.value.onerror = (err) => {
        console.error('WebSocket Host error:', err)
        peerError.value = 'Erreur de connexion avec le serveur.'
        isPeerReady.value = false
      }
    } catch (err: any) {
      peerError.value = `Une erreur est survenue: ${err.message}`
    }
  }

  // Host Actions (all route as control commands to the Go server)
  const addQuestion = (text: string, options: string[]) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'ADD_QUESTION',
        text,
        options
      }))
    }
  }

  const prepareNextQuestion = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'PREPARE_NEXT_QUESTION'
      }))
    }
  }

  const launchVoting = (questionId?: string) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'LAUNCH_VOTING',
        questionId
      }))
    }
  }

  const deleteQuestion = (questionId: string) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'DELETE_QUESTION',
        questionId
      }))
    }
  }

  const closeVoting = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'CLOSE_VOTING'
      }))
    }
  }

  const revealQuestionAnswers = (correctIndex: number) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'REVEAL_ANSWER',
        correctIndex
      }))
    }
  }

  const endGame = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'END_GAME'
      }))
    }
  }

  const submitHostSelfAnswer = (optionIndex: number) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'SUBMIT_ANSWER',
        optionIndex
      }))
    }
  }

  const cancelQuestion = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'CANCEL_QUESTION'
      }))
    }
  }

  const kickPlayer = (playerId: string) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'KICK_PLAYER',
        playerId
      }))
    }
  }

  const leaveRoom = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'DELETE_ROOM'
      }))
      ws.value.close()
    }
  }

  const editQuestion = (questionId: string, text: string, options: string[]) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'EDIT_QUESTION',
        questionId,
        text,
        options
      }))
    }
  }

  const sendChatMessage = (text: string) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'SEND_CHAT_MESSAGE',
        text
      }))
    }
  }

  const restartQuiz = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'RESTART_QUIZ'
      }))
    }
  }

  onBeforeUnmount(() => {
    if (ws.value) {
      ws.value.close()
    }
  })

  return {
    roomId,
    phase,
    players,
    questions,
    chat,
    currentQuestion,
    currentQuestionIndex,
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
    submitHostSelfAnswer,
    endGame,
    cancelQuestion,
    kickPlayer,
    leaveRoom,
    deleteQuestion,
    restartQuiz,
    sendChatMessage
  }
}
