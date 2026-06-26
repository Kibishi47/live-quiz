package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow dev server origins
	},
}

type Player struct {
	ID                string `json:"id"`
	Nickname          string `json:"nickname"`
	Score             int    `json:"score"`
	Answered          bool   `json:"answered"`
	LastAnswerCorrect *bool  `json:"lastAnswerCorrect"`
	LastOptionIndex   *int   `json:"lastOptionIndex"`
	CorrectCount      int    `json:"correctCount"`
	AttemptedCount    int    `json:"attemptedCount"`
	JoinQuestionIndex int    `json:"joinQuestionIndex"`
	Connected         bool   `json:"connected"`
}

type Question struct {
	ID             string   `json:"id"`
	Text           string   `json:"text"`
	Options        []string `json:"options"`
	CorrectIndex   *int     `json:"correctIndex"`
	CorrectIndices []int    `json:"correctIndices"`
}

type PlayerQuestion struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Options []string `json:"options"`
}

type ChatMessage struct {
	Sender    string `json:"sender"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
}

type GameState struct {
	RoomID               string          `json:"roomId"`
	Phase                string          `json:"phase"`
	Players              []Player        `json:"players"`
	CurrentQuestion      *PlayerQuestion `json:"currentQuestion"`
	RevealAnswers        bool            `json:"revealAnswers"`
	CorrectOptionIndex   *int            `json:"correctOptionIndex"`
	CorrectOptionIndices []int           `json:"correctOptionIndices"`
	Chat                 []ChatMessage   `json:"chat"`
}

type PlayerConn struct {
	ID       string
	Nickname string
	Conn     *websocket.Conn
	mu       sync.Mutex
}

type Room struct {
	ID                   string                 `json:"roomId"`
	Phase                string                 `json:"phase"`
	HostConn             *websocket.Conn        `json:"-"`
	HostMu               sync.Mutex             `json:"-"`
	Players              map[string]*PlayerConn `json:"-"`
	PlayersData          map[string]*Player     `json:"players"`
	PlayersMu            sync.RWMutex           `json:"-"`
	Questions            []Question             `json:"-"`
	Chat                 []ChatMessage          `json:"-"`
	CurrentQuestionIndex int                    `json:"currentQuestionIndex"`
	IsHostPlaying        bool                   `json:"isHostPlaying"`
	HostNickname         string                 `json:"hostNickname"`
	LastActive           time.Time              `json:"-"`
}

func NewRoom(id string) *Room {
	return &Room{
		ID:                   id,
		Phase:                "lobby",
		Players:              make(map[string]*PlayerConn),
		PlayersData:          make(map[string]*Player),
		Questions:            make([]Question, 0),
		Chat:                 make([]ChatMessage, 0),
		CurrentQuestionIndex: -1,
		LastActive:           time.Now(),
	}
}

func (r *Room) BroadcastState() {
	r.PlayersMu.Lock()
	defer r.PlayersMu.Unlock()

	var currentQ *PlayerQuestion
	var correctIdx *int
	var correctOptionIndices []int

	if r.CurrentQuestionIndex >= 0 && r.CurrentQuestionIndex < len(r.Questions) {
		q := r.Questions[r.CurrentQuestionIndex]
		currentQ = &PlayerQuestion{
			ID:      q.ID,
			Text:    q.Text,
			Options: q.Options,
		}
		if r.Phase == "revealed" {
			correctIdx = q.CorrectIndex
			correctOptionIndices = q.CorrectIndices
		}
	}

	// Prepare mapped players list to keep current votes hidden during voting
	playersList := make([]Player, 0, len(r.PlayersData))
	for _, p := range r.PlayersData {
		var isActive bool
		if p.ID == "host-self" {
			isActive = r.HostConn != nil
		} else {
			_, isActive = r.Players[p.ID]
		}
		mappedP := Player{
			ID:                p.ID,
			Nickname:          p.Nickname,
			Score:             p.Score,
			Answered:          p.Answered,
			CorrectCount:      p.CorrectCount,
			AttemptedCount:    p.AttemptedCount,
			JoinQuestionIndex: p.JoinQuestionIndex,
			Connected:         isActive,
		}
		if r.Phase == "revealed" {
			mappedP.LastAnswerCorrect = p.LastAnswerCorrect
			mappedP.LastOptionIndex = p.LastOptionIndex
		}
		playersList = append(playersList, mappedP)
	}

	state := GameState{
		RoomID:               r.ID,
		Phase:                r.Phase,
		Players:              playersList,
		CurrentQuestion:      currentQ,
		RevealAnswers:        r.Phase == "revealed",
		CorrectOptionIndex:   correctIdx,
		CorrectOptionIndices: correctOptionIndices,
		Chat:                 r.Chat,
	}

	payloadPlayer, err := json.Marshal(map[string]interface{}{
		"type":  "STATE_UPDATE",
		"state": state,
	})
	if err != nil {
		log.Printf("Error marshalling player state: %v", err)
		return
	}

	payloadHost, err := json.Marshal(map[string]interface{}{
		"type": "STATE_UPDATE",
		"state": map[string]interface{}{
			"roomId":               r.ID,
			"phase":                r.Phase,
			"players":              playersList,
			"currentQuestion":      currentQ,
			"revealAnswers":        r.Phase == "revealed",
			"correctOptionIndex":   correctIdx,
			"correctOptionIndices": correctOptionIndices,
			"questions":            r.Questions,
			"chat":                 r.Chat,
		},
	})
	if err != nil {
		log.Printf("Error marshalling host state: %v", err)
		return
	}

	// Send state update to Host
	r.HostMu.Lock()
	if r.HostConn != nil {
		r.HostConn.WriteMessage(websocket.TextMessage, payloadHost)
	}
	r.HostMu.Unlock()

	// Send state update to Players
	for _, pConn := range r.Players {
		go func(conn *PlayerConn) {
			conn.mu.Lock()
			defer conn.mu.Unlock()
			conn.Conn.WriteMessage(websocket.TextMessage, payloadPlayer)
		}(pConn)
	}
}

type RoomRegistry struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

var registry = &RoomRegistry{
	rooms: make(map[string]*Room),
}

func (reg *RoomRegistry) GetOrCreateRoom(id string, isHost bool, hostPlay bool, hostNick string) *Room {
	reg.mu.Lock()
	defer reg.mu.Unlock()

	room, ok := reg.rooms[id]
	if !ok {
		room = NewRoom(id)
		if isHost {
			room.IsHostPlaying = hostPlay
			room.HostNickname = hostNick
			if room.IsHostPlaying && room.HostNickname != "" {
				room.PlayersData["host-self"] = &Player{
					ID:                "host-self",
					Nickname:          room.HostNickname,
					Score:             0,
					Answered:          false,
					CorrectCount:      0,
					AttemptedCount:    0,
					JoinQuestionIndex: 0,
				}
			}
		}
		reg.rooms[id] = room
		log.Printf("Created room: %s", id)
	} else if isHost {
		// Update host details on reconnection if room already existed
		room.IsHostPlaying = hostPlay
		room.HostNickname = hostNick
		if room.IsHostPlaying && room.HostNickname != "" {
			if _, exists := room.PlayersData["host-self"]; !exists {
				room.PlayersData["host-self"] = &Player{
					ID:                "host-self",
					Nickname:          room.HostNickname,
					Score:             0,
					Answered:          false,
					CorrectCount:      0,
					AttemptedCount:    0,
					JoinQuestionIndex: 0,
				}
			} else {
				room.PlayersData["host-self"].Nickname = room.HostNickname
			}
		} else {
			delete(room.PlayersData, "host-self")
		}
	}
	room.LastActive = time.Now()
	return room
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	role := r.URL.Query().Get("role")
	nickname := r.URL.Query().Get("nickname")
	playQuery := r.URL.Query().Get("play")

	if roomID == "" || role == "" {
		http.Error(w, "Missing room or role query parameters", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	isHost := role == "host"
	hostPlay := playQuery == "true"

	room := registry.GetOrCreateRoom(roomID, isHost, hostPlay, nickname)

	if isHost {
		handleHost(room, conn)
	} else if role == "player" {
		if nickname == "" {
			nickname = "Anonyme"
		}
		handlePlayer(room, conn, nickname)
	} else {
		conn.WriteJSON(map[string]string{"error": "Invalid role"})
		conn.Close()
	}
}

func handleHost(room *Room, conn *websocket.Conn) {
	room.HostMu.Lock()
	if room.HostConn != nil {
		room.HostConn.Close()
	}
	room.HostConn = conn
	room.HostMu.Unlock()

	log.Printf("Host connected to room: %s", room.ID)
	room.BroadcastState()

	defer func() {
		room.HostMu.Lock()
		if room.HostConn == conn {
			room.HostConn = nil
		}
		room.HostMu.Unlock()
		conn.Close()
		log.Printf("Host disconnected from room: %s", room.ID)
		
		// Garbage collect room after delay if empty
		time.AfterFunc(60*time.Second, func() {
			registry.mu.Lock()
			defer registry.mu.Unlock()
			r, exists := registry.rooms[room.ID]
			if exists && r.HostConn == nil && len(r.Players) == 0 {
				delete(registry.rooms, room.ID)
				log.Printf("Garbage collected room: %s", room.ID)
			}
		})
	}()

	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		if messageType == websocket.TextMessage {
			var cmd map[string]interface{}
			if err := json.Unmarshal(payload, &cmd); err != nil {
				continue
			}

			cmdType, _ := cmd["type"].(string)

			switch cmdType {
			case "ADD_QUESTION":
				text, _ := cmd["text"].(string)
				optsRaw, ok := cmd["options"].([]interface{})
				if !ok || text == "" {
					continue
				}
				options := make([]string, len(optsRaw))
				for i, v := range optsRaw {
					options[i] = fmt.Sprintf("%v", v)
				}
				
				room.Questions = append(room.Questions, Question{
					ID:           fmt.Sprintf("q-%d", time.Now().UnixNano()),
					Text:         text,
					Options:      options,
					CorrectIndex: nil,
				})
				
				if room.Phase != "lobby" {
					room.Phase = "creating_question"
				}
				room.BroadcastState()

			case "EDIT_QUESTION":
				targetQID, _ := cmd["questionId"].(string)
				text, _ := cmd["text"].(string)
				optsRaw, ok := cmd["options"].([]interface{})
				log.Printf("[EDIT_QUESTION] Payload: id=%s, text=%s, ok=%t", targetQID, text, ok)
				if !ok || text == "" || targetQID == "" {
					continue
				}
				options := make([]string, len(optsRaw))
				for i, v := range optsRaw {
					options[i] = fmt.Sprintf("%v", v)
				}
				
				foundIdx := -1
				for i, q := range room.Questions {
					if q.ID == targetQID {
						foundIdx = i
						break
					}
				}
				log.Printf("[EDIT_QUESTION] Found index: %d", foundIdx)
				if foundIdx >= 0 {
					if room.Questions[foundIdx].CorrectIndex == nil {
						room.Questions[foundIdx].Text = text
						room.Questions[foundIdx].Options = options
						log.Printf("[EDIT_QUESTION] Updated question %s successfully", targetQID)
						room.BroadcastState()
					} else {
						log.Printf("[EDIT_QUESTION] Question %s is already validated, skipping edit", targetQID)
					}
				}

			case "PREPARE_NEXT_QUESTION":
				room.Phase = "creating_question"
				room.BroadcastState()

			case "LAUNCH_VOTING":
				if len(room.Questions) == 0 {
					continue
				}
				targetQID, _ := cmd["questionId"].(string)
				targetIdx := -1
				if targetQID != "" {
					for i, q := range room.Questions {
						if q.ID == targetQID {
							targetIdx = i
							break
						}
					}
				} else {
					for i, q := range room.Questions {
						if q.CorrectIndex == nil {
							targetIdx = i
							break
						}
					}
				}

				if targetIdx < 0 || targetIdx >= len(room.Questions) {
					continue
				}
				room.CurrentQuestionIndex = targetIdx
				room.Phase = "voting"
				
				// Reset player active answer statuses for the voting round
				for _, p := range room.PlayersData {
					p.Answered = false
					p.LastAnswerCorrect = nil
					p.LastOptionIndex = nil
				}
				room.BroadcastState()

			case "DELETE_QUESTION":
				targetQID, _ := cmd["questionId"].(string)
				if targetQID == "" {
					continue
				}
				foundIdx := -1
				for i, q := range room.Questions {
					if q.ID == targetQID {
						foundIdx = i
						break
					}
				}
				if foundIdx >= 0 {
					if room.Questions[foundIdx].CorrectIndex == nil {
						room.Questions = append(room.Questions[:foundIdx], room.Questions[foundIdx+1:]...)
						if foundIdx <= room.CurrentQuestionIndex {
							room.CurrentQuestionIndex--
						}
						room.BroadcastState()
					}
				}

			case "CLOSE_VOTING":
				if room.Phase == "voting" {
					room.Phase = "selecting_answer"
					room.BroadcastState()
				}

			case "CANCEL_QUESTION":
				if room.Phase == "voting" || room.Phase == "selecting_answer" {
					if room.CurrentQuestionIndex >= 0 {
						room.CurrentQuestionIndex--
					}
					room.Phase = "creating_question"
					for _, p := range room.PlayersData {
						p.Answered = false
						p.LastAnswerCorrect = nil
						p.LastOptionIndex = nil
					}
					room.BroadcastState()
				}

			case "REVEAL_ANSWER":
				var correctIndices []int
				if indicesVal, exists := cmd["correctIndices"]; exists {
					if list, ok := indicesVal.([]interface{}); ok {
						for _, item := range list {
							if val, ok := item.(float64); ok {
								correctIndices = append(correctIndices, int(val))
							}
						}
					}
				} else if idxVal, ok := cmd["correctIndex"].(float64); ok {
					correctIndices = []int{int(idxVal)}
				}

				if len(correctIndices) == 0 {
					continue
				}

				if room.Phase == "selecting_answer" || room.Phase == "voting" {
					if room.CurrentQuestionIndex >= 0 && room.CurrentQuestionIndex < len(room.Questions) {
						room.Questions[room.CurrentQuestionIndex].CorrectIndices = correctIndices
						firstIdx := correctIndices[0]
						room.Questions[room.CurrentQuestionIndex].CorrectIndex = &firstIdx
					}
					room.Phase = "revealed"

					pointsPerCorrect := 100
					if len(correctIndices) > 1 {
						rawPoints := float64(100) / float64(len(correctIndices))
						pointsPerCorrect = int(math.Ceil(rawPoints / 10.0) * 10.0)
					}

					// Validate player answers and increment stats
					for _, p := range room.PlayersData {
						if room.CurrentQuestionIndex < p.JoinQuestionIndex {
							continue
						}

						if p.Answered {
							p.AttemptedCount += 1
							isCorrect := false
							if p.LastOptionIndex != nil {
								for _, cIdx := range correctIndices {
									if *p.LastOptionIndex == cIdx {
										isCorrect = true
										break
									}
								}
							}
							p.LastAnswerCorrect = &isCorrect
							if isCorrect {
								p.CorrectCount += 1
								p.Score += pointsPerCorrect
							}
						} else {
							p.AttemptedCount += 1
							isCorrect := false
							p.LastAnswerCorrect = &isCorrect
						}
					}
					room.BroadcastState()
				}

			case "REVEAL_MOST_VOTED":
				if room.Phase == "selecting_answer" || room.Phase == "voting" {
					if room.CurrentQuestionIndex >= 0 && room.CurrentQuestionIndex < len(room.Questions) {
						q := room.Questions[room.CurrentQuestionIndex]
						
						counts := make([]int, len(q.Options))
						for _, p := range room.PlayersData {
							if p.LastOptionIndex != nil && *p.LastOptionIndex >= 0 && *p.LastOptionIndex < len(counts) {
								counts[*p.LastOptionIndex]++
							}
						}
						
						maxVal := 0
						for _, c := range counts {
							if c > maxVal {
								maxVal = c
							}
						}
						
						var correctIndices []int
						if maxVal > 0 {
							for idx, c := range counts {
								if c == maxVal {
									correctIndices = append(correctIndices, idx)
								}
							}
						}
						
						if len(correctIndices) == 0 {
							correctIndices = []int{0}
						}

						room.Questions[room.CurrentQuestionIndex].CorrectIndices = correctIndices
						firstIdx := correctIndices[0]
						room.Questions[room.CurrentQuestionIndex].CorrectIndex = &firstIdx
						
						room.Phase = "revealed"

						pointsPerCorrect := 100
						if len(correctIndices) > 1 {
							rawPoints := float64(100) / float64(len(correctIndices))
							pointsPerCorrect = int(math.Ceil(rawPoints / 10.0) * 10.0)
						}

						for _, p := range room.PlayersData {
							if room.CurrentQuestionIndex < p.JoinQuestionIndex {
								continue
							}

							if p.Answered {
								p.AttemptedCount += 1
								isCorrect := false
								if p.LastOptionIndex != nil {
									for _, cIdx := range correctIndices {
										if *p.LastOptionIndex == cIdx {
											isCorrect = true
											break
										}
									}
								}
								p.LastAnswerCorrect = &isCorrect
								if isCorrect {
									p.CorrectCount += 1
									p.Score += pointsPerCorrect
								}
							} else {
								p.AttemptedCount += 1
								isCorrect := false
								p.LastAnswerCorrect = &isCorrect
							}
						}
						room.BroadcastState()
					}
				}

			case "SUBMIT_ANSWER": // Host playing and submits their vote
				optionIdxVal, ok := cmd["optionIndex"].(float64)
				if !ok || !room.IsHostPlaying || room.Phase != "voting" {
					continue
				}
				optionIndex := int(optionIdxVal)
				hostPlayer, exists := room.PlayersData["host-self"]
				if exists && !hostPlayer.Answered {
					hostPlayer.Answered = true
					hostPlayer.LastOptionIndex = &optionIndex
					room.BroadcastState()
				}

			case "END_GAME":
				room.Phase = "ended"
				room.BroadcastState()

			case "KICK_PLAYER":
				targetID, _ := cmd["playerId"].(string)
				if targetID == "" || targetID == "host-self" {
					continue
				}
				room.PlayersMu.Lock()
				if pConn, exists := room.Players[targetID]; exists {
					payload, _ := json.Marshal(map[string]string{
						"type":    "KICKED",
						"message": "Vous avez été exclu de la partie par l'hôte.",
					})
					pConn.mu.Lock()
					pConn.Conn.WriteMessage(websocket.TextMessage, payload)
					pConn.mu.Unlock()
					pConn.Conn.Close()
					delete(room.Players, targetID)
				}
				delete(room.PlayersData, targetID)
				room.PlayersMu.Unlock()
				room.BroadcastState()

			case "DELETE_ROOM":
				room.PlayersMu.Lock()
				for _, pConn := range room.Players {
					payload, _ := json.Marshal(map[string]interface{}{
						"type":  "ROOM_CLOSED",
						"error": "Le salon a été fermé par l'hôte.",
					})
					pConn.mu.Lock()
					pConn.Conn.WriteMessage(websocket.TextMessage, payload)
					pConn.mu.Unlock()
					pConn.Conn.Close()
				}
				room.Players = make(map[string]*PlayerConn)
				room.PlayersMu.Unlock()

				registry.mu.Lock()
				delete(registry.rooms, room.ID)
				registry.mu.Unlock()
				log.Printf("Room %s explicitly deleted by host", room.ID)

			case "RESTART_QUIZ":
				room.Phase = "lobby"
				room.CurrentQuestionIndex = -1
				room.Questions = make([]Question, 0)
				for _, p := range room.PlayersData {
					p.Score = 0
					p.Answered = false
					p.LastAnswerCorrect = nil
					p.LastOptionIndex = nil
					p.CorrectCount = 0
					p.AttemptedCount = 0
					p.JoinQuestionIndex = 0
				}
				room.BroadcastState()

			case "ADJUST_SCORE":
				playerID, _ := cmd["playerId"].(string)
				amountVal, ok := cmd["amount"].(float64)
				if !ok || playerID == "" {
					continue
				}
				amount := int(amountVal)

				room.PlayersMu.Lock()
				if p, exists := room.PlayersData[playerID]; exists {
					p.Score += amount
					if p.Score < 0 {
						p.Score = 0
					}
				}
				room.PlayersMu.Unlock()
				room.BroadcastState()

			case "SEND_CHAT_MESSAGE":
				text, _ := cmd["text"].(string)
				if text == "" {
					continue
				}
				msg := ChatMessage{
					Sender:    "Hôte",
					Text:      text,
					Timestamp: time.Now().Unix(),
				}
				room.PlayersMu.Lock()
				room.Chat = append(room.Chat, msg)
				if len(room.Chat) > 50 {
					room.Chat = room.Chat[len(room.Chat)-50:]
				}
				room.PlayersMu.Unlock()
				room.BroadcastState()
			}
		}
	}
}

func handlePlayer(room *Room, conn *websocket.Conn, nickname string) {
	playerID := fmt.Sprintf("p-%d", time.Now().UnixNano())
	player := &PlayerConn{
		ID:       playerID,
		Nickname: nickname,
		Conn:     conn,
	}

	room.PlayersMu.Lock()
	room.Players[playerID] = player
	
	// Try to restore session by nickname
	var pData *Player
	for _, p := range room.PlayersData {
		if p.Nickname == nickname {
			pData = p
			break
		}
	}

	if pData != nil {
		// Update their connection ID to the new one
		// Wait, if they already answered, don't reset their answers
		delete(room.PlayersData, pData.ID) // Clean up old ID key
		pData.ID = playerID
		room.PlayersData[playerID] = pData
	} else {
		// New player
		pData = &Player{
			ID:                playerID,
			Nickname:          nickname,
			Score:             0,
			Answered:          false,
			LastAnswerCorrect: nil,
			LastOptionIndex:   nil,
			CorrectCount:      0,
			AttemptedCount:    0,
			JoinQuestionIndex: room.CurrentQuestionIndex,
		}
		room.PlayersData[playerID] = pData
	}
	room.PlayersMu.Unlock()

	log.Printf("Player %s (%s) connected to room: %s", nickname, playerID, room.ID)
	room.BroadcastState()

	defer func() {
		room.PlayersMu.Lock()
		delete(room.Players, playerID)
		room.PlayersMu.Unlock()
		conn.Close()

		log.Printf("Player %s (%s) disconnected from room: %s", nickname, playerID, room.ID)
		room.BroadcastState()
	}()

	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		if messageType == websocket.TextMessage {
			var cmd map[string]interface{}
			if err := json.Unmarshal(payload, &cmd); err != nil {
				continue
			}

			cmdType, _ := cmd["type"].(string)

			if cmdType == "LEAVE_ROOM" {
				room.PlayersMu.Lock()
				delete(room.PlayersData, playerID)
				room.PlayersMu.Unlock()
				break
			}

			if cmdType == "SUBMIT_ANSWER" && room.Phase == "voting" {
				optionIdxVal, ok := cmd["optionIndex"].(float64)
				if !ok {
					continue
				}
				optionIndex := int(optionIdxVal)

				room.PlayersMu.Lock()
				playerData, exists := room.PlayersData[playerID]
				if exists && !playerData.Answered {
					if room.CurrentQuestionIndex >= playerData.JoinQuestionIndex {
						playerData.Answered = true
						playerData.LastOptionIndex = &optionIndex
					}
				}
				room.PlayersMu.Unlock()
				room.BroadcastState()
			}

			if cmdType == "SEND_CHAT_MESSAGE" {
				text, _ := cmd["text"].(string)
				if text != "" {
					msg := ChatMessage{
						Sender:    nickname,
						Text:      text,
						Timestamp: time.Now().Unix(),
					}
					room.PlayersMu.Lock()
					room.Chat = append(room.Chat, msg)
					if len(room.Chat) > 50 {
						room.Chat = room.Chat[len(room.Chat)-50:]
					}
					room.PlayersMu.Unlock()
					room.BroadcastState()
				}
			}
		}
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/ws", handleWebSocket)

	log.Printf("WebSocket server listening on port %s", port)
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatalf("Server start failed: %v", err)
	}
}
