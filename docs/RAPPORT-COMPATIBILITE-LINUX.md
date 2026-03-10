# Rapport d'analyse — Compatibilité Linux (electron-builder)

Ce document liste tout ce qui est actuellement spécifique à Windows dans le projet et les modifications appliquées pour permettre une build et une exécution sous Linux.

---

## 1. Résumé exécutif

| Fichier / zone | Problème | Gravité | Statut |
|----------------|----------|---------|--------|
| `electron/consoleWatcher.ts` | Chemin Windows en dur pour `console.txt` | Moyen | Corrigé |
| `electron/gameDetector.ts` | Détection Steam basée sur lecteurs C:–M et chemins Windows | Bloquant | Corrigé |
| `electron/modManager.ts` | Chemins Steam Windows, `start ""` pour ouvrir URL | Bloquant | Corrigé |
| `electron/sessionManager.ts` | `tasklist`/`taskkill`, `start ""`, nom processus `.exe` | Bloquant | Corrigé |
| `electron/main.ts` | Icône fenêtre/tray en `.ico` uniquement | Moyen | Corrigé (fallback PNG) |
| `package.json` (build) | Section `win` uniquement, pas de cible Linux | Bloquant | Corrigé |

---

## 2. Détail par fichier

### 2.1 `electron/consoleWatcher.ts`

- **Problème** : `CONSOLE_CANDIDATES` contient un chemin Windows en dur :
  - `join('C:\\Users', os.userInfo().username, 'Zomboid', 'console.txt')`
- **Impact** : Sous Linux, seul `join(os.homedir(), 'Zomboid', 'console.txt')` est pertinent. Le second chemin ne trouve jamais le fichier sous Linux et est redondant sous Windows (équivalent à `homedir()` sur la plupart des configs).
- **Correction** : Construire la liste des candidats en fonction de `process.platform` : une seule entrée `join(os.homedir(), 'Zomboid', 'console.txt')` pour tous les OS (ou ajouter des variantes Linux/macOS si besoin plus tard).

---

### 2.2 `electron/gameDetector.ts`

- **Problème** :
  - `STEAM_PATHS` et `DRIVE_LETTERS` (C à M) : logique 100 % Windows.
  - `join(\`${drive}:\\\`, steamPath)` : construction de chemin type `C:\Program Files (x86)\Steam\...`
- **Impact** : La détection automatique du jeu échoue sous Linux (pas de lecteurs C:, D:, etc.).
- **Correction** :
  - Sous **Windows** : conserver la logique actuelle (lecteurs + chemins Steam standards).
  - Sous **Linux** : utiliser les emplacements Steam courants (`~/.steam/steam`, `~/.local/share/Steam`, etc.) et, si nécessaire, parser `libraryfolders.vdf` pour les bibliothèques additionnelles.
  - Sous **macOS** : idem, chemins Steam macOS si vous ciblez la plateforme plus tard.

---

### 2.3 `electron/modManager.ts`

- **Problème** :
  - `getSteamLibraryPaths()` : uniquement `C:\Program Files (x86)\Steam`, `C:\Program Files\Steam`, `C:\Steam`.
  - `subscribeWorkshopMod()` : `execAsync('start "" "${uri}"')` — commande Windows pour ouvrir une URL.
  - Parsing VDF : `replace(/\\\\/g, '\\')` orienté chemins Windows.
- **Impact** : Sous Linux, aucune bibliothèque Steam n’est trouvée ; l’ouverture des liens Workshop ne fonctionne pas.
- **Correction** :
  - `getSteamLibraryPaths()` : selon `process.platform`, retourner soit les racines Steam Windows, soit les chemins Linux (et plus tard macOS).
  - `subscribeWorkshopMod()` : utiliser `shell.openExternal(uri)` (Electron) au lieu de `exec('start ...')`, afin de fonctionner sur Windows, Linux et macOS.

**Note** : Le format de `default.txt` (ex. `mod = \\ModId,`) est défini par Project Zomboid ; il est identique sur toutes les plateformes. Aucun changement nécessaire pour ce format.

---

### 2.4 `electron/sessionManager.ts`

- **Problème** :
  - `PZ_PROCESS_NAME = 'ProjectZomboid64.exe'` : sous Linux le binaire n’a en général pas d’extension (ex. `ProjectZomboid64`).
  - `isPZRunning()` : utilisation de `tasklist /FI "IMAGENAME eq ..."` (Windows).
  - `killPZ()` : utilisation de `taskkill /IM "..." /F` (Windows).
  - `launchPZ()` : `execAsync('start "" "${uri}"')` pour lancer l’URL Steam (Windows).
- **Impact** : Sous Linux, le launcher ne peut ni détecter ni lancer Project Zomboid, ni le tuer proprement.
- **Correction** :
  - Nom du processus : selon l’OS, utiliser `ProjectZomboid64.exe` (Windows) ou `ProjectZomboid64` (Linux/macOS).
  - Détection du processus : sous Windows garder `tasklist` ; sous Linux utiliser par ex. `pgrep -f ProjectZomboid64` ou équivalent.
  - Arrêt du processus : sous Windows garder `taskkill` ; sous Linux utiliser `pkill` ou `killall`.
  - Lancement Steam : remplacer `start ""` par `shell.openExternal(uri)` (Electron) pour que `steam://` soit ouvert par le bon handler (Steam) sur chaque OS.

---

### 2.5 `electron/main.ts`

- **Problème** :
  - Fenêtre : `icon: join(__dirname, '../assets/icon.ico')`.
  - Tray : `nativeImage.createFromPath(join(__dirname, '../assets/icon.ico'))`.
  - Sous Linux (et souvent macOS), les icônes sont en général en PNG (ex. 256×256, 512×512) ; le `.ico` peut ne pas être supporté ou mal rendu (notamment pour le tray).
- **Impact** : Icône manquante ou de mauvaise qualité sous Linux.
- **Correction** :
  - Utiliser une icône selon la plateforme : par ex. `icon.ico` sous Windows, `icon.png` sous Linux (et macOS si besoin).
  - Si `icon.png` n’existe pas, conserver un fallback sur `icon.ico` pour ne pas casser la build.

---

### 2.6 `package.json` (section `build`)

- **Problème** :
  - Seule la section `"win"` est définie (icône, cible NSIS x64).
  - Aucune section `"linux"` pour electron-builder.
- **Impact** : Impossible de produire un paquet Linux (AppImage, deb, etc.) sans config dédiée.
- **Correction** :
  - Ajouter une section `"linux"` avec au minimum :
    - `icon` : ex. `assets/icon.png` (recommandé 256×256 ou 512×512).
    - `target` : par ex. `AppImage`, `deb`, ou les deux selon vos besoins.

---

## 3. Fichiers sans changement nécessaire

- **`electron/patchManager.ts`** : utilisation de `join()`, chemins relatifs et `adm-zip` (Node.js) ; pas d’API Windows spécifique.
- **`package-lock.json`** : les références à `win32` dans les dépendances (esbuild, rollup, etc.) sont des binaires optionnels par plateforme ; npm installe automatiquement les bons pour l’OS cible.
- **Scripts** : `release.bat` est Windows uniquement par choix ; la build Linux s’effectue avec `npm run build` ou `electron-builder` avec la cible `linux`.

---

## 4. Asset requis pour Linux

- **Icône** : fournir au moins une icône PNG pour Linux (et éventuellement macOS), par ex. :
  - `assets/icon.png` en 256×256 ou 512×512.
  Vous pouvez exporter depuis votre `icon.ico` avec un outil (GIMP, ImageMagick, etc.) ou un script.

---

## 5. Vérifications recommandées après mise en œuvre

1. Build : `npm run build` avec une cible Linux (ou `electron-builder --linux`) sans erreur.
2. Lancement : l’app démarre, la fenêtre et le tray (si utilisé) affichent une icône.
3. Détection du jeu : chemin Steam Linux détecté ; chemin du jeu correct.
4. Session : lancement de PZ via Steam (`steam://`), détection du processus, fermeture propre (kill) et restauration du JAR.
5. Mods : chemins `default.txt` et bibliothèques Steam corrects ; ouverture des liens Workshop via le navigateur/Steam.

Ce rapport reflète l’état du projet après application des corrections décrites ci-dessus.
