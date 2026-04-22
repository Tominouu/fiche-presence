# Générateur fiche de présence

Ce projet conciste à renseigner les heures ainsi que les dates de travail à l'iut, puis de les retransmettre automatiquement dans le pdf.
À venir (Une ia qui interprete l'emploi du temps et qui remplie tout automatiquement)

## Table des matières

- [À propos](#à-propos)
- [Fonctionnalités](#fonctionnalités)
- [Technologies](#technologies)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Structure du projet](#structure-du-projet)
- [Auteur](#auteurs)

## À propos

C'est fini de passer son temps à remplir cette fiche de présence, optimisons notre temps.

## Fonctionnalités

- Récupération des données par l'intermédiaire d'un json (data.json)
- Traitement par javascript des données et écriture sur le pdf
- À venir: automatisation par IA

## Technologies

- Langage : JS
- Lib: @pdf-lib


## Installation

```bash
# 1) Cloner le dépôt
git clone https://github.com/Tominouu/fiche-presence

# 2) Aller dans le dossier
cd fiche-presence

# 3) Installer les dépendances
npm install
```

## Utilisation

```json
// Renseignez vos datas (exemple)
[
  { "name": "Tom Leclercq" },
  { "mois": "Janvier" },
  { "date-realisation": "05/01/2026" },
  { "directeur": "Alban Pichon" },
  { "date": "05/01/2026", "hours": 2 },
  { "date": "06/01/2026", "hours": 8 },
  { "date": "07/01/2026", "hours": 8 }
]
```

```bash
# Lancer le rendu
node generate.js

```

## Structure du projet

```text
.
├── data.json
├── generate.js
├── template.pdf
├── output.pdf
├── package-lock.json
├── package.json
└── readme.md
```

## Auteur

- Tom Leclercq
