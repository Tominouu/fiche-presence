# Générateur fiche de présence

Remplir sa fiche d'émargement mensuelle du CFA Bordeaux Montaigne en 30 secondes : on saisit ses heures dans une page web, on télécharge le PDF du mois déjà rempli et signé.

## Utilisation

1. Ouvrir `index.html` (double-clic, il faut une connexion internet pour charger les librairies).
2. Renseigner une fois : nom, responsable de la formation, signature (celle de `new/signature.png` est mise par défaut).
3. Choisir le mois, saisir les heures matin / après-midi de chaque jour (les boutons `8`, `ap. 4`, `mat. 4` et « Lun–ven 4+4 » vont plus vite).
4. **Aperçu** pour vérifier, **Télécharger le PDF** pour récupérer `fiche_presence_<mois>_<nom>.pdf`.

Tout est sauvegardé dans le navigateur (heures, nom, signature) : on peut revenir compléter un mois plus tard.

Ce qui est écrit sur la fiche :

- nom, total journalier, heures matin / après-midi (en colonne « autonomie » si la case *auto* de la demi-journée est cochée) ;
- la signature sur chaque demi-journée renseignée ;
- le total mensuel, la date « Fait à Bordeaux, le » (aujourd'hui par défaut) et le nom du responsable.

## Modèle PDF

Le modèle `new/modeles_fiche_presence.pdf` (13 mois, septembre 2026 → septembre 2027) est embarqué dans `assets/template.js`.
La position des lignes et colonnes est lue directement dans le PDF, donc un nouveau modèle du CFA marche aussi : bouton « Autre modèle… » dans la page.

Pour changer le modèle ou la signature par défaut, régénérer les fichiers embarqués (PowerShell) :

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("new\modeles_fiche_presence.pdf"))
Set-Content assets\template.js "window.DEFAULT_TEMPLATE_B64='$b64';" -Encoding ascii -NoNewline

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("new\signature.png"))
Set-Content assets\signature.js "window.DEFAULT_SIGNATURE='data:image/png;base64,$b64';" -Encoding ascii -NoNewline
```

## Technologies

- HTML / JS, aucune installation
- [pdf.js](https://mozilla.github.io/pdf.js/) pour lire la mise en page du modèle
- [pdf-lib](https://pdf-lib.js.org/) pour écrire sur le PDF

## Structure du projet

```text
.
├── index.html            # l'interface
├── assets/
│   ├── app.js            # lecture du modèle, saisie, génération du PDF
│   ├── style.css
│   ├── template.js       # modèle PDF embarqué (base64)
│   └── signature.js      # signature par défaut (base64)
└── new/                  # sources : modèle, signature, exemple attendu
```

## Auteur

- Tom Leclercq
