# OptiBuilding

Application web d'analyse et de rénovation énergétique des bâtiments.

Dessinez votre bâtiment sur une carte, obtenez son **DPE physique** (ISO 13790), calibrez le modèle sur votre consommation réelle, et comparez des scénarios de rénovation avec leur retour sur investissement.

## Architecture

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Backend** | Python / FastAPI | API REST, simulation thermique |
| **Moteur physique** | `thermal_engine/` (intégré) | ISO 13790/7730, EPW, HVAC, ENR, rénovation |
| **Frontend** | Vite + Vanilla JS | Carte MapLibre, interface utilisateur |

---

## Prérequis

- **Python ≥ 3.11**
- **Node.js ≥ 18**
- **Git**

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/MaximeGRELET/Optibuilding.git
cd Optibuilding
```

### 2. Installer les dépendances Python

```bash
pip install fastapi "uvicorn[standard]" numpy scipy python-multipart httpx
```

### 3. Installer les dépendances frontend

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
- Paramétrez chaque zone : année de construction, hauteur, nombre d'étages, type d'usage, système de chauffage, niveau d'infiltration
- Sélectionnez une station météo EPW parmi 13 stations françaises (TMYx 2004-2018)

### Étape 2 — Analyse & calibration
- Calcul du **DPE physique** (ISO 13790) avec décomposition des déperditions par poste (murs, toiture, plancher, fenêtres, ponts thermiques, ventilation)
- Besoins mensuels de chauffage et apports solaires en graphique
- **Panel de calibration** : ajustez les U-values, le taux d'infiltration, la consigne de chauffage, les apports internes pour coller à votre consommation réelle
- Comparaison simulé vs réel par graphique mensuel

### Étape 3 — Rénovation
- **3 scénarios pré-définis** avec économies et retour sur investissement :
  - *Confort+* : isolation murs + vitrages
  - *Rénovation RT* : isolation complète enveloppe + VMC double flux
  - *BBC rénovation* : isolation maximale + VMC + PAC
- **Actions à la carte** : isolation murs/toiture/plancher bas, remplacement vitrages, système de chauffage, VMC double flux — avec sliders de paramétrage
- **Graphique mensuel comparé** : baseline vs scénarios
- **Tableau de comparaison** des scénarios sauvegardés avec efficacité kWh/k€

---

## Structure du projet

```
OptiBuilding/
├── api/
│   ├── main.py              # FastAPI app — routes, CORS
│   ├── schemas.py           # Pydantic models requêtes/réponses
│   ├── dependencies.py      # get_weather() — EPW ou synthétique
│   └── routers/
│       ├── analysis.py      # POST /analysis
│       ├── renovation.py    # POST /renovation, /renovation/simulate
│       ├── calibration.py   # POST /calibration/simulate
│       └── weather.py       # GET /weather/library, /weather/epw/{id}/preview
├── thermal_engine/          # Moteur thermique physique (voir thermal_engine/README.md)
│   ├── core/                # Zones, enveloppe, matériaux, bâtiment
│   ├── climate/             # Parser EPW, modèle solaire, ciel
│   ├── simulation/          # Besoins ISO 13790 (mensuel + horaire RC)
│   ├── hvac/                # Chaudières, PAC, réseaux chaleur, ECS
│   ├── comfort/             # PMV/PPD ISO 7730, confort adaptatif
│   ├── renewables/          # PV, solaire thermique ECS
│   ├── inter_zone/          # Couplage thermique multi-zones
│   ├── io/                  # Chargement GeoJSON
│   └── data/                # Base de données matériaux, fichiers EPW
├── frontend/
│   ├── index.html
│   └── src/
│       ├── main.js          # Point d'entrée, carte, dessin des zones
│       ├── api.js           # Clients API fetch
│       ├── buildings.js     # État multi-bâtiments, buildGeoJSON()
│       ├── results.js       # Affichage DPE, KPIs, rénovation
│       ├── charts.js        # Graphiques Chart.js
│       ├── calibration.js   # Panel calibration avec sliders
│       ├── actions-panel.js # Simulation d'actions à la carte
│       ├── scenario-compare.js # Tableau comparatif
│       ├── weather-picker.js   # Sélecteur station EPW
│       └── style.css
└── start.bat                # Lance API + frontend (Windows)
```

---

## API — Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/analysis` | Analyse DPE (GeoJSON → résultats) |
| `POST` | `/calibration/simulate` | Simulation avec overrides physiques |
| `POST` | `/renovation` | Scénarios de rénovation pré-définis |
| `POST` | `/renovation/simulate` | Actions à la carte personnalisées |
| `GET`  | `/weather/library` | Liste des stations EPW disponibles |
| `GET`  | `/weather/epw/{id}/preview` | Données météo mensuelles d'une station |

Documentation interactive : `http://127.0.0.1:8000/docs`

---

## Données météo

Fichiers EPW issus de [climate.onebuilding.org](https://climate.onebuilding.org) — licence **CC BY 4.0**, TMYx 2004-2018, une station par région métropolitaine française :
Paris, Lyon, Marseille, Toulouse, Bordeaux, Nantes, Rennes, Strasbourg, Lille, Caen, Orléans, Dijon, Ajaccio.

---

## Licence

MIT — Maxime Grelet
