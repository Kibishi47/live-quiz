# Live Quiz - Web Client (Nuxt 4)

Cette partie contient l'interface utilisateur web du Quiz en temps réel. Elle est construite avec Nuxt 4 en mode Single Page Application (SPA).

## Fonctionnalités Client

- **Interface Hôte** :
  - Création de questions à la volée (jusqu'à 8 options).
  - Lancement des votes en direct.
  - Sélection de la réponse correcte pour clore le vote et distribuer les points.
  - Persistance de la partie en `localStorage`.
- **Interface Participant** :
  - Connexion rapide via code de salon.
  - Validation de vote sécurisée pour éviter les clics erronés.
  - Tableau des scores en temps réel sous forme de ratio (Bonnes réponses / Tentatives).

## Développement Local

### Installation des dépendances
```bash
npm install
```

### Lancement du serveur de développement
```bash
npm run dev
```

### Production static generate
```bash
npm run generate
```
Les fichiers générés iront dans `.output/public/`.
