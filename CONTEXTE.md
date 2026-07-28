# Projet : roguelite deckbuilder JS (index.html + game-logic.js depuis 2026-07-27)
GitHub raw : https://raw.githubusercontent.com/Air-One0810/mon-jeu/refs/heads/main/index.html

## Stack
HTML/CSS/JS pur, navigateur local, localStorage pour la méta. Pas de framework, pas de build tool
(le harnais de tests maison dans tests.html ne compte pas comme framework — voir plus bas).

## Architecture (2 fichiers, 5 zones)
- **game-logic.js** — Zones 1+2+3, zéro dépendance DOM :
  - Zone 1 : Données statiques (CARDS_DEF, REWARD_POOL, IDENTITY_POOL, RELIC_POOL, ENCOUNTERS, RARITY_WEIGHTS, DEV flags)
  - Zone 2 : État du jeu (G = { meta, run, combat, scene, log })
  - Zone 3 : Logique pure (applyElementEffect, assembleAction, endTurn, checkWin, applyRelicEffects, etc.)
- **index.html** — charge game-logic.js puis Zones 4+5 inline :
  - Zone 4 : Rendu (render() dispatcher → renderCombat/Reward/IdentityChoice/RelicChoice/Meta)
  - Zone 5 : Événements utilisateur (selectCard/selectTarget vivent dans game-logic.js ; abandonRun/copyRunLog
    restent ici car ils touchent confirm()/clipboard)
- **tests.html** — charge game-logic.js, exécute ~28 tests dans le navigateur (aucun serveur/npm requis)
- Point d'extension `requestRender` (dans game-logic.js) : la logique appelle `requestRender()`, jamais
  `render()` directement. index.html branche `requestRender = render` une fois son render() défini.
  tests.html laisse le no-op par défaut — les tests mutent G sans jamais peindre le DOM.
  Détails : architecture-code.md §0.

## Patterns clés
- État monolithique G, single source of truth
- render() = fonction pure de G
- data-driven : cartes/ennemis/identités/reliques = objets JSON
- Hooks data-driven (zéro couplage renderer/contenu) :
  - modifyElement(el, target, ctx)     → logique combat (Identité Pattern 1)
  - previewElement(el, target, ctx)    → affichage effet (string | null)
  - previewCost(currentCost, el, fo, ctx) → affichage coût (reducer, number)
  - onCombo(target, comboName, ctx)    → trigger combo (Identité Pattern 2, vide)
  - onCombatStart(ctx)                 → trigger début combat (Reliques)
  - onTurnStart(ctx)                   → trigger début tour joueur (Reliques)
  - onComboResolved(target, name, dmg, ctx) → trigger combo résolu avec dgt (Reliques)
- Pipeline reducer previewCost : Identity → Reliques → renderer. Zéro if id===X.
- YAGNI : design dans la data
- runLog (journal copiable) pour debug et feedback
- Opérateur ?? pour overrides + flags booléens

## Mécaniques en place

### Combat
- Assemblage 1 Élément + 1 Forme, max 2 actions/tour, 6 mana/tour
- États cycliques : Glace→Givré→Feu(x2), Feu→Brûlure→Vide(détonne), Vide→Fragile→Glace(stun)
- Défausse tactique : 1 action, pioche 1 carte
- Mot-clé Élan : +1 action et +1 mana pour ce tour uniquement
- Bouclier ennemi : absorbe dégâts directs, pas la Brûlure
- Restriction d'assemblage : flag formeRestricted (ex: Brise-éclat = mono-cible)

### Archétypes ennemis
- tank : enemyShield + shieldRegen
- catalyst : +1 atk permanent quand combo déclenché sur lui
- charged : prépare attaque lourde tous les N tours

### Run
- 7 combats : Goule, Sentinelle, Essaim, Bastion, Réacteur, Berserker, Briseur
- +6 PV soignés entre combats
- Fragments : +1/combat, +3/boss
- Berserker calibré : chargedDamage 6

### Méta-progression
- localStorage clé 'mon-jeu:meta:v1'
- G.meta : { fragments, unlockedCards[], totalRunsWon, totalRunsLost }
- 2 cartes locked : Glace mortelle (5 frag) / Maelström (12 frag)

## Système Identité — TERMINÉ V1.2 stable

### Infrastructure
- IDENTITY_POOL séparé de REWARD_POOL
- G.run.identity : slot unique, null par défaut
- Choix après Combat 2 UNIQUEMENT, définitif pour la run
- Écran renderIdentityChoice() : 3 propositions + skip
- Bandeau permanent dans renderCombat
- Hooks data-driven : modifyElement (clone éphémère safe) + previewElement + previewCost

### 4 Identités actives — état V1.2 + patches playtest Reliques

**🔥 Cendres Persistantes** (elem: feu)
- Feu : 0 dgt directs, +5 Brûlure. Brûlure tick = 2 dgt.
- flags: { bruleDoubleTick: true }
- Verdict : viable, matchup Briseur partiellement résolu par Sceau Résonant

**❄️ Étreinte Permanente** (elem: glace)
- flags: { noGivreDecay: true, givreConsumeBackfire: true }
- Givré permanent. Consommation Givré → +1 atk ennemi + 1 Brûlure
- PATCH V1.3 : le backfire +1 atk ne s'applique QUE si l'ennemi survit au Choc Thermique
  (avant : punissait le plan ; après : punit la maladresse)
- Verdict post-patch : à valider sur 2 runs

**🕳️ Implosion** (elem: vide)
- flags: { implosionMode: true }
- Vide : 2 + (états sur cible) dgt, pose Fragile. Pas de pioche, pas de détonation.
- Verdict : fonctionnelle, difficile sans setup. Mauvaise paire avec Mémoire du Cycle.

**🔁 Écho** (elem: meta)
- flags: { echoMode: true }
- 1ère carte ciblée (non-Zone) du tour : effet rejoué gratuitement
- PATCH V1.3 : friction +2 mana (était +1). Onde de choc × Écho = 16 dgt tour 1 → trop fort
- Verdict post-patch : à valider sur 2 runs

## Système Reliques — TERMINÉ V1 (sessions 2.a + 2.b + 2.c)

### Infrastructure (session 2.a)
- RELIC_POOL séparé d'IDENTITY_POOL et REWARD_POOL
- G.run.relics : tableau (accumulation). Initialisé à [] dans initRun.
- Choix après Combat 4 (index 3). Combat 6 = futur slot V2.
- Écran renderRelicChoice() : 3 propositions + skip
- Bandeau Reliques permanent dans renderCombat (tags ambrés)
- applyRelicEffects(trigger, ctx) : dispatch vers toutes les reliques actives
- Hooks câblés : onCombatStart (initCombat), onTurnStart (endTurn), onComboResolved (triggerCatalystReaction)
- Pipeline previewCost reliques branché dans assemblyDescription (déjà actif)

### Rareté Reliques : rare / epic / legendary (pas de common)
- Toutes les reliques valent le détour — distinction par amplitude de transformation
- rare = améliore le plan | epic = ouvre une ligne | legendary = change les règles

### 4 Reliques V1 — état post-playtest 2.c

**🔨 Cœur de Forge** (rare)
- "Tes attaques Zone infligent +1 dgt par cible + 1 dgt supplémentaire par ennemi vivant."
- flag: { zoneBonus: true }, logique dans assembleAction
- ⚠️ NON TESTÉE en run réelle — à valider sur 1-2 runs

**🔥 Cendres Vagabondes** (rare)
- "Au début de chaque tour, 33% d'appliquer 2 Brûlure à un ennemi aléatoire."
- Hook: onTurnStart. Log théâtralisé.
- ⚠️ NON TESTÉE en run réelle — à valider sur 1-2 runs

**🜂 Sceau Résonant** (epic)
- "Les combos sur un ennemi affecté par l'état de ton Identité propagent 50% des dgt aux autres."
- Hook: onComboResolved. Propage dgt directs uniquement (pas les états).
- Écho (elem meta) : déclenche sur n'importe quel combo.
- elemToState : { feu:'brule', glace:'givre', vide:'fragile' }
- Verdict : fonctionnel, amplitude modeste sur les 2 runs testées. Amplitude réelle à confirmer
  sur run avec gros stacks (Cendres + Détonation 15+ dgt).

**🌀 Mémoire du Cycle** (legendary)
- "Quand tu joues un Élément, le précédent est rappelé en main, coût -1 (min 0)."
- flag: { memoireCycle: true }, logique dans assembleAction
- G.combat.lastElementPlayed : tracké par combat, reset dans initCombat
- Garde-fou : pas de rappel si l'Élément est déjà en main
- Verdict : VALIDÉE. Feeling de "jonglage" réel. Bonne paire avec Écho/Cendres.
  Mauvaise paire avec Implosion (pas de synérgie setup). C'est voulu.

## REWARD_POOL V1 — état actuel (14 cartes — inchangé)
[cf. version précédente — aucune modification dans cette session]

## Doctrine d'équilibre — "Dégâts Effectifs" (DE)
Composantes : Offensive + Défensive + Économique.
Cibles : common 5-8 DE, rare 10-15 DE, epic 18-30 DE.
Calibrage : 1 mana ≈ 4 DE (rare), 1 action ≈ 2 DE, 1 carte piochée ≈ 3 DE.
⚠️ TENSION IDENTIFIÉE : doctrine DE = calibrage Magic. Vision = dopamine Balatro.
Les Legendaries doivent pouvoir dépasser 30 DE quand le build est aligné. Assumer.

## Étapes terminées (historique complet)
- ✅ [sessions 1-1.b] Core loop, identités, patches V1.1 + V1.2
- ✅ Session 2.0 : refactoring previewElement + previewCost reducer
  → zéro couplage renderer/contenu, pipeline extensible Identity + Reliques
- ✅ Session 2.a : infrastructure Reliques (pool, slot, écran, hooks, bandeau)
- ✅ Session 2.b : co-design 4 reliques V1 (rare×2, epic×1, legendary×1)
- ✅ Session 2.c : playtest 4 runs, analyse 3-axes, patches V1.3 identifiés
- ✅ Étape 3.a : 3 decks de départ (Arsenal/Brasier/Permafrost) + pool
  d'Identités filtré par deck (piste B) — fait entre les sessions, pas encore
  documenté ici avant aujourd'hui (git log : ca155aa, 9524cb0)
- ✅ Système Signatures (Mécanisme B) : livraison garantie après Combat 1,
  gatée par deck, Arsenal exempté (git log : 4de2a55). STUBS Fournaise/Zéro
  Absolu à redesigner — cf. "Runs manquantes" ci-dessous.
- ✅ Session 2026-07-27 : 4 bugs corrigés (render() switch, duplication
  Mémoire du Cycle, canAssemble/Écho désync, appliedStates jamais nettoyé)
  + infrastructure de tests automatisés — cf. section suivante.

## Patches V1.3 — ✅ IMPLÉMENTÉS (vérifié session 2026-07-27)
1. **Écho friction +2 mana** (était +1) — présent dans previewCost + assembleAction.
   ⚠️ Trouvé lors de la relecture : `canAssemble()` était resté à l'ancienne formule
   (+1, sans exclusion Zone) → le bouton "Assembler" pouvait s'activer sur un coup
   ensuite refusé. Corrigé (canAssemble aligné sur assembleAction/previewCost).
2. **Étreinte backfire conditionnel survie** — présent dans applyElementEffect (ligne ~1245).
Les deux patches étaient donc déjà en place dans le code — seul le doc était périmé.
Les "runs manquantes" listées plus bas restent pertinentes : le code est correct,
mais pas encore revalidé par playtest.

## Session 2026-07-27 — 4 bugs corrigés (relecture complète du fichier)
1. **`render()` : switch sans `break` sur `case 'deckChoice'`** — provoquait une
   exception silencieuse à chaque écran de choix de deck (l'écran s'affichait quand
   même car le HTML était déjà injecté avant le crash). Conséquence directe :
   `DEV.startCombat` était cassé (l'exception coupait le script avant que les lignes
   de peuplement du deck DEV ne s'exécutent).
2. **Mémoire du Cycle dupliquait des cartes** — le rappel clonait la carte
   (`{ ...previous, cost }`) au lieu de la déplacer, laissant l'original dans la
   défausse. À la victoire, `deck = [...deck, ...hand, ...discard]` récupérait les
   deux → cause probable du deck bloat observé (29 cartes au Combat 7, run 4).
   Fix : `splice` hors défausse au lieu de cloner (même pattern que Mémoire des
   cendres / Cycle des Éléments).
3. **`canAssemble()` désynchronisé du patch Écho** — cf. ci-dessus.
4. **`appliedStates` ne s'effaçait jamais** — un état une fois appliqué restait
   marqué "affecté" pour tout le combat, même après décroissance naturelle à 0.
   Sceau Résonant pouvait donc se propager sur des combos sans rapport avec l'état
   réellement actif. Fix : les 3 boucles de décroissance en fin de tour (Brûlure,
   Givré, Fragile) retirent maintenant l'entrée d'`appliedStates` quand la valeur
   atteint 0. La consommation par un combo (Choc Thermique, Fracture, Détonation)
   n'est pas touchée — l'entrée doit rester vraie le temps que `triggerCatalystReaction`
   vérifie la synergie juste après.

Impact sur les verdicts existants : Sceau Résonant et Écho ont pu être mesurés sur
du code légèrement différent de leur comportement voulu. Revalidation recommandée
avant de trancher leur équilibrage final.

## Runs manquantes — À jouer avant session 3
- 1 run avec Cœur de Forge (forcer via console)
- 1 run avec Cendres Vagabondes (forcer via console)
- 2 runs post-patch V1.3 (Écho et Étreinte)

## Score playtest global
- ~24+ runs depuis V1
- Taux de victoire estimé : ~60-65%
- Identités post-reliques : Cendres ✅, Étreinte ⚠️ patch en cours, Implosion ✅, Écho ❌ patch en cours
- Reliques validées : Sceau Résonant ✅, Mémoire du Cycle ✅
- Reliques non testées : Cœur de Forge ⚠️, Cendres Vagabondes ⚠️

## Infrastructure de tests automatisés (session 2026-07-27)
- Fichier unique scindé en 2 : `game-logic.js` (Zones 1+2+3, zéro DOM) +
  `index.html` (Zones 4+5, rendu + événements navigateur). Détails et règle
  de placement pour le futur contenu : voir architecture-code.md §0.
- `tests.html` : harnais maison (~30 lignes, zéro dépendance — pas de Node
  installé sur cette machine, donc pas de node:test). Ouvrir le fichier dans
  un navigateur pour lancer. 28 tests, tous verts au moment de l'écriture :
  combos élémentaires, mécaniques d'assemblage, fin de tour/archétypes, cas
  limites (pioche/défausse vides, mort en cours de résolution, mana négatif),
  + une régression dédiée pour chacun des 4 bugs de la session.
- Découverte notable pendant l'écriture des tests : Fracture (Glace sur
  Fragile) ré-applique aussi du Givré en side-effect (le bloc d'application
  Givré/Fragile tourne sans condition sur la branche empruntée). Pas un bug —
  documenté et testé tel quel — mais à garder en tête si le comportement
  surprend en playtest.
- Règle pour la suite : cf. architecture-code.md §4 (un bug corrigé = un test
  de régression ; une mécanique non triviale = au moins un test avant
  playtest manuel).

## Session « refonte du socle » (2026-07-27, 2ᵉ partie)

### 3 bugs trouvés par audit et corrigés (chacun reproduit avant correction)
1. **appliedStates jamais nettoyé après consommation par un combo.** Choc
   Thermique / Détonation / Fracture mettaient l'état à 0 en direct, et le
   nettoyage de `endTurn` était enfermé dans un `if(état > 0)` qui ne pouvait
   donc plus jamais s'exécuter. **Conséquence : Sceau Résonant propageait sur
   TOUS les combos après le premier, même sans état sur la cible** — la relique
   epic était silencieusement bien plus forte que designée. Ça invalide
   probablement le verdict « amplitude modeste » des playtests précédents :
   l'amplitude jugée était faussée. Corrigé via `syncAppliedStates()`, appelée
   APRÈS résolution (jamais au moment de la consommation, sinon Sceau Résonant
   ne se déclencherait plus du tout — un test garde-fou verrouille les deux sens).
2. **Aucune garde cible-morte dans `applyElementEffect`.** Sur un cadavre elle
   renvoyait des dégâts et logguait « 3 dgt (létal) ». Aggravé par Cœur de Forge
   qui frappe avant l'Élément, et par Sceau Résonant qui peut tuer en milieu de
   Zone. Corrigé par un `if(target.hp <= 0) return 0;`.
3. **La transition CSS de la barre de PV n'avait jamais joué.** `renderCombat`
   réécrit tout l'`innerHTML`, donc chaque `.hp-bar` naissait à sa largeur
   finale, sans valeur de départ à animer. Corrigé : la barre est insérée à sa
   largeur précédente, la vraie largeur est posée à la frame suivante. Le cache
   est invalidé sur l'identité du tableau d'ennemis (pas sur `encName`, qui
   laissait passer un cache périmé au Combat 1 d'une nouvelle run).

### Refonte
- `BALANCE` : tous les leviers d'équilibrage centralisés (cf. architecture-code.md §1.c)
- `ELEMENT_RESOLVERS` : éléments data-driven (§1.b)
- `assembleAction` découpé en étapes nommées, `resolveAssemblyCost` et
  `dealRawDamage` comme sources uniques (§3.b)
- Hook mort `modifyElementDamage` supprimé de Cœur de Forge (YAGNI)

### Validation
- **39 tests verts** (28 → 39), relancés après chaque phase de refonte
- **Fuzz de 30 runs complètes** (3841 coups, 19 combinaisons deck/identité/
  relique) : zéro crash, zéro blocage
- Parcours manuel de l'UI (clic réel) après la découpe en 2 fichiers

### Détails à trancher plus tard (non bloquants)
- **Fracture ré-applique du Givré** en effet de bord : le bloc de pose de Givré
  tourne aussi après la branche Fragile. Conservé tel quel et commenté dans le
  code, mais non documenté côté joueur → problème de lisibilité (le joueur ne
  peut pas le prédire). À valider ou retirer explicitement.
- **Maelström** teste la survie sans tenir compte du bouclier ennemi, contrairement
  à tous les autres éléments. Incohérence conservée et commentée.
- **Arsenal propose 4 Identités** alors que la doc annonce 3 (les decks
  thématiques en proposent 3, car ils excluent leur Identité native).
- **Main morte** : 4 Formes sans Élément = tour perdu, seule sortie = défausse
  tactique. Constaté en simulation. C'est cohérent avec le design mais mérite
  peut-être un garde-fou (mulligan ? pioche garantie d'un Élément ?).

## Roadmap — prochaines étapes

### Court terme (avant session 3)
- 4 runs de validation (2 reliques manquantes + 2 post-patch) — nécessite du
  playtest humain, les tests automatisés ne remplacent pas cette étape
  (ils valident la mécanique, pas le fun/rythme, cf. gamefeel.md)
- Design réel de Fournaise (Brasier) et Zéro Absolu (Permafrost) — actuellement
  des STUBS qui recyclent Feu/Glace pour valider le flux uniquement

### Socle restant (identifié à l'audit, non fait)
- **Tests sur reliques/identités** : les 7 bugs de la journée étaient TOUS dans
  ces interactions, et c'est la zone la moins couverte. Sceau Résonant et Cœur de
  Forge ont maintenant des tests ; Implosion, Écho et le backfire d'Étreinte non.
- **Rendu incrémental** : tant que `renderCombat` réécrit tout l'`innerHTML`, le
  juice reste difficile (la barre de PV a nécessité un contournement rAF).
  Prérequis pour la doctrine gamefeel.md.
- **Deck bloat** : proposer « supprimer une carte » comme option de récompense.
  Fuzz mesuré : 19 cartes en fin de run avec des choix aléatoires.
- **`endTurn` fait encore 103 lignes** (non touchée cette session). Cinq phases
  distinctes bien identifiables : tick Brûlure, attaques ennemies, décroissance
  des états, fin de tour des archétypes, reset joueur. Même découpe que
  `assembleAction` à appliquer quand on y retouchera.

## Rencontres aléatoires — FAIT (2026-07-27, 3ᵉ partie)
- `ENCOUNTERS` porte un champ `tier` par rencontre : `ouverture` (Goule,
  Sentinelle) / `milieu` (Essaim, Bastion, Réacteur) / `avantBoss` (Berserker) /
  `boss` (Briseur, toujours 7ᵉ et dernier).
- `buildCombatList()` mélange l'ordre À L'INTÉRIEUR de chaque palier ; l'ORDRE
  DES PALIERS reste fixe (`BALANCE.run.tierOrder`) pour garantir la courbe de
  difficulté. Appelée une fois par `initRun()`.
- `name` des rencontres ne porte plus l'ordinal (« La Goule », pas « Combat 1 —
  La Goule ») : l'ordinal est maintenant calculé dans `initCombat()` sur la
  position RÉELLE dans la run (`Combat ${index+1} — ${enc.name}`), puisque
  cette position varie désormais d'une run à l'autre.
- **Ajouter une rencontre = ajouter une entrée avec le bon tier**, zéro ligne
  de moteur — même principe que ELEMENT_RESOLVERS.
- 5 tests dédiés (couverture exhaustive sans doublon, boss toujours dernier,
  ouverture toujours en tête, variation réelle prouvée statistiquement sur 30
  tirages, ordinal dynamique correct). **44 tests verts au total.**
- Validé par fuzz : 30 runs, 11 ordres distincts observés sur 30, zéro crash.
- ⚠️ Piège rencontré en validation, pas un bug de code : le navigateur de test a
  servi une version en cache de `game-logic.js` sur plusieurs rechargements
  successifs de la même URL (`file://`), y compris après Ctrl+Maj+R. Seule une
  fermeture d'onglet + réouverture a forcé un rechargement propre. Symptôme si
  ça se reproduit : des fonctions récemment ajoutées semblent « undefined »
  alors que le fichier sur disque est correct — vérifier le disque avant de
  chercher un bug côté code.

### Étape 3 — Méta réelle (PROCHAINE SESSION MAJEURE)
- 3.a : ✅ fait (3 decks de départ + pool d'Identités filtré)
- 3.b : Plus de cartes locked
- 3.c : Trophées / défis de run

### Et plus tard (V3+)
- Map de run (chemins à la Slay the Spire)
- Slot Relique 2 après Combat 6
- Phase shift boss
- 10-12 combats
- Mécanique d'élimination/upgrade de cartes (résout deck bloat)

## Décisions de design gravées
- Méta = palette + collection, jamais croissance brute
- Pyramide tonale : common ancré, epic transformateur, legendary = "attends je peux faire ÇA ??"
- REWARD_POOL / IDENTITY_POOL / RELIC_POOL : pools séparés
- Séparation systèmes/contenu : jamais les deux dans la même session
- YAGNI, design dans la data
- Doctrine DE = mesure de puissance (mais Legendaries peuvent la dépasser)
- 1 seul slot Identité, choix après Combat 2, définitif
- Identité = modifier une RÈGLE, pas un chiffre
- Relique = modifier une RÈGLE, pas un chiffre (idem)
- Reliques : rare/epic/legendary uniquement (pas de common)
- Reliques gratuites en V1 (tester le fun, pas l'économie)
- Tous les hooks d'affichage passent par previewElement/previewCost (data-driven)
- Le pipeline previewCost est un reducer : chaque source reçoit le coût courant
- Backfire Étreinte : punit la maladresse (kill raté), pas le plan (kill réussi)
- Mémoire du Cycle garde-fou : pas de rappel si Élément déjà en main

## Questions ouvertes
- Sceau Résonant : amplitude suffisante sur gros stacks ? (à confirmer)
- Cœur de Forge / Cendres Vagabondes : fun validé ? (runs manquantes)
- Deck bloat (29 cartes au Combat 7 en run 4) : à adresser en V3 via upgrade/sacrifice
- Maelström : toujours trop attractive ? (surveiller en V2)

## DEV flags
- godMode: false → 50 PV si true
- startCombat: 0 → saute au combat N si > 0

## Fonctions debug (console F12)
- resetMeta(), unlockCard('id'), giveFragments(N), showMeta()
- window.pickIdentity(index), window.skipIdentity()
- window.giveRelic('relic_id'), window.giveIdentity('identity_id')