// ============================================================
// GAME-LOGIC.JS — Zones 1+2+3 (données, état, logique pure)
// ============================================================
// Extrait de index.html (session tests automatisés, 2026-07-27).
// Règle : ce fichier ne touche JAMAIS le DOM (pas de `document`,
// pas de `confirm`/`alert`/`navigator`). C'est ce qui le rend
// chargeable aussi bien par index.html (script classique, même
// scope global) que par tests.html (harnais de test navigateur).
//
// Point d'extension `requestRender` : les fonctions de cette zone
// appellent requestRender() (pas render()) après une mutation de G.
// index.html, une fois sa fonction render() réelle définie, fait
// `requestRender = render;` pour la brancher. Dans tests.html, le
// no-op par défaut ci-dessous reste actif — aucune paint réclamée.
// Même pattern que les hooks Identité/Relique déjà dans ce projet :
// zéro couplage, un point d'extension unique.
// ============================================================

// ============================================================
// ZONE 1 — DONNÉES STATIQUES
// ============================================================

const DEV = {
  godMode: false,
  startCombat: 0,
  showHiddenInfo: false,
};

// ============================================================
// BALANCE — tous les leviers d'équilibrage en un seul endroit.
// ============================================================
// Avant : ces valeurs étaient dispersées dans applyElementEffect, endTurn,
// initCombat et assembleAction. Chaque itération d'équilibrage demandait de
// les retrouver une par une, avec le risque d'en oublier une (ex : le coût de
// friction Écho existait en double, ce qui a déjà produit un bug de désync).
//
// Règle : une valeur qu'on ajusterait en playtest vit ICI. Ce qui appartient à
// une carte précise (dmgOverride, bruleStacks…) reste dans sa data — BALANCE ne
// porte que les DÉFAUTS et les règles globales.
const BALANCE = {
  player: {
    startHp: 20,
    godModeHp: 50,
    healBetweenCombats: 6,
  },
  run: {
    // Ordre des paliers de rencontres — FIXE, contrairement à l'intérieur
    // d'un palier (mélangé par buildCombatList). Le palier 'boss' en dernier
    // garantit qu'aucune rencontre boss ne peut sortir de la 7e position.
    tierOrder: ['ouverture', 'milieu', 'avantBoss', 'boss'],
  },
  turn: {
    mana: 6,
    actions: 2,
    handSize: 4,
  },
  // Dégâts de base par élément, avant états et modificateurs de carte.
  elementBaseDmg: {
    feu: 3,
    glace: 1,
    vide: 2,
    maelstrom: 3,
    cataclysme: 0,   // Cataclysme est un pur poseur d'états
  },
  // Durées / stacks appliqués par défaut quand la carte ne précise rien.
  states: {
    defaultBruleStacks: 2,
    defaultGivreDuration: 2,
    defaultFragileDuration: 1,
    bruleTickDmg: 1,
    bruleTickDmgDoubled: 2,   // Identité Cendres Persistantes
  },
  combos: {
    chocThermiqueMultiplier: 2,   // Feu sur Givré
    detonationDmgPerStack: 2,     // Vide consumant la Brûlure
    frozenTargetBonusDmg: 1,      // Glace sur cible déjà Givrée (closer Permafrost)
  },
  formes: {
    defaultShieldAmount: 4,
  },
  identities: {
    echoManaFriction: 2,          // surcoût du 1er assemblage éligible du tour
  },
  // ── Cartes signature (1 par deck thématique, livrée après Combat 1) ──
  // Ce sont les win conditions : elles ont le droit de dépasser la doctrine DE.
  // Molettes de playtest à surveiller en priorité :
  //   fournaiseBruleStacks       → puissance du moteur Brûlure de Brasier
  //   zeroAbsoluDmgPerGivreTurn  → puissance du closer de Permafrost
  //   (le Stun de Zéro Absolu en Zone est le point le plus susceptible
  //    d'être trop fort : il saute un tour ennemi complet sur tout le groupe)
  signatures: {
    fournaiseBruleStacks: 4,
    zeroAbsoluGivreDuration: 3,   // mode setup (cible non Givrée)
    zeroAbsoluSetupDmg: 2,        // dgt directs du mode setup
    zeroAbsoluDmgPerGivreTurn: 4, // mode brise : dgt par tour de Givré consumé
  },
  relics: {
    forgeBonusBase: 1,            // + 1 par ennemi vivant
    sceauSpreadRatio: 0.5,
    cendresVagabondesChance: 0.33,
    cendresVagabondesStacks: 2,
    memoireCycleCostReduction: 1,
  },
  rewards: {
    fragmentsPerCombat: 1,
    fragmentsBossBonus: 3,
    choicesPerReward: 3,
  },
};

// ============================================================
// MÉTA-PROGRESSION
// ============================================================
const META_STORAGE_KEY = 'mon-jeu:meta:v1';

const DEFAULT_META = {
  fragments: 0,
  unlockedCards: [],
  totalRunsWon: 0,
  totalRunsLost: 0,
};

function loadMeta() {
  try {
    const stored = localStorage.getItem(META_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_META };
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_META, ...parsed };
  } catch (e) {
    console.warn('Erreur de chargement méta, reset.', e);
    return { ...DEFAULT_META };
  }
}

function saveMeta() {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(G.meta));
  } catch (e) {
    console.error('Erreur de sauvegarde méta.', e);
  }
}

function resetMeta() {
  try {
    localStorage.removeItem(META_STORAGE_KEY);
  } catch (e) {
    console.error('Erreur de reset méta.', e);
  }
  G.meta = { ...DEFAULT_META };
}

// Deck de départ — inchangé
const CARDS_DEF = [
  { id:'feu1',  type:'element', name:'Feu',        cost:2, effect:'3 dgt + Brûlure (2)',     elem:'feu' },
  { id:'feu2',  type:'element', name:'Feu',        cost:2, effect:'3 dgt + Brûlure (2)',     elem:'feu' },
  { id:'gla1',  type:'element', name:'Glace',      cost:2, effect:'1 dgt + Givré (1 tour)',  elem:'glace' },
  { id:'gla2',  type:'element', name:'Glace',      cost:2, effect:'1 dgt + Givré (1 tour)',  elem:'glace' },
  { id:'vid1',  type:'element', name:'Vide',       cost:2, effect:'2 dgt + Fragile + pioche',elem:'vide' },
  { id:'vid2',  type:'element', name:'Vide',       cost:2, effect:'2 dgt + Fragile + pioche',elem:'vide' },
  { id:'pro1',  type:'forme',   name:'Projectile', cost:1, effect:'1 ennemi ciblé',          forme:'proj' },
  { id:'pro2',  type:'forme',   name:'Projectile', cost:1, effect:'1 ennemi ciblé',          forme:'proj' },
  { id:'zon1',  type:'forme',   name:'Zone',       cost:3, effect:'Tous les ennemis',        forme:'zone' },
  { id:'zon2',  type:'forme',   name:'Zone',       cost:3, effect:'Tous les ennemis',        forme:'zone' },
  { id:'arm1',  type:'forme',   name:'Armure',     cost:1, effect:'+4 bouclier',             forme:'arm' },
  { id:'arm2',  type:'forme',   name:'Armure',     cost:1, effect:'+4 bouclier',             forme:'arm' },
];


// ============================================================
// DECKS DE DÉPART — 3 profils stratégiques
// Chaque deck oriente naturellement vers une Identité.
// Composition : toujours 12 cartes pour garantir l'équilibre
// de la main de départ (4 cartes visibles / combat).
// ============================================================

const BRASIER_CARDS = [
  // 3 Feu — pipeline Brûlure→Détonation hyper-fiable
  { id:'b_feu1', type:'element', name:'Feu', cost:2, effect:'3 dgt + Brûlure (2)', elem:'feu' },
  { id:'b_feu2', type:'element', name:'Feu', cost:2, effect:'3 dgt + Brûlure (2)', elem:'feu' },
  { id:'b_feu3', type:'element', name:'Feu', cost:2, effect:'3 dgt + Brûlure (2)', elem:'feu' },
  // 1 Glace — present mais rare, Choc Thermique = reward, pas routine
  { id:'b_gla1', type:'element', name:'Glace', cost:2, effect:'1 dgt + Givré (1 tour)', elem:'glace' },
  // 2 Vide — partenaire naturel du Feu
  { id:'b_vid1', type:'element', name:'Vide', cost:2, effect:'2 dgt + Fragile + pioche', elem:'vide' },
  { id:'b_vid2', type:'element', name:'Vide', cost:2, effect:'2 dgt + Fragile + pioche', elem:'vide' },
  // 3 Projectile — ciblage précis pour Brûlure mono-cible
  { id:'b_pro1', type:'forme', name:'Projectile', cost:1, effect:'1 ennemi ciblé', forme:'proj' },
  { id:'b_pro2', type:'forme', name:'Projectile', cost:1, effect:'1 ennemi ciblé', forme:'proj' },
  { id:'b_pro3', type:'forme', name:'Projectile', cost:1, effect:'1 ennemi ciblé', forme:'proj' },
  // 1 Zone — présente mais rare, burst AoE occasionnel
  { id:'b_zon1', type:'forme', name:'Zone', cost:3, effect:'Tous les ennemis', forme:'zone' },
  // 2 Armure — défense standard
  { id:'b_arm1', type:'forme', name:'Armure', cost:1, effect:'+4 bouclier', forme:'arm' },
  { id:'b_arm2', type:'forme', name:'Armure', cost:1, effect:'+4 bouclier', forme:'arm' },
];

const PERMAFROST_CARDS = [
  // 1 Feu — rare, valeur montée si Givré en place → Choc Thermique explosif
  { id:'p_feu1', type:'element', name:'Feu', cost:2, effect:'3 dgt + Brûlure (2)', elem:'feu' },
  // 3 Glace — pipeline Givré→Fracture→Stun dominant
  { id:'p_gla1', type:'element', name:'Glace', cost:2, effect:'1 dgt + Givré (1 tour)', elem:'glace' },
  { id:'p_gla2', type:'element', name:'Glace', cost:2, effect:'1 dgt + Givré (1 tour)', elem:'glace' },
  { id:'p_gla3', type:'element', name:'Glace', cost:2, effect:'1 dgt + Givré (1 tour)', elem:'glace' },
  // 2 Vide — pose Fragile pour fermer la boucle Glace→Fragile→Stun
  { id:'p_vid1', type:'element', name:'Vide', cost:2, effect:'2 dgt + Fragile + pioche', elem:'vide' },
  { id:'p_vid2', type:'element', name:'Vide', cost:2, effect:'2 dgt + Fragile + pioche', elem:'vide' },
  // 2 Projectile — ciblage Glace précis
  { id:'p_pro1', type:'forme', name:'Projectile', cost:1, effect:'1 ennemi ciblé', forme:'proj' },
  { id:'p_pro2', type:'forme', name:'Projectile', cost:1, effect:'1 ennemi ciblé', forme:'proj' },
  // 2 Zone — AoE Glace = Givré sur tous → setup multi-cibles puissant
  { id:'p_zon1', type:'forme', name:'Zone', cost:3, effect:'Tous les ennemis', forme:'zone' },
  { id:'p_zon2', type:'forme', name:'Zone', cost:3, effect:'Tous les ennemis', forme:'zone' },
  // 2 Armure — défense standard
  { id:'p_arm1', type:'forme', name:'Armure', cost:1, effect:'+4 bouclier', forme:'arm' },
  { id:'p_arm2', type:'forme', name:'Armure', cost:1, effect:'+4 bouclier', forme:'arm' },
];

// Pool des decks de départ — référencé par renderDeckChoice()
const STARTER_DECKS = [
  {
    id: 'arsenal',
    name: 'Arsenal',
    subtitle: 'Le Généraliste',
    description: 'Accès immédiat aux 3 éléments et aux 3 synergies. Aucun axe forcé.',
    hint: 'Idéal pour tester toutes les Identités. Liberté totale.',
    accentColor: '#888',
    excludeIdentities: [],
    composition: { feu:2, glace:2, vide:2, proj:2, zone:2, arm:2 },
    cards: CARDS_DEF,
  },
  {
    id: 'brasier',
    name: 'Brasier',
    subtitle: 'L\'Incendiaire',
    description: '3 Feu, 1 Glace. Pipeline Brûlure→Détonation fiable dès le tour 1. Peu de contrôle.',
    hint: 'Synergise avec : Cendres Persistantes, Embrasure, Mémoire des cendres.',
    accentColor: '#D85A30',
    excludeIdentities: ['identity_cendres'],
    composition: { feu:3, glace:1, vide:2, proj:3, zone:1, arm:2 },
    cards: BRASIER_CARDS,
  },
  {
    id: 'permafrost',
    name: 'Permafrost',
    subtitle: 'Le Contrôleur',
    description: '3 Glace, 2 Zone. Pipeline Givré→Fracture dominant. Peu de burst direct.',
    hint: 'Synergise avec : Étreinte Permanente, Brise-éclat, Glace mortelle.',
    accentColor: '#378ADD',
    excludeIdentities: ['identity_etreinte'],
    composition: { feu:1, glace:3, vide:2, proj:2, zone:2, arm:2 },
    cards: PERMAFROST_CARDS,
  },
];

// ============================================================
// REWARD_POOL — V1 refondu
// Supprimés : Brûlure intense, Glace persistante, Vide instable,
//             Régénération, Sceau vital.
// Ajoutés   : 4 Hybrides + 5 Tempo.
// Commons ancres : Feu+, Projectile+, Armure runique, Étincelle.
// ============================================================
const REWARD_POOL = [

  // ── COMMONS ANCRES ──────────────────────────────────────────────────────
  // Rôle : lisibilité immédiate, baseline mémorable.
  { id:'feuP_1',          type:'element', name:'Feu+',
    cost:2,  effect:'4 dgt + Brûlure (2). Ancre dégâts.',
    elem:'feu', rarity:'common', dmgOverride:4 },

  { id:'projP_1',         type:'forme',   name:'Projectile+',
    cost:0,  effect:'1 ennemi ciblé (gratuit). Ancre mana.',
    forme:'proj', rarity:'common' },

  { id:'armureRunique_1', type:'forme',   name:'Armure runique',
    cost:1,  effect:'+6 bouclier. Ancre défense.',
    forme:'arm', rarity:'common', shieldAmount:6 },

  // Étincelle — ancre tempo / introduction du mot-clé Élan
  { id:'etincelle_1',     type:'forme',   name:'Étincelle',
    cost:1,  effect:'2 dgt bonus + Élan (+1 action et +1 mana ce tour).',
    forme:'proj', rarity:'common', formeDmg:2, elan:true },

  // ── HYBRIDES — combos sans setup ────────────────────────────────────────
  // Chaque hybride porte son propre combo mais ferme un autre axe.

  // Embrasure : Choc thermique sans Givré → ferme Glace
  { id:'embrasure_1',     type:'element', name:'Embrasure',
    cost:3,  effect:'6 dgt + Brûlure (2). Burst Feu mono-cible, sans Givré requis.',
    elem:'feu', rarity:'rare', dmgOverride:6, bruleStacks:2 },

  // Brise-éclat : Fracture sans Fragile → ferme Choc thermique
  { id:'briseeclat_1',    type:'element', name:'Brise-éclat',
    cost:3,  effect:'1 dgt + Fragile (1) + Stun garanti. Mono-cible uniquement (Projectile).',
    elem:'glace', rarity:'rare', forceStun:true, applyFragile:true, fragileDuration:1,
    formeRestricted:['proj'] },

  // Onde de choc : Détonation sans Feu → ferme stack-Brûlure
  { id:'ondechoc_1',      type:'element', name:'Onde de choc',
    cost:3,  effect:'Applique 3 Brûlure puis détonne immédiatement (~8 dgt + Fragile).',
    elem:'vide', rarity:'rare', instantDetonate:true, bruleStacks:3, drawCount:0 },

  // Cataclysme : setup explosif avec Élan — le "moment" de run
  { id:'cataclysme_1',    type:'element', name:'Cataclysme',
    cost:5,  effect:'Brûlure (3) + Givré (2) + Fragile (2). Élan. Combos ce tour +2 dgt.',
    elem:'cataclysme', rarity:'epic',
    bruleStacks:3, givreDuration:2, fragileDuration:2, elan:true, comboBonus:2, comboBonusDuration:2 },

  // ── TEMPO — économie d'actions / recyclage ───────────────────────────────

  // Mémoire des cendres : recyclage Feu — pousse vers identité mono-élément
  { id:'memoirecendres_1',type:'element', name:'Mémoire des cendres',
    cost:2,  effect:'3 dgt + Brûlure (2). Rappelle un Feu de la défausse en main.',
    elem:'feu', rarity:'rare', recallFromDiscard:'feu' },

  // Souffle : action gratuite ponctuelle
  { id:'souffle_1',       type:'forme',   name:'Souffle',
    cost:1,  effect:'1 ennemi ciblé — cet assemblage ne consomme pas d\'action.',
    forme:'proj', rarity:'rare', freeAction:true },

  // Stèle : action gratuite + pioche 2
  { id:'stele_1',         type:'forme',   name:'Stèle',
    cost:2,  effect:'1 ennemi ciblé — pioche 2 cartes, sans consommer d\'action.',
    forme:'proj', rarity:'rare', freeAction:true, drawCount:2 },

  // Cycle des Éléments : moteur — l'Élément revient en main plus fort
  { id:'cycle_1',         type:'forme',   name:'Cycle des Éléments',
    cost:3,  effect:'1 ennemi ciblé — l\'Élément retourne en main, son coût baisse de 1 (min 0).',
    forme:'proj', rarity:'epic', recycleSelf:true },

  // ── LOCKED — débloquables via Fragments ─────────────────────────────────
  { id:'glaceMortelle_1', type:'element', name:'Glace mortelle',
    cost:3,  effect:'2 dgt + Givré (2 tours) + Fragile (2 tours)',
    elem:'glace', rarity:'rare',
    givreDuration:2, applyFragile:true, fragileDuration:2,
    locked:true, unlockCost:5 },

  { id:'maelstrom_1',     type:'element', name:'Maelström',
    cost:3,  effect:'3 dgt + Brûlure (3) + Givré (2) + Fragile (2)',
    elem:'maelstrom', rarity:'epic',
    bruleStacks:3, givreDuration:2, fragileDuration:2,
    locked:true, unlockCost:12 },
];

// ============================================================
// IDENTITÉS — pool séparé de REWARD_POOL
// Apparaissent après Combat 2 et Combat 4.
// Une Identité modifie la *façon* de jouer un Élément, pas ses chiffres bruts.
// Structure :
//   modifyElement(el, target, ctx) → mute l'objet `el` (copie temporaire,
//                                    safe). Appelé au début de applyElementEffect.
//   onCombo(target, comboName, ctx) → effet additionnel sur combo
//                                    (Pattern 2, vide pour l'instant).
// ctx contient : { game: G } — accès complet à l'état si besoin.
// ============================================================
const IDENTITY_POOL = [

  {
    id: 'identity_cendres',
    name: 'Cendres Persistantes',
    elem: 'feu',
    description: 'Tes Feu n\'infligent plus de dgt directs, mais appliquent 5 Brûlure au lieu de 2. Ta Brûlure brûle 2 fois plus fort.',
    modifyElement: (el, target, ctx) => {
      if (el.elem === 'feu') {
        el.dmgOverride = 0;
        el.bruleStacks = (el.bruleStacks ?? 2) + 3;
      }
    },
    // Affiche le comportement réel si l'élément est Feu
    previewElement: (el, target, ctx) => {
      if (el.elem === 'feu') return `(0 dgt + ${el.bruleStacks ?? 5} Brûlure)`;
      return null;
    },
    // Cendres ne modifie pas le coût
    previewCost: (currentCost, el, fo, ctx) => currentCost,
    flags: { bruleDoubleTick: true },
  },

  {
    id: 'identity_etreinte',
    name: 'Étreinte Permanente',
    elem: 'glace',
    description: 'Givré ne s\'efface plus. Quand il est consumé : +1 atk à l\'ennemi, +1 Brûlure appliquée.',
    // Étreinte ne modifie pas l'affichage de l'Élément,
    // mais on signale visuellement le Givré permanent
    previewElement: (el, target, ctx) => {
      if (el.elem === 'glace') return `(Givré permanent)`;
      return null;
    },
    previewCost: (currentCost, el, fo, ctx) => currentCost,
    flags: { noGivreDecay: true, givreConsumeBackfire: true },
  },

  {
    id: 'identity_implosion',
    name: 'Implosion',
    elem: 'vide',
    description: 'Vide ne fait plus piocher et ne détonne plus. Inflige 2 dgt + 1 par état présent, et pose Fragile.',
    previewElement: (el, target, ctx) => {
      if (el.elem !== 'vide') return null;
      // Calcule les états sur la cible probable pour l'aperçu
      let stateCount = 0;
      if (target) {
        if (target.givre > 0)   stateCount += 1;
        if (target.brule > 0)   stateCount += target.brule;
        if (target.fragile > 0) stateCount += 1;
        if (target.stun)        stateCount += 1;
      }
      return `(Implosion : ${2 + stateCount} dgt)`;
    },
    previewCost: (currentCost, el, fo, ctx) => currentCost,
    flags: { implosionMode: true },
  },

  {
    id: 'identity_echo',
    name: 'Écho',
    elem: 'meta',
    description: 'La 1ère carte ciblée que tu joues chaque tour déclenche son effet une seconde fois. (Ne fonctionne pas avec Zone.)',
    // Écho ne modifie pas la description de l'effet
    previewElement: (el, target, ctx) => null,
    // Écho ajoute +1 mana si 1er assemblage éligible du tour
    previewCost: (currentCost, el, fo, ctx) => {
      const echoEligible = fo.forme !== 'zone' && !ctx.game.combat.echoUsedThisTurn;
      return echoEligible ? currentCost + BALANCE.identities.echoManaFriction : currentCost;
    },
    flags: { echoMode: true },
  },

];

// ============================================================
// RELIQUES — pool séparé d'IDENTITY_POOL et REWARD_POOL.
// Apparaît après Combat 4 (et Combat 6 en V2).
// Une Relique = modificateur structurel passif permanent.
// Hooks optionnels (même pattern que les Identités) :
//   onCombatStart(ctx)               → effet au début de chaque combat
//   previewCost(cost, el, fo, ctx)   → modifie l'affichage du coût
//   previewElement(el, target, ctx)  → modifie l'affichage de l'effet
// ============================================================
const RELIC_POOL = [

  // ── 🔨 CŒUR DE FORGE (rare) — Rupture d'échelle ─────────────────────
  // Le bonus a besoin de connaître la FORME jouée, information que
  // applyElementEffect n'a pas. Il vit donc dans applyForgeBonus(), piloté par
  // le flag zoneBonus. (Un hook modifyElementDamage traînait ici sans être
  // jamais appelé — supprimé, YAGNI.)
  {
    id: 'relic_forge',
    name: 'Cœur de Forge',
    description: 'Tes attaques Zone infligent +1 dgt par cible + 1 dgt supplémentaire par ennemi vivant.',
    rarity: 'rare',
    flags: { zoneBonus: true },
  },

  // ── 🔥 CENDRES VAGABONDES (rare) — RNG positive ─────────────────────
  // Au début de chaque tour, 33% d'appliquer 2 Brûlure à un ennemi aléatoire.
  {
    id: 'relic_cendres_vagabondes',
    name: 'Cendres Vagabondes',
    description: 'Au début de chaque tour, 33% de chances d\'appliquer 2 Brûlure à un ennemi aléatoire.',
    rarity: 'rare',
    onTurnStart: (ctx) => {
      const roll = Math.random();
      if (roll >= BALANCE.relics.cendresVagabondesChance) return;
      const living = ctx.game.combat.enemies.filter(e => e.hp > 0);
      if (living.length === 0) return;
      const target = living[Math.floor(Math.random() * living.length)];
      const stacks = BALANCE.relics.cendresVagabondesStacks;
      applyStateToEnemy(target, 'brule', stacks);
      addLog(`🔥 Une cendre vagabonde s'échoue sur ${target.name} ! (+${stacks} Brûlure)`, 'good');
    },
  },

  // ── 🜂 SCEAU RÉSONANT (epic) — Synergie identitaire ────────────────
  // Les combos sur un ennemi affecté par l'état d'Identité propagent
  // 50% des dgt directs aux autres ennemis vivants.
  // Pour Écho (elem 'meta') : déclenche sur n'importe quel combo.
  {
    id: 'relic_sceau_resonant',
    name: 'Sceau Résonant',
    description: 'Les combos déclenchés sur un ennemi affecté par l\'état de ton Identité se propagent à tous les autres ennemis, à 50% des dgt.',
    rarity: 'epic',
    onComboResolved: (target, comboName, dmgDealt, ctx) => {
      const id = ctx.game.run.identity;
      if (!id) return;  // Pas d'Identité = pas de propagation

      // Check d'éligibilité : l'état correspond à l'Identité ?
      const elemToState = { feu: 'brule', glace: 'givre', vide: 'fragile' };
      const requiredState = elemToState[id.elem];
      const isEcho = id.elem === 'meta';

      // Pour les Identités élémentaires, l'état requis doit avoir été présent
      // AVANT consommation par le combo → on check via appliedStates
      const wasAffected = isEcho ||
        (requiredState && target.appliedStates?.includes(requiredState));
      if (!wasAffected) return;

      const spreadDmg = Math.floor(dmgDealt * BALANCE.relics.sceauSpreadRatio);
      if (spreadDmg <= 0) return;

      const otherEnemies = ctx.game.combat.enemies.filter(
        e => e !== target && e.hp > 0
      );
      if (otherEnemies.length === 0) return;

      addLog(`🜂 Sceau Résonant : ${comboName} se propage (${spreadDmg} dgt sur ${otherEnemies.length} cible(s)).`, 'combo');

      // Propagation = dégâts hors Élément → passe par le helper commun.
      otherEnemies.forEach(other => dealRawDamage(other, spreadDmg));
    },
  },

  // ── 🌀 MÉMOIRE DU CYCLE (legendary) — Transformation pure ──────────
  // Quand tu joues un Élément, le précédent Élément joué ce combat est
  // rappelé en main avec coût -1 (min 0), s'il n'est pas déjà en main.
  {
    id: 'relic_memoire_cycle',
    name: 'Mémoire du Cycle',
    description: 'Quand tu joues un Élément, le précédent Élément joué ce combat est rappelé en main, coût réduit de 1 (min 0).',
    rarity: 'legendary',
    // Logique dans assembleAction (cf. Snippet 4).
    flags: { memoireCycle: true },
  },

];

// ============================================================
// SIGNATURES — pool séparé. Lien deck↔carte via deckId.
// Livraison : récompense GARANTIE après Combat 1 (Mécanisme B).
// Arsenal : AUCUNE entrée → son identité est l'absence de signature.
// ============================================================
// POURQUOI ces cartes existent (cadre de design) :
// Les decks thématiques sont privés de leur Identité native — Brasier ne peut
// jamais se voir proposer Cendres Persistantes, Permafrost jamais Étreinte
// Permanente (cf. excludeIdentities dans STARTER_DECKS). La signature EST cette
// maîtrise élémentaire native, rendue sous forme de carte au lieu d'Identité.
// C'est aussi ce qui explique qu'Arsenal n'en ait pas : il a accès à tout, il
// n'a rien à compenser.
//
// Conséquence importante : Fournaise ne peut exister QUE dans une run Brasier,
// qui ne peut JAMAIS avoir Cendres Persistantes. Le combo dégénéré
// (bruleDoubleTick + Brûlure permanente) est structurellement impossible, pas
// seulement improbable — inutile de le garder à l'œil.
//
// Ce sont des win conditions : la doctrine DE (epic 18-30) est un plancher,
// pas un plafond. Molettes d'équilibrage dans BALANCE.signatures.
const SIGNATURE_POOL = [
  // 🔥 Le feu ne s'éteint plus. Brasier a les dégâts mais pas le contrôle, et
  // sa Brûlure est un consommable (détonner = encaisser puis repartir de zéro).
  // Fournaise la transforme en MOTEUR, et crée la vraie décision du deck :
  // laisser tourner le moteur, ou tout cramer d'un Vide pour un burst.
  {
    id:'sig_brasier', deckId:'brasier',
    type:'element', name:'Fournaise', cost:3,
    effect:'3 dgt + 4 Brûlure. Sur cette cible, la Brûlure ne s\'éteint plus et inflige ses stacks en dégâts chaque tour.',
    elem:'feu', rarity:'epic',
    bruleStacks: BALANCE.signatures.fournaiseBruleStacks,
    lockBrule: true,
  },
  // ❄️ Geler, puis briser. Permafrost contrôle mais ne conclut pas.
  // Deux modes → jamais une carte morte : soit ton setup, soit ton payoff.
  // Explose avec les 2 Zone du deck (geler tout le groupe, tout briser d'un coup).
  {
    id:'sig_permafrost', deckId:'permafrost',
    type:'element', name:'Zéro Absolu', cost:3,
    effect:'Cible non Givrée : 2 dgt + Givré (3). Cible Givrée : brise le Givré — 4 dgt par tour consumé + Stun.',
    elem:'glace', rarity:'epic',
    shatterGivre: true,
    givreDuration: BALANCE.signatures.zeroAbsoluGivreDuration,
  },
];

// Retourne la signature d'un deck, ou null (Arsenal → null).
function getDeckSignature(deckId) {
  return SIGNATURE_POOL.find(s => s.deckId === deckId) ?? null;
}

// ============================================================
// ENCOUNTERS — rencontres groupées par palier de difficulté.
// ============================================================
// `name` porte uniquement le nom de la rencontre ("La Goule"), PAS son
// ordinal ("Combat 1 —") : depuis les rencontres aléatoires, la position
// réelle dans la run varie, donc l'ordinal est calculé au moment de
// initCombat() à partir de la position effective, pas figé dans la donnée.
//
// `tier` place la rencontre dans buildCombatList() (cf. plus bas) :
//   ouverture  → positions 1-2, difficulté tutoriel
//   milieu     → positions 3-5, un enjeu tactique chacune (swarm/tank/catalyst)
//   avantBoss  → position 6, dernière montée avant le boss
//   boss       → position 7, TOUJOURS en dernier (tier non mélangé avec les autres)
//
// Ajouter une rencontre = ajouter une entrée avec le bon tier. Zéro ligne de
// moteur à toucher (buildCombatList lit BALANCE.run.tierOrder dynamiquement).
const ENCOUNTERS = [
  {
    name:'La Goule', tier:'ouverture',
    enemies:[{ name:'Goule', maxHp:8, hp:8, atk:2 }]
  },
  {
    name:'La Sentinelle', tier:'ouverture',
    enemies:[{ name:'Sentinelle', maxHp:14, hp:14, atk:4 }]
  },
  {
    name:'L\'Essaim', tier:'milieu',
    enemies:[
      { name:'Essaim A', maxHp:4, hp:4, atk:1, startShield:2 },
      { name:'Essaim B', maxHp:4, hp:4, atk:1 },
      { name:'Essaim C', maxHp:4, hp:4, atk:1 },
    ]
  },
  {
    name:'Le Bastion', tier:'milieu',
    enemies:[{
      name:'Bastion', maxHp:14, hp:14, atk:3,
      archetype:'tank', startShield:5, shieldRegen:0,
    }]
  },
  {
    name:'Le Réacteur', tier:'milieu',
    enemies:[{
      name:'Réacteur', maxHp:10, hp:10, atk:2,
      archetype:'catalyst',
      archetypeHint: 'Réagit aux combos → +1 atk',
    }]
  },
  {
    name:'Le Berserker', tier:'avantBoss',
    enemies:[{
      name:'Berserker', maxHp:14, hp:14, atk:2,
      archetype:'charged', chargedDamage:6, chargedInterval:2,
    }]
  },
  {
    name:'Le Briseur', tier:'boss',
    enemies:[
      { name:'Briseur',     maxHp:14, hp:14, atk:3,
        archetype:'tank', startShield:4, shieldRegen:1 },
      { name:'Serviteur A', maxHp:5,  hp:5,  atk:1,
        archetype:'catalyst', archetypeHint:'Réagit aux combos → +1 atk' },
      { name:'Serviteur B', maxHp:5,  hp:5,  atk:1,
        archetype:'catalyst', archetypeHint:'Réagit aux combos → +1 atk' },
    ]
  },
];

// ── buildCombatList ─────────────────────────────────────────────────────────
// Construit l'ordre des rencontres d'une run : à l'intérieur de chaque palier
// (BALANCE.run.tierOrder), les rencontres sont mélangées : à l'extérieur,
// l'ordre des paliers reste fixe pour garantir la courbe de difficulté (le
// boss ne peut jamais sortir du tier 'boss', donc jamais apparaître ailleurs
// qu'en dernier).
//
// Garde-fou : un palier vide (contenu retiré, typo) est simplement ignoré —
// pas de crash, juste une run plus courte. Cf. architecture-code.md §2.
function buildCombatList() {
  const list = [];
  BALANCE.run.tierOrder.forEach(tier => {
    const idsInTier = ENCOUNTERS
      .map((enc, idx) => ({ enc, idx }))
      .filter(o => o.enc.tier === tier)
      .map(o => o.idx);
    list.push(...shuffle(idsInTier));
  });
  return list;
}

const RARITY_WEIGHTS = [
  ['common',  55],
  ['rare',    35],
  ['epic',    10],
];

// ============================================================
// ZONE 2 — ÉTAT DU JEU
// ============================================================

let G = {};

// Point d'extension "paint" — voir commentaire d'en-tête.
let requestRender = () => {};

function pickRarity() {
  const total = RARITY_WEIGHTS.reduce((s, [_, w]) => s + w, 0);
  let roll = Math.random() * total;
  for(const [rarity, weight] of RARITY_WEIGHTS) {
    roll -= weight;
    if(roll < 0) return rarity;
  }
  return 'common';
}

function generateRewardChoices(count) {
  const choices = [];
  const usedIds = new Set();

  // Guard : G.meta peut être absent lors d'appels précoces
  const unlockedCards = G.meta?.unlockedCards ?? [];
  const availablePool = REWARD_POOL.filter(c =>
    !c.locked || unlockedCards.includes(c.id)
  );

  // Guard : pool vide = retourne [] proprement, sans boucle infinie
  if (availablePool.length === 0) return choices;

  for (let i = 0; i < count; i++) {
    const rarity = pickRarity();

    let candidates = availablePool.filter(c =>
      c.rarity === rarity && !usedIds.has(c.id)
    );
    // Fallback rareté : si la rareté tirée est épuisée, prend n'importe quoi
    if (candidates.length === 0) {
      candidates = availablePool.filter(c => !usedIds.has(c.id));
    }
    // Pool entier épuisé : on arrête proprement
    if (candidates.length === 0) break;

    const card = candidates[Math.floor(Math.random() * candidates.length)];
    usedIds.add(card.id);
    choices.push({ ...card, id: `${card.id}_${Date.now()}_${i}` });
  }

  return choices;
}

// ── generateIdentityChoices — PISTE B ─────────────────────────────────────────
// Le deck de départ filtre les Identités proposées via excludeIdentities.
//   - Deck thématique (Brasier/Permafrost) : exclut son Identité native
//     → propose les 3 voies COMPLÉMENTAIRES (build hybride garanti).
//   - Arsenal (excludeIdentities vide) : mode expert → propose TOUT le pool.
// Zéro couplage : la règle vit dans la data du deck, pas dans le moteur.
// ─────────────────────────────────────────────────────────────────────────────
function generateIdentityChoices() {
  const currentId   = G.run.identity?.baseId;          // exclut l'Identité actuelle (re-offre future)
  const starterDeck = STARTER_DECKS.find(d => d.id === G.run.startingDeckId);
  const excluded    = new Set(starterDeck?.excludeIdentities ?? []);

  // Toutes les Identités non-natives + non-actuelles, ordre mélangé pour la fraîcheur.
  return shuffle(
    IDENTITY_POOL
      .filter(c => c.id !== currentId && !excluded.has(c.id))
      .map(c => ({ ...c, baseId: c.id }))
  );
}

function generateRelicChoices(count = 3) {
  const choices = [];
  const usedIds = new Set();
  // Exclure les reliques déjà équipées (pas de doublon en V2+)
  const ownedIds = new Set((G.run.relics ?? []).map(r => r.baseId));
  const available = RELIC_POOL.filter(r => !ownedIds.has(r.id));

  for (let i = 0; i < count; i++) {
    const remaining = available.filter(r => !usedIds.has(r.id));
    if (remaining.length === 0) break;
    const relic = remaining[Math.floor(Math.random() * remaining.length)];
    usedIds.add(relic.id);
    choices.push({ ...relic, baseId: relic.id });
  }
  return choices;
}

function shuffle(arr) {
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function newEnemy(e) {
  return {
    ...e,
    givre:0, brule:0, fragile:0, stun:false,
    enemyShield: e.startShield ?? 0,
    intent: null,
    appliedStates: [],
    atkBonus: 0,
    // Fournaise (signature Brasier) : marque définitive posée sur CET ennemi.
    // Tant qu'elle est vraie, sa Brûlure ne décroît plus (cf. endTurn).
    // Survit à une Détonation qui remet brule à 0 : la cible reste marquée,
    // donc toute Brûlure ré-appliquée ensuite est de nouveau permanente.
    bruleLocked: false,
  };
}

function initRun() {
  const meta = G.meta || loadMeta();
  G = {
    meta,
    run: {
      playerHp: DEV.godMode ? BALANCE.player.godModeHp : BALANCE.player.startHp,
      playerMaxHp: DEV.godMode ? BALANCE.player.godModeHp : BALANCE.player.startHp,
      deck: [],           // ← vide : sera peuplé par pickStarterDeck()
      combatIndex: 0,
      combatList: buildCombatList(),
      fragmentsEarned: 0,
      identity: null,
      relics: [],
      startingDeckId: null,  // ← tracké pour 3.c
    },
    scene: 'deckChoice',
    log: [],
  };
  runLog(`═══ NOUVELLE RUN — ${new Date().toLocaleString('fr-FR')} ═══`);
  // Pas d'initCombat ici — on attend le choix du deck
  transitionTo('deckChoice');
}

function initCombat(index) {
  const run = G.run;
  const encounterId = run.combatList[index];
  const enc = ENCOUNTERS[encounterId];

  if(index > 0) {
    const healed = Math.min(run.playerMaxHp, run.playerHp + BALANCE.player.healBetweenCombats);
    const actualHeal = healed - run.playerHp;
    run.playerHp = healed;
    if(actualHeal > 0) {
      addLog(`Tu te soignes de ${actualHeal} PV avant le combat. (${run.playerHp}/${run.playerMaxHp})`, 'good');
    }
  }

  G.encIdx = index;
  // Ordinal calculé sur la POSITION réelle dans la run, pas figé dans la
  // donnée de la rencontre — nécessaire depuis que l'ordre est mélangé.
  G.encName = `Combat ${index + 1} — ${enc.name}`;
  runLog(`\n══ ${G.encName} ══`);
  runLog(`PV début : ${run.playerHp}/${run.playerMaxHp}`);
  const deckSummary = run.deck.map(c=>c.name).join(', ');
  runLog(`Deck (${run.deck.length}) : ${deckSummary}`);
  G.playerHp = run.playerHp;
  G.playerMaxHp = run.playerMaxHp;
  G.shield = 0;
  G.mana = BALANCE.turn.mana;
  G.maxMana = BALANCE.turn.mana;
  G.actionsLeft = BALANCE.turn.actions;
  G.selected = [];
  G.selectedTarget = null;

  G.combat = {
    enemies: enc.enemies.map(newEnemy),
    deck: shuffle([...run.deck]),
    hand: [],
    discard: [],
    comboBonusTurn: 0,   // Reset au début de chaque combat et de chaque tour
    comboBonusTurnsLeft: 0,   // était implicitement undefined avant
    echoUsedThisTurn: false,
    lastElementPlayed: null,
  };

  // Fix recycleSelf : restaurer le coût d'origine des cartes
  // (les modifications de Cycle ne valent que pour le combat où elles ont eu lieu)
  G.combat.deck.forEach(c => {
    if(c._origCost === undefined) c._origCost = c.cost;
    c.cost = c._origCost;
  });

  drawToFull();
  addLog(`--- ${G.encName} --- Mana ${G.mana}, Actions ${G.actionsLeft}.`, 'info');
  // Effets de début de combat des Reliques actives
  applyRelicEffects('onCombatStart');
  transitionTo('combat');
}

function onCombatVictory() {
  G.run.playerHp = G.playerHp;
  G.run.deck = [...G.combat.deck, ...G.combat.hand, ...G.combat.discard];

  const isLast = G.run.combatIndex >= G.run.combatList.length - 1;
  const fragmentsThisCombat = isLast
    ? BALANCE.rewards.fragmentsBossBonus
    : BALANCE.rewards.fragmentsPerCombat;
  G.run.fragmentsEarned += fragmentsThisCombat;
  addLog(`🏆 Victoire ! +${fragmentsThisCombat} Fragment(s) (total run : ${G.run.fragmentsEarned}).`, 'good');
  runLog(`→ Combat terminé — PV : ${G.playerHp}/${G.playerMaxHp} — Fragments run : ${G.run.fragmentsEarned}`);

  if(isLast) {
    commitRunRewards(true);
    transitionTo('meta');
    return;
  }

  // ── NOUVEAU : choix d'Identité après Combat 2 (index 1)
  // Le choix d'Identité a lieu AVANT la récompense standard.
  const justFinishedIndex = G.run.combatIndex;

  // Combat 1 (index 0) → Signature garantie SI le deck en a une.
  // Arsenal (getDeckSignature = null) : tombe vers la récompense normale.
  if (justFinishedIndex === 0) {
    const sig = getDeckSignature(G.run.startingDeckId);
    if (sig) {
      G.signatureChoice      = sig;
      G.pendingRewardChoices = generateRewardChoices(3);
      transitionTo('signatureChoice');
      return;
    }
    // pas de signature → on ne return PAS, on continue vers le reward final
  }

  // Combat 2 (index 1) → Identité, puis récompense
  if (justFinishedIndex === 1 && IDENTITY_POOL.length > 0) {
    G.identityChoices    = generateIdentityChoices();
    G.pendingRewardChoices = generateRewardChoices(3);
    transitionTo('identityChoice');
    return;
  }

  // Combat 4 (index 3) → Relique, puis récompense
  if (justFinishedIndex === 3 && RELIC_POOL.length > 0) {
    G.relicChoices       = generateRelicChoices(3);
    G.pendingRewardChoices = generateRewardChoices(3);
    transitionTo('relicChoice');
    return;
  }

  // Autres combats → récompense directe
  G.rewardChoices = generateRewardChoices(3);
  transitionTo('reward');
}

function onCombatDefeat() {
  runLog(`\n✗ DÉFAITE — Fragments conservés : ${G.run.fragmentsEarned}`);
  commitRunRewards(false);
  transitionTo('meta');
}

function onRewardChosen() {
  G.run.combatIndex++;
  initCombat(G.run.combatIndex);
}

// ── Choix d'Identité ────────────────────────────────────────────────────────
function pickIdentity(index) {
  const chosen = G.identityChoices[index];
  const previous = G.run.identity?.name ?? '(aucune)';
  G.run.identity = { ...chosen };
  runLog(`\n── Identité — Choisi : ${chosen.name} (remplace : ${previous})`);
  addLog(`Identité acquise : ${chosen.name}.`, 'good');
  proceedAfterIdentity();
}

function skipIdentity() {
  const allChoices = G.identityChoices.map(c => c.name).join(' | ');
  runLog(`\n── Identité — Choix proposés : ${allChoices}`);
  runLog(`── Identité — PASSÉE`);
  proceedAfterIdentity();
}

function pickRelic(index) {
  const chosen = G.relicChoices[index];
  G.run.relics.push({ ...chosen });
  runLog(`\n── Relique — Choisie : ${chosen.name}`);
  addLog(`Relique acquise : ${chosen.name}.`, 'good');
  proceedAfterRelic();
}

function skipRelic() {
  const allChoices = G.relicChoices.map(r => r.name).join(' | ');
  runLog(`\n── Relique — Choix proposés : ${allChoices}`);
  runLog(`── Relique — PASSÉE`);
  proceedAfterRelic();
}

function proceedAfterRelic() {
  G.relicChoices = null;
  G.rewardChoices = G.pendingRewardChoices;
  G.pendingRewardChoices = null;
  transitionTo('reward');
}

// ── Choix de Signature (après Combat 1) ──────────────────────────────────────
function pickSignature() {
  const sig = G.signatureChoice;
  if (sig) {
    // Instance unique (comme les récompenses) pour éviter les collisions d'id
    const instance = { ...sig, id: `${sig.id}_${Date.now()}` };
    G.run.deck.push(instance);
    runLog(`\n── Signature — Acquise : ${sig.name} [${sig.rarity}]`);
    addLog(`Carte signature acquise : ${sig.name}.`, 'good');
  }
  proceedAfterSignature();
}

function skipSignature() {
  runLog(`\n── Signature — Proposée : ${G.signatureChoice?.name} — PASSÉE`);
  proceedAfterSignature();
}

function proceedAfterSignature() {
  G.signatureChoice = null;
  G.rewardChoices = G.pendingRewardChoices;
  G.pendingRewardChoices = null;
  transitionTo('reward');
}

function proceedAfterIdentity() {
  G.identityChoices = null;
  // Récompense standard prévue juste après Identité
  G.rewardChoices = G.pendingRewardChoices;
  G.pendingRewardChoices = null;
  transitionTo('reward');
}

function onUnlockCard(cardId) {
  const success = unlockCard(cardId);
  if(success) requestRender();
}

function onStartRun() {
  G.lastRunResult = null;
  initRun();
}

function drawToFull() {
  while(G.combat.hand.length < BALANCE.turn.handSize) {
    if(G.combat.deck.length === 0) {
      if(G.combat.discard.length === 0) break;
      G.combat.deck = shuffle([...G.combat.discard]);
      G.combat.discard = [];
      addLog('Pioche épuisée — la défausse est mélangée.', 'warn');
    }
    G.combat.hand.push(G.combat.deck.pop());
  }
}

function addLog(msg, type='') {
  G.log.unshift({ msg, type });
  if(G.log.length > 50) G.log.pop();
  // Propagation vers le journal de run (texte brut, sans HTML)
  runLog(msg);
}

// Journal de RUN — persiste à travers les combats, affichable à la fin.
// Ne contient PAS de HTML — texte brut copiable.
function runLog(msg) {
  if(!G.run) return;
  if(!G.run.runLog) G.run.runLog = [];
  G.run.runLog.push(msg);
}

// ============================================================
// ZONE 3 — LOGIQUE PURE
// ============================================================

function commitRunRewards(won) {
  G.meta.fragments += G.run.fragmentsEarned;
  if(won) G.meta.totalRunsWon++;
  else G.meta.totalRunsLost++;
  saveMeta();
  G.lastRunResult = { won, fragmentsEarned: G.run.fragmentsEarned };
}

// Dispatch d'un trigger vers toutes les reliques actives.
// trigger = nom de la méthode hook ('onCombatStart', etc.)
// ctx     = données contextuelles additionnelles si besoin
function applyRelicEffects(trigger, ctx = {}) {
  for (const relic of G.run.relics ?? []) {
    if (typeof relic[trigger] === 'function') {
      try {
        // Pour onComboResolved : signature spéciale (target, name, dmg, ctx)
        if (trigger === 'onComboResolved') {
          relic[trigger](ctx.target, ctx.comboName, ctx.dmgDealt, { game: G });
        } else {
          relic[trigger]({ game: G, ...ctx });
        }
      } catch(e) {
        console.error(`Erreur relique "${relic.name}" (${trigger}) :`, e);
      }
    }
  }
}

function unlockCard(cardId) {
  const card = REWARD_POOL.find(c => c.id === cardId);
  if(!card) { console.error(`Carte introuvable : ${cardId}`); return false; }
  if(!card.locked) { console.warn(`Carte déjà déverrouillée : ${cardId}`); return false; }
  if(G.meta.unlockedCards.includes(cardId)) { console.warn(`Carte déjà débloquée : ${cardId}`); return false; }
  if(G.meta.fragments < card.unlockCost) { console.warn(`Pas assez de Fragments : ${G.meta.fragments}/${card.unlockCost}`); return false; }
  G.meta.fragments -= card.unlockCost;
  G.meta.unlockedCards.push(cardId);
  saveMeta();
  return true;
}

// Note sur l'asymétrie voulue : 'givre' et 'fragile' sont des DURÉES (on écrase),
// 'brule' est un compteur de STACKS (on cumule).
function applyStateToEnemy(target, stateName, value) {
  if(stateName === 'givre')        target.givre = value;
  else if(stateName === 'brule')   target.brule = (target.brule || 0) + value;
  else if(stateName === 'fragile') target.fragile = value;

  if(!target.appliedStates.includes(stateName)) {
    target.appliedStates.push(stateName);
  }
}

// ── syncAppliedStates ───────────────────────────────────────────────────────
// Réconcilie appliedStates avec la réalité des compteurs : tout état retombé
// à 0 est retiré du marquage.
//
// ⚠️ TIMING CRITIQUE — à n'appeler QU'APRÈS la résolution complète d'un effet,
// jamais au moment où un combo consomme l'état. Sceau Résonant lit
// appliedStates pour savoir si la cible ÉTAIT affectée avant consommation :
// nettoyer trop tôt l'empêcherait de se déclencher sur le combo lui-même.
//
// Sans cet appel, un état consommé par un combo (Choc Thermique → givre = 0,
// Détonation → brule = 0, Fracture → fragile = 0) restait marqué à vie, car le
// nettoyage de endTurn était enfermé dans un `if(état > 0)` qui ne pouvait
// alors plus jamais s'exécuter. Sceau Résonant propageait donc sur TOUS les
// combos suivants, même sur une cible sans aucun état.
function syncAppliedStates(target) {
  if(!target.appliedStates) return;
  const stillLive = { givre: target.givre > 0, brule: target.brule > 0, fragile: target.fragile > 0 };
  // Un nom d'état inconnu est conservé (on ne présume pas de son cycle de vie).
  target.appliedStates = target.appliedStates.filter(s => stillLive[s] ?? true);
}

function triggerCatalystReaction(target, comboName, dmgDealt = 0) {
  // ── HOOK IDENTITÉ Pattern 2 ──
  if (G.run.identity && typeof G.run.identity.onCombo === 'function') {
    try {
      G.run.identity.onCombo(target, comboName, { game: G });
    } catch(e) {
      console.error('Erreur dans onCombo de l\'Identité :', e);
    }
  }

  // ── HOOK RELIQUES : combo résolu ──
  applyRelicEffects('onComboResolved', { target, comboName, dmgDealt });

  // ── Archétype Catalyst ──
  if (target.archetype !== 'catalyst') return;
  target.atkBonus = (target.atkBonus || 0) + 1;
  addLog(`⚡ Réaction ! Le ${target.name} absorbe le ${comboName} et gagne +1 atk (total : ${target.atk + target.atkBonus}).`, 'warn');
}

// ── survivesDamage ──────────────────────────────────────────────────────────
// Un état ne se pose que si la cible survit au coup : inutile d'empiler de la
// Brûlure sur un mort. Le bouclier ennemi absorbe en premier.
function survivesDamage(target, dmg) {
  const effective = Math.max(0, dmg - target.enemyShield);
  return target.hp - effective > 0;
}

// ============================================================
// ELEMENT_RESOLVERS — un élément = une entrée, zéro if/else moteur
// ============================================================
// Contrat : (el, target, ctx) => dégâts bruts à infliger.
//   el     : instance ÉPHÉMÈRE, déjà passée par le hook modifyElement de
//            l'Identité — la muter est sans danger.
//   target : ennemi VIVANT (la garde cible-morte est faite en amont).
//   ctx    : { comboBonus } — bonus Cataclysme actif ce tour.
// Le resolver pose les états et loggue. L'application des dégâts et du bouclier
// reste centralisée dans applyElementEffect : un seul endroit pour cette règle.
//
// Ajouter un 6ᵉ élément = ajouter une clé ici + une carte dans un pool.
// Aucune ligne du moteur à modifier (architecture-code.md §1).
const ELEMENT_RESOLVERS = {

  feu: (el, target, { comboBonus }) => {
    let baseDmg = el.dmgOverride ?? BALANCE.elementBaseDmg.feu;
    let comboTriggered = false;

    if(target.givre > 0) {
      // Choc Thermique. Si Cendres Persistantes a mis les dgt directs à 0, on
      // repart du dgt standard de Feu comme base du x2 : Cendres sacrifie les
      // dégâts directs, pas le potentiel de réaction.
      const ctBase = baseDmg > 0 ? baseDmg : BALANCE.elementBaseDmg.feu;
      baseDmg = ctBase * BALANCE.combos.chocThermiqueMultiplier;
      if(comboBonus) baseDmg += comboBonus;
      target.givre = 0;
      comboTriggered = true;

      // Backfire Étreinte : uniquement si l'ennemi SURVIT → punit la maladresse
      // (kill raté), jamais le plan (kill réussi).
      if(G.run.identity?.flags?.givreConsumeBackfire && survivesDamage(target, baseDmg)) {
        target.atkBonus = (target.atkBonus || 0) + 1;
        addLog(`❄→⚠ Étreinte brisée : ${target.name} gagne +1 atk (total ${target.atk + target.atkBonus}).`, 'warn');
        applyStateToEnemy(target, 'brule', 1);
        addLog(`❄→🔥 La rupture du Givré laisse +1 Brûlure sur ${target.name}.`, 'good');
      }
      addLog(
        `🔥❄ CHOC THERMIQUE sur ${target.name} ! ${baseDmg} dgt (x${BALANCE.combos.chocThermiqueMultiplier}${comboBonus ? ' +'+comboBonus+' Cataclysme' : ''}).`,
        'combo'
      );
      triggerCatalystReaction(target, 'Choc Thermique', baseDmg);
    }

    if(survivesDamage(target, baseDmg)) {
      const stacks = el.bruleStacks ?? BALANCE.states.defaultBruleStacks;
      applyStateToEnemy(target, 'brule', stacks);
      // ── FOURNAISE (signature Brasier) — change une RÈGLE, pas un chiffre ──
      // Marque la cible : sa Brûlure cesse de décroître pour tout le combat.
      // Le stack devient un moteur (dgt/tour indéfiniment) au lieu d'un
      // consommable — et la Brûlure ignorant le bouclier ennemi, c'est la
      // réponse de Brasier aux tanks (Bastion, Briseur).
      // Posée seulement si la cible survit : pas de marque sur un cadavre.
      if(el.lockBrule && !target.bruleLocked) {
        target.bruleLocked = true;
        addLog(`🔥🔒 FOURNAISE : la Brûlure de ${target.name} ne s'éteindra plus de ce combat.`, 'combo');
      }
      if(!comboTriggered) addLog(`Feu → ${target.name} : ${baseDmg} dgt + ${stacks} Brûlure.`, 'good');
    } else if(!comboTriggered) {
      addLog(`Feu → ${target.name} : ${baseDmg} dgt (létal).`, 'good');
    }
    return baseDmg;
  },

  glace: (el, target, { comboBonus }) => {
    // ── ZÉRO ABSOLU (signature Permafrost) — deux modes, jamais morte ──
    // Permafrost sait geler et stunner mais ne sait pas CONCLURE : Glace fait
    // 1-2 dgt. Cette carte convertit le contrôle accumulé en dégâts.
    //   cible saine  → mode setup  : gèle profond (3 tours)
    //   cible Givrée → mode brise  : consomme TOUT le Givré, N dgt par tour
    // Sortie anticipée dans les deux cas : Zéro Absolu ne doit jamais
    // enchaîner sur la Fracture ni sur la pose de Givré standard plus bas.
    if(el.shatterGivre) {
      if(target.givre > 0) {
        const turns = target.givre;
        let shatterDmg = turns * BALANCE.signatures.zeroAbsoluDmgPerGivreTurn;
        if(comboBonus) shatterDmg += comboBonus;
        target.givre = 0;
        target.stun = true;
        addLog(
          `❄️💥 ZÉRO ABSOLU sur ${target.name} : ${turns} tour(s) de Givré brisés → ${shatterDmg} dgt + Stun${comboBonus ? ' (+'+comboBonus+' Cataclysme)' : ''}.`,
          'combo'
        );
        triggerCatalystReaction(target, 'Zéro Absolu', shatterDmg);
        return shatterDmg;
      }
      const setupDmg = BALANCE.signatures.zeroAbsoluSetupDmg;
      if(survivesDamage(target, setupDmg)) {
        applyStateToEnemy(target, 'givre', el.givreDuration ?? BALANCE.signatures.zeroAbsoluGivreDuration);
        addLog(`❄️ Zéro Absolu → ${target.name} : ${setupDmg} dgt + Givré (${target.givre} tours). Rejoue-le pour briser.`, 'good');
      } else {
        addLog(`❄️ Zéro Absolu → ${target.name} : ${setupDmg} dgt (létal).`, 'good');
      }
      return setupDmg;
    }

    let dmg = BALANCE.elementBaseDmg.glace;
    // Closer Permafrost : Glace frappe plus fort sur une cible déjà Givrée.
    // Rend le re-gel pertinent ; en Zone, chaque ennemi gelé encaisse le bonus.
    if(target.givre > 0) dmg += BALANCE.combos.frozenTargetBonusDmg;

    if(el.forceStun) {
      // Brise-éclat : Stun garanti et AUCUN Givré posé.
      target.stun = true;
      if(survivesDamage(target, dmg)) {
        applyStateToEnemy(target, 'fragile', el.fragileDuration ?? BALANCE.states.defaultFragileDuration);
        addLog(`🔨 Brise-éclat → ${target.name} : ${dmg} dgt + Stun + Fragile (${target.fragile} tour(s)).`, 'good');
      } else {
        addLog(`🔨 Brise-éclat → ${target.name} : ${dmg} dgt (létal) + Stun.`, 'good');
      }
      return dmg;   // court-circuite la pose de Givré ci-dessous
    }

    if(target.fragile > 0) {
      // Fracture. Consume Fragile, pas Givré → pas de backfire Étreinte ici.
      target.stun = true;
      target.fragile = 0;
      if(comboBonus) dmg += comboBonus;
      addLog(
        `💎❄ FRACTURE sur ${target.name} ! Stun garanti${comboBonus ? ', +'+comboBonus+' dgt Cataclysme' : ''}.`,
        'combo'
      );
      triggerCatalystReaction(target, 'Fracture', dmg);
    } else {
      addLog(`Glace → ${target.name} : ${dmg} dgt + Givré.`, 'good');
    }

    // ⚠️ Effet de bord historique CONSERVÉ tel quel : ce bloc tourne aussi après
    // la branche Fracture, donc Fracture ré-applique du Givré. Non documenté
    // côté joueur → à trancher en session design (cf. CONTEXTE.md).
    if(survivesDamage(target, dmg)) {
      applyStateToEnemy(target, 'givre', el.givreDuration ?? BALANCE.states.defaultGivreDuration);
      if(el.applyFragile) {
        applyStateToEnemy(target, 'fragile', el.fragileDuration ?? BALANCE.states.defaultFragileDuration);
        addLog(`${target.name} devient aussi Fragile (${target.fragile} tour(s)).`, 'good');
      }
    }
    return dmg;
  },

  vide: (el, target, { comboBonus }) => {
    let baseDmg = BALANCE.elementBaseDmg.vide;
    const implosionMode = G.run.identity?.flags?.implosionMode;

    if(implosionMode) {
      // Implosion : ne détonne plus, scale sur les états présents
      // (la Brûlure compte pour son nombre de stacks).
      let stateCount = 0;
      if(target.givre > 0)   stateCount += 1;
      if(target.brule > 0)   stateCount += target.brule;
      if(target.fragile > 0) stateCount += 1;
      if(target.stun)        stateCount += 1;
      baseDmg += stateCount;
      if(comboBonus) baseDmg += comboBonus;
      addLog(
        `🕳 IMPLOSION sur ${target.name} : ${baseDmg} dgt (${BALANCE.elementBaseDmg.vide} + ${stateCount} État${stateCount>1?'s':''}${comboBonus ? ' +'+comboBonus+' Cataclysme' : ''}).`,
        'combo'
      );
      // Pas de triggerCatalystReaction : Implosion n'est pas un combo classique.

    } else if(el.instantDetonate) {
      // Onde de choc : pose ses stacks puis détonne tout dans le même souffle.
      const bruStacks = el.bruleStacks ?? 3;   // fallback ; la carte le définit
      target.brule = (target.brule || 0) + bruStacks;
      const totalBrule = target.brule;
      baseDmg += totalBrule * BALANCE.combos.detonationDmgPerStack;
      if(comboBonus) baseDmg += comboBonus;
      target.brule = 0;
      addLog(
        `💥 Onde de choc → ${target.name} : ${totalBrule} Brûlure détonées ! ${baseDmg} dgt + Fragile.`,
        'combo'
      );
      triggerCatalystReaction(target, 'Détonation', baseDmg);

    } else if(target.brule > 0) {
      const detonation = target.brule;
      baseDmg += detonation * BALANCE.combos.detonationDmgPerStack;
      if(comboBonus) baseDmg += comboBonus;
      target.brule = 0;
      addLog(
        `💥🔥 DÉTONATION sur ${target.name} ! Vide consume ${detonation} Brûlure → ${baseDmg} dgt${comboBonus ? ' (+'+comboBonus+' Cataclysme)' : ''}.`,
        'combo'
      );
      triggerCatalystReaction(target, 'Détonation', baseDmg);
    } else {
      addLog(`Vide → ${target.name} : ${baseDmg} dgt + Fragile + pioche.`, 'good');
    }

    if(survivesDamage(target, baseDmg)) {
      applyStateToEnemy(target, 'fragile', el.fragileDuration ?? BALANCE.states.defaultFragileDuration);
    }
    return baseDmg;
  },

  cataclysme: (el, target) => {
    // Aucun dégât direct : pose les 3 États et arme le bonus combos du tour.
    applyStateToEnemy(target, 'brule',   el.bruleStacks     ?? 3);
    applyStateToEnemy(target, 'givre',   el.givreDuration   ?? 2);
    applyStateToEnemy(target, 'fragile', el.fragileDuration ?? 2);
    const bonus = el.comboBonus ?? 2;
    G.combat.comboBonusTurn      = (G.combat.comboBonusTurn || 0) + bonus;
    G.combat.comboBonusTurnsLeft = el.comboBonusDuration ?? 1;
    addLog(
      `🌋 Cataclysme → ${target.name} : Brûlure(${target.brule})+Givré(${target.givre})+Fragile(${target.fragile}). Combos ce tour +${bonus} dgt !`,
      'combo'
    );
    return BALANCE.elementBaseDmg.cataclysme;
  },

  maelstrom: (el, target) => {
    const dmg = BALANCE.elementBaseDmg.maelstrom;
    // ⚠️ Incohérence historique conservée : ce test ignore le bouclier ennemi,
    // contrairement aux autres éléments qui passent par survivesDamage().
    if(target.hp - dmg > 0) {
      applyStateToEnemy(target, 'brule',   el.bruleStacks     ?? BALANCE.states.defaultBruleStacks);
      applyStateToEnemy(target, 'givre',   el.givreDuration   ?? 1);
      applyStateToEnemy(target, 'fragile', el.fragileDuration ?? 1);
    }
    addLog(`🌀 MAELSTRÖM sur ${target.name} : ${dmg} dgt + Brûlure/Givré/Fragile appliqués.`, 'combo');
    return dmg;
  },

};

// ── applyElementEffect ──────────────────────────────────────────────────────
// Orchestrateur. Ne connaît AUCUN élément par son nom : garde cible-morte,
// hook Identité, dispatch vers ELEMENT_RESOLVERS, application des dégâts,
// réconciliation du marquage d'états.
// ────────────────────────────────────────────────────────────────────────────
function applyElementEffect(el, target) {
  // ── GARDE CIBLE MORTE ──
  // Une cible peut mourir EN COURS de résolution : bonus de Cœur de Forge
  // appliqué avant l'Élément, propagation de Sceau Résonant en milieu de Zone,
  // tick de Brûlure... Sans cette garde, l'Élément se résolvait sur le cadavre :
  // logs mensongers ("3 dgt (létal)" sur un mort), états posés sur un cadavre,
  // et combos déclenchés à tort. Cf. architecture-code.md §2.
  if(target.hp <= 0) return 0;

  let dmg = 0;
  const comboBonus = G.combat.comboBonusTurn || 0;

  // ── HOOK IDENTITÉ — modifie une copie de l'Élément avant résolution ──
  // On clone pour ne JAMAIS muter le template original (carte du deck).
  // Le clone est éphémère : valide uniquement pour cette résolution.
  const elInstance = { ...el };
  if(G.run.identity && typeof G.run.identity.modifyElement === 'function') {
    try {
      G.run.identity.modifyElement(elInstance, target, { game: G });
    } catch(e) {
      console.error('Erreur dans modifyElement de l\'Identité :', e);
    }
  }
  el = elInstance;  // Le reste de la fonction utilise la version modifiée

  // ── DISPATCH DATA-DRIVEN ──
  // Le moteur ne teste plus aucun nom d'élément : il délègue à la table.
  const resolver = ELEMENT_RESOLVERS[el.elem];
  if(resolver) {
    dmg = resolver(el, target, { comboBonus });
  } else {
    // Garde-fou : carte mal déclarée (typo sur `elem`, élément retiré du jeu).
    // On loggue au lieu de crasher silencieusement en plein combat.
    console.warn(`Aucun resolver pour l'élément "${el.elem}" — aucun effet appliqué.`);
    addLog(`⚠️ ${el.name ?? 'Élément'} n'a produit aucun effet (élément inconnu).`, 'warn');
  }

  // ── Application des dégâts (bouclier ennemi en premier) ──
  let remainingDmg = dmg;
  if(target.enemyShield > 0 && remainingDmg > 0) {
    const absorbed = Math.min(target.enemyShield, remainingDmg);
    target.enemyShield -= absorbed;
    remainingDmg -= absorbed;
    if(absorbed > 0) {
      addLog(`${target.name} : ${absorbed} dgt absorbés par son bouclier (reste ${target.enemyShield}).`, 'warn');
    }
  }
  target.hp = Math.max(0, target.hp - remainingDmg);

  // Réconciliation du marquage APRÈS résolution complète (combos inclus).
  syncAppliedStates(target);
  return dmg;
}

// ============================================================
// ASSEMBLAGE — décomposé en étapes à responsabilité unique
// ============================================================
// Mécaniques portées par la data des cartes, jamais par des if sur un id :
//   fo.freeAction        → l'assemblage ne consomme pas d'action
//   fo.recycleSelf       → l'Élément retourne en main, coût -1
//   el.elan / fo.elan    → +1 action +1 mana ce tour (mot-clé Élan)
//   fo.formeDmg          → dgt bonus de la Forme sur la cible principale
//   fo.drawCount         → pioche N cartes après l'assemblage
//   el.recallFromDiscard → rappelle un Élément de ce type depuis la défausse

// ── dealRawDamage ───────────────────────────────────────────────────────────
// Dégâts qui ne passent PAS par la résolution d'un Élément : bonus de relique,
// dgt de Forme, propagation du Sceau. Bouclier ennemi absorbé en premier.
// Retourne les dégâts réellement passés aux PV.
// Cette règle existait en 3 copies (Forge, Étincelle, Sceau Résonant) — une
// seule implémentation, donc un seul endroit à corriger si la règle change.
function dealRawDamage(target, amount) {
  let remaining = amount;
  if(target.enemyShield > 0 && remaining > 0) {
    const absorbed = Math.min(target.enemyShield, remaining);
    target.enemyShield -= absorbed;
    remaining -= absorbed;
  }
  if(remaining > 0) target.hp = Math.max(0, target.hp - remaining);
  return remaining;
}

// ── echoFrictionFor ─────────────────────────────────────────────────────────
// Surcoût en mana du 1er assemblage éligible du tour sous Identité Écho.
// Zone en est exemptée (Écho ne rejoue pas les Zone).
function echoFrictionFor(fo) {
  const echoActive = G.run.identity?.flags?.echoMode;
  const eligible   = echoActive && fo.forme !== 'zone';
  const isFirst    = eligible && !G.combat.echoUsedThisTurn;
  return isFirst ? BALANCE.identities.echoManaFriction : 0;
}

// ── resolveAssemblyCost ─────────────────────────────────────────────────────
// SOURCE UNIQUE du coût d'un assemblage : utilisée par assembleAction (qui
// débite le mana) ET par canAssemble (qui active le bouton).
// Pourquoi ça compte : ces deux calculs existaient en double et leur
// désynchronisation a déjà produit un bug (bouton actif sur un coup ensuite
// refusé). Avec une seule fonction, cette classe de bug devient impossible.
function resolveAssemblyCost(el, fo) {
  return el.cost + fo.cost + echoFrictionFor(fo);
}

// ── validateAssembly ────────────────────────────────────────────────────────
// Retourne { msg, type } si le coup est illégal, sinon null.
// Ne mute RIEN : toutes les vérifications passent avant la moindre dépense.
function validateAssembly(el, fo) {
  if(!el || !fo) {
    return { msg: 'Sélectionne 1 Élément + 1 Forme.', type: 'warn' };
  }
  if(el.formeRestricted && !el.formeRestricted.includes(fo.forme)) {
    return { msg: `${el.name} ne peut être combiné qu'avec : ${el.formeRestricted.join(', ')}.`, type: 'warn' };
  }
  const cost = resolveAssemblyCost(el, fo);
  if(cost > G.mana) {
    return { msg: `Pas assez de mana (besoin ${cost}, dispo ${G.mana}).`, type: 'bad' };
  }
  if(G.actionsLeft <= 0 && !fo.freeAction) {
    return { msg: `Tu as déjà assemblé ${BALANCE.turn.actions} fois ce tour.`, type: 'warn' };
  }
  const living = G.combat.enemies.filter(e => e.hp > 0);
  if(fo.forme === 'proj' && G.selectedTarget === null && living.length > 1) {
    return { msg: 'Choisis une cible pour cet assemblage.', type: 'warn' };
  }
  return null;
}

function payAssemblyCost(el, fo) {
  // Appelé AVANT applyEchoRepeat, donc echoUsedThisTurn est encore false :
  // la friction est bien celle validée juste au-dessus.
  G.mana -= resolveAssemblyCost(el, fo);
  if(!fo.freeAction) G.actionsLeft--;
}

// Sort les cartes jouées de la main et les route vers leur destination.
function moveCardsAfterPlay(el, fo) {
  G.combat.hand = G.combat.hand.filter(c => !G.selected.includes(c.id));
  if(fo.recycleSelf) {
    el.cost = Math.max(0, (el.cost || 0) - 1);
    G.combat.hand.push(el);
    G.combat.discard.push(fo);
    addLog(`Cycle → ${el.name} retourne en main (coût : ${el.cost} mana).`, 'info');
  } else {
    G.combat.discard.push(el, fo);
  }
  G.selected = [];
}

// Sélection pure : aucun log, aucune mutation.
function pickAssemblyTargets(fo, living) {
  if(fo.forme === 'zone')  return living;
  if(living.length === 1)  return [living[0]];
  return [living[G.selectedTarget] || living[0]];
}

// ── applyForgeBonus (Cœur de Forge) ─────────────────────────────────────────
// ⚠️ Appliqué AVANT l'Élément : il peut donc tuer une cible. La garde
// cible-morte de applyElementEffect empêche alors l'Élément de se résoudre
// sur le cadavre.
function applyForgeBonus(fo, targets) {
  if(fo.forme !== 'zone') return;
  const forgeRelic = G.run.relics?.find(r => r.flags?.zoneBonus);
  if(!forgeRelic) return;

  const livingCount   = G.combat.enemies.filter(e => e.hp > 0).length;
  const bonusPerCible = BALANCE.relics.forgeBonusBase + livingCount;
  targets.forEach(t => {
    if(t.hp <= 0) return;
    dealRawDamage(t, bonusPerCible);
  });
  addLog(`🔨 Cœur de Forge : +${bonusPerCible} dgt par cible (${livingCount} ennemi(s) vivant(s)).`, 'good');
}

// ── applyEchoRepeat (Identité Écho) ─────────────────────────────────────────
function applyEchoRepeat(el, fo, targets) {
  const echoActive = G.run.identity?.flags?.echoMode;
  const eligible   = echoActive && fo.forme !== 'zone';
  if(!eligible || G.combat.echoUsedThisTurn) return;

  G.combat.echoUsedThisTurn = true;
  const stillLiving = targets.filter(e => e.hp > 0);
  if(stillLiving.length === 0) {
    addLog(`🔁 Écho — cible(s) déjà éliminée(s), pas de répétition.`, 'info');
    return;
  }
  addLog(`🔁 ÉCHO ! L'effet de ${el.name} + ${fo.name} se répète.`, 'combo');
  stillLiving.forEach(e => applyElementEffect(el, e));
}

// Dgt bonus portés par la Forme (Étincelle) → cible principale uniquement.
function applyFormeBonusDamage(fo, targets) {
  if(!fo.formeDmg) return;
  const primary = targets[0];
  if(!primary || primary.hp <= 0) return;

  const shieldBefore = primary.enemyShield;
  const dealt        = dealRawDamage(primary, fo.formeDmg);
  const absorbed     = shieldBefore - primary.enemyShield;
  if(absorbed > 0) addLog(`${fo.name} : ${absorbed} dgt bonus absorbés par le bouclier.`, 'warn');
  if(dealt > 0)    addLog(`${fo.name} → ${dealt} dgt bonus sur ${primary.name}.`, 'good');
}

function resolveDraws(el, fo) {
  // Pioche du Vide — supprimée par Implosion, qui troque la pioche contre des
  // dégâts scalant sur les états.
  const implosionMode = G.run.identity?.flags?.implosionMode;
  if(el.elem === 'vide' && !el.instantDetonate && !implosionMode) {
    const drawCount = el.drawCount ?? 1;
    for(let i = 0; i < drawCount; i++) drawCard();
    if(drawCount > 0) addLog(`Vide → tu pioches ${drawCount} carte(s).`, 'info');
  }
  // Pioche portée par la Forme (Stèle).
  if(fo.drawCount) {
    for(let i = 0; i < fo.drawCount; i++) drawCard();
    addLog(`${fo.name} → tu pioches ${fo.drawCount} carte(s).`, 'info');
  }
}

function resolveRecalls(el) {
  // Mémoire des cendres — rappelle un Élément du type demandé.
  // Exclut la carte qu'on vient de jouer (comparaison sur l'id).
  if(el.recallFromDiscard) {
    const idx = G.combat.discard.findIndex(
      c => c.elem === el.recallFromDiscard && c.id !== el.id
    );
    if(idx >= 0) {
      const recalled = G.combat.discard.splice(idx, 1)[0];
      G.combat.hand.push(recalled);
      addLog(`Mémoire des cendres → ${recalled.name} rappelé de la défausse.`, 'info');
    }
  }

  const memoireRelic = G.run.relics?.find(r => r.flags?.memoireCycle);
  if(!memoireRelic) return;

  // Mémoire du Cycle — rappelle l'Élément joué juste avant.
  // On DÉPLACE la carte (splice), on ne la clone PAS : cloner laissait
  // l'original en défausse → doublon permanent dans le deck (deck bloat).
  const previous = G.combat.lastElementPlayed;
  if(previous) {
    const alreadyInHand = G.combat.hand.some(c => c.id === previous.id);
    const idx = G.combat.discard.findIndex(c => c.id === previous.id);
    if(!alreadyInHand && idx >= 0) {
      const recalled = G.combat.discard.splice(idx, 1)[0];
      recalled.cost = Math.max(0, (recalled.cost ?? 0) - BALANCE.relics.memoireCycleCostReduction);
      G.combat.hand.push(recalled);
      addLog(`🌀 Mémoire du Cycle → ${recalled.name} rappelé (coût : ${recalled.cost}).`, 'info');
    }
  }
  G.combat.lastElementPlayed = el;
}

// Élan — traité en DERNIER, après toutes les dépenses de l'assemblage.
function applyElan(el, fo) {
  if(!el.elan && !fo.elan) return;
  G.actionsLeft++;
  G.mana++;
  addLog('⚡ Élan ! +1 action et +1 mana pour ce tour.', 'info');
}

// ── assembleAction ─────────────────────────────────────────────────────────
// Orchestrateur : valide, débite, puis enchaîne les étapes dans l'ordre.
// L'ordre est significatif — Forge frappe avant l'Élément, Élan vient après.
function assembleAction() {
  const sel = G.selected.map(id => G.combat.hand.find(c => c.id === id));
  const el  = sel.find(c => c?.type === 'element');
  const fo  = sel.find(c => c?.type === 'forme');

  const error = validateAssembly(el, fo);
  if(error) { addLog(error.msg, error.type); requestRender(); return; }

  const living = G.combat.enemies.filter(e => e.hp > 0);
  if(living.length === 0) return;   // combat déjà gagné : rien à résoudre

  payAssemblyCost(el, fo);
  moveCardsAfterPlay(el, fo);

  if(fo.forme === 'arm') {
    const shieldAmount = fo.shieldAmount ?? BALANCE.formes.defaultShieldAmount;
    G.shield += shieldAmount;
    addLog(`${el.name} + ${fo.name} → +${shieldAmount} bouclier (total ${G.shield}).`, 'good');
  } else {
    const targets = pickAssemblyTargets(fo, living);
    if(fo.forme === 'zone') addLog(`${el.name} + Zone → frappe tous les ennemis :`, 'info');

    applyForgeBonus(fo, targets);
    targets.forEach(e => applyElementEffect(el, e));
    applyEchoRepeat(el, fo, targets);
    applyFormeBonusDamage(fo, targets);
    resolveDraws(el, fo);
  }

  resolveRecalls(el);
  applyElan(el, fo);

  G.selectedTarget = null;
  checkWin();
  requestRender();
}

function drawCard() {
  if(G.combat.deck.length === 0) {
    if(G.combat.discard.length === 0) return;
    G.combat.deck = shuffle([...G.combat.discard]);
    G.combat.discard = [];
  }
  G.combat.hand.push(G.combat.deck.pop());
}

function discardCard() {
  if(G.scene !== 'combat') return;
  if(G.actionsLeft <= 0) { addLog('Tu n\'as plus d\'action ce tour.', 'warn'); requestRender(); return; }
  if(G.selected.length !== 1) { addLog('Sélectionne exactement 1 carte à défausser.', 'warn'); requestRender(); return; }

  const cardId = G.selected[0];
  const card = G.combat.hand.find(c => c.id === cardId);
  if(!card) return;

  G.combat.hand = G.combat.hand.filter(c => c.id !== cardId);
  G.combat.discard.push(card);
  G.selected = [];
  G.actionsLeft--;

  drawCard();
  addLog(`Défausse : ${card.name}. Tu pioches une nouvelle carte.`, 'info');
  requestRender();
}

function checkWin() {
  if(G.combat.enemies.every(e=>e.hp<=0)) { onCombatVictory(); return; }
  if(G.playerHp <= 0)                    { onCombatDefeat();  return; }
}

function endTurn() {
  // Reset du bonus combos Cataclysme au début du tour ennemi
  // Décrémente la durée du bonus combos Cataclysme
  if(G.combat.comboBonusTurnsLeft > 0) {
    G.combat.comboBonusTurnsLeft--;
    if(G.combat.comboBonusTurnsLeft === 0) {
      G.combat.comboBonusTurn = 0;
    }
  }

  G.selected = []; G.selectedTarget = null;
  addLog('--- Tour ennemi ---', 'info');

  // 1. Tick des Brûlures
  const bruleDoubleTick = G.run.identity?.flags?.bruleDoubleTick;
  G.combat.enemies.filter(e=>e.hp>0).forEach(e => {
    if(e.brule > 0) {
      const baseTick = bruleDoubleTick
        ? BALANCE.states.bruleTickDmgDoubled
        : BALANCE.states.bruleTickDmg;
      // ── FOURNAISE ──
      // Normalement, les stacks de Brûlure sont une DURÉE, pas une intensité :
      // Brûlure 4 = 1 dgt/tour pendant 4 tours. Sous la marque Fournaise, le
      // stack ne décroît plus ET brûle à pleine intensité (dgt = stacks).
      // Sans cette seconde moitié, « Brûlure permanente » ne vaudrait qu'1
      // dgt/tour : mesuré à 8 DE sur 5 tours, très loin de la bande epic 18-30.
      const tickDmg = e.bruleLocked ? e.brule * baseTick : baseTick;
      e.hp = Math.max(0, e.hp - tickDmg);
      if(!e.bruleLocked) e.brule -= 1;
      addLog(
        e.bruleLocked
          ? `🔥🔒 ${e.name} subit ${tickDmg} dgt — la Fournaise ne s'éteint pas (${e.brule} Brûlure).`
          : `${e.name} subit ${tickDmg} dgt de Brûlure (${e.brule} restante).`,
        'good'
      );
    }
    // Hors du `if` : un état déjà à 0 (consommé par un combo) doit AUSSI
    // être démarqué, sinon le nettoyage ne s'exécute jamais.
    syncAppliedStates(e);
  });
  checkWin();
  if(G.scene !== 'combat') return;

  // 2. Attaques ennemies
  G.combat.enemies.filter(e=>e.hp>0).forEach(e => {
    if(e.stun) {
      addLog(`${e.name} est stunné, rate son tour.`,'info');
      e.stun = false;
      if(e.intent) {
        addLog(`${e.name} interrompt son attaque chargée !`, 'good');
        e.intent = null;
      }
      return;
    }

    let dmg = (e.atk + (e.atkBonus || 0));
    let attackLabel = e.name;

    if(e.archetype === 'charged' && e.intent && e.intent.type === 'charged') {
      dmg = e.intent.damage;
      attackLabel = `${e.name} ATTAQUE CHARGÉE`;
      e.intent = null;
    }

    if(G.shield > 0) {
      const absorbed = Math.min(G.shield, dmg);
      G.shield -= absorbed; dmg -= absorbed;
      addLog(`${attackLabel} attaque : ${absorbed} absorbé par le bouclier.`, 'warn');
    }
    if(dmg > 0) {
      G.playerHp = Math.max(0, G.playerHp - dmg);
      addLog(`${attackLabel} inflige ${dmg} dgt. PV joueur : ${G.playerHp}/${G.playerMaxHp}.`, 'bad');
    }
  });

  if(G.playerHp <= 0) {
    addLog('☠ Tu as été vaincu.', 'bad');
    onCombatDefeat();
    return;
  }

  // ── PATCH 1 : décrémentation des États — UNE SEULE FOIS ──
  const noGivreDecay = G.run.identity?.flags?.noGivreDecay;
  G.combat.enemies.forEach(e => {
    if(e.givre > 0 && !noGivreDecay) e.givre -= 1;
    if(e.fragile > 0)                e.fragile -= 1;
    syncAppliedStates(e);
  });

  // 3. Fin de tour — archétypes
  G.combat.enemies.filter(e=>e.hp>0).forEach(e => {
    if(e.archetype === 'tank' && e.shieldRegen) {
      const before = e.enemyShield;
      e.enemyShield += e.shieldRegen;
      addLog(`${e.name} régénère ${e.shieldRegen} bouclier (${before} → ${e.enemyShield}).`, 'warn');
    }
    if(e.archetype === 'charged') {
      e.chargedCounter = (e.chargedCounter || 0) + 1;
      if(e.chargedCounter >= (e.chargedInterval || 2)) {
        e.intent = { type:'charged', damage: e.chargedDamage };
        e.chargedCounter = 0;
        addLog(`⚠️ ${e.name} prépare une attaque chargée : ${e.chargedDamage} dgt au prochain tour !`, 'warn');
      }
    }
  });

  // 4. Reset joueur
  G.shield = 0; G.mana = G.maxMana; G.actionsLeft = BALANCE.turn.actions;
  G.combat.echoUsedThisTurn = false;   // ← AJOUT : reset Écho à chaque début de tour joueur
  drawToFull();
  // ── Hook Reliques : déclencheurs de début de tour joueur ──
  applyRelicEffects('onTurnStart');
  addLog(`--- Ton tour --- Mana ${G.mana}, Actions ${G.actionsLeft}, Main ${G.combat.hand.length}.`, 'info');
  requestRender();
}

function playConsumable() {
  if(G.scene !== 'combat') return;
  if(G.actionsLeft <= 0) { addLog('Tu n\'as plus d\'action ce tour.', 'warn'); requestRender(); return; }
  if(G.selected.length !== 1) return;

  const cardId = G.selected[0];
  const card = G.combat.hand.find(c => c.id === cardId);
  if(!card || card.type !== 'consumable') return;

  if(card.cost > G.mana) {
    addLog(`Pas assez de mana (besoin ${card.cost}, dispo ${G.mana}).`, 'bad');
    requestRender(); return;
  }

  G.combat.hand = G.combat.hand.filter(c => c.id !== cardId);
  G.combat.discard.push(card);
  G.mana -= card.cost;
  G.actionsLeft--;
  G.selected = [];

  if(card.heal) {
    const before = G.playerHp;
    G.playerHp = Math.min(G.playerMaxHp, G.playerHp + card.heal);
    const actualHeal = G.playerHp - before;
    addLog(`${card.name} → tu soignes ${actualHeal} PV. (${G.playerHp}/${G.playerMaxHp})`, 'good');
  }

  requestRender();
}

// ── Événements utilisateur (partie sans DOM — sélection de cartes/cible) ────

function selectCard(id) {
  if(G.scene !== 'combat') return;
  const idx = G.selected.indexOf(id);
  if(idx >= 0) { G.selected.splice(idx,1); requestRender(); return; }
  const card = G.combat.hand.find(c=>c.id===id);
  if(!card) return;

  if(card.type === 'consumable') {
    G.selected = [id];
    requestRender(); return;
  }

  const consumableSelected = G.selected.some(sid =>
    G.combat.hand.find(c=>c.id===sid)?.type === 'consumable'
  );
  if(consumableSelected) G.selected = [];

  const alreadyEl = G.selected.some(sid => G.combat.hand.find(c=>c.id===sid)?.type==='element');
  const alreadyFo = G.selected.some(sid => G.combat.hand.find(c=>c.id===sid)?.type==='forme');
  if(card.type==='element' && alreadyEl) { addLog('Tu as déjà sélectionné un Élément.','warn'); requestRender(); return; }
  if(card.type==='forme'   && alreadyFo) { addLog('Tu as déjà sélectionné une Forme.','warn');   requestRender(); return; }
  G.selected.push(id);
  requestRender();
}

function selectTarget(idx) {
  G.selectedTarget = idx;
  requestRender();
}

// ── Helpers d'affichage (purs, utilisés par le renderer mais zéro DOM) ──────

function selectionType() {
  if(G.selected.length === 0) return 'none';
  const cards = G.selected.map(id => G.combat.hand.find(c=>c.id===id));
  if(cards.some(c => c?.type === 'consumable')) return 'consumable';
  return 'assembly';
}

function canPlay() {
  const t = selectionType();
  if(t === 'consumable') {
    const card = G.combat.hand.find(c => c.id === G.selected[0]);
    return card && card.cost <= G.mana && G.actionsLeft > 0;
  }
  if(t === 'assembly') return canAssemble();
  return false;
}

function canAssemble() {
  const sel = G.selected.map(id => G.combat.hand.find(c=>c.id===id));
  const el = sel.find(c=>c?.type==='element');
  const fo = sel.find(c=>c?.type==='forme');
  if(!el || !fo) return false;
  if(el.formeRestricted && !el.formeRestricted.includes(fo.forme)) return false;
  const hasAction = G.actionsLeft > 0 || !!fo.freeAction;
  // Coût calculé par la MÊME fonction que assembleAction : aucune duplication,
  // donc aucun risque de bouton actif sur un coup ensuite refusé.
  return resolveAssemblyCost(el, fo) <= G.mana && hasAction;
}

function canDiscard() {
  return G.selected.length === 1 && G.actionsLeft > 0;
}

function assemblyDescription() {
  const t = selectionType();

  if (t === 'consumable') {
    const card = G.combat.hand.find(c => c.id === G.selected[0]);
    return `→ ${card.name} : ${card.effect}. Coût : ${card.cost} mana.`;
  }

  const sel = G.selected.map(id => G.combat.hand.find(c => c.id === id));
  const el  = sel.find(c => c?.type === 'element');
  const fo  = sel.find(c => c?.type === 'forme');

  if (!el && !fo) return 'Sélectionne 1 Élément + 1 Forme dans ta main.';
  if (el && !fo)  return `Élément choisi : ${el.name}. Sélectionne une Forme.`;
  if (!el && fo)  return `Forme choisie : ${fo.name}. Sélectionne un Élément.`;

  // Restriction d'assemblage
  if (el.formeRestricted && !el.formeRestricted.includes(fo.forme)) {
    return `<span style="color:#f5a383">⚠️ ${el.name} ne peut être combiné qu'avec : ${el.formeRestricted.join(', ')}.</span>`;
  }

  // ── Coût — pipeline reducer ──────────────────────────────────────────
  // Chaque source (Identity, puis Reliques plus tard) peut modifier
  // le coût courant. Le renderer n'a aucune connaissance des règles.
  let displayCost = el.cost + fo.cost;
  const ctx = { game: G };

  if (G.run.identity?.previewCost) {
    displayCost = G.run.identity.previewCost(displayCost, el, fo, ctx);
  }
  // Reliques — même pipeline, prêt pour session 2.b :
  for (const relic of G.run.relics ?? []) {
    if (relic.previewCost) displayCost = relic.previewCost(displayCost, el, fo, ctx);
  }

  const baseCost = el.cost + fo.cost;
  const hasCostMod = displayCost !== baseCost;
  const costSuffix = hasCostMod
    ? ` <span style="color:#b29be0">(${displayCost > baseCost ? '+' : ''}${displayCost - baseCost} Écho)</span>`
    : '';

  // ── Description de l'effet — hook previewElement ─────────────────────
  // On clone l'élément pour l'aperçu (safe, sans muter le template)
  const elPreview = { ...el };
  if (G.run.identity?.modifyElement) {
    try { G.run.identity.modifyElement(elPreview, null, ctx); } catch(e) {}
  }

  // Suffixe déclaré par l'Identité elle-même — zéro couplage renderer
  let elSuffix = '';
  if (G.run.identity?.previewElement) {
    // Cible probable pour le preview (Implosion a besoin des états)
    const living = G.combat.enemies.filter(e => e.hp > 0);
    const previewTarget = fo.forme === 'zone'
      ? living[0]
      : (G.selectedTarget !== null ? living[G.selectedTarget] : living[0]);
    const suffix = G.run.identity.previewElement(elPreview, previewTarget, ctx);
    if (suffix) elSuffix = ` <span style="color:#aaa">${suffix}</span>`;
  }

  // ── Aperçus de combos ────────────────────────────────────────────────
  let bonus = '';
  if (fo.forme !== 'arm') {
    const living = G.combat.enemies.filter(e => e.hp > 0);
    const targets = fo.forme === 'zone'
      ? living
      : (living.length === 1 ? living
         : G.selectedTarget !== null ? [living[G.selectedTarget]] : []);

    targets.forEach(tgt => {
      if (!tgt) return;
      if (el.elem === 'feu'   && tgt.givre > 0)
        bonus += `<span class="assembly-bonus">⚡ Choc thermique sur ${tgt.name} (x2)</span> `;
      if (el.elem === 'vide'  && tgt.brule > 0 && !G.run.identity?.flags?.implosionMode)
        bonus += `<span class="assembly-bonus">⚡ Détonation sur ${tgt.name} (+${tgt.brule * 2} dgt)</span> `;
      // Fracture : masquée pour Zéro Absolu, qui sort avant cette branche.
      if (el.elem === 'glace' && tgt.fragile > 0 && !el.shatterGivre)
        bonus += `<span class="assembly-bonus">⚡ Fracture sur ${tgt.name} (stun)</span> `;
      if (el.elem === 'vide'  && el.instantDetonate && tgt.brule > 0)
        bonus += `<span class="assembly-bonus">⚡ Onde amplifie : +${tgt.brule * 2} dgt bonus</span> `;
      // ── Signatures ──
      if (el.shatterGivre && tgt.givre > 0)
        bonus += `<span class="assembly-bonus">❄️💥 Brise ${tgt.givre} Givré sur ${tgt.name} (${tgt.givre * BALANCE.signatures.zeroAbsoluDmgPerGivreTurn} dgt + Stun)</span> `;
      if (el.lockBrule && !tgt.bruleLocked)
        bonus += `<span class="assembly-bonus">🔥🔒 Brûlure permanente sur ${tgt.name}</span> `;
    });

    if (el.elem === 'cataclysme')
      bonus += `<span class="assembly-bonus">🌋 Élan + combos ce tour +${el.comboBonus ?? 2} dgt</span> `;
  }

  // ── Indicateurs mécaniques ───────────────────────────────────────────
  let mecaDesc = '';
  if (fo.freeAction)  mecaDesc += ` <span style="color:#8bb8e8">Action gratuite.</span>`;
  if (fo.recycleSelf) mecaDesc += ` <span style="color:#8bb8e8">Élément recyclé.</span>`;
  if (fo.drawCount)   mecaDesc += ` <span style="color:#8bb8e8">Pioche ${fo.drawCount}.</span>`;
  if (el.elan || fo.elan) mecaDesc += ` <span class="assembly-bonus">Élan.</span>`;

  // ── Assemblage de la description finale ─────────────────────────────
  let baseDesc = '';
  if (fo.forme === 'arm')       baseDesc = `${el.name}${elSuffix} + ${fo.name} → +${fo.shieldAmount ?? 4} bouclier`;
  else if (fo.forme === 'zone') baseDesc = `${el.name}${elSuffix} + Zone → frappe tous`;
  else                          baseDesc = `${el.name}${elSuffix} + ${fo.name} → 1 cible`;

  return `${baseDesc}. Coût : ${displayCost} mana${costSuffix}${mecaDesc} ${bonus}`;
}

function needsTargetChoice() {
  const sel = G.selected.map(id => G.combat.hand.find(c=>c.id===id));
  const fo = sel.find(c=>c?.type==='forme');
  if(!fo || fo.forme !== 'proj') return false;
  return G.combat.enemies.filter(e=>e.hp>0).length > 1;
}

// ── pickStarterDeck ──────────────────────────────────────────────────────────
// Appelée par renderDeckChoice. Peuple G.run.deck et lance le premier combat.
// G.run.deck est volontairement vide jusqu'ici (initRun ne le peuple plus).
// ────────────────────────────────────────────────────────────────────────────
function pickStarterDeck(index) {
  const deck = STARTER_DECKS[index];
  // Clone chaque carte pour isoler l'instance de run du template statique
  G.run.deck = shuffle(deck.cards.map(c => ({...c})));
  G.run.startingDeckId = deck.id;  // tracké pour les Trophées en 3.c
  runLog(`PV : ${G.run.playerHp}/${G.run.playerMaxHp}`);
  runLog(`Deck : ${deck.name} — ${deck.subtitle}`);
  addLog(`Deck choisi : ${deck.name}.`, 'info');
  initCombat(0);
}

function pickReward(index) {
  const card = G.rewardChoices[index];
  const allChoices = G.rewardChoices.map(c => `${c.name} [${c.rarity}]`).join(' | ');
  runLog(`\n── Récompense — Choix proposés : ${allChoices}`);
  runLog(`── Récompense — Choisi : ${card.name} [${card.rarity}]`);

  if(card.type === 'reward_effect') {
    if(card.instantEffect === 'maxHpUp') {
      G.run.playerMaxHp += card.maxHpUp;
      G.run.playerHp = Math.min(G.run.playerMaxHp, G.run.playerHp + card.maxHpUp);
      addLog(`${card.name} → +${card.maxHpUp} PV max. (${G.run.playerHp}/${G.run.playerMaxHp})`, 'good');
    }
  } else {
    G.run.deck.push(card);
    addLog(`Carte ajoutée : ${card.name} (${card.rarity}).`, 'good');
  }

  G.rewardChoices = null;
  onRewardChosen();
}

function skipReward() {
  const allChoices = G.rewardChoices.map(c => `${c.name} [${c.rarity}]`).join(' | ');
  runLog(`\n── Récompense — Choix proposés : ${allChoices}`);
  runLog(`── Récompense — PASSÉE`);
  G.rewardChoices = null;
  onRewardChosen();
}

function transitionTo(scene) {
  G.scene = scene;
  requestRender();
}

// ============================================================
// Interop navigateur / Node — no-op si aucun des deux n'est présent.
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEV, BALANCE, CARDS_DEF, BRASIER_CARDS, PERMAFROST_CARDS, STARTER_DECKS,
    REWARD_POOL, IDENTITY_POOL, RELIC_POOL, SIGNATURE_POOL, ENCOUNTERS, RARITY_WEIGHTS,
    ELEMENT_RESOLVERS,
    getDeckSignature, shuffle, newEnemy,
    initRun, initCombat, pickStarterDeck,
    applyElementEffect, assembleAction, endTurn, checkWin,
    applyStateToEnemy, syncAppliedStates, survivesDamage, dealRawDamage,
    resolveAssemblyCost, validateAssembly, pickAssemblyTargets,
    triggerCatalystReaction, applyRelicEffects,
    selectCard, selectTarget, discardCard, playConsumable,
    canPlay, canAssemble, canDiscard, assemblyDescription, selectionType, needsTargetChoice,
    pickReward, skipReward, transitionTo,
    getG: () => G, setG: (v) => { G = v; },
    setRequestRender: (fn) => { requestRender = fn; },
  };
}
