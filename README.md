# OptiBuilding

Application web d'analyse et de rénovation énergétique des bâtiments.

Dessinez votre bâtiment sur une carte, obtenez son **DPE physique** (ISO 13790), calibrez le modèle sur votre consommation réelle, et comparez des scénarios de rénovation avec leur retour sur investissement.

## Architecture

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Backend** | Python / FastAPI | API REST, simulation thermique, auth JWT, BDD |
| **Moteur physique** | [thermal-engine](https://github.com/MaximeGRELET/thermal-engine) | ISO 13790, EPW, rénovation |
| **Frontend** | Vite + Vanilla JS | Carte MapLibre, interface utilisateur |
| **Base de données** | SQLite / SQLAlchemy | Comptes utilisateurs et projets |

---

## Prérequis

- **Python ≥ 3.11**
- **Node.js ≥ 18**
- **Git**

---

## Installation

### 1. Cloner les deux dépôts

```bash
# Moteur physique (dépendance)
git clone https://github.com/MaximeGRELET/thermal-engine.git

# Application
git clone https://github.com/MaximeGRELET/Optibuilding.git
cd Optibuilding
```

### 2. Installer le moteur thermique

```bash
pip install -e ../thermal-engine
```

> Ou directement depuis GitHub (sans cloner) :
> ```bash
> pip install git+https://github.com/MaximeGRELET/thermal-engine.git
> ```

### 3. Installer les dépendances Python

```bash
pip install fastapi "uvicorn[standard]" python-multipart \
            sqlalchemy "python-jose[cryptography]" "passlib[bcrypt]" \
            email-validator
```

### 4. Installer les dépendances frontend

```bash
cd frontend
npm install
cd ..
```

---

## Lancement

### Option A — Script automatique (Windows)

Double-cliquer sur **`start.bat`** à la racine du projet.

Cela ouvre deux fenêtres :
- **API** → `http://127.0.0.1:8000`
- **Frontend** → `http://localhost:5173`

### Option B — Manuellement

**Terminal 1 — Backend :**
```bash
python -m uvicorn api.main:app --reload
```

**Terminal 2 — Frontend :**
```bash
cd frontend
npm run dev
```

Ouvrir **`http://localhost:5173`** dans le navigateur.

---

## Fonctionnalités

### Étape 1 — Dessin des zones
- Dessinez vos zones thermiques sur la carte satellite
- Paramétrez chaque zone : année de construction, hauteur, type, système de chauffage
- Sélectionnez une station météo EPW parmi 13 stations françaises (TMYx 2004-2018)

### Étape 2 — Analyse & calibration
- Calcul du DPE physique (ISO 13790) avec décomposition des déperditions
- Panel de calibration : ajustez les paramètres (U-values, infiltration, consigne…) pour coller à votre consommation réelle
- Comparaison simulé vs réel par graphique mensuel

### Étape 3 — Rénovation
- 3 scénarios pré-définis (Confort+, Rénovation RT, BBC)
- Simulation d'actions à la carte (isolation murs/toiture/plancher, vitrages, VMC, PAC)
- Tableau de comparaison des scénarios sauvegardés avec efficacité kWh/k€

### Comptes et projets
- Création de compte, connexion (JWT 7 jours)
- Sauvegarde/chargement de projets complets (zones, calibration, résultats)
- Export PDF : baseline calibrée + paramètres + tableau comparatif + fiches scénarios

---

## Structure du projet

```
OptiBuilding/
├── api/
│   ├── main.py              # FastAPI app — routes, CORS, démarrage BDD
│   ├── schemas.py           # Pydantic models requêtes/réponses
│   ├── dependencies.py      # get_weather() — EPW ou synthétique
│   ├── db/
│   │   ├── database.py      # SQLAlchemy engine + SessionLocal
│   │   ├── models.py        # User, Project (ORM)
│   │   └── auth.py          # JWT, bcrypt, get_current_user
│   ├── routers/
│   │   ├── analysis.py      # POST /analysis
│   │   ├── renovation.py    # POST /renovation, /renovation/simulate
│   │   ├── calibration.py   # POST /calibration/simulate
│   │   ├── weather.py       # GET /weather/library, /weather/epw/{id}/preview
│   │   ├── auth.py          # POST /auth/register, /auth/login, GET /auth/me
│   │   └── projects.py      # CRUD /projects
│   ├── services/
│   │   └── epw_cache.py     # Cache mémoire des fichiers EPW
│   └── data/
│       ├── epw_catalog.py   # 13 stations météo françaises
│       └── epw/             # Fichiers EPW bundlés (TMYx 2004-2018, CC BY 4.0)
├── frontend/
│   ├── index.html
│   └── src/
│       ├── main.js          # Point d'entrée, carte, dessin des zones
│       ├── api.js           # Clients API fetch
│       ├── auth.js          # Écran login/register, token localStorage
│       ├── projects.js      # Header projet, modal liste, save/load
│       ├── results.js       # Affichage DPE, KPIs, rénovation
│       ├── calibration.js   # Panel calibration avec sliders
│       ├── actions-panel.js # Simulation d'actions à la carte
│       ├── scenario-compare.js # Tableau comparatif + graphique
│       ├── weather-picker.js   # Sélecteur station EPW
│       ├── pdf-export.js    # Export PDF
│       └── style.css
├── start.bat                # Lance API + frontend (Windows)
└── optibuilding.db          # Base SQLite (créée automatiquement, gitignorée)
```

---

## API — Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/auth/register` | Créer un compte |
| `POST` | `/auth/login` | Connexion (retourne JWT) |
| `GET`  | `/auth/me` | Profil utilisateur courant |
| `GET`  | `/projects` | Liste des projets |
| `POST` | `/projects` | Créer un projet |
| `PUT`  | `/projects/{id}` | Sauvegarder l'état complet |
| `POST` | `/analysis` | Analyse DPE (GeoJSON → résultats) |
| `POST` | `/calibration/simulate` | Simulation avec overrides |
| `POST` | `/renovation` | Scénarios pré-définis |
| `POST` | `/renovation/simulate` | Actions à la carte |
| `GET`  | `/weather/library` | Liste des stations EPW |

Documentation interactive : `http://127.0.0.1:8000/docs`

---

## Données météo

Fichiers EPW issus de [climate.onebuilding.org](https://climate.onebuilding.org) — licence **CC BY 4.0**, TMYx 2004-2018, une station par région métropolitaine française (Paris, Lyon, Marseille, Toulouse, Bordeaux, Nantes, Rennes, Strasbourg, Lille, Caen, Orléans, Dijon, Ajaccio).

---

## Licence

MIT — Maxime Grelet
