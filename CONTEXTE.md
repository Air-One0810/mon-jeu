# Projet : roguelite deckbuilder JS (fichier unique index.html)
GitHub raw : https://raw.githubusercontent.com/Air-One0810/mon-jeu/refs/heads/main/index.html

## Stack
HTML/CSS/JS pur, navigateur local, localStorage pour la méta. Pas de framework, pas de build tool.

## Architecture (5 zones dans le fichier)
- Zone 1 : Données statiques (CARDS_DEF, REWARD_POOL, ENCOUNTERS, RARITY_WEIGHTS, DEV flags)
- Zone 2 : État du jeu (G = { meta, run, combat, scene, log })
- Zone 3 : Logique pure (applyElementEffect, assembleAction, endTurn, checkWin, etc.)
- Zone 4 : Rendu (render() dispatcher → renderCombat/Reward/Meta)
- Zone 5 : Événements utilisateur (selectCard, selectTarget, abandonRun)

## Patterns clés
- État monolithique G, single source of truth
- render() = fonction pure de G
- transitionTo(scene) = seul point de mutation de G.scene
- data-driven : cartes/ennemis = objets JSON
- Opérateur ?? pour overrides (dmgOverride, givreDuration, bruleStacks…)
- YAGNI : design dans la data, pas dans les règles spéciales

## Mécaniques de jeu
### Combat
- Assemblage 1 Élément + 1 Forme, max 2 actions/tour, 6 mana/tour
- États cycliques : Glace→Givré→Feu(x2), Feu→Brûlure→Vide(détonne), Vide→Fragile→Glace(stun)
- Défausse tactique : 1 action, pioche 1 carte
- Consumables : sélection exclusive, se joue seul (1 action)
- Bouclier ennemi : absorbe dégâts directs, pas le tick Brûlure
- **Élan (mot-clé)** : "Gagnez +1 action et +1 mana pour ce tour uniquement."

### Archetypes ennemis
- tank : enemyShield + shieldRegen
- catalyst : +1 atk permanent quand un COMBO (pas un État) est déclenché sur lui
- charged : prépare attaque lourde tous les N tours

### Run
- 7 combats : Goule, Sentinelle, Essaim, Bastion(tank), Réacteur(catalyst), Berserker(charged), Briseur(boss)
- +4 PV soignés entre combats
- Fragments : +1 / combat, +3 / boss

### Méta-progression
- localStorage clé 'mon-jeu:meta:v1'
- G.meta : { fragments, unlockedCards[], totalRunsWon, totalRunsLost }

## Direction design tranchée (méta)
**A+C only, pas de B (puissance brute).**
Mantra : "je gagne parce que j'ai compris, pas parce que j'ai grind."
Cap de scope V1 : ~18 cartes unlock, ~5-10 reliques (V2), 2-3 starts (V3).

**Le common sert de baseline lisible, pas d'objectif d'excitation.
L'excitation vient des rares/epics par contraste.**
Chaque common conservé joue un rôle d'ancre mentale (dégâts / mana / défense / tempo).

## Doctrine d'équilibre — "Dégâts Effectifs" (DE)
Composantes : Offensive (dgt directs + États sur 2 tours) + Défensive (bouclier + dgt évités par stun, ~5 DE/attaque) + Économique (1 carte ≈ 4 DE, 1 mana ≈ 2 DE, 1 action ≈ 5 DE).
Cibles : common 5-8 DE, rare 10-15 DE, epic 18-30 DE (avec conditions/trade-offs marqués).
Outil de cadrage, pas contrainte rigide.

## Roadmap V1 — Refonte REWARD_POOL
**État : 9/12+ cartes designées, en attente d'intégration code.**

### Paquet 1 — Hybrides (validé, 4 cartes)
- **Embrasure** (rare, 3m) : 6 dgt + Brûlure(2) mono-cible, sans Givré requis. Ferme Glace.
- **Onde de choc** (rare, 3m) : 2 dgt + 3 Brûlure + détonne immédiatement (+6 dgt), Fragile. Ferme stack-Brûlure.
- **Brise-éclat** (rare, 3m) : 1 dgt + Fragile(1) + Stun garanti. Ferme Choc thermique.
- **Cataclysme** (epic, 5m) : applique Brûlure(3)+Givré(2)+Fragile(2). **Élan**. Combos sur cette cible ce tour +2 dgt.

### Paquet 3 — Tempo (validé, 5 cartes)
- **Étincelle** (common, Forme, 1m) : 2 dgt + Élan inconditionnel.
- **Mémoire des cendres** (rare, Élément Feu, 2m) : 3 dgt + Brûlure(2). Si Feu en défausse → la pioche au lieu de défausser.
- **Souffle** (rare, Forme, 2m) : assemble un Élément sans consommer d'action. Mono-cible.
- **Stèle** (rare, Forme, 2m) : pioche 2 + action gratuite, Élément joué normalement.
- **Cycle des Éléments** (epic, Forme, 3m) : la carte Élément retourne en main au lieu de défausse, coût mana -1 cumulatif (min 0) pour le combat.

### Conservées (3 commons-ancres à retravailler comme tels)
- Feu+ : ancre dégâts
- Projectile+ : ancre mana/économie
- Armure runique : ancre défense

### Locked epics conservées
- Glace mortelle (5 fragments)
- Maelström (12 fragments)

### Total V1 = 17-18 cartes dans REWARD_POOL.

### Paquet 2 — Identité — REPORTÉ post-playtest
Décision A.3 prise (slot Identité dédié dans l'UI, effet permanent run) mais infrastructure non implémentée. Reporté après playtest V1 pour valider que le besoin est réel et non théorique.

## Étapes terminées
- ✅ Étapes 1→5.1 : core loop, scènes, récompenses, archétypes, 7 combats
- ✅ Correctifs post-playtest 5.1
- ✅ Direction méta tranchée (A+C only)
- ✅ Diagnostic + refonte REWARD_POOL (Hybrides + Tempo designés)
- ✅ Mot-clé Élan, doctrine DE établie

## Prochaine étape immédiate
**Intégration code des 9 nouvelles cartes dans REWARD_POOL + implémentation du mot-clé Élan.**
Modèle : Sonnet 4.6. Tâches :
1. Ajouter le flag `elan: true` (mécanique : +1 action, +1 mana ce tour).
2. Ajouter le flag `freeAction: true` sur les Formes Souffle/Stèle.
3. Ajouter le flag `recycleSelf: true` + `manaReductionStack` sur Cycle.
4. Ajouter le flag `recallFromDiscard: 'feu'` sur Mémoire des cendres.
5. Modifier `assembleAction` pour gérer Élan, freeAction, recycle.
6. Recalibrer pickRarity ou generateRewardChoices si besoin (vérifier distribution après ajout).
7. Supprimer du pool : Brûlure intense, Glace persistante, Vide instable, Régénération, Sceau vital.
8. Retravailler descriptions Feu+/Projectile+/Armure runique comme ancres mentales.

## Étape suivante (après intégration)
**Playtest V1 : 3-5 runs complètes en solo, notes dans IDEES.md.**
Critères d'observation :
- Excitation à la récompense (notable vs invisible ?)
- Variance entre runs (les builds émergent-ils ?)
- Lisibilité combat (Élan, recyclage, hybrides compris en jeu ?)
- Besoin ressenti d'Identité ou non.

## Décisions de design gravées
- Méta = palette + collection, jamais croissance brute
- Pyramide tonale : common ancré, epic transformateur
- Le common n'est pas un déchet, c'est un repère qui donne du relief
- REWARD_POOL séparé de CARDS_DEF
- Séparation systèmes/contenu : ne jamais ajouter une mécanique et du contenu dans la même session
- YAGNI, design dans la data
- Zone = pouvoir contextuel (voulu)
- **Doctrine DE = mesure de puissance unifiée (offensive + défensive + économique)**
- **Élan = première famille de mécaniques (extensible aux futures cartes tempo)**
- **Cartes d'archétype acceptées (ex : Mémoire = Feu only) ; chaque élément aura ses spécificités, pas des clones**
- **Playtest avant nouveau contenu : pas d'Identité avant retour terrain V1**

## Questions ouvertes
- Cap de main (actuellement pas de limite haute) — à trancher si Stèle déborde en playtest
- Identité A.3 : infrastructure à concevoir post-playtest si confirmée prioritaire
- Reliques V2 : en concurrence fonctionnelle avec Identité (toutes deux portent le "caractère de run") — playtest tranchera la priorité
- Map de run : décision toujours différée
- Phase shift boss : idée toujours différée

## DEV flags
- godMode: false → 50 PV si true
- startCombat: 0 → saute au combat N si > 0

## Fonctions debug (console F12)
- resetMeta(), unlockCard('id'), giveFragments(N), showMeta()