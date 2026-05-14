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
On collectionne : cartes (priorité 1), reliques (priorité 2 — V2), variations de départ (priorité 3 — V3).
Cap de scope : ~10-20 cartes unlock, ~5-10 reliques, 2-3 starts.

**Le common sert de baseline lisible, pas d'objectif d'excitation.
L'excitation vient des rares/epics par contraste.**
Chaque common conservé doit jouer un rôle d'ancre mentale claire (axe dégâts / mana / défense).

## Roadmap V1 (en cours) : refonte du REWARD_POOL
Problème identifié : pool actuel 100% incrémental ("X+1 mais mieux"), zéro excitation à la récompense.

**Cadre conceptuel pour les nouvelles cartes :**
- Pyramide tonale : common = incrémental majoritaire (B), rare = pivot, epic = transformateur majoritaire (A+C). Quelques exceptions pour éviter prévisibilité.
- Choix douloureux : un bon paquet propose "plus solide / différemment / mieux" (3 questions différentes).
- 4 axes de design space : Espace (hybrides), Stratégie (identité), Tempo (économie d'actions), Temps (setup différé — V1.5).

**V1 — Pool cible : 12 cartes nouvelles + 3-4 incrémentales conservées**
- 4 hybrides (combo immédiat)
- 4 identité (transformation de run)
- 4 économie d'actions (rupture de tempo)
- Base incrémentale conservée comme "bruit de fond" pour créer du contraste

**V1.5 — Setup différé (catégorie 8)**
Cartes qui investissent maintenant pour un effet futur (ex : reste en assemblage, se déclenche T+1).
Demande infrastructure nouvelle (zone persistante hors main, hook endTurn, rendu dédié).
Séparée de V1 pour ne pas mélanger contenu et système.

## Étapes terminées
- ✅ Étapes 1→4.3 : core loop, scènes, récompenses, défausse, soins, consumables, fragments, cartes locked, écran méta
- ✅ Étape 5.1 : archetypes (tank/catalyst/charged), 7 combats, applyStateToEnemy
- ✅ Correctifs post-playtest 5.1 (doublon décrémentation, appliedStates Array, Catalyseur sur combos, états-sur-bouclier, équilibrage encounters)
- ✅ Direction méta-progression tranchée (A+C only)
- ✅ Diagnostic REWARD_POOL : refonte nécessaire


## Prochaine étape
**Co-design des 12 nouvelles cartes en session dédiée.**
Protocole : Claude propose 12 cartes structurées → user valide sur 3 axes (excitation, lisibilité, cohérence) → itération → intégration code sur Sonnet.

**Décisions de cadrage déjà prises :**
- Identités : élémentaires (Feu / Glace / Vide), mais transformatives — chaque identité change la *façon de jouer* l'élément, pas juste le renforce.
- REWARD_POOL : on garde Feu+, Projectile+, Armure runique (common, à retravailler comme ancres mentales : dégâts / mana / défense), Glace mortelle et Maelström (locked). On supprime Brûlure intense, Glace persistante, Vide instable, Régénération, Sceau vital.
- Open : algo de composition des paquets de récompense (garantir 1 common par paquet ?) — à trancher en V1.

## Décisions de design gravées
- Méta = palette + collection, jamais croissance brute
- Pyramide tonale : common ancré, epic transformateur
- Le common n'est pas un déchet, c'est un repère qui donne du relief
- REWARD_POOL séparé de CARDS_DEF
- Séparation systèmes/contenu : ne jamais ajouter une mécanique et du contenu dans la même session
- YAGNI, design dans la data
- Zone = pouvoir contextuel (voulu)

## Questions ouvertes
- Win rate à retester après refonte pool
- Map de run : décision différée
- Phase shift boss : idée différée
- Cartes risque/récompense (cat. 4) et réactives (cat. 6) : reportées, pas abandonnées

## DEV flags
- godMode: false → 50 PV si true
- startCombat: 0 → saute au combat N si > 0

## Fonctions debug (console F12)
- resetMeta(), unlockCard('id'), giveFragments(N), showMeta()