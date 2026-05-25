# Projet : roguelite deckbuilder JS (fichier unique index.html)
GitHub raw : https://raw.githubusercontent.com/Air-One0810/mon-jeu/refs/heads/main/index.html

## Stack
HTML/CSS/JS pur, navigateur local, localStorage pour la méta. Pas de framework, pas de build tool.

## Architecture (5 zones dans le fichier)
- Zone 1 : Données statiques (CARDS_DEF, REWARD_POOL, IDENTITY_POOL, RELIC_POOL, ENCOUNTERS, RARITY_WEIGHTS, DEV flags)
- Zone 2 : État du jeu (G = { meta, run, combat, scene, log })
- Zone 3 : Logique pure (applyElementEffect, assembleAction, endTurn, checkWin, applyRelicEffects, etc.)
- Zone 4 : Rendu (render() dispatcher → renderCombat/Reward/IdentityChoice/RelicChoice/Meta)
- Zone 5 : Événements utilisateur (selectCard, selectTarget, abandonRun)

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

## Patches V1.3 — À IMPLÉMENTER (non encore dans le code)
1. **Écho friction +2 mana** (était +1) — 2 lignes (previewCost + assembleAction)
2. **Étreinte backfire conditionnel survie** — 5 lignes dans applyElementEffect

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

## Roadmap — prochaines étapes

### Court terme (avant session 3)
- Implémenter patches V1.3 (2 patches, ~10 lignes)
- 4 runs de validation (2 reliques manquantes + 2 post-patch)

### Étape 3 — Méta réelle (PROCHAINE SESSION MAJEURE)
- 3.a : Variations de départ (2-3 decks au choix avant run)
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