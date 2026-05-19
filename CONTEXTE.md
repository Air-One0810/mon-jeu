# Projet : roguelite deckbuilder JS (fichier unique index.html)
GitHub raw : https://raw.githubusercontent.com/Air-One0810/mon-jeu/refs/heads/main/index.html

## Stack
HTML/CSS/JS pur, navigateur local, localStorage pour la méta. Pas de framework, pas de build tool.

## Architecture (5 zones dans le fichier)
- Zone 1 : Données statiques (CARDS_DEF, REWARD_POOL, IDENTITY_POOL, ENCOUNTERS, RARITY_WEIGHTS, DEV flags)
- Zone 2 : État du jeu (G = { meta, run, combat, scene, log })
- Zone 3 : Logique pure (applyElementEffect, assembleAction, endTurn, checkWin, etc.)
- Zone 4 : Rendu (render() dispatcher → renderCombat/Reward/IdentityChoice/Meta)
- Zone 5 : Événements utilisateur (selectCard, selectTarget, abandonRun)

## Patterns clés
- État monolithique G, single source of truth
- render() = fonction pure de G
- data-driven : cartes/ennemis/identités = objets JSON
- Opérateur ?? pour overrides + flags booléens (elan, freeAction, recycleSelf, implosionMode, echoMode, etc.)
- YAGNI : design dans la data
- runLog (journal copiable) pour debug et feedback
- Hook modifyElement(el, target, ctx) dans applyElementEffect (Identité Pattern 1)
- Hook onCombo(target, comboName, ctx) dans triggerCatalystReaction (Identité Pattern 2, vide)

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
- Berserker calibré : chargedDamage 7 → 6

### Méta-progression
- localStorage clé 'mon-jeu:meta:v1'
- G.meta : { fragments, unlockedCards[], totalRunsWon, totalRunsLost }
- 2 cartes locked : Glace mortelle (5 frag) / Maelström (12 frag)
- Maelström confirmée débloquée par le joueur — surveiller si trop attractive (prise trop souvent)

## Système Identité — TERMINÉ (Étapes 1.a + 1.b)

### Infrastructure
- IDENTITY_POOL : pool séparé de REWARD_POOL
- G.run.identity : slot unique, null par défaut
- Choix d'Identité après Combat 2 UNIQUEMENT (décision gravée : 1 seul choix, pas de swap Combat 4)
- Écran renderIdentityChoice() : 3 propositions + bloc identité actuelle + skip
- Bandeau permanent dans renderCombat (couleur selon elem)
- Hook modifyElement : clone éphémère de l'élément, safe (jamais de mutation du template)
- Hook onCombo : vide mais prêt pour Pattern 2

### 4 Identités actives — état V1.2

**🔥 Cendres Persistantes** (elem: feu)
- Tes Feu n'infligent plus de dgt directs (dmgOverride:0), appliquent 5 Brûlure au lieu de 2
- flags: { bruleDoubleTick: true } → tick Brûlure = 2 dgt au lieu de 1
- Choc Thermique tué de facto (0 × 2 = 0)
- Force build Feu→stack, Vide→détonne — viable mais punit matchup Tank-régen (Briseur)
- Verdict playtest : identitaire, bon rythme, pas à patcher

**❄️ Étreinte Permanente** (elem: glace)
- flags: { noGivreDecay: true, givreConsumeBackfire: true }
- Givré ne décrémente plus naturellement
- Consommation Givré (Choc Thermique) : +1 atk permanent à l'ennemi + 1 Brûlure appliquée (engine)
- Verdict playtest : fonctionnelle, peu mémorable mais pas broken. Patch engine Brûlure ajouté V1.2

**🕳️ Implosion** (elem: vide)
- flags: { implosionMode: true }
- Vide ne pioche plus, ne détonne plus
- Vide inflige 2 + (états sur cible) dgt. Brûlure scale sur stacks (chaque stack = +1)
- Vide applique toujours Fragile (hérité de la branche existante)
- Verdict playtest : identitaire quand setup présent, faible sans setup. Description clarifiée V1.2

**🔁 Écho** (elem: meta)
- flags: { echoMode: true }
- La 1ère carte CIBLÉE (non-Zone) du tour déclenche l'effet une 2e fois, sans coût
- Friction : premier assemblage éligible coûte +1 mana
- Zone exclue du déclenchement (patch V1.2 — cassait Onde+Zone et Feu+Zone)
- La friction +1 mana ne s'applique QUE si la forme est non-Zone (sinon on paye sans bénéfice)
- Verdict playtest : encore la plus forte mais contenue. À surveiller sur 3-4 runs.

### UX Identité (ajouté V1.2)
- assemblyDescription() modifiée : affiche le comportement réel si Identité active
  (ex : "Feu (0 dgt + 5 Brûlure)", "Glace (Givré permanent)", "Vide (Implosion : N dgt)")
- Coût affiché avec friction Écho visible avant de jouer
- canAssemble() tient compte de la friction Écho dans le calcul de mana
- Log friction Écho : affiché AVANT l'effet, plus après (lisibilité)

## REWARD_POOL V1 — état actuel (14 cartes)

### Commons-ancres
- Feu+ (common, 2m) — 4 dgt + Brûlure (2)
- Projectile+ (common, 0m) — ancre mana
- Armure runique (common, 1m) — +6 bouclier
- Étincelle (common Forme, 1m) — 2 dgt bonus + Élan

### Rares (Hybrides + Tempo)
- Embrasure (rare Feu, 3m) — 6 dgt + Brûlure, sans Givré requis
- Brise-éclat (rare Glace, 3m) — Stun garanti + Fragile. MONO-CIBLE (formeRestricted: ['proj'])
- Onde de choc (rare Vide, 3m) — 3 Brûlure auto-détonées (~8 dgt)
- Mémoire des cendres (rare Feu, 2m) — rappelle un Feu de la défausse
- Souffle (rare Forme, 1m) — action gratuite. COÛT CORRIGÉ : 2→1 mana
- Stèle (rare Forme, 2m) — pioche 2 + action gratuite

### Epics
- Cataclysme (epic, 5m) — 3 États + Élan + combos +2 dgt pendant 2 tours. comboBonusDuration:2 ajouté
- Cycle des Éléments (epic Forme, 3m) — Élément retourne en main, coût -1/combat

### Locked
- Glace mortelle (rare, 3m, 5 frag) — Givré(2) + Fragile(2)
- Maelström (epic, 3m, 12 frag) — 3 dgt + Brûlure + Givré + Fragile

## Doctrine d'équilibre — "Dégâts Effectifs" (DE)
Composantes : Offensive + Défensive + Économique.
Cibles : common 5-8 DE, rare 10-15 DE, epic 18-30 DE.
Calibrage : 1 mana ≈ 4 DE (rare), 1 action ≈ 2 DE (5 si accompagnée de mana), 1 carte piochée ≈ 3 DE.
Mana = vraie contrainte. Actions = contrainte molle.

## Étapes terminées (historique complet)
- ✅ Core loop + scènes + récompenses + défausse + soins + consumables + fragments + écran méta
- ✅ Archétypes (tank/catalyst/charged) + 7 combats
- ✅ Refonte REWARD_POOL (12 cartes + 4 ancres)
- ✅ Mot-clé Élan, doctrine DE
- ✅ Journal de run copiable (runLog)
- ✅ Calibrage post-playtest : Bastion shieldRegen 0, soins 6 PV, Brise-éclat mono-cible, Berserker 7→6
- ✅ Playtest A (4 runs) : confirmation H4 (pas de build), validation Cycle
- ✅ Étape 1.a : infrastructure Identité (pool, slot, scène, hooks, bandeau UI)
- ✅ Playtest Identités V1 (8 runs, 2/Identité) : Écho OP, Cendres 0/2, Implosion 1/2, Étreinte 2/2
- ✅ Patches V1.1 : Écho friction +1 mana, Cendres bruleDoubleTick, Implosion scale stacks Brûlure, swap Combat 4 supprimé
- ✅ Patches V1.2 : Écho Zone exclue, UX feedback Identité dans assemblyDescription, friction visible, bug canAssemble fix, Étreinte engine Brûlure, Implosion description clarifiée
- ✅ Validation V1.2 (2 runs) : fonctionnel ✅

## Diagnostic actuel — Identités V1.2 stable

**Ce qui marche :**
- 4 Identités fonctionnelles, ressenties distinctement
- Cataclysme viable (comboBonusDuration:2 corrige le bonus inutilisable)
- Souffle jouable (coût 1 mana)
- Berserker non mur (chargedDamage 6)
- UX Identité lisible

**Ce qui reste à surveiller :**
- Écho : encore la plus forte après patch Zone-exclue. Si encore OP sur 2-3 runs → friction +2 mana ou perte 2 PV par déclenchement
- Étreinte : engine Brûlure ajouté, à valider sur 2+ runs (peut rester "peu mémorable")
- Cendres vs Briseur (Tank-régen) : pas un bug, un matchup défavorable qui sera adressé par Reliques V2
- Maelström : prise trop souvent (attractivité haute), à surveiller en V2 si elle écrase la diversité

## Roadmap — prochaines étapes

### Étape 2 — Reliques V1 (PROCHAINE ÉTAPE)
- Infrastructure : slot persistant dédié (slot Combat 4 libéré)
- Reliques = modificateurs structurels passifs permanents pour la run
- Exemples pressentis : anti-bouclier (résout Cendres vs Briseur), extension Givré (synergise Étreinte), bonus pioche, etc.
- Pool dédié RELIC_POOL, séparé de IDENTITY_POOL et REWARD_POOL
- Hook à créer : applyRelicEffect() ou flags lus dans la logique existante (pattern identique aux Identités)
- Session à découper en : 2.a (infra slot + écran choix) → 2.b (co-design 4-6 reliques)

### Étape 3 — Méta réelle
- 3.a : Variations de départ (2-3 decks au choix avant run)
- 3.b : Plus de cartes locked
- 3.c : Trophées / défis de run

### Et plus tard (V3+)
- Map de run (chemins à la Slay the Spire)
- Phase shift boss
- 10-12 combats
- Setup différé (zone persistante entre tours)

## Décisions de design gravées
- Méta = palette + collection, jamais croissance brute (A+C only)
- Pyramide tonale : common ancré, epic transformateur
- REWARD_POOL séparé de CARDS_DEF
- IDENTITY_POOL séparé de REWARD_POOL
- Séparation systèmes/contenu : ne jamais ajouter une mécanique et du contenu dans la même session
- YAGNI, design dans la data
- Doctrine DE = mesure de puissance unifiée
- Élan = première famille de mécaniques (extensible)
- Playtest avant nouveau contenu
- Restriction d'assemblage (formeRestricted) = pattern réutilisable
- 1 seul slot Identité, choix après Combat 2 uniquement, définitif pour la run
- Identité = modifier une RÈGLE, pas un chiffre
- Pas de swap d'Identité entre combats
- Slot Combat 4 = futur slot Relique (V2)

## Questions ouvertes
- Écho : friction suffisante après exclusion Zone ? (1-2 runs de confirmation)
- Étreinte : engine Brûlure rend-il l'Identité mémorable ?
- Maelström : trop attractive → dilue-t-elle la diversité des runs ?
- Reliques : remplacer/cumuler avec Identité ? (à trancher en session 2.a)
- Cap de main (actuellement pas de limite haute) : à reconsidérer si exploit trouvé

## DEV flags
- godMode: false → 50 PV si true
- startCombat: 0 → saute au combat N si > 0

## Fonctions debug (console F12)
- resetMeta(), unlockCard('id'), giveFragments(N), showMeta()
- window.pickIdentity(index), window.skipIdentity()

## Score playtest global (toutes sessions confondues)
- ~20+ runs jouées depuis V1
- Taux de victoire V1.2 : ~65-70% (estimé)
- Identités jouées : Cendres 4x, Étreinte 4x, Implosion 4x, Écho 4x
- Victoires par Identité : Cendres 2/4, Étreinte 3/4, Implosion 3/4, Écho 4/4