# Projet : roguelite deckbuilder JS (fichier unique index.html)
GitHub raw : https://raw.githubusercontent.com/Air-One0810/mon-jeu/refs/heads/main/index.html

## Stack
HTML/CSS/JS pur, navigateur local, localStorage pour la méta. Pas de framework, pas de build tool.

## Architecture (5 zones dans le fichier)
- Zone 1 : Données statiques (CARDS_DEF, REWARD_POOL, ENCOUNTERS, RARITY_WEIGHTS, DEV flags, META constants)
- Zone 2 : État du jeu (G = { meta, run, combat, scene, log })
- Zone 3 : Logique pure (applyElementEffect, assembleAction, endTurn, checkWin, etc.)
- Zone 4 : Rendu (render() dispatcher → renderCombat/Reward/Meta)
- Zone 5 : Événements utilisateur (selectCard, selectTarget, abandonRun)

## Patterns clés
- État monolithique G, single source of truth
- render() = fonction pure de G, reconstruit tout l'écran à chaque changement
- transitionTo(scene) = seul point de mutation de G.scene
- data-driven : les cartes sont des objets JSON, la logique lit leurs propriétés
- Opérateur ?? pour les overrides de cartes (dmgOverride, givreDuration, bruleStacks, etc.)

## Mécaniques de jeu
### Combat
- Assemblage : 1 Élément + 1 Forme = 1 action (max 2 actions/tour, 6 mana/tour)
- États cycliques : Glace→Givré→Feu(x2), Feu→Brûlure→Vide(détonne), Vide→Fragile→Glace(stun)
- Défausse tactique : défausser 1 carte coûte 1 action, pioche 1 nouvelle carte
- Consumables : type:'consumable', sélection exclusive, se joue seul (1 action)

### Archetypes ennemis (NOUVEAU en 5.1)
- tank : enemyShield, shieldRegen par tour
- catalyst : absorbe chaque nouvel État appliqué → +1 atk permanent
- charged : prépare une attaque lourde tous les N tours (intent affiché au joueur)
- (boss standard) : pas d'archétype, combinaison d'ennemis

### Run
- 7 combats : [0,1,2,3,4,5,6] → Goule, Sentinelle, Essaim, Bastion(tank), Réacteur(catalyst), Berserker(charged), Boss(Briseur+sbires)
- +4 PV soignés avant chaque combat (sauf le 1er)
- Fragments : +1 par combat normal gagné, +3 pour le boss

### Méta-progression
- localStorage, clé 'mon-jeu:meta:v1'
- G.meta : { fragments, unlockedCards[], totalRunsWon, totalRunsLost }
- commitRunRewards(won) sauvegarde après chaque run (victoire ou défaite)
- Écran méta : scène 'meta', s'affiche au démarrage et après chaque run

## Pool de cartes

### CARDS_DEF (deck de départ, 12 cartes)
Feu×2, Glace×2, Vide×2, Projectile×2, Zone×2, Armure×2

### REWARD_POOL (récompenses entre combats)
- common : Feu+ (4dgt), Projectile+ (gratuit)
- rare : Glace persistante (Givré 3 tours), Brûlure intense (4 stacks), Régénération (consumable +5PV)
- epic : Vide instable (pioche 2), Armure runique (+6 bouclier), Sceau vital (reward_effect +5PV max)
- locked/rare (5 frags) : Glace mortelle (2dgt + Givré + Fragile)
- locked/epic (12 frags) : Maelström (3dgt + tous les États, elem:'maelstrom')

## Étapes terminées
- ✅ Étape 1 : core loop (assemblage + États cycliques)
- ✅ Étape 2 : système de scènes (dispatcher render, transitionTo)
- ✅ Étape 3 : récompenses (raretés, consumables, reward_effect, no-doublon)
- ✅ Étape 3.5 : défausse tactique
- ✅ Étape 3.7 : soin entre combats (+4 PV)
- ✅ Étape 3.8 : équilibrage combat 4 (Briseur atk:4, serviteurs 3PV)
- ✅ Étape 3.9 : consumables (type:'consumable', playConsumable)
- ✅ Étape 4.1 : Fragments (localStorage, commitRunRewards, affichage fin de run)
- ✅ Étape 4.2 : cartes verrouillées (locked, unlockCost, unlockCard, filtrage dans generateRewardChoices)
- ✅ Étape 4.3 : écran méta (renderMeta, démarrage sur 'meta', bouton déblocage)
- ✅ Étape 5.1 : nouveaux ennemis avec archetypes (tank/catalyst/charged), 7 combats, applyStateToEnemy

## Étape en cours : attente des retours de playtest 5.1
On attendait les retours de test sur :
1. Les 3 nouveaux archetypes (tank/catalyst/charged) — fun ? compréhensibles ?
2. Équilibrage de la run à 7 combats avec 20 PV de départ
3. Maelström et Glace mortelle (cartes verrouillées) — sensation en jeu ?

## Prochaine étape prévue : 4.2 tests + suite roadmap
Après validation du playtest 5.1, décision à prendre sur la prochaine direction :
- Continuer enrichissement contenu (plus de cartes, d'ennemis)
- Attaquer le game feel (animations, juice)
- Carte de progression / map entre combats

## Décisions de design gravées
- Méta-progression séparée de la run (dépense uniquement sur écran méta)
- REWARD_POOL séparé de CARDS_DEF
- YAGNI : pas d'abstraction anticipée, on refactorise quand le besoin est réel
- Contraintes émergentes préférées aux contraintes explicites
- Un seul bouton Assembler/Jouer qui change de label selon selectionType()
- Pas de localStorage pour autre chose que G.meta (état run = ephémère)

## DEV flags (haut du fichier)
- godMode: false → 50 PV si true
- startCombat: 0 → saute directement au combat N si > 0
- showHiddenInfo: false → non implémenté

## Fonctions debug (console navigateur F12)
- resetMeta() → remet méta à zéro
- unlockCard('id') → tente de débloquer une carte
- giveFragments(N) → ajoute N fragments
- showMeta() → affiche G.meta
