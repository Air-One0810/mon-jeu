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
- data-driven : cartes/ennemis = objets JSON
- Opérateur ?? pour overrides + flags booléens (elan, freeAction, recycleSelf, etc.)
- YAGNI : design dans la data
- runLog (journal copiable) pour debug et feedback

## Mécaniques en place
### Combat
- Assemblage 1 Élément + 1 Forme, max 2 actions/tour, 6 mana/tour
- États cycliques : Glace→Givré→Feu(x2), Feu→Brûlure→Vide(détonne), Vide→Fragile→Glace(stun)
- Défausse tactique : 1 action, pioche 1 carte
- **Mot-clé Élan** : "+1 action et +1 mana pour ce tour uniquement"
- Bouclier ennemi : absorbe dégâts directs, pas la Brûlure
- Restriction d'assemblage : flag `formeRestricted` (utilisé par Brise-éclat = mono-cible)

### Archétypes ennemis
- tank : enemyShield + shieldRegen (Bastion : shieldRegen=0 après fix)
- catalyst : +1 atk permanent quand un COMBO est déclenché sur lui
- charged : prépare attaque lourde tous les N tours

### Run
- 7 combats : Goule, Sentinelle, Essaim, Bastion, Réacteur, Berserker, Briseur
- +6 PV soignés entre combats (calibrage validé)
- Fragments : +1 / combat, +3 / boss

### Méta-progression (minimale)
- localStorage clé 'mon-jeu:meta:v1'
- G.meta : { fragments, unlockedCards[], totalRunsWon, totalRunsLost }
- 2 cartes locked : Glace mortelle (5 frag) / Maelström (12 frag)

## Doctrine d'équilibre — "Dégâts Effectifs" (DE)
Composantes : Offensive + Défensive + Économique.
Cibles : common 5-8 DE, rare 10-15 DE, epic 18-30 DE.
Calibrage actualisé post-playtest : 1 mana ≈ 4 DE (rare), 1 action seule ≈ 2 DE (5 si accompagnée de mana), 1 carte piochée ≈ 3 DE.
**Mana = vraie contrainte. Actions = contrainte molle.** (asymétrie confirmée)

## REWARD_POOL V1 — état actuel (14 cartes)
### Commons-ancres
- **Feu+** (common, 2m) — ancre dégâts
- **Projectile+** (common, 0m) — ancre mana
- **Armure runique** (common, 1m) — ancre défense
- **Étincelle** (common Forme, 1m) — ancre tempo (Élan + 2 dgt bonus)

### Rares (Hybrides + Tempo)
- **Embrasure** (rare Feu, 3m) — 6 dgt + Brûlure, sans Givré requis
- **Brise-éclat** (rare Glace, 3m) — Stun garanti + Fragile. **MONO-CIBLE (formeRestricted: ['proj'])**
- **Onde de choc** (rare Vide, 3m) — applique 3 Brûlure + auto-détonne (~8 dgt)
- **Mémoire des cendres** (rare Feu, 2m) — rappelle un Feu de la défausse
- **Souffle** (rare Forme, 2m) — assemblage sans action
- **Stèle** (rare Forme, 2m) — pioche 2 + action gratuite

### Epics
- **Cataclysme** (epic, 5m) — applique 3 États + Élan + combos +2 dgt ce tour
- **Cycle des Éléments** (epic Forme, 3m) — Élément retourne en main, coût -1 cumulatif/combat

### Locked
- **Glace mortelle** (rare, 3m, 5 frag) — Givré + Fragile
- **Maelström** (epic, 3m, 12 frag) — Brûlure + Givré + Fragile

## Étapes terminées (10 runs playtest)
- ✅ Core loop + scènes + récompenses + défausse + soins + consumables + fragments + écran méta
- ✅ Archétypes (tank/catalyst/charged) + 7 combats
- ✅ Refonte REWARD_POOL (12 nouvelles cartes + 4 ancres conservées)
- ✅ Mot-clé Élan, doctrine DE
- ✅ Journal de run copiable (runLog)
- ✅ Calibrage post-playtest :
  - Bastion : shieldRegen 1 → 0
  - Soin inter-combat : 4 → 6 PV
  - Brise-éclat : ajout formeRestricted:['proj'] (mono-cible)
  - Retrait du forceCommon dans generateRewardChoices
  - Fix bug Cycle (deep clone CARDS_DEF + restauration _origCost)
- ✅ V1 jouable : 1ère victoire propre run 9 (8/20 PV), ressenti "dur mais juste"

## Diagnostic actuel — V1 fonctionnel mais incomplet
**Ce qui marche :**
- Combat équilibré (Bastion, Berserker, Briseur OK)
- Brise-éclat mono restaure l'identité des archétypes
- Mémoire des cendres = carte pivot solide
- Cycle = moteur honnête (pas cassée une fois Bastion calibré)
- Envie de relancer présente

**Ce qui manque (ressenti joueur, run 10) :**
- **Pas de sentiment de "build"** — accumulation, pas direction
- Méta-progression quasi inexistante (juste 2 unlocks)
- Souffle pas attractive (jamais jouée significativement)
- Étincelle peu excitante mais OK
- Réacteur trop facile (combat-respiration acceptable)

## Roadmap — 3 grandes étapes à venir

### Étape immédiate : Playtest A (3-4 runs supplémentaires)
But : stabiliser le ressenti V1, tester Cataclysme en conditions réelles, voir si Souffle reste invisible. Critères : si tu sens encore "j'accumule" après 4 runs, on bascule sur Identité sans hésiter.

### Étape 1 — Système Identité (A.3 confirmé)
Découpée en 2 sessions :
- **1.a Système** : conception slot Identité dédié (UI permanente), hook passif, gestion conflit (remplacement entre combats ?), nouveau type 'identity' dans REWARD_POOL.
- **1.b Contenu** : co-design des 4 cartes-identité (Feu-burst, Glace-contrôle, Vide-explosion, +1). Respect du mantra "transforme la façon de jouer, ne renforce pas".

### Étape 2 — Reliques V2
S'appuie sur l'infra UI de l'Identité (slot persistant). Reliques = modificateurs structurels passifs (ex: "tous les Givrés durent +1 tour"). Demande pool dédié, hook d'apparition à définir.

### Étape 3 — Méta réelle
- 3.a : Variations de départ (2-3 decks de départ au choix avant run)
- 3.b : Plus de cartes locked à débloquer
- 3.c : Trophées / défis de run

### Et plus tard (V3+)
- Setup différé (catégorie 8 originale, zone persistante)
- Map de run (chemins à la Slay the Spire)
- Phase shift boss
- Plus d'encounters (10-12 combats)

## Prochaine action concrète
**Faire 3-4 runs supplémentaires (playtest A).** Critères d'observation :
- Cataclysme se déclenche-t-elle bien ?
- Souffle vraiment morte ?
- Cycle reste honnête ou apparaît broken ?
- Un build émerge-t-il de lui-même ou tu accumules toujours ?

À la fin du playtest : bilan + décision de lancer Étape 1.a (Système Identité).

## Décisions de design gravées
- Méta = palette + collection, jamais croissance brute (A+C only)
- Pyramide tonale : common ancré, epic transformateur
- REWARD_POOL séparé de CARDS_DEF
- Séparation systèmes/contenu : ne jamais ajouter une mécanique et du contenu dans la même session
- YAGNI, design dans la data
- Doctrine DE = mesure de puissance unifiée
- Élan = première famille de mécaniques (extensible)
- Cartes d'archétype acceptées (Mémoire = Feu only)
- Playtest avant nouveau contenu
- Refus de garantir 1 rare/paquet : la variance roguelite est désirable
- Restriction d'assemblage (formeRestricted) = pattern réutilisable pour corriger des cartes trop polyvalentes

## Questions ouvertes
- Souffle : redesign, retrait ou maintien en attente ?
- Étincelle : peut rester common-ancre ou besoin de plus de pep ?
- Réacteur : trop facile, à durcir ou garder comme respiration ?
- Identité A.3 : conflit entre Identités (remplacer/cumuler ?) à trancher en session 1.a
- Cap de main (actuellement pas de limite haute) à reconsidérer si une carte exploite

## DEV flags
- godMode: false → 50 PV si true
- startCombat: 0 → saute au combat N si > 0

## Fonctions debug (console F12)
- resetMeta(), unlockCard('id'), giveFragments(N), showMeta()

## Ressources
- Fichier actif : /mnt/user-data/outputs/index.html (dernière version avec tous les fixes)
- GitHub raw : https://raw.githubusercontent.com/Air-One0810/mon-jeu/refs/heads/main/index.html