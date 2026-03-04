# LA STATION — B42 Launcher

Launcher Electron pour Project Zomboid (Build 42) — serveur LA STATION.  
Interface dark premium inspirée des launchers Riot Games / Epic Games.

---

## Stack technique
- **Electron** 29 + **React** 18 + **TypeScript** 5
- **Framer Motion** pour les animations
- **CSS Modules** pour le style
- **vite-plugin-electron** pour le bundling
- **electron-builder** pour la distribution Windows

---

## Structure du projet

```
LA STATION - LAUNCHER/
├── electron/
│   ├── main.ts             # Processus principal Electron
│   ├── preload.ts          # Bridge contextIsolation → renderer
│   ├── gameDetector.ts     # Scan C→M pour détecter PZ
│   ├── patchManager.ts     # Check / download / inject / restore
│   └── sessionManager.ts  # Cycle complet de session
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── context/
│   │   └── LauncherContext.tsx  # État global + IPC bindings
│   ├── components/
│   │   ├── TitleBar/           # Barre de titre custom frameless
│   │   ├── PlayButton/         # Bouton multi-états + steps
│   │   ├── PatchStatus/        # Badge vert/orange/rouge
│   │   ├── LogPanel/           # Logs dépliables
│   │   ├── ToastContainer/     # Notifications animées
│   │   ├── HeroBackground/     # Fond atmosphérique CSS
│   │   └── OnboardingScreen/   # Sélection manuelle du dossier
│   ├── pages/
│   │   └── MainPage/
│   ├── styles/
│   │   └── global.css
│   └── types/
│       ├── assets.d.ts
│       └── electron.d.ts
├── patch/
│   └── version.json        # Exemple de version.json à héberger sur GitHub
└── assets/
    └── icon.ico            # Icône de l'application (à ajouter)
```

---

## Configuration requise

### 1. URLs GitHub (patchManager.ts)
Editez `electron/patchManager.ts` :
```typescript
const REMOTE_VERSION_URL =
  'https://raw.githubusercontent.com/VOTRE_ORG/VOTRE_REPO/main/patch/version.json';

const PATCH_BASE_URL =
  'https://raw.githubusercontent.com/VOTRE_ORG/VOTRE_REPO/main/patch/classes/';
```

### 2. Lien Discord (MainPage.tsx)
```typescript
const DISCORD_URL = 'https://discord.gg/VOTRE_DISCORD';
```

### 3. Icône app
Placez votre icône dans `assets/icon.ico`

### 4. Java (pour la commande `jar uf`)
Project Zomboid embarque son propre JRE. Si `jar` n'est pas dans le PATH système,
le `patchManager.ts` tente `C:\Program Files\Java\jre1.8.0_333\bin\jar.exe`.
Adaptez le chemin si nécessaire ou ajoutez Java au PATH.

---

## version.json — Format

Hébergez sur GitHub dans `patch/version.json` :
```json
{
  "version": "1.0.0",
  "patchedClasses": [
    "zombie/network/StatePacket.class",
    "zombie/inventory/types/ContainerID.class"
  ],
  "changelog": "Fix NullPointerException"
}
```

Les fichiers `.class` correspondants doivent être accessibles à :
```
https://raw.githubusercontent.com/.../patch/classes/zombie/network/StatePacket.class
```

---

## Développement

```bash
npm install
npm run dev        # Lance Vite + Electron en parallèle
```

## Build Windows

```bash
npm run build      # Compile + electron-builder → release/
```

---

## Cycle de session (résumé)

```
[JOUER]
  → Vérifier version.json distant
  → Télécharger .class si nécessaire
  → Créer .bak si inexistant
  → Injecter via jar uf
  → steam://rungameid/108600
  → Poll tasklist toutes les 2s (timeout 60s)
  → Quand ProjectZomboid64.exe disparaît → restore .bak
  → Afficher "Session terminée"
```

---

## Sécurité

- **app.on('before-quit')** : restaure le JAR avant fermeture
- **Détection patch orphelin** : au démarrage, si `.bak` existe et JAR ≠ BAK → propose restauration
- Jamais de crash silencieux — toutes les erreurs en toast animé
