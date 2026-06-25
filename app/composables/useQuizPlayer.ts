import { ref, onBeforeUnmount } from 'vue'
import type { GameState } from './useQuizHost'

export function useQuizPlayer() {
  const peer = ref<any>(null)
  const connection = ref<any>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref('')
  const gameState = ref<GameState | null>(null)

  const joinRoom = async (roomId: string, nickname: string) => {
    if (!process.client) return
    
    isConnecting.value = true
    error.value = ''

    const { Peer } = await import('peerjs')
    
    try {
      peer.value = new Peer(undefined, {
        debug: 1
      })

      peer.value.on('open', () => {
        const hostPeerId = `livequiz-${roomId.trim().toLowerCase()}`
        const conn = peer.value.connect(hostPeerId)

        conn.on('open', () => {
          connection.value = conn
          isConnected.value = true
          isConnecting.value = false
          
          // Send join message
          conn.send({
            type: 'JOIN',
            nickname: nickname
          })
        })

        conn.on('data', (data: any) => {
          if (data && data.type === 'STATE_UPDATE') {
            gameState.value = data.state
          }
        })

        conn.on('close', () => {
          isConnected.value = false
          error.value = 'La connexion avec le host a été fermée.'
        })

        conn.on('error', (err: any) => {
          isConnected.value = false
          error.value = `Erreur de connexion: ${err.message || err.type}`
        })
      })

      peer.value.on('error', (err: any) => {
        isConnecting.value = false
        error.value = `Impossible d'initialiser le système peer-to-peer: ${err.message || err.type}`
      })
    } catch (err: any) {
      isConnecting.value = false
      error.value = `Une erreur est survenue: ${err.message}`
    }
  }

  const submitAnswer = (questionId: string, optionIndex: number) => {
    if (connection.value && connection.value.open) {
      connection.value.send({
        type: 'SUBMIT_ANSWER',
        questionId,
        optionIndex
      })
    }
  }

  const disconnect = () => {
    if (peer.value) {
      peer.value.destroy()
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
    disconnect
  }
}
