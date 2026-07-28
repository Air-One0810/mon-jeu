# SPÉCIFICATIONS TECHNIQUES & RIGUEUR DU CODE

## 0. Structure des fichiers (depuis session tests automatisés, 2026-07-27)
Le projet est passé de 1 fichier à 2, pour permettre des tests automatisés
sans introduire de framework ni de build tool :

- **`game-logic.js`** — Zones 1+2+3 (données, état, logique pure). Ne touche
  JAMAIS le DOM (pas de `document`, `confirm`, `alert`, `navigator`). Chargé en
  `<script>` classique — mêmes fonctions/variables globales qu'avant, juste
  physiquement dans un autre fichier.
- **`index.html`** — Zones 4+5 (rendu DOM + événements navigateur type
  `confirm`/`clipboard`), charge `game-logic.js` en premier via
  `<script src="game-logic.js"></script>`, garde le reste inline.
- **`tests.html`** — harnais de test maison (~30 lignes, zéro dépendance),
  charge `game-logic.js` et exécute des assertions dans le navigateur. Ouvrir
  le fichier directement, aucun serveur ni `npm install` requis. Reflète la
  doctrine "pas de framework, pas de build tool" : Node.js n'est pas installé
  sur cette machine, donc pas de `node:test` — tout tourne en page HTML.

**Point d'extension `requestRender`** (dans `game-logic.js`) : les fonctions
de logique appellent `requestRender()`, jamais `render()` directement — sinon
elles seraient couplées au DOM et non testables. `index.html`, une fois sa
vraie fonction `render()` définie, fait `requestRender = render;` pour la
brancher. `tests.html` laisse le no-op par défaut actif : les tests mutent
`G` sans jamais déclencher de paint. Même pattern que les hooks
Identité/Relique déjà dans ce projet (`modifyElement`, `previewCost`) : un
point d'extension unique, zéro couplage.

**Règle pour la suite** : toute nouvelle fonction qui ne touche pas le DOM va
dans `game-logic.js`. Toute fonction qui appelle `document.*`, `confirm`,
`alert` ou `navigator.*` reste dans `index.html`. Un doute → si la fonction
peut s'exécuter sans navigateur, elle appartient à `game-logic.js`.

## 1. Approche Data-Driven
- Séparer drastiquement les données de la logique du moteur.
- Les pools de cartes, d'identités et les caractéristiques des ennemis doivent être stockés dans des structures de données pures (dictionnaires, JSON, ou classes de configuration).
- L'ajout de contenu (ex: une nouvelle carte) ne doit JAMAIS nécessiter la modification des boucles logiques de combat.

### 1.b Éléments — table ELEMENT_RESOLVERS (depuis 2026-07-27)
Avant, `applyElementEffect` était une chaîne `if/else` sur `el.elem` : ajouter
Cataclysme et Maelström avait exigé d'éditer le moteur, en violation directe de
la règle ci-dessus. C'est corrigé.

- `ELEMENT_RESOLVERS` mappe `elem` → `(el, target, ctx) => dégâts bruts`.
- `applyElementEffect` n'est plus qu'un orchestrateur : garde cible-morte, hook
  `modifyElement` de l'Identité, dispatch, application des dégâts (bouclier
  d'abord), `syncAppliedStates`. Il ne connaît **aucun** nom d'élément.
- **Ajouter un élément = ajouter une clé + une carte dans un pool.** Zéro ligne
  de moteur. Un élément inconnu loggue un avertissement au lieu de crasher.
- Deux tests verrouillent cette promesse dans `tests.html` (groupe
  « Architecture data-driven ») : l'un enregistre un élément inédit à la volée
  et vérifie qu'il fonctionne, l'autre vérifie le garde-fou d'élément inconnu.

### 1.c Équilibrage — objet BALANCE
Tous les leviers d'équilibrage vivent dans `BALANCE` en tête de `game-logic.js`
(PV, mana, actions, taille de main, dégâts de base par élément, multiplicateurs
de combo, durées d'états par défaut, friction Écho, valeurs de reliques,
fragments). Un test vérifie que modifier une valeur de `BALANCE` change bien le
résultat en combat — la constante est donc la vraie source, pas une décoration.

**Règle** : une valeur qu'on ajusterait en playtest va dans `BALANCE`. Ce qui
appartient à une carte précise (`dmgOverride`, `bruleStacks`) reste dans sa
data ; `BALANCE` ne porte que les défauts et les règles globales.

## 2. Gestion des Cas Limites (Edge Cases)
- Anticiper systématiquement les ruptures de flux : main vide, pioche vide, mort d'une cible au milieu d'une résolution de combo, mana négatif.
- Implémenter des garde-fous (clamping, checks de validité) avant d'appliquer les effets.

## 3. Modularité & Propreté
- Pas de fonctions géantes. Une fonction = une seule responsabilité (Single Responsibility Principle).
- Le code doit être documenté avec des commentaires concis expliquant le "pourquoi" de la logique.

### 3.b Assemblage — étapes nommées (depuis 2026-07-27)
`assembleAction` faisait 187 lignes. Découpé en étapes à responsabilité unique :
`validateAssembly` (ne mute rien), `resolveAssemblyCost`, `payAssemblyCost`,
`moveCardsAfterPlay`, `pickAssemblyTargets` (sélection pure), `applyForgeBonus`,
`applyEchoRepeat`, `applyFormeBonusDamage`, `resolveDraws`, `resolveRecalls`,
`applyElan`. `assembleAction` n'est plus qu'un orchestrateur lisible où l'ordre
des étapes est explicite (Forge frappe avant l'Élément, Élan vient en dernier).

**Deux invariants structurels à préserver :**
1. `resolveAssemblyCost` est la SOURCE UNIQUE du coût, partagée par
   `assembleAction` (qui débite) et `canAssemble` (qui active le bouton). Ce
   calcul existait en double et sa désynchronisation a produit un bug. Ne jamais
   recalculer un coût à la main ailleurs. Un test balaie tous les manas sous
   Écho pour vérifier que bouton et résolution ne divergent pas.
2. `dealRawDamage` est la source unique des dégâts hors Élément (bonus de
   relique, dgt de Forme, propagation du Sceau). Cette logique de bouclier
   existait en 3 copies.

## 4. Tests automatisés (depuis session 2026-07-27)
- `tests.html` couvre : les combos élémentaires (`applyElementEffect`), les
  mécaniques d'assemblage (`assembleAction` : coût, freeAction, formeRestricted,
  recycleSelf, Élan), la fin de tour (`endTurn` : tick Brûlure, stun, archétypes
  tank/charged), les cas limites de la section 2 ci-dessus, et une régression
  dédiée par bug corrigé.
- **Règle** : un bug corrigé sans test de régression n'est qu'à moitié corrigé
  — il peut revenir silencieusement au prochain refactor. Ajouter le test dans
  le même geste que le fix, dans le groupe `Régressions` de `tests.html`.
- **Règle** : toute nouvelle mécanique de combat non triviale (nouvel état,
  nouveau hook Identité/Relique, nouvel archétype ennemi) doit s'accompagner
  d'au moins un test dans `tests.html` avant validation par playtest manuel.
  Les tests vérifient la validité mathématique (doctrine Dégâts Effectifs) ;
  le playtest reste nécessaire pour le fun et le rythme (cf. gamefeel.md).
- Lancer les tests : ouvrir `tests.html` dans un navigateur. Le résumé
  pass/fail s'affiche dans la page, et une ligne `TESTS: X/Y passed` est
  loggée en console pour lecture rapide.