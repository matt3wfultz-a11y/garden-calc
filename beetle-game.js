/* =====================================================================
   Beetle Bash — a beetle-themed deck-building card game
   Vanilla JS. Balatro-style scoring reimplemented from public game rules.
   (Numbers/mechanics are not copyrightable; all code here is original.)
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   1. Constants — beetle "families" replace the four suits
   ------------------------------------------------------------------- */
const FAMILIES = {
  ladybug: { name: 'Ladybugs',   glyph: '🐞', color: '#e63946' },
  scarab:  { name: 'Scarabs',    glyph: '🪲', color: '#3a86ff' },
  bee:     { name: 'Honeybees',  glyph: '🐝', color: '#f4a300' },
  leaf:    { name: 'Leaf Bugs',  glyph: '🐛', color: '#2d8653' },
};
const FAMILY_ORDER = ['ladybug', 'scarab', 'bee', 'leaf'];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
// Chips each card contributes when scored (Balatro rule: faces = 10, Ace = 11)
const RANK_CHIPS = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11 };

// Base chips/mult per poker hand at level 1 (verified from reference clones)
const HANDS = {
  FLUSH_FIVE:     { name: 'Flush Five',      chips: 160, mult: 16 },
  FLUSH_HOUSE:    { name: 'Flush House',     chips: 140, mult: 14 },
  FIVE:           { name: 'Five of a Kind',  chips: 120, mult: 12 },
  STRAIGHT_FLUSH: { name: 'Straight Flush',  chips: 100, mult: 8  },
  FOUR:           { name: 'Four of a Kind',  chips: 60,  mult: 7  },
  FULL_HOUSE:     { name: 'Full House',      chips: 40,  mult: 4  },
  FLUSH:          { name: 'Flush',           chips: 35,  mult: 4  },
  STRAIGHT:       { name: 'Straight',        chips: 30,  mult: 4  },
  THREE:          { name: 'Three of a Kind', chips: 30,  mult: 3  },
  TWO_PAIR:       { name: 'Two Pair',        chips: 20,  mult: 2  },
  PAIR:           { name: 'Pair',            chips: 10,  mult: 2  },
  HIGH_CARD:      { name: 'High Card',       chips: 5,   mult: 1  },
};

// Small-blind base target per ante (ante 1..8). Big = x1.5, Boss = x2.
const ANTE_BASE = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];

const BLINDS = [
  { key: 'small', label: 'Small Blind', targetMult: 1,   reward: 3 },
  { key: 'big',   label: 'Big Blind',   targetMult: 1.5, reward: 4 },
  { key: 'boss',  label: 'Boss Blind',  targetMult: 2,   reward: 5 },
];

// Boss blinds add a themed twist for flavor (one is picked at random)
const BOSSES = [
  { name: 'The Infestation',      desc: 'A swarm this big just needs a big score.' },
  { name: 'The Drought',          desc: '−1 Hand this round.',            hands: -1 },
  { name: 'The Frost',            desc: 'Discards are disabled.',         noDiscard: true },
  { name: 'The Locust Swarm',     desc: '🐛 Leaf Bugs score nothing.',    debuff: 'leaf' },
  { name: 'The Ladybird Plague',  desc: '🐞 Ladybugs score nothing.',     debuff: 'ladybug' },
  { name: 'The Smoke-Out',        desc: '🐝 Honeybees score nothing.',    debuff: 'bee' },
];

/* ---------------------------------------------------------------------
   2. Jokers — "garden bugs" that modify scoring
   Each effect(ctx) mutates ctx.chips / ctx.mult and may log a step.
   ------------------------------------------------------------------- */
const JOKER_POOL = [
  { id: 'gardener',   name: 'Gardener',      glyph: '🧑‍🌾', cost: 4, rarity: 'Common',
    text: '+4 Mult.',
    effect: (ctx) => { ctx.mult += 4; ctx.log('Gardener', '+4 Mult'); } },

  { id: 'compost',    name: 'Compost Heap',  glyph: '🍂', cost: 4, rarity: 'Common',
    text: '+30 Chips.',
    effect: (ctx) => { ctx.chips += 30; ctx.log('Compost Heap', '+30 Chips'); } },

  { id: 'swarm',      name: 'Swarm',         glyph: '🐜', cost: 5, rarity: 'Common',
    text: '+1 Mult for each card scored.',
    effect: (ctx) => { const n = ctx.scoring.length; ctx.mult += n; ctx.log('Swarm', `+${n} Mult`); } },

  { id: 'ladybugLord', name: 'Ladybug Lord', glyph: '🐞', cost: 6, rarity: 'Uncommon',
    text: '+3 Mult per 🐞 Ladybug scored.',
    effect: (ctx) => { const n = ctx.scoring.filter(c => c.family === 'ladybug').length;
      if (n) { ctx.mult += 3 * n; ctx.log('Ladybug Lord', `+${3 * n} Mult`); } } },

  { id: 'hiveMind',   name: 'Hive Mind',     glyph: '🍯', cost: 6, rarity: 'Uncommon',
    text: '+20 Chips per 🐝 Honeybee scored.',
    effect: (ctx) => { const n = ctx.scoring.filter(c => c.family === 'bee').length;
      if (n) { ctx.chips += 20 * n; ctx.log('Hive Mind', `+${20 * n} Chips`); } } },

  { id: 'metamorph',  name: 'Metamorphosis', glyph: '🦋', cost: 7, rarity: 'Uncommon',
    text: '×1.5 Mult if played hand is a Flush.',
    effect: (ctx) => { if (ctx.handType === 'FLUSH' || ctx.handType === 'STRAIGHT_FLUSH' ||
      ctx.handType === 'FLUSH_HOUSE' || ctx.handType === 'FLUSH_FIVE') {
      ctx.mult *= 1.5; ctx.log('Metamorphosis', '×1.5 Mult'); } } },

  { id: 'aphidHoard', name: 'Aphid Hoard',   glyph: '💰', cost: 6, rarity: 'Common',
    text: '+2 Mult per $5 you hold (max +10).',
    effect: (ctx) => { const bonus = Math.min(10, Math.floor(ctx.money / 5) * 2);
      if (bonus) { ctx.mult += bonus; ctx.log('Aphid Hoard', `+${bonus} Mult`); } } },

  { id: 'pollenRush', name: 'Pollen Rush',   glyph: '🌼', cost: 5, rarity: 'Common',
    text: '+50 Chips if you play exactly 5 cards.',
    effect: (ctx) => { if (ctx.played.length === 5) { ctx.chips += 50; ctx.log('Pollen Rush', '+50 Chips'); } } },

  { id: 'queenBee',   name: 'Queen Bee',     glyph: '👑', cost: 8, rarity: 'Rare',
    text: '×2 Mult if hand is a Pair, Three, or Four of a Kind.',
    effect: (ctx) => { if (['PAIR', 'THREE', 'FOUR', 'FULL_HOUSE'].includes(ctx.handType)) {
      ctx.mult *= 2; ctx.log('Queen Bee', '×2 Mult'); } } },

  { id: 'scarabIdol', name: 'Scarab Idol',   glyph: '🪲', cost: 7, rarity: 'Uncommon',
    text: '+40 Chips per 🪲 Scarab scored.',
    effect: (ctx) => { const n = ctx.scoring.filter(c => c.family === 'scarab').length;
      if (n) { ctx.chips += 40 * n; ctx.log('Scarab Idol', `+${40 * n} Chips`); } } },
];

/* ---------------------------------------------------------------------
   3. Game state
   ------------------------------------------------------------------- */
let S = null;

function newGame() {
  S = {
    deck: [], hand: [], selected: new Set(),
    jokers: [],
    money: 4,
    ante: 1, blindIdx: 0,
    boss: null,
    roundScore: 0, target: 0,
    handsLeft: 0, discardsLeft: 0,
    handSize: 8, maxHands: 4, maxDiscards: 3, maxJokers: 5,
    busy: false, won: false,
  };
  startBlind();
}

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const family of FAMILY_ORDER) {
    for (const rank of RANKS) {
      deck.push({ id: id++, family, rank });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------------------------------------------------------------
   4. Blind / round lifecycle
   ------------------------------------------------------------------- */
function currentBlind() { return BLINDS[S.blindIdx]; }

function startBlind() {
  const blind = currentBlind();
  S.boss = blind.key === 'boss' ? BOSSES[Math.floor(Math.random() * BOSSES.length)] : null;

  S.target = Math.ceil(ANTE_BASE[S.ante - 1] * blind.targetMult);
  S.roundScore = 0;
  S.maxHands = 4;
  S.maxDiscards = 3;
  if (S.boss && S.boss.hands) S.maxHands += S.boss.hands;
  if (S.boss && S.boss.noDiscard) S.maxDiscards = 0;
  S.handsLeft = S.maxHands;
  S.discardsLeft = S.maxDiscards;

  S.deck = buildDeck();
  S.hand = [];
  S.selected.clear();
  refillHand();

  showBlindIntro();
  render();
}

function refillHand() {
  while (S.hand.length < S.handSize && S.deck.length > 0) {
    S.hand.push(S.deck.pop());
  }
}

/* ---------------------------------------------------------------------
   5. Poker-hand evaluation
   Returns { type, scoring:[cards that earn chips] }
   ------------------------------------------------------------------- */
function evaluate(cards) {
  const n = cards.length;
  const byRank = {};
  for (const c of cards) (byRank[c.rank] ||= []).push(c);
  const groups = Object.values(byRank).sort((a, b) => b.length - a.length);
  const counts = groups.map(g => g.length);

  const isFlush = n === 5 && cards.every(c => c.family === cards[0].family);
  const straight = getStraight(cards);
  const isStraight = !!straight;

  if (counts[0] === 5) return { type: isFlush ? 'FLUSH_FIVE' : 'FIVE', scoring: cards };
  if (counts[0] === 3 && counts[1] === 2)
    return { type: isFlush ? 'FLUSH_HOUSE' : 'FULL_HOUSE', scoring: cards };
  if (isFlush && isStraight) return { type: 'STRAIGHT_FLUSH', scoring: cards };
  if (counts[0] === 4) return { type: 'FOUR', scoring: groups[0] };
  if (isFlush) return { type: 'FLUSH', scoring: cards };
  if (isStraight) return { type: 'STRAIGHT', scoring: straight };
  if (counts[0] === 3) return { type: 'THREE', scoring: groups[0] };
  if (counts[0] === 2 && counts[1] === 2)
    return { type: 'TWO_PAIR', scoring: [...groups[0], ...groups[1]] };
  if (counts[0] === 2) return { type: 'PAIR', scoring: groups[0] };

  // High card: only the single highest-ranked card scores
  const high = cards.reduce((a, b) => (RANK_VALUE[b.rank] > RANK_VALUE[a.rank] ? b : a));
  return { type: 'HIGH_CARD', scoring: [high] };
}

function getStraight(cards) {
  if (cards.length !== 5) return null;
  const vals = cards.map(c => RANK_VALUE[c.rank]);
  if (new Set(vals).size !== 5) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  if (sorted[4] - sorted[0] === 4) return cards;          // normal run
  if ([14, 2, 3, 4, 5].every(v => vals.includes(v))) return cards; // A-2-3-4-5 wheel
  return null;
}

/* ---------------------------------------------------------------------
   6. Scoring pipeline (with step log for animation)
   ------------------------------------------------------------------- */
function computeScore(played) {
  const { type, scoring } = evaluate(played);
  const base = HANDS[type];
  const debuff = S.boss && S.boss.debuff;

  const ctx = {
    chips: base.chips,
    mult: base.mult,
    scoring, played, handType: type,
    money: S.money,
    steps: [],
    log(source, text) { this.steps.push({ source, text }); },
  };

  // Card chips (debuffed families contribute nothing)
  ctx.cardSteps = [];
  for (const c of scoring) {
    if (debuff && c.family === debuff) { ctx.cardSteps.push({ card: c, chips: 0, debuffed: true }); continue; }
    const chips = RANK_CHIPS[c.rank];
    ctx.chips += chips;
    ctx.cardSteps.push({ card: c, chips, debuffed: false });
  }

  // Jokers (left to right)
  for (const j of S.jokers) j.effect(ctx);

  ctx.total = Math.round(ctx.chips * ctx.mult);
  ctx.type = type;
  ctx.typeName = base.name;
  return ctx;
}

/* ---------------------------------------------------------------------
   7. Actions: play / discard
   ------------------------------------------------------------------- */
async function playHand() {
  if (S.busy || S.handsLeft <= 0) return;
  const sel = selectedCards();
  if (sel.length < 1 || sel.length > 5) { toast('Select 1–5 cards to play.'); return; }

  S.busy = true;
  S.handsLeft--;
  const result = computeScore(sel);
  await animateScore(sel, result);

  S.roundScore += result.total;
  // remove played cards
  S.hand = S.hand.filter(c => !S.selected.has(c.id));
  S.selected.clear();
  refillHand();
  render();

  if (S.roundScore >= S.target) { S.busy = false; await sleep(250); winBlind(); return; }
  if (S.handsLeft <= 0) { S.busy = false; await sleep(250); gameOver(); return; }
  S.busy = false;
  render();
}

function discard() {
  if (S.busy || S.discardsLeft <= 0) return;
  const sel = selectedCards();
  if (sel.length < 1) { toast('Select cards to discard.'); return; }
  S.discardsLeft--;
  S.hand = S.hand.filter(c => !S.selected.has(c.id));
  S.selected.clear();
  refillHand();
  render();
}

function selectedCards() { return S.hand.filter(c => S.selected.has(c.id)); }

/* ---------------------------------------------------------------------
   8. Win / lose / economy / shop
   ------------------------------------------------------------------- */
function winBlind() {
  const blind = currentBlind();
  const interest = Math.min(5, Math.floor(S.money / 5));
  const handBonus = S.handsLeft;
  const reward = blind.reward + interest + handBonus;
  S.money += reward;
  showCashOut(blind, reward, interest, handBonus);
}

function advanceBlind() {
  if (S.blindIdx < 2) {
    S.blindIdx++;
  } else {
    if (S.ante >= 8) { victory(); return; }
    S.ante++;
    S.blindIdx = 0;
  }
  openShop();
}

function gameOver() {
  overlay(`
    <h2 class="ov-title lose">Wiped Out!</h2>
    <p>The ${escapeHtml(blindName())} overwhelmed your garden.</p>
    <p class="ov-stat">You reached <b>${fmt(S.roundScore)}</b> / ${fmt(S.target)} on Ante ${S.ante}.</p>
    <button class="btn btn-primary" id="ov-restart">Plant a New Garden</button>
  `);
  document.getElementById('ov-restart').onclick = () => { closeOverlay(); newGame(); };
}

function victory() {
  S.won = true;
  overlay(`
    <h2 class="ov-title win">Garden Champion! 🏆</h2>
    <p>You survived all 8 Antes and tamed every swarm.</p>
    <p class="ov-stat">Final stash: <b>$${S.money}</b></p>
    <button class="btn btn-primary" id="ov-restart">Play Again</button>
  `);
  document.getElementById('ov-restart').onclick = () => { closeOverlay(); newGame(); };
}

/* ------- Shop ------- */
let shopState = null;

function openShop() {
  shopState = { items: rollShop(), rerollCost: 5 };
  renderShop();
  document.getElementById('shop').classList.add('open');
}

function rollShop() {
  const owned = new Set(S.jokers.map(j => j.id));
  const available = JOKER_POOL.filter(j => !owned.has(j.id));
  shuffle(available);
  return available.slice(0, 2).map(j => ({ joker: j, bought: false }));
}

function buyJoker(idx) {
  const item = shopState.items[idx];
  if (!item || item.bought) return;
  if (S.jokers.length >= S.maxJokers) { toast('Joker slots full — sell one first.'); return; }
  if (S.money < item.joker.cost) { toast('Not enough money.'); return; }
  S.money -= item.joker.cost;
  S.jokers.push(item.joker);
  item.bought = true;
  renderShop();
  render();
}

function sellJoker(id) {
  const idx = S.jokers.findIndex(j => j.id === id);
  if (idx < 0) return;
  const val = Math.max(1, Math.floor(S.jokers[idx].cost / 2));
  S.money += val;
  S.jokers.splice(idx, 1);
  toast(`Sold for $${val}.`);
  renderShop();
  render();
}

function reroll() {
  if (S.money < shopState.rerollCost) { toast('Not enough money to reroll.'); return; }
  S.money -= shopState.rerollCost;
  shopState.rerollCost += 1;
  shopState.items = rollShop();
  renderShop();
  render();
}

function leaveShop() {
  document.getElementById('shop').classList.remove('open');
  startBlind();
}

/* ---------------------------------------------------------------------
   9. Rendering
   ------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

function render() {
  if (!S) return;
  const blind = currentBlind();

  $('blind-name').textContent = blindName();
  $('blind-label').textContent = blind.label;
  $('blind-target').textContent = fmt(S.target);
  $('blind-reward').textContent = '$' + blind.reward;
  $('blind-desc').textContent = S.boss ? S.boss.desc : '';
  $('blind-desc').style.display = S.boss ? 'block' : 'none';

  $('round-score').textContent = fmt(S.roundScore);
  $('money').textContent = '$' + S.money;
  $('ante').textContent = S.ante + '/8';
  $('hands-left').textContent = S.handsLeft;
  $('discards-left').textContent = S.discardsLeft;
  $('deck-count').textContent = S.deck.length;

  renderJokers();
  renderHand();
  renderPreview();

  $('btn-play').disabled = S.busy || S.handsLeft <= 0 || S.selected.size === 0 || S.selected.size > 5;
  $('btn-discard').disabled = S.busy || S.discardsLeft <= 0 || S.selected.size === 0;
}

function renderJokers() {
  const el = $('jokers');
  el.innerHTML = '';
  for (const j of S.jokers) {
    const d = document.createElement('div');
    d.className = 'joker';
    d.innerHTML = `<div class="joker-glyph">${j.glyph}</div>
      <div class="joker-tip"><b>${escapeHtml(j.name)}</b><span class="rar ${j.rarity.toLowerCase()}">${j.rarity}</span><br>${escapeHtml(j.text)}<br><i>click to sell ($${Math.max(1, Math.floor(j.cost / 2))})</i></div>`;
    d.onclick = () => sellJoker(j.id);
    el.appendChild(d);
  }
  $('joker-count').textContent = `${S.jokers.length}/${S.maxJokers}`;
}

function renderHand() {
  const el = $('hand');
  el.innerHTML = '';
  const debuff = S.boss && S.boss.debuff;
  for (const c of S.hand) {
    el.appendChild(cardEl(c, {
      selected: S.selected.has(c.id),
      debuffed: debuff && c.family === debuff,
      onClick: () => toggleSelect(c.id),
    }));
  }
}

function cardEl(c, opts = {}) {
  const fam = FAMILIES[c.family];
  const d = document.createElement('div');
  d.className = 'card' + (opts.selected ? ' selected' : '') + (opts.debuffed ? ' debuffed' : '');
  d.style.setProperty('--fam', fam.color);
  d.innerHTML = `
    <div class="card-rank">${c.rank}</div>
    <div class="card-glyph">${fam.glyph}</div>
    <div class="card-foot"><span class="chip">+${RANK_CHIPS[c.rank]}</span></div>`;
  if (opts.onClick) d.onclick = opts.onClick;
  d.title = `${c.rank} of ${fam.name}`;
  return d;
}

function toggleSelect(id) {
  if (S.busy) return;
  if (S.selected.has(id)) S.selected.delete(id);
  else {
    if (S.selected.size >= 5) { toast('You can play at most 5 cards.'); return; }
    S.selected.add(id);
  }
  render();
}

function renderPreview() {
  const sel = selectedCards();
  const box = $('preview');
  if (sel.length === 0) { box.innerHTML = '<span class="muted">Select cards to see the hand</span>'; return; }
  const { type } = evaluate(sel);
  const base = HANDS[type];
  box.innerHTML = `<span class="prev-name">${base.name}</span>
    <span class="prev-vals"><b class="chips">${base.chips}</b> × <b class="mult">${base.mult}</b></span>`;
}

function sortHand(mode) {
  if (mode === 'rank') {
    S.hand.sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank] ||
      FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));
  } else {
    S.hand.sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) ||
      RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  }
  render();
}

/* ------- Score animation ------- */
async function animateScore(played, result) {
  const readout = $('readout');
  readout.classList.add('active');
  $('r-hand').textContent = result.typeName;

  let chips = HANDS[result.type].chips;
  let mult = HANDS[result.type].mult;
  setRC(chips, mult);

  await sleep(260);

  // Mark scoring cards & count their chips one by one
  const scoringIds = new Set(result.scoring.map(c => c.id));
  const cardNodes = [...$('hand').children];
  for (const step of result.cardSteps) {
    const idxInHand = S.hand.findIndex(c => c.id === step.card.id);
    const node = cardNodes[idxInHand];
    if (node) { node.classList.add('scoring'); }
    if (step.debuffed) { popText(node, 'debuffed', 'bad'); }
    else { chips += step.chips; setRC(chips, mult); popText(node, '+' + step.chips, 'chip'); }
    await sleep(180);
  }
  void scoringIds;

  // Joker steps
  for (const st of result.steps) {
    // recompute display value by re-deriving — simpler: just show label & bump
    if (/Chips/.test(st.text)) { const v = parseFloat(st.text); if (!isNaN(v)) chips += v; }
    else if (/×/.test(st.text)) { const v = parseFloat(st.text.replace('×', '')); if (!isNaN(v)) mult *= v; }
    else if (/Mult/.test(st.text)) { const v = parseFloat(st.text); if (!isNaN(v)) mult += v; }
    setRC(chips, mult);
    flashJoker(st.source);
    await sleep(220);
  }

  // Final total
  setRC(Math.round(chips), round1(mult));
  $('r-total').textContent = fmt(result.total);
  $('r-total').classList.add('pop');
  await sleep(650);
  $('r-total').classList.remove('pop');
  readout.classList.remove('active');
  $('r-total').textContent = '';
}

function setRC(chips, mult) {
  $('r-chips').textContent = fmt(Math.round(chips));
  $('r-mult').textContent = round1(mult);
}

function popText(node, text, cls) {
  if (!node) return;
  const p = document.createElement('div');
  p.className = 'pop-text ' + cls;
  p.textContent = text;
  node.appendChild(p);
  setTimeout(() => p.remove(), 700);
}

function flashJoker(name) {
  const idx = S.jokers.findIndex(j => j.name === name);
  const node = $('jokers').children[idx];
  if (node) { node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 300); }
}

/* ------- Overlays / intros / shop render ------- */
function showBlindIntro() {
  const blind = currentBlind();
  const b = S.boss;
  overlay(`
    <div class="intro-kicker">Ante ${S.ante} · ${blind.label}</div>
    <h2 class="ov-title ${blind.key}">${blindName()}</h2>
    ${b ? `<p class="boss-desc">${escapeHtml(b.desc)}</p>` : ''}
    <p class="ov-stat">Score at least <b>${fmt(S.target)}</b> chips</p>
    <p class="ov-sub">${S.maxHands} hands · ${S.maxDiscards} discards · reward $${blind.reward}</p>
    <button class="btn btn-primary" id="ov-go">Enter the Garden</button>
  `, false);
  $('ov-go').onclick = () => closeOverlay();
}

function showCashOut(blind, reward, interest, handBonus) {
  overlay(`
    <h2 class="ov-title win">Blind Cleared! ✅</h2>
    <p class="ov-stat">${fmt(S.roundScore)} / ${fmt(S.target)}</p>
    <div class="cashout">
      <div><span>${blind.label} reward</span><b>$${blind.reward}</b></div>
      <div><span>Hands left (×$1)</span><b>$${handBonus}</b></div>
      <div><span>Interest ($1 per $5)</span><b>$${interest}</b></div>
      <div class="total"><span>Total earned</span><b>$${reward}</b></div>
    </div>
    <button class="btn btn-primary" id="ov-next">Go to Shop →</button>
  `, false);
  $('ov-next').onclick = () => { closeOverlay(); advanceBlind(); };
}

function renderShop() {
  const wrap = $('shop-items');
  wrap.innerHTML = '';
  shopState.items.forEach((item, i) => {
    const j = item.joker;
    const card = document.createElement('div');
    card.className = 'shop-item' + (item.bought ? ' bought' : '');
    card.innerHTML = `
      <div class="joker-glyph big">${j.glyph}</div>
      <div class="shop-name">${escapeHtml(j.name)}</div>
      <div class="rar ${j.rarity.toLowerCase()}">${j.rarity}</div>
      <div class="shop-text">${escapeHtml(j.text)}</div>
      <button class="btn buy" ${item.bought ? 'disabled' : ''}>${item.bought ? 'Owned' : '$' + j.cost}</button>`;
    if (!item.bought) card.querySelector('.buy').onclick = () => buyJoker(i);
    wrap.appendChild(card);
  });
  $('shop-money').textContent = '$' + S.money;
  $('reroll-cost').textContent = '$' + shopState.rerollCost;
}

/* ---------------------------------------------------------------------
   10. Overlay + utility helpers
   ------------------------------------------------------------------- */
function overlay(html, dim = true) {
  const ov = $('overlay');
  $('overlay-content').innerHTML = html;
  ov.classList.toggle('dim', dim);
  ov.classList.add('open');
}
function closeOverlay() { $('overlay').classList.remove('open'); render(); }

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function blindName() {
  const blind = currentBlind();
  if (blind.key === 'boss' && S.boss) return S.boss.name;
  return blind.label;
}
const fmt = (n) => n.toLocaleString('en-US');
const round1 = (n) => (Math.round(n * 10) / 10).toString();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

/* ---------------------------------------------------------------------
   11. Wire up
   ------------------------------------------------------------------- */
function init() {
  $('btn-play').onclick = playHand;
  $('btn-discard').onclick = discard;
  $('btn-sort-rank').onclick = () => sortHand('rank');
  $('btn-sort-family').onclick = () => sortHand('family');
  $('btn-reroll').onclick = reroll;
  $('btn-leave-shop').onclick = leaveShop;
  document.addEventListener('keydown', (e) => {
    if (S && !S.busy) {
      if (e.key === 'Enter') { e.preventDefault(); if (!$('btn-play').disabled) playHand(); }
      if (e.key === ' ') { e.preventDefault(); if (!$('btn-discard').disabled) discard(); }
    }
  });
  newGame();
}

document.addEventListener('DOMContentLoaded', init);
