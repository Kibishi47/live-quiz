# Live Quiz - WebSocket Server (Go)

Ce dossier contient le serveur d'orchestration en Go. Il sert de routeur de messages WebSocket léger entre l'Hôte et ses participants.

## Fonctionnalités

- **WebSocket Broker** :
  - Endpoint `/ws` gérant les rôles d'hôte et de joueur de manière concurrente et thread-safe.
  - Transfert immédiat des messages des joueurs à l'hôte.
  - Diffusion générale ou sélective des états de jeu envoyés par l'hôte.
- **SPA static server** : En production, sert le dossier frontend statique `./dist`. Si une route n'existe pas en physique, il redirige vers `index.html` pour laisser le routeur client (Vue Router) gérer la navigation.

## Lancement

```bash
go run main.go
```

Le serveur écoute par défaut sur le port configuré par la variable d'environnement `PORT` ou sur le port `8080`.
