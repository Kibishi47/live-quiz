import { ref, onBeforeUnmount } from 'vue'
import type { GameState } from './useQuizHost'

export function useQuizPlayer() {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref('')
  const gameState = ref<GameState | null>(null)

  const joinRoom = async (roomId: string, nickname: string) => {
    if (!process.client) return
    
    isConnecting.value = true
    error.value = ''
    
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

      const wsUrl = `${baseWsUrl}/ws?room=${roomId.trim().toLowerCase()}&role=player&nickname=${encodeURIComponent(nickname)}`

      ws.value = new WebSocket(wsUrl)

      ws.value.onopen = () => {
        isConnected.value = true
        isConnecting.value = false
      }

      ws.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data && data.type === 'STATE_UPDATE') {
            gameState.value = data.state
          } else if (data && data.type === 'KICKED') {
            error.value = data.message || 'Vous avez été exclu de la partie.'
            disconnect()
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e)
        }
      }

      ws.value.onclose = () => {
        isConnected.value = false
        isConnecting.value = false
        error.value = 'La connexion avec le serveur a été fermée.'
      }

      ws.value.onerror = (err) => {
        console.error('WebSocket Player error:', err)
        isConnected.value = false
        isConnecting.value = false
        error.value = 'Erreur de connexion avec le serveur.'
      }
    } catch (err: any) {
      isConnecting.value = false
      error.value = `Une erreur est survenue: ${err.message}`
    }
  }

  const submitAnswer = (questionId: string, optionIndex: number) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'SUBMIT_ANSWER',
        questionId,
        optionIndex
      }))
    }
  }

  const leaveRoom = () => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'LEAVE_ROOM'
      }))
    }
    disconnect()
  }

  const sendChatMessage = (text: string) => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'SEND_CHAT_MESSAGE',
        text
      }))
    }
  }

  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
    }
    isConnected.value = false
    gameState.value = null
  }

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    isConnected,
    isConnecting,
    error,
    gameState,
    joinRoom,
    submitAnswer,
    leaveRoom,
    disconnect,
    sendChatMessage
  }
}
