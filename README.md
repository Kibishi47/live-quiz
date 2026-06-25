# Live Quiz - WebSocket Serverless-Like Mono-Repo

Ce projet est un système de quiz interactif en temps réel, constitué de deux parties distinctes :
1. **`web/`** : L'application web interactive développée avec Nuxt 4 (Vue.js).
2. **`server/`** : Le serveur d'orchestration en Go qui gère la communication WebSocket entre l'hôte et les participants de manière bidirectionnelle.

---

## Structure du Projet

```
live-quiz/
├── Dockerfile          # Compile le frontend statique et l'intègre au binaire Go (Déploiement Coolify)
├── server/             # Serveur WebSocket en Go
└── web/                # Interface SPA en Nuxt 4
```

---

## Lancement en Développement Local

Pour faire tourner le projet localement :

### 1. Démarrer le Serveur Go
Allez dans le dossier `server` et lancez :
```bash
go run main.go
```
Le serveur WebSocket démarrera sur le port `8080`.

### 2. Démarrer le Frontend Nuxt
Allez dans le dossier `web` et lancez :
```bash
npm run dev
```
L'interface sera accessible sur `http://localhost:3000` (ou `3001` si occupé). Le client détecte automatiquement le mode de développement et se connecte au port `8080`.

---

## Déploiement (Coolify / Docker)

Le projet dispose d'un `Dockerfile` multi-étapes à la racine :
1. Il compile le frontend Nuxt en mode statique (SPA).
2. Il compile le binaire Go.
3. Il intègre le dossier généré directement dans le conteneur final servi par le binaire Go.

Pour déployer sur Coolify, pointez simplement sur la racine du dépôt git.
