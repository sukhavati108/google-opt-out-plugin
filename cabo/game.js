// ==========================================
// CABO Card Game
// ==========================================

// ---- Constants ----
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const RED_SUITS = new Set(['hearts', 'diamonds']);
const AI_NAMES = ['Coco', 'Tashi', 'Ricky Baker', 'Jeff'];

// ---- Utility Functions ----
function createCard(rank, suit) {
  return { rank, suit, id: rank + '_' + suit };
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(rank, suit));
    }
  }
  // Add two Jokers: one red, one black
  deck.push(createCard('Joker', 'hearts'));
  deck.push(createCard('Joker', 'spades'));
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCardValue(card) {
  if (!card) return 0;
  if (card.rank === 'Joker') return -1;
  if (card.rank === 'A') return 1;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return isRedSuit(card.suit) ? 0 : 13;
  return parseInt(card.rank);
}

function cardName(card) {
  if (!card) return '?';
  if (card.rank === 'Joker') return '\u2605J';
  return card.rank + SUIT_SYMBOLS[card.suit];
}

function isJoker(card) {
  return card && card.rank === 'Joker';
}

function isOneEyedKing(card) {
  return card && card.rank === 'K' && card.suit === 'diamonds';
}

function isBlackKing(card) {
  return card && card.rank === 'K' && (card.suit === 'spades' || card.suit === 'clubs');
}

function isPowerCard(card) {
  if (!card) return false;
  if (['7','8','9','10','J','Q'].indexOf(card.rank) !== -1) return true;
  if (isBlackKing(card)) return true;
  return false;
}

function getPowerType(card) {
  if (!card) return null;
  if (card.rank === '7' || card.rank === '8') return 'peek_self';
  if (card.rank === '9' || card.rank === '10') return 'peek_other';
  if (card.rank === 'J' || card.rank === 'Q') return 'swap_cards';
  if (isBlackKing(card)) return 'spy_and_swap';
  return null;
}

function getPowerDescription(card) {
  const type = getPowerType(card);
  if (type === 'peek_self') return 'Peek at one of your own cards';
  if (type === 'peek_other') return "Peek at an opponent's card";
  if (type === 'swap_cards') return 'Swap any two cards on the table';
  if (type === 'spy_and_swap') return 'Spy & Swap: peek at one, then swap or keep';
  return '';
}

function isRedSuit(suit) {
  return RED_SUITS.has(suit);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- Match State ----
const match = {
  totalRounds: 1,
  currentRound: 0,
  numPlayers: 2,
  playerNames: [],
  matchTotals: [],
  roundHistory: [],
};

// ---- Game State ----
let game = null;
let showMemoryAids = true;

const state = {
  phase: 'start',
  deck: [],
  discardPile: [],
  players: [],
  numPlayers: 4,
  currentPlayerIndex: 0,
  drawnCard: null,
  drawnFrom: null,
  caboCallerIndex: null,
  turnsUntilEnd: null,
  selectedCards: new Set(),
  powerSwapFirst: null,
  peekReveal: null, // {pIdx, cIdx} - card to temporarily show face-up
  aiHighlights: new Set(), // Set of 'pIdx-cIdx' keys to glow during AI actions
  message: '',
  log: [],
  humanMemory: new Map(),
  aiMemory: [],
  gameOver: false,
  scores: [],
  aiProcessing: false,
  turnLock: false,
  blackKingOwnSelection: null,    // {pIdx, cIdx}
  blackKingOpponentSelection: null, // {pIdx, cIdx}
  matchPreviousPhase: null,
  matchGiveTarget: null, // {pIdx, cIdx}
  aiMatchPauseResolve: null,
};

function resetState() {
  state.phase = 'start';
  state.deck = [];
  state.discardPile = [];
  state.players = [];
  state.currentPlayerIndex = 0;
  state.drawnCard = null;
  state.drawnFrom = null;
  state.caboCallerIndex = null;
  state.turnsUntilEnd = null;
  state.selectedCards = new Set();
  state.powerSwapFirst = null;
  state.peekReveal = null;
  state.message = '';
  state.log = [];
  state.humanMemory = new Map();
  state.aiMemory = [];
  state.gameOver = false;
  state.scores = [];
  state.aiProcessing = false;
  state.turnLock = false;
  state.aiHighlights = new Set();
  state.blackKingOwnSelection = null;
  state.blackKingOpponentSelection = null;
  state.matchPreviousPhase = null;
  state.matchGiveTarget = null;
  state.aiMatchPauseResolve = null;
}

async function flashAiHighlight(keys, ms) {
  state.aiHighlights = new Set(Array.isArray(keys) ? keys : [keys]);
  render();
  await delay(ms || 2000);
  state.aiHighlights.clear();
}

function startMatch(numPlayers, totalRounds) {
  match.totalRounds = totalRounds;
  match.currentRound = 0;
  match.numPlayers = numPlayers;
  match.playerNames = ['You'];
  for (let i = 1; i < numPlayers; i++) {
    match.playerNames.push(AI_NAMES[i - 1]);
  }
  match.matchTotals = new Array(numPlayers).fill(0);
  match.roundHistory = [];
  startNextRound();
}

function startNextRound() {
  match.currentRound++;
  initGame(match.numPlayers);
  render();
}

// ---- Game Logic ----
function initGame(numPlayers) {
  resetState();
  state.numPlayers = numPlayers;

  // Create players
  state.players = [{ name: 'You', isHuman: true, cards: [null,null,null,null] }];
  for (let i = 1; i < numPlayers; i++) {
    state.players.push({ name: AI_NAMES[i-1], isHuman: false, cards: [null,null,null,null] });
  }

  // Init AI memory
  state.aiMemory = state.players.map(() => new Map());

  // Shuffle and deal
  state.deck = shuffle(createDeck());
  for (let p = 0; p < numPlayers; p++) {
    for (let c = 0; c < 4; c++) {
      state.players[p].cards[c] = state.deck.pop();
    }
  }

  // Start discard pile
  state.discardPile.push(state.deck.pop());

  // Initial peek: everyone sees their bottom 2 cards (positions 2, 3)
  for (let p = 0; p < numPlayers; p++) {
    for (const ci of [2, 3]) {
      const card = state.players[p].cards[ci];
      if (card) {
        state.aiMemory[p].set(p + '-' + ci, { rank: card.rank, suit: card.suit });
        if (p === 0) {
          state.humanMemory.set(p + '-' + ci, { rank: card.rank, suit: card.suit });
        }
      }
    }
  }

  state.phase = 'peek';
  state.message = 'Memorize your bottom two cards, then click Ready.';
  addLog('Game started with ' + numPlayers + ' players.');
  addLog('Peek at your bottom two cards!');
}

function addLog(msg) {
  state.log.push(msg);
  if (state.log.length > 80) state.log.shift();
}

// Returns a human-readable position label for a card slot.
// For 4-card hands: top-left, top-right, bottom-left, bottom-right
// For other sizes: position 1, position 2, etc.
function posLabel(cardCount, idx) {
  if (cardCount === 4) {
    const names = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    return names[idx] || ('position ' + (idx + 1));
  }
  return 'position ' + (idx + 1);
}

// Build a description like "your top-left card" or "Coco's bottom-right card"
function cardPosDesc(pIdx, cIdx) {
  const count = state.players[pIdx].cards.length;
  const pos = posLabel(count, cIdx);
  const owner = pIdx === 0 ? 'your' : state.players[pIdx].name + "'s";
  return owner + ' ' + pos + ' card';
}

// Build a description for own card from the acting AI's perspective
function ownPosDesc(pIdx, cIdx) {
  const count = state.players[pIdx].cards.length;
  const pos = posLabel(count, cIdx);
  return 'their ' + pos + ' card';
}

function getTopDiscard() {
  return state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null;
}

function drawFromDeck() {
  if (state.deck.length === 0) reshuffleDeck();
  if (state.deck.length === 0) return null;
  return state.deck.pop();
}

function reshuffleDeck() {
  if (state.discardPile.length <= 1) return;
  const topCard = state.discardPile.pop();
  state.deck = shuffle([...state.discardPile]);
  state.discardPile = [topCard];
  addLog('Discard pile reshuffled into the deck.');
}

function drawFromDiscard() {
  if (state.discardPile.length === 0) return null;
  return state.discardPile.pop();
}

function discardCard(card) {
  state.discardPile.push(card);
}

function playerCardCount(pIdx) {
  return state.players[pIdx].cards.filter(c => c !== null).length;
}

function nonNullCardIndices(pIdx) {
  const result = [];
  for (let i = 0; i < state.players[pIdx].cards.length; i++) {
    if (state.players[pIdx].cards[i] !== null) result.push(i);
  }
  return result;
}

function clearMemoryAt(pIdx, cIdx) {
  const key = pIdx + '-' + cIdx;
  state.humanMemory.delete(key);
  for (let ai = 0; ai < state.numPlayers; ai++) {
    state.aiMemory[ai].delete(key);
  }
}

function setMemory(observer, pIdx, cIdx, card) {
  const key = pIdx + '-' + cIdx;
  const mem = { rank: card.rank, suit: card.suit };
  if (observer === 0) {
    state.humanMemory.set(key, mem);
  }
  state.aiMemory[observer].set(key, mem);
}

function checkGameEnd() {
  for (let i = 0; i < state.numPlayers; i++) {
    if (playerCardCount(i) === 0) return true;
  }
  if (state.deck.length === 0 && state.discardPile.length <= 1) return true;
  return false;
}

function calculateScores() {
  state.scores = state.players.map((p, i) => {
    let total = 0;
    const cards = [];
    for (const card of p.cards) {
      if (card) {
        total += getCardValue(card);
        cards.push(card);
      }
    }
    return { playerIndex: i, name: p.name, score: total, caboBonus: 0, cards };
  });

  // Apply CABO caller bonus/penalty
  if (state.caboCallerIndex !== null) {
    const caller = state.scores.find(s => s.playerIndex === state.caboCallerIndex);
    const lowestOpponent = Math.min(
      ...state.scores.filter(s => s.playerIndex !== state.caboCallerIndex).map(s => s.score)
    );
    if (caller.score < lowestOpponent) {
      caller.caboBonus = -5;
      caller.score -= 5;
    } else if (caller.score > lowestOpponent) {
      caller.caboBonus = 5;
      caller.score += 5;
    }
    // Tied with lowest: no adjustment
  }

  state.scores.sort((a, b) => a.score - b.score);
  return state.scores;
}

function endRound() {
  state.gameOver = true;
  state.phase = 'game_over';
  calculateScores();

  // Accumulate into match totals
  for (const s of state.scores) {
    match.matchTotals[s.playerIndex] += s.score;
  }
  match.roundHistory.push(state.scores.map(s => ({ ...s })));

  const isMultiRound = match.totalRounds > 1;
  state.message = isMultiRound
    ? 'Round ' + match.currentRound + ' of ' + match.totalRounds + ' complete!'
    : 'Game Over!';
  addLog(state.message);
  if (state.caboCallerIndex !== null) {
    const caller = state.scores.find(s => s.playerIndex === state.caboCallerIndex);
    if (caller.caboBonus === -5) {
      addLog(caller.name + ' called Cabo with the lowest score! -5 bonus.');
    } else if (caller.caboBonus === 5) {
      addLog(caller.name + ' was back-doored! +5 penalty.');
    } else {
      addLog(caller.name + ' called Cabo but tied — no bonus.');
    }
  }
  render();
}

function nextTurn() {
  if (checkGameEnd()) {
    endRound();
    return;
  }

  if (state.caboCallerIndex !== null) {
    state.turnsUntilEnd--;
    if (state.turnsUntilEnd <= 0) {
      endRound();
      return;
    }
  }

  // Move to next player
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.numPlayers;

  // Skip cabo caller
  if (state.caboCallerIndex !== null && state.currentPlayerIndex === state.caboCallerIndex) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.numPlayers;
    state.turnsUntilEnd--;
    if (state.turnsUntilEnd <= 0) {
      endRound();
      return;
    }
  }

  // Reset turn state
  state.drawnCard = null;
  state.drawnFrom = null;
  state.selectedCards.clear();
  state.powerSwapFirst = null;
  state.peekReveal = null;
  state.turnLock = false;
  state.blackKingOwnSelection = null;
  state.blackKingOpponentSelection = null;
  state.matchPreviousPhase = null;
  state.matchGiveTarget = null;
  state.aiMatchPauseResolve = null;

  const player = state.players[state.currentPlayerIndex];
  if (player.isHuman) {
    state.phase = 'turn_start';
    state.message = 'Your turn! Draw from the deck or discard pile.';
    if (state.caboCallerIndex !== null) {
      state.message += ' (Cabo! ' + state.turnsUntilEnd + ' turn(s) left)';
    }
    render();
  } else {
    state.phase = 'ai_thinking';
    state.aiProcessing = true;
    render();
    runAiTurn(state.currentPlayerIndex);
  }
}

function finishHumanAction(msg) {
  state.phase = 'turn_end';
  if (state.caboCallerIndex !== null) {
    state.message = msg ? msg + ' Match or end your turn.' : 'Match or end your turn.';
  } else {
    state.message = msg ? msg + ' End your turn or call Cabo.' : 'End your turn or call Cabo.';
  }
  render();
}

// Pause during an AI turn so the human can match against the new top discard.
// Returns a Promise that resolves when the human clicks Continue.
function humanMatchPause() {
  const topDiscard = getTopDiscard();
  if (!topDiscard) return Promise.resolve();
  state.phase = 'ai_match_pause';
  state.matchPreviousPhase = 'ai_match_pause';
  state.message = cardName(topDiscard) + ' on discard pile. Match against it or continue.';
  render();
  return new Promise(resolve => {
    state.aiMatchPauseResolve = resolve;
  });
}

function returnToDrawDecision(msg) {
  state.phase = 'draw_decision';
  state.message = msg || 'You drew ' + cardName(state.drawnCard) + '. What will you do?';
  render();
}

function returnToTurnStart(msg) {
  state.phase = 'turn_start';
  state.message = msg || 'Your turn! Draw from the deck or discard pile.';
  render();
}

// ---- UI Rendering ----
function render() {
  if (state.phase === 'start') return;
  renderScoreboard();
  renderCaboBanner();
  renderOpponents();
  renderTable();
  renderPlayer();
  renderMessage();
  renderActions();
  renderLog();
  if (state.phase === 'game_over') renderGameOver();
}

function buildPipLayout(count, suit) {
  // Traditional playing card pip positions: [left%, top%, rotated180]
  const layouts = {
    2:  [[50,18,0],[50,82,1]],
    3:  [[50,18,0],[50,50,0],[50,82,1]],
    4:  [[30,18,0],[70,18,0],[30,82,1],[70,82,1]],
    5:  [[30,18,0],[70,18,0],[50,50,0],[30,82,1],[70,82,1]],
    6:  [[30,18,0],[70,18,0],[30,50,0],[70,50,0],[30,82,1],[70,82,1]],
    7:  [[30,18,0],[70,18,0],[50,34,0],[30,50,0],[70,50,0],[30,82,1],[70,82,1]],
    8:  [[30,14,0],[70,14,0],[50,33,0],[30,50,0],[70,50,0],[50,67,1],[30,86,1],[70,86,1]],
    9:  [[30,14,0],[70,14,0],[30,38,0],[70,38,0],[50,50,0],[30,62,1],[70,62,1],[30,86,1],[70,86,1]],
    10: [[30,14,0],[70,14,0],[50,27,0],[30,38,0],[70,38,0],[30,62,1],[70,62,1],[50,73,1],[30,86,1],[70,86,1]]
  };
  const positions = layouts[count];
  if (!positions) return '';
  let html = '';
  for (const [left, top, rotated] of positions) {
    const transform = rotated
      ? 'transform:translate(-50%,-50%) rotate(180deg)'
      : 'transform:translate(-50%,-50%)';
    html += '<span class="pip" style="left:' + left + '%;top:' + top + '%;' + transform + '">' + suit + '</span>';
  }
  return html;
}

function createCardElement(card, options) {
  const defaults = { faceUp: false, clickable: false, selected: false, empty: false, highlight: null, memory: null };
  const opts = Object.assign({}, defaults, options);
  const div = document.createElement('div');
  const slot = document.createElement('div');
  slot.className = 'card-slot';

  div.className = 'card';

  if (!card && opts.empty) {
    div.classList.add('card-empty');
    slot.appendChild(div);
    return slot;
  }
  if (!card) {
    div.classList.add('card-empty');
    slot.appendChild(div);
    return slot;
  }

  if (opts.faceUp) {
    div.classList.add('card-face-up');

    if (card.rank === 'Joker') {
      // Joker: distinctive display
      div.classList.add(isRedSuit(card.suit) ? 'card-red' : 'card-black');
      div.classList.add('card-joker');

      const topCorner = document.createElement('div');
      topCorner.className = 'card-corner card-corner-top';
      const topRank = document.createElement('div');
      topRank.className = 'corner-rank';
      topRank.textContent = '\u2605';
      topCorner.appendChild(topRank);

      const center = document.createElement('div');
      center.className = 'card-center card-face-center';
      const faceLabel = document.createElement('div');
      faceLabel.className = 'face-label';
      faceLabel.style.fontSize = '1.4em';
      faceLabel.textContent = '\u2605';
      const faceSuit = document.createElement('div');
      faceSuit.className = 'face-suit';
      faceSuit.style.fontSize = '0.65em';
      faceSuit.textContent = 'JOKER';
      center.appendChild(faceLabel);
      center.appendChild(faceSuit);

      const bottomCorner = document.createElement('div');
      bottomCorner.className = 'card-corner card-corner-bottom';
      const btmRank = document.createElement('div');
      btmRank.className = 'corner-rank';
      btmRank.textContent = '\u2605';
      bottomCorner.appendChild(btmRank);

      div.appendChild(topCorner);
      div.appendChild(center);
      div.appendChild(bottomCorner);
    } else {
      div.classList.add(isRedSuit(card.suit) ? 'card-red' : 'card-black');

      const suit = SUIT_SYMBOLS[card.suit];

      // Top-left corner: rank + suit stacked
      const topCorner = document.createElement('div');
      topCorner.className = 'card-corner card-corner-top';
      const topRank = document.createElement('div');
      topRank.className = 'corner-rank';
      topRank.textContent = card.rank;
      const topSuit = document.createElement('div');
      topSuit.className = 'corner-suit';
      topSuit.textContent = suit;
      topCorner.appendChild(topRank);
      topCorner.appendChild(topSuit);

      // Center area
      const center = document.createElement('div');
      center.className = 'card-center';
      const isFace = ['J', 'Q', 'K'].indexOf(card.rank) !== -1;
      const isAce = card.rank === 'A';

      if (isFace) {
        // Face cards: large decorative letter + suit
        center.classList.add('card-face-center');
        const faceLabel = document.createElement('div');
        faceLabel.className = 'face-label';
        faceLabel.textContent = card.rank;
        const faceSuit = document.createElement('div');
        faceSuit.className = 'face-suit';
        faceSuit.textContent = suit;
        center.appendChild(faceLabel);
        center.appendChild(faceSuit);
      } else if (isAce) {
        // Ace: single large suit symbol
        center.classList.add('card-ace-center');
        const aceSuit = document.createElement('div');
        aceSuit.className = 'ace-suit';
        aceSuit.textContent = suit;
        center.appendChild(aceSuit);
      } else {
        // Number cards: pip layout
        center.classList.add('card-pips');
        const count = parseInt(card.rank);
        const pipHTML = buildPipLayout(count, suit);
        center.innerHTML = pipHTML;
      }

      // Bottom-right corner: rank + suit stacked, rotated 180
      const bottomCorner = document.createElement('div');
      bottomCorner.className = 'card-corner card-corner-bottom';
      const btmRank = document.createElement('div');
      btmRank.className = 'corner-rank';
      btmRank.textContent = card.rank;
      const btmSuit = document.createElement('div');
      btmSuit.className = 'corner-suit';
      btmSuit.textContent = suit;
      bottomCorner.appendChild(btmRank);
      bottomCorner.appendChild(btmSuit);

      div.appendChild(topCorner);
      div.appendChild(center);
      div.appendChild(bottomCorner);
    }
  } else {
    div.classList.add('card-face-down');
    const pattern = document.createElement('div');
    pattern.className = 'card-back-pattern';
    const inner = document.createElement('div');
    inner.className = 'card-back-inner';
    pattern.appendChild(inner);
    div.appendChild(pattern);
  }

  if (opts.clickable) div.classList.add('card-clickable');
  if (opts.selected) div.classList.add('card-selected');
  if (opts.highlight === 'success') div.classList.add('card-highlight-success');
  if (opts.highlight === 'fail') div.classList.add('card-highlight-fail');
  if (opts.highlight === 'peek') div.classList.add('card-peek');
  if (opts.highlight === 'ai') div.classList.add('card-ai-highlight');

  slot.appendChild(div);

  if (opts.memory && showMemoryAids) {
    const memDiv = document.createElement('div');
    memDiv.className = 'card-memory';
    memDiv.textContent = opts.memory;
    slot.appendChild(memDiv);
  }

  return slot;
}

function renderOpponents() {
  const area = document.getElementById('opponents-area');
  area.innerHTML = '';

  for (let p = 1; p < state.numPlayers; p++) {
    const player = state.players[p];
    const opDiv = document.createElement('div');
    opDiv.className = 'opponent';
    if (state.currentPlayerIndex === p) opDiv.classList.add('active-turn');

    const label = document.createElement('div');
    label.className = 'player-label';
    label.textContent = player.name;
    if (state.currentPlayerIndex === p) label.classList.add('active');
    if (state.caboCallerIndex === p) {
      label.classList.add('cabo-called');
      label.textContent += ' (CABO)';
    }

    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'opponent-cards';

    for (let c = 0; c < player.cards.length; c++) {
      const card = player.cards[c];
      if (card === null) {
        cardsDiv.appendChild(createCardElement(null, { empty: true }));
        continue;
      }

      const isPeekRevealed = state.peekReveal && state.peekReveal.pIdx === p && state.peekReveal.cIdx === c;
      const showFace = state.phase === 'game_over' || isPeekRevealed;
      const key = p + '-' + c;
      const mem = state.humanMemory.get(key);
      const memStr = mem && !showFace ? cardName(mem) : null;

      let clickable = false;
      let selected = state.selectedCards.has(key);

      if (state.phase === 'match_mode') clickable = true;
      if (state.phase === 'ai_match_pause') clickable = true;
      if (state.phase === 'peek_other') clickable = true;
      if (state.phase === 'swap_cards_1' || state.phase === 'swap_cards_2') clickable = true;
      if (state.phase === 'black_king_select') clickable = true;

      if (state.phase === 'black_king_select' && state.blackKingOpponentSelection &&
          state.blackKingOpponentSelection.pIdx === p && state.blackKingOpponentSelection.cIdx === c) {
        selected = true;
      }

      let highlight = isPeekRevealed ? 'peek' : null;
      if (!highlight && state.aiHighlights.has(key)) highlight = 'ai';
      const el = createCardElement(card, { faceUp: showFace, clickable, selected, memory: memStr, highlight });
      if (clickable) {
        el.firstChild.addEventListener('click', () => onCardClick(p, c));
      }
      cardsDiv.appendChild(el);
    }

    opDiv.appendChild(label);
    opDiv.appendChild(cardsDiv);
    area.appendChild(opDiv);
  }
}

function renderTable() {
  // Deck
  const deckEl = document.getElementById('deck');
  deckEl.innerHTML = '';
  if (state.deck.length > 0) {
    const deckCard = createCardElement(createCard('?', 'spades'), {
      faceUp: false,
      clickable: state.phase === 'turn_start'
    });
    if (state.phase === 'turn_start') {
      deckCard.firstChild.addEventListener('click', () => onDeckClick());
    }
    deckEl.appendChild(deckCard);
  } else {
    deckEl.appendChild(createCardElement(null, { empty: true }));
  }
  document.getElementById('deck-count').textContent = state.deck.length + ' cards';

  // Discard
  const discardEl = document.getElementById('discard');
  discardEl.innerHTML = '';
  const topDiscard = getTopDiscard();
  if (topDiscard) {
    const discardCard = createCardElement(topDiscard, {
      faceUp: true,
      clickable: state.phase === 'turn_start'
    });
    if (state.phase === 'turn_start') {
      discardCard.firstChild.addEventListener('click', () => onDiscardClick());
    }
    discardEl.appendChild(discardCard);
  } else {
    discardEl.appendChild(createCardElement(null, { empty: true }));
  }

  // Drawn card
  const drawnArea = document.getElementById('drawn-card-area');
  drawnArea.innerHTML = '';
  if (state.drawnCard) {
    const drawnLabel = document.createElement('div');
    drawnLabel.className = 'drawn-label';
    drawnLabel.textContent = 'Drawn';
    drawnArea.appendChild(drawnLabel);

    const isHumanTurn = state.players[state.currentPlayerIndex].isHuman;
    const showFaceUp = isHumanTurn || state.drawnFrom === 'discard';
    const drawnEl = createCardElement(state.drawnCard, { faceUp: showFaceUp });
    drawnArea.appendChild(drawnEl);
  }
}

function renderPlayer() {
  const area = document.getElementById('player-area');
  const cardsDiv = document.getElementById('player-cards');
  const nameDiv = document.getElementById('player-name');

  area.className = '';
  if (state.currentPlayerIndex === 0 && !state.gameOver) {
    area.classList.add('active-turn');
  }

  nameDiv.className = 'player-label';
  nameDiv.textContent = 'You';
  if (state.currentPlayerIndex === 0) nameDiv.classList.add('active');
  if (state.caboCallerIndex === 0) {
    nameDiv.classList.add('cabo-called');
    nameDiv.textContent += ' (CABO)';
  }

  cardsDiv.innerHTML = '';
  const player = state.players[0];

  for (let c = 0; c < player.cards.length; c++) {
    const card = player.cards[c];
    if (card === null) {
      cardsDiv.appendChild(createCardElement(null, { empty: true }));
      continue;
    }

    const key = '0-' + c;
    const isPeekRevealed = state.peekReveal && state.peekReveal.pIdx === 0 && state.peekReveal.cIdx === c;
    const showFace = state.phase === 'peek' && (c === 2 || c === 3);
    const showFaceGameOver = state.phase === 'game_over';
    const isFaceUp = showFace || showFaceGameOver || isPeekRevealed;
    const mem = state.humanMemory.get(key);
    const memStr = mem && !isFaceUp ? cardName(mem) : null;

    let clickable = false;
    let selected = state.selectedCards.has(key);

    if (state.phase === 'swap_select') clickable = true;
    if (state.phase === 'match_mode') clickable = true;
    if (state.phase === 'ai_match_pause') clickable = true;
    if (state.phase === 'match_give') clickable = true;
    if (state.phase === 'peek_self') clickable = true;
    if (state.phase === 'swap_cards_1' || state.phase === 'swap_cards_2') clickable = true;
    if (state.phase === 'black_king_select') clickable = true;

    if (state.phase === 'black_king_select' && state.blackKingOwnSelection &&
        state.blackKingOwnSelection.cIdx === c) {
      selected = true;
    }

    let highlight = isPeekRevealed ? 'peek' : null;
    if (!highlight && state.aiHighlights.has(key)) highlight = 'ai';
    const el = createCardElement(card, { faceUp: isFaceUp, clickable, selected, memory: memStr, highlight });
    if (clickable) {
      el.firstChild.addEventListener('click', () => onCardClick(0, c));
    }
    cardsDiv.appendChild(el);
  }
}

function renderMessage() {
  document.getElementById('message-area').textContent = state.message;
}

function renderActions() {
  const area = document.getElementById('actions-area');
  area.innerHTML = '';

  if (state.phase === 'peek') {
    addButton(area, 'Ready', 'btn btn-primary', () => {
      state.phase = 'turn_start';
      state.message = 'Your turn! Draw from the deck or discard pile.';
      addLog('You memorized your bottom cards. Game begins!');
      render();
    });
    return;
  }

  // Persistent Match button — available at any point during the human player's turn
  if (['turn_start', 'draw_decision', 'swap_select', 'turn_end', 'ai_match_pause'].indexOf(state.phase) !== -1) {
    const topDiscard = getTopDiscard();
    if (topDiscard) {
      addButton(area, 'Match (' + topDiscard.rank + ')', 'btn btn-secondary', () => {
        state.matchPreviousPhase = state.phase;
        state.phase = 'match_mode';
        state.message = 'Click any card to match against ' + cardName(topDiscard) + '. Click Done when finished.';
        render();
      });
    }
  }

  // During AI turn pause: Continue button to resume AI play
  if (state.phase === 'ai_match_pause') {
    addButton(area, 'Continue', 'btn btn-primary', () => {
      const resolve = state.aiMatchPauseResolve;
      state.aiMatchPauseResolve = null;
      state.phase = 'ai_thinking';
      render();
      if (resolve) resolve();
    });
  }

  if (state.phase === 'turn_end') {
    addButton(area, 'End Turn', 'btn btn-primary', () => {
      nextTurn();
    });
    if (state.caboCallerIndex === null) {
      addButton(area, 'Call Cabo!', 'btn btn-cabo', () => {
        state.caboCallerIndex = 0;
        state.turnsUntilEnd = state.numPlayers;
        state.message = 'You called CABO! Everyone else gets one more turn.';
        addLog('You called CABO!');
        render();
        showCaboOverlay('You').then(() => nextTurn());
      });
    }
  }

  if (state.phase === 'draw_decision') {
    addButton(area, 'Swap with my card', 'btn btn-secondary', () => {
      state.phase = 'swap_select';
      state.message = 'Click one of your cards to swap with ' + cardName(state.drawnCard) + '.';
      render();
    });

    addButton(area, 'Discard', 'btn btn-secondary', () => {
      addLog('You discarded ' + cardName(state.drawnCard) + '.');
      discardCard(state.drawnCard);
      state.drawnCard = null;
      finishHumanAction('Discarded.');
    });

    if (state.drawnFrom === 'deck' && isPowerCard(state.drawnCard)) {
      const desc = getPowerDescription(state.drawnCard);
      addButton(area, 'Use Power (' + desc + ')', 'btn btn-primary', () => {
        usePowerCard();
      });
    }
  }

  if (state.phase === 'match_mode') {
    addButton(area, 'Done Matching', 'btn btn-primary', () => {
      const prev = state.matchPreviousPhase || 'turn_start';
      state.matchPreviousPhase = null;
      if (prev === 'ai_match_pause') {
        // Resume AI turn
        const resolve = state.aiMatchPauseResolve;
        state.aiMatchPauseResolve = null;
        state.phase = 'ai_thinking';
        render();
        if (resolve) resolve();
        return;
      }
      state.phase = prev;
      if (prev === 'turn_start') {
        state.message = 'Your turn! Draw from the deck or discard pile.';
      } else if (prev === 'draw_decision') {
        state.message = 'You drew ' + cardName(state.drawnCard) + '. What will you do?';
      } else if (prev === 'turn_end') {
        state.message = 'End your turn or call Cabo.';
      } else if (prev === 'swap_select') {
        state.message = 'Click one of your cards to swap with ' + cardName(state.drawnCard) + '.';
      }
      render();
    });
  }

  if (state.phase === 'swap_select') {
    addButton(area, 'Cancel', 'btn btn-secondary', () => {
      state.phase = 'draw_decision';
      state.message = 'You drew ' + cardName(state.drawnCard) + '. What will you do?';
      render();
    });
  }

  if (state.phase === 'swap_cards_1') {
    addButton(area, 'Skip (waste power)', 'btn btn-secondary', () => {
      state.powerSwapFirst = null;
      addLog('You skipped the swap power.');
      finishHumanAction('Power skipped.');
    });
  }

  if (state.phase === 'swap_cards_2') {
    addButton(area, 'Reselect first card', 'btn btn-secondary', () => {
      state.phase = 'swap_cards_1';
      state.powerSwapFirst = null;
      state.message = 'Choose the first card to swap.';
      render();
    });
  }

  if (state.phase === 'black_king_select') {
    const bothSelected = state.blackKingOwnSelection !== null && state.blackKingOpponentSelection !== null;
    if (bothSelected) {
      addButton(area, 'Confirm Selection', 'btn btn-primary', () => {
        state.phase = 'black_king_peek_choice';
        state.message = 'Which card do you want to peek at?';
        render();
      });
    }
    addButton(area, 'Skip (waste power)', 'btn btn-secondary', () => {
      state.blackKingOwnSelection = null;
      state.blackKingOpponentSelection = null;
      addLog('You skipped the Black King power.');
      finishHumanAction('Power skipped.');
    });
  }

  if (state.phase === 'black_king_peek_choice') {
    const oppSel = state.blackKingOpponentSelection;
    const oppName = state.players[oppSel.pIdx].name;
    addButton(area, 'Peek at your card', 'btn btn-primary', () => {
      performBlackKingPeek('own');
    });
    addButton(area, "Peek at " + oppName + "'s card", 'btn btn-primary', () => {
      performBlackKingPeek('opponent');
    });
    addButton(area, 'Go back', 'btn btn-secondary', () => {
      state.phase = 'black_king_select';
      state.message = "Reselect your cards, or confirm to proceed.";
      render();
    });
  }

  if (state.phase === 'black_king_swap_decision') {
    addButton(area, 'Swap the two cards', 'btn btn-primary', () => {
      performBlackKingSwap(true);
    });
    addButton(area, 'Keep as they are', 'btn btn-secondary', () => {
      performBlackKingSwap(false);
    });
  }
}

function addButton(container, text, className, handler) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className = className;
  btn.addEventListener('click', handler);
  container.appendChild(btn);
}

// Show a dramatic full-screen CABO announcement overlay.
// Returns a Promise that resolves after the overlay fades out (~3.5s total).
function showCaboOverlay(callerName) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'cabo-overlay';

    const text = document.createElement('div');
    text.className = 'cabo-overlay-text';
    text.textContent = 'CABO!';

    const caller = document.createElement('div');
    caller.className = 'cabo-overlay-caller';
    caller.textContent = callerName + ' called Cabo!';

    const sub = document.createElement('div');
    sub.className = 'cabo-overlay-sub';
    sub.textContent = 'Everyone else gets one more turn.';

    overlay.appendChild(text);
    overlay.appendChild(caller);
    overlay.appendChild(sub);
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('fade-out');
      overlay.addEventListener('animationend', () => {
        overlay.remove();
        resolve();
      });
    }, 3000);
  });
}

// Render the persistent red Cabo banner at the top of the game screen.
function renderCaboBanner() {
  const banner = document.getElementById('cabo-banner');
  if (!banner) return;
  if (state.caboCallerIndex === null || state.gameOver) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = '';
  const callerName = state.caboCallerIndex === 0 ? 'You' : state.players[state.caboCallerIndex].name;
  banner.textContent = 'CABO called by ' + callerName + '! ' + state.turnsUntilEnd + ' turn(s) remaining';
}

function renderLog() {
  const logContent = document.getElementById('log-content');
  logContent.innerHTML = '';
  for (const entry of state.log) {
    const div = document.createElement('div');
    div.textContent = entry;
    if (entry.indexOf('called CABO!') !== -1) {
      div.classList.add('log-cabo');
    }
    logContent.appendChild(div);
  }
  logContent.scrollTop = logContent.scrollHeight;
}

function renderScoreboard() {
  const el = document.getElementById('match-scoreboard');
  if (!el) return;
  if (match.totalRounds <= 1) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = '';

  const roundInfo = document.createElement('span');
  roundInfo.className = 'scoreboard-round';
  roundInfo.textContent = 'Round ' + match.currentRound + '/' + match.totalRounds;
  el.appendChild(roundInfo);

  const scoresDiv = document.createElement('span');
  scoresDiv.className = 'scoreboard-scores';
  for (let i = 0; i < match.numPlayers; i++) {
    const span = document.createElement('span');
    span.className = 'scoreboard-player';
    span.textContent = match.playerNames[i] + ': ' + match.matchTotals[i];
    scoresDiv.appendChild(span);
  }
  el.appendChild(scoresDiv);

  const btn = document.createElement('button');
  btn.className = 'btn btn-small';
  btn.textContent = 'New Game';
  btn.addEventListener('click', () => {
    const overlay = document.querySelector('.game-over-overlay');
    if (overlay) overlay.remove();
    showStartScreen();
  });
  el.appendChild(btn);
}

function renderGameOver() {
  const existing = document.querySelector('.game-over-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';

  const content = document.createElement('div');
  content.className = 'game-over-content';

  const isMultiRound = match.totalRounds > 1;
  const isMatchEnd = match.currentRound >= match.totalRounds;
  const roundWinner = state.scores[0];

  // Header
  const h2 = document.createElement('h2');
  if (isMultiRound && isMatchEnd) {
    h2.textContent = 'Match Over!';
  } else if (isMultiRound) {
    h2.textContent = 'Round ' + match.currentRound + ' of ' + match.totalRounds;
  } else {
    h2.textContent = roundWinner.playerIndex === 0 ? 'You Win!' : roundWinner.name + ' Wins!';
  }
  content.appendChild(h2);

  // Subtitle for multi-round
  if (isMultiRound) {
    const sub = document.createElement('div');
    sub.className = 'round-subtitle';
    if (isMatchEnd) {
      let minTotal = Infinity, winnerIdx = 0;
      for (let i = 0; i < match.numPlayers; i++) {
        if (match.matchTotals[i] < minTotal) {
          minTotal = match.matchTotals[i];
          winnerIdx = i;
        }
      }
      sub.textContent = (winnerIdx === 0 ? 'You' : match.playerNames[winnerIdx]) + ' win' + (winnerIdx === 0 ? '' : 's') + ' with ' + minTotal + ' points!';
    } else {
      sub.textContent = (roundWinner.playerIndex === 0 ? 'You' : roundWinner.name) + ' win' + (roundWinner.playerIndex === 0 ? '' : 's') + ' this round.';
    }
    content.appendChild(sub);
  }

  // Score table
  const table = document.createElement('table');
  table.className = 'score-table';
  const thead = document.createElement('thead');
  let headerHTML = '<tr><th>Player</th><th>' + (isMultiRound ? 'Round' : 'Score') + '</th><th>Cards</th>';
  if (isMultiRound) headerHTML += '<th>Total</th>';
  headerHTML += '</tr>';
  thead.innerHTML = headerHTML;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Sort: match-end by total, otherwise by round score
  let displayOrder;
  if (isMatchEnd && isMultiRound) {
    displayOrder = [...state.scores].sort((a, b) => match.matchTotals[a.playerIndex] - match.matchTotals[b.playerIndex]);
  } else {
    displayOrder = state.scores;
  }

  let matchWinnerIdx = null;
  if (isMultiRound) {
    let minTotal = Infinity;
    for (let i = 0; i < match.numPlayers; i++) {
      if (match.matchTotals[i] < minTotal) {
        minTotal = match.matchTotals[i];
        matchWinnerIdx = i;
      }
    }
  }

  for (const s of displayOrder) {
    const tr = document.createElement('tr');
    if (isMatchEnd && isMultiRound) {
      if (s.playerIndex === matchWinnerIdx) tr.className = 'winner';
    } else {
      if (s === roundWinner) tr.className = 'winner';
    }

    const tdName = document.createElement('td');
    tdName.textContent = s.name;
    if (state.caboCallerIndex === s.playerIndex) tdName.textContent += ' (Cabo)';

    const tdScore = document.createElement('td');
    if (s.caboBonus !== 0) {
      const bonusStr = s.caboBonus > 0 ? ' (+5)' : ' (-5)';
      tdScore.textContent = s.score + bonusStr;
    } else {
      tdScore.textContent = s.score;
    }

    const tdCards = document.createElement('td');
    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'score-cards';
    for (const card of s.cards) {
      const span = document.createElement('span');
      span.className = 'score-card-mini';
      span.textContent = cardName(card);
      if (isRedSuit(card.suit)) span.style.color = '#c0392b';
      cardsDiv.appendChild(span);
    }
    tdCards.appendChild(cardsDiv);

    tr.appendChild(tdName);
    tr.appendChild(tdScore);
    tr.appendChild(tdCards);

    if (isMultiRound) {
      const tdTotal = document.createElement('td');
      tdTotal.textContent = match.matchTotals[s.playerIndex];
      tdTotal.style.fontWeight = '700';
      tr.appendChild(tdTotal);
    }

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  content.appendChild(table);

  // Memory aid toggle (show when there are more rounds to play)
  if (isMultiRound && !isMatchEnd) {
    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'memory-aid-toggle';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = showMemoryAids;
    checkbox.addEventListener('change', () => {
      showMemoryAids = checkbox.checked;
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' Show memory aids'));
    toggleDiv.appendChild(label);
    content.appendChild(toggleDiv);
  }

  // Buttons
  const btnDiv = document.createElement('div');
  btnDiv.className = 'game-over-buttons';

  if (isMultiRound && !isMatchEnd) {
    addButton(btnDiv, 'Next Round', 'btn btn-primary', () => {
      overlay.remove();
      startNextRound();
    });
  }

  addButton(btnDiv, 'New Game', (isMultiRound && !isMatchEnd) ? 'btn btn-secondary' : 'btn btn-primary', () => {
    overlay.remove();
    showStartScreen();
  });

  content.appendChild(btnDiv);

  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

// ---- Event Handlers ----
function onDeckClick() {
  if (state.phase !== 'turn_start' || state.turnLock) return;
  state.turnLock = true;
  const card = drawFromDeck();
  if (!card) {
    state.message = 'Deck is empty!';
    state.turnLock = false;
    render();
    return;
  }
  state.drawnCard = card;
  state.drawnFrom = 'deck';
  state.phase = 'draw_decision';
  state.message = 'You drew ' + cardName(card) + '. What will you do?';
  addLog('You drew a card from the deck.');
  state.turnLock = false;
  render();
}

function onDiscardClick() {
  if (state.phase !== 'turn_start' || state.turnLock) return;
  state.turnLock = true;
  const card = drawFromDiscard();
  if (!card) {
    state.turnLock = false;
    return;
  }
  state.drawnCard = card;
  state.drawnFrom = 'discard';
  state.phase = 'draw_decision';
  state.message = 'You took ' + cardName(card) + ' from the discard pile. What will you do?';
  addLog('You took ' + cardName(card) + ' from the discard pile.');
  state.turnLock = false;
  render();
}

function onCardClick(pIdx, cIdx) {
  const card = state.players[pIdx].cards[cIdx];
  if (!card) return;

  if (state.phase === 'swap_select') {
    if (pIdx !== 0) return;
    performSwap(0, cIdx);
    return;
  }

  if (state.phase === 'match_mode') {
    attemptMatch(pIdx, cIdx);
    return;
  }

  if (state.phase === 'ai_match_pause') {
    // Clicking a card during AI pause enters match mode and attempts match
    state.matchPreviousPhase = 'ai_match_pause';
    state.phase = 'match_mode';
    attemptMatch(pIdx, cIdx);
    return;
  }

  if (state.phase === 'match_give') {
    if (pIdx !== 0) return;
    performGiveCard(cIdx);
    return;
  }

  if (state.phase === 'peek_self') {
    if (pIdx !== 0) return;
    performPeekSelf(cIdx);
    return;
  }

  if (state.phase === 'peek_other') {
    if (pIdx === 0) return;
    performPeekOther(pIdx, cIdx);
    return;
  }

  if (state.phase === 'black_king_select') {
    if (pIdx === 0) {
      // Selecting own card
      if (state.blackKingOwnSelection && state.blackKingOwnSelection.cIdx === cIdx) {
        state.blackKingOwnSelection = null; // deselect
      } else {
        state.blackKingOwnSelection = { pIdx: 0, cIdx };
      }
    } else {
      // Selecting opponent card
      if (state.blackKingOpponentSelection &&
          state.blackKingOpponentSelection.pIdx === pIdx && state.blackKingOpponentSelection.cIdx === cIdx) {
        state.blackKingOpponentSelection = null; // deselect
      } else {
        state.blackKingOpponentSelection = { pIdx, cIdx };
      }
    }
    // Update message
    const ownSelected = state.blackKingOwnSelection !== null;
    const oppSelected = state.blackKingOpponentSelection !== null;
    if (ownSelected && oppSelected) {
      state.message = 'Both cards selected. Click Confirm to proceed.';
    } else if (ownSelected) {
      state.message = "Now select one of an opponent's cards.";
    } else if (oppSelected) {
      state.message = 'Now select one of your own cards.';
    } else {
      state.message = "Select one of your cards AND one of an opponent's cards.";
    }
    render();
    return;
  }

  if (state.phase === 'swap_cards_1') {
    state.powerSwapFirst = { pIdx, cIdx };
    state.phase = 'swap_cards_2';
    state.message = 'Now choose the second card to swap.';
    render();
    return;
  }

  if (state.phase === 'swap_cards_2') {
    if (pIdx === state.powerSwapFirst.pIdx && cIdx === state.powerSwapFirst.cIdx) return;
    performPowerSwap(state.powerSwapFirst.pIdx, state.powerSwapFirst.cIdx, pIdx, cIdx);
    return;
  }
}

function performSwap(pIdx, cIdx) {
  const oldCard = state.players[pIdx].cards[cIdx];
  state.players[pIdx].cards[cIdx] = state.drawnCard;

  // Player knows what they put there
  setMemory(0, pIdx, cIdx, state.drawnCard);

  // Discard the old card
  discardCard(oldCard);
  addLog('You swapped ' + cardName(state.drawnCard) + ' into your hand, discarding ' + cardName(oldCard) + '.');

  state.drawnCard = null;
  finishHumanAction('Swapped!');
}

function attemptMatch(pIdx, cIdx) {
  const card = state.players[pIdx].cards[cIdx];
  if (!card) return;

  const topDiscard = getTopDiscard();
  if (!topDiscard) return;

  if (card.rank === topDiscard.rank) {
    // Correct match
    if (pIdx === 0) {
      // Own card: discard it and remove from hand
      discardCard(card);
      state.players[0].cards[cIdx] = null;
      clearMemoryAt(0, cIdx);
      addLog('Matched your ' + cardName(card) + '! Card discarded.');
      state.message = 'Correct! ' + cardName(card) + ' removed. Continue matching or click Done.';
      render();
    } else {
      // Opponent card: discard it, then give them one of yours
      discardCard(card);
      state.players[pIdx].cards[cIdx] = null;
      clearMemoryAt(pIdx, cIdx);
      addLog('Matched ' + state.players[pIdx].name + "'s " + cardName(card) + '!');

      const ownCards = nonNullCardIndices(0);
      if (ownCards.length > 0) {
        state.matchGiveTarget = { pIdx, cIdx };
        state.phase = 'match_give';
        state.message = 'Choose one of your cards to give to ' + state.players[pIdx].name + ' as a replacement.';
      } else {
        state.message = 'Correct! ' + state.players[pIdx].name + "'s card removed. Continue matching or click Done.";
      }
      render();
    }
  } else {
    // Wrong match — penalty card
    addLog('Wrong! ' + cardName(card) + ' is not a ' + topDiscard.rank + '. Penalty card!');
    const penalty = drawFromDeck();
    if (penalty) {
      state.players[0].cards.push(penalty);
    }
    state.message = 'Wrong match! Penalty card added. Continue matching or click Done.';
    render();
  }
}

function performGiveCard(cIdx) {
  const card = state.players[0].cards[cIdx];
  if (!card) return;
  if (!state.matchGiveTarget) return;

  const target = state.matchGiveTarget;

  // Move card from human to opponent's empty slot
  state.players[target.pIdx].cards[target.cIdx] = card;
  state.players[0].cards[cIdx] = null;

  // Nobody sees the replacement
  clearMemoryAt(target.pIdx, target.cIdx);
  clearMemoryAt(0, cIdx);

  addLog('You gave a card to ' + state.players[target.pIdx].name + '.');
  state.matchGiveTarget = null;
  state.phase = 'match_mode';
  state.message = 'Card given. Continue matching or click Done.';
  render();
}

function usePowerCard() {
  const card = state.drawnCard;
  const powerType = getPowerType(card);

  discardCard(card);
  addLog('You used ' + cardName(card) + "'s power.");
  state.drawnCard = null;

  if (powerType === 'peek_self') {
    state.phase = 'peek_self';
    state.message = 'Choose one of your cards to peek at.';
  } else if (powerType === 'peek_other') {
    state.phase = 'peek_other';
    state.message = "Choose an opponent's card to peek at.";
  } else if (powerType === 'swap_cards') {
    state.phase = 'swap_cards_1';
    state.message = 'Choose the first card to swap (any card on the table).';
  } else if (powerType === 'spy_and_swap') {
    state.blackKingOwnSelection = null;
    state.blackKingOpponentSelection = null;
    state.phase = 'black_king_select';
    state.message = "Select one of your cards AND one of an opponent's cards.";
  }
  render();
}

function performPeekSelf(cIdx) {
  const card = state.players[0].cards[cIdx];
  if (!card) return;

  setMemory(0, 0, cIdx, card);
  addLog('You peeked at your card: ' + cardName(card) + '.');
  state.message = 'Your card is ' + cardName(card) + '. Memorize it!';
  state.phase = 'peek_show';
  state.peekReveal = { pIdx: 0, cIdx: cIdx };
  render();

  setTimeout(() => {
    state.peekReveal = null;
    finishHumanAction('Card memorized.');
  }, 2500);
}

function performPeekOther(pIdx, cIdx) {
  const card = state.players[pIdx].cards[cIdx];
  if (!card) return;

  setMemory(0, pIdx, cIdx, card);
  addLog('You peeked at ' + state.players[pIdx].name + "'s card: " + cardName(card) + '.');
  state.message = state.players[pIdx].name + "'s card is " + cardName(card) + '. Memorize it!';
  state.phase = 'peek_show';
  state.peekReveal = { pIdx: pIdx, cIdx: cIdx };
  render();

  setTimeout(() => {
    state.peekReveal = null;
    finishHumanAction('Card memorized.');
  }, 2500);
}

function performPowerSwap(p1, c1, p2, c2) {
  const card1 = state.players[p1].cards[c1];
  const card2 = state.players[p2].cards[c2];

  state.players[p1].cards[c1] = card2;
  state.players[p2].cards[c2] = card1;

  // Update memories: everyone who knew about these positions needs updating
  // The human (observer 0) needs to swap their memory entries
  const key1 = p1 + '-' + c1;
  const key2 = p2 + '-' + c2;

  // For human memory
  const mem1 = state.humanMemory.get(key1);
  const mem2 = state.humanMemory.get(key2);
  state.humanMemory.delete(key1);
  state.humanMemory.delete(key2);
  if (mem1) state.humanMemory.set(key2, mem1);
  if (mem2) state.humanMemory.set(key1, mem2);

  // For AI memories
  for (let ai = 0; ai < state.numPlayers; ai++) {
    const aiMem1 = state.aiMemory[ai].get(key1);
    const aiMem2 = state.aiMemory[ai].get(key2);
    state.aiMemory[ai].delete(key1);
    state.aiMemory[ai].delete(key2);
    if (aiMem1) state.aiMemory[ai].set(key2, aiMem1);
    if (aiMem2) state.aiMemory[ai].set(key1, aiMem2);
  }

  const name1 = p1 === 0 ? 'your' : state.players[p1].name + "'s";
  const name2 = p2 === 0 ? 'your' : state.players[p2].name + "'s";
  addLog('You swapped ' + name1 + ' card with ' + name2 + ' card.');
  state.powerSwapFirst = null;
  finishHumanAction('Cards swapped!');
}

// ---- Black King Power (Human) ----
function performBlackKingPeek(which) {
  let peekTarget;
  if (which === 'own') {
    peekTarget = state.blackKingOwnSelection;
  } else {
    peekTarget = state.blackKingOpponentSelection;
  }

  const card = state.players[peekTarget.pIdx].cards[peekTarget.cIdx];
  if (!card) {
    state.message = 'That card slot is empty. Power wasted.';
    finishHumanAction('Card was empty.');
    return;
  }

  setMemory(0, peekTarget.pIdx, peekTarget.cIdx, card);
  const ownerName = peekTarget.pIdx === 0 ? 'Your' : state.players[peekTarget.pIdx].name + "'s";
  addLog('You peeked at ' + ownerName.toLowerCase() + ' card: ' + cardName(card) + '.');
  state.message = ownerName + ' card is ' + cardName(card) + '. Now decide: swap or keep?';
  state.peekReveal = { pIdx: peekTarget.pIdx, cIdx: peekTarget.cIdx };
  state.phase = 'black_king_peek_show';
  render();

  setTimeout(() => {
    state.peekReveal = null;
    state.phase = 'black_king_swap_decision';
    state.message = 'Swap your card with ' + state.players[state.blackKingOpponentSelection.pIdx].name + "'s card, or keep them?";
    render();
  }, 2500);
}

function performBlackKingSwap(doSwap) {
  const own = state.blackKingOwnSelection;
  const opp = state.blackKingOpponentSelection;

  if (doSwap) {
    const card1 = state.players[own.pIdx].cards[own.cIdx];
    const card2 = state.players[opp.pIdx].cards[opp.cIdx];

    state.players[own.pIdx].cards[own.cIdx] = card2;
    state.players[opp.pIdx].cards[opp.cIdx] = card1;

    // Update memories
    const key1 = own.pIdx + '-' + own.cIdx;
    const key2 = opp.pIdx + '-' + opp.cIdx;

    const hm1 = state.humanMemory.get(key1);
    const hm2 = state.humanMemory.get(key2);
    state.humanMemory.delete(key1);
    state.humanMemory.delete(key2);
    if (hm1) state.humanMemory.set(key2, hm1);
    if (hm2) state.humanMemory.set(key1, hm2);

    for (let ai = 0; ai < state.numPlayers; ai++) {
      const m1 = state.aiMemory[ai].get(key1);
      const m2 = state.aiMemory[ai].get(key2);
      state.aiMemory[ai].delete(key1);
      state.aiMemory[ai].delete(key2);
      if (m1) state.aiMemory[ai].set(key2, m1);
      if (m2) state.aiMemory[ai].set(key1, m2);
    }

    addLog('You swapped your card with ' + state.players[opp.pIdx].name + "'s card.");
    state.blackKingOwnSelection = null;
    state.blackKingOpponentSelection = null;
    finishHumanAction('Cards swapped!');
  } else {
    addLog('You chose to keep the cards in place.');
    state.blackKingOwnSelection = null;
    state.blackKingOpponentSelection = null;
    finishHumanAction('Cards kept.');
  }
}

// ---- AI Logic ----
async function runAiTurn(pIdx) {
  const player = state.players[pIdx];
  const aiMem = state.aiMemory[pIdx];

  state.message = player.name + ' is thinking...';
  render();
  await delay(2000);

  // Pre-draw matching against top discard
  const topDiscardForMatch = getTopDiscard();
  if (topDiscardForMatch) {
    const matchTargets = findAiMatchTargets(pIdx, topDiscardForMatch);
    if (matchTargets.length > 0) {
      await aiPerformMatch(pIdx, topDiscardForMatch, matchTargets);
      await delay(1000);
      await humanMatchPause();
    }
  }

  // Decide draw source
  const topDiscard = getTopDiscard();
  let drawnCard = null;
  let fromDeck = true;

  if (topDiscard && shouldAiTakeDiscard(pIdx, topDiscard)) {
    drawnCard = drawFromDiscard();
    fromDeck = false;
    addLog(player.name + ' took ' + cardName(drawnCard) + ' from the discard pile.');
    state.message = player.name + ' took ' + cardName(drawnCard) + ' from the discard pile.';
  } else {
    drawnCard = drawFromDeck();
    if (!drawnCard) {
      state.aiProcessing = false;
      nextTurn();
      return;
    }
    fromDeck = true;
    addLog(player.name + ' drew from the deck.');
    state.message = player.name + ' drew from the deck.';
  }

  state.drawnCard = drawnCard;
  state.drawnFrom = fromDeck ? 'deck' : 'discard';
  render();
  await delay(2000);

  // If taken from discard, always swap with the intended card
  if (!fromDeck) {
    const swapIdx = findAiDiscardSwapTarget(pIdx, drawnCard);
    if (swapIdx >= 0) {
      const oldCard = player.cards[swapIdx];
      player.cards[swapIdx] = drawnCard;
      setMemory(pIdx, pIdx, swapIdx, drawnCard);
      discardCard(oldCard);
      addLog(player.name + ' placed ' + cardName(drawnCard) + ' into ' + ownPosDesc(pIdx, swapIdx) + ' slot. Discarded ' + cardName(oldCard) + '.');
      state.message = player.name + ' placed ' + cardName(drawnCard) + ' into their hand. Discarded ' + cardName(oldCard) + '.';
      state.drawnCard = null;
      await flashAiHighlight(pIdx + '-' + swapIdx, 2000);
      await humanMatchPause();
    } else {
      discardCard(drawnCard);
      addLog(player.name + ' discarded ' + cardName(drawnCard) + '.');
      state.message = player.name + ' discarded ' + cardName(drawnCard) + '.';
      state.drawnCard = null;
      render();
      await delay(2000);
      await humanMatchPause();
    }
  } else {
    // Decide what to do with drawn card (deck draw)
    const action = decideAiAction(pIdx, drawnCard, fromDeck);

    if (action.type === 'swap') {
      const oldCard = player.cards[action.cardIdx];
      player.cards[action.cardIdx] = drawnCard;
      setMemory(pIdx, pIdx, action.cardIdx, drawnCard);
      discardCard(oldCard);
      addLog(player.name + ' swapped ' + ownPosDesc(pIdx, action.cardIdx) + ' with drawn card. Discarded ' + cardName(oldCard) + '.');
      state.message = player.name + ' placed a card into their hand. Discarded ' + cardName(oldCard) + '.';
      state.drawnCard = null;
      await flashAiHighlight(pIdx + '-' + action.cardIdx, 2000);
      await humanMatchPause();
    } else if (action.type === 'power') {
      discardCard(drawnCard);
      addLog(player.name + ' used ' + cardName(drawnCard) + "'s power.");
      state.message = player.name + ' used ' + cardName(drawnCard) + "'s power.";
      render();
      await delay(2000);
      await aiUsePower(pIdx, drawnCard);
      await humanMatchPause();
    } else {
      discardCard(drawnCard);
      addLog(player.name + ' discarded ' + cardName(drawnCard) + '.');
      state.message = player.name + ' discarded ' + cardName(drawnCard) + '.';
      state.drawnCard = null;
      render();
      await delay(1000);
      await humanMatchPause();
    }
    state.drawnCard = null;
  }

  // Post-action matching: top discard may have changed
  const postDiscard = getTopDiscard();
  if (postDiscard) {
    const postMatchTargets = findAiMatchTargets(pIdx, postDiscard);
    if (postMatchTargets.length > 0) {
      render();
      await delay(1000);
      await aiPerformMatch(pIdx, postDiscard, postMatchTargets);
      await delay(1000);
      await humanMatchPause();
    }
  }

  // After action: check if AI wants to call Cabo
  render();
  await delay(2000);

  if (state.caboCallerIndex === null && shouldAiCallCabo(pIdx)) {
    state.caboCallerIndex = pIdx;
    state.turnsUntilEnd = state.numPlayers;
    state.message = player.name + ' called CABO!';
    addLog(player.name + ' called CABO!');
    render();
    await showCaboOverlay(player.name);
  }

  state.aiProcessing = false;
  nextTurn();
}

function shouldAiCallCabo(pIdx) {
  const mem = state.aiMemory[pIdx];
  const cards = state.players[pIdx].cards;
  let knownTotal = 0;
  let unknownCount = 0;

  for (let c = 0; c < cards.length; c++) {
    if (!cards[c]) continue;
    const key = pIdx + '-' + c;
    const known = mem.get(key);
    if (known) {
      knownTotal += getCardValue(known);
    } else {
      unknownCount++;
    }
  }

  // Estimate unknown cards at ~6 each
  const estimated = knownTotal + unknownCount * 6;
  const threshold = 4 + Math.random() * 6; // 4-10
  return estimated <= threshold && unknownCount <= 1;
}

function findAiDiscardSwapTarget(pIdx, card) {
  const value = getCardValue(card);
  const mem = state.aiMemory[pIdx];
  const cards = state.players[pIdx].cards;
  let worstIdx = -1;
  let worstVal = -1;
  for (let c = 0; c < cards.length; c++) {
    if (!cards[c]) continue;
    const key = pIdx + '-' + c;
    const known = mem.get(key);
    if (known) {
      // Never swap out a Joker
      if (known.rank === 'Joker') continue;
      const val = getCardValue(known);
      if (val > value && val > worstVal) {
        worstVal = val;
        worstIdx = c;
      }
    }
  }
  // If no known card is worse, swap with a random unknown
  if (worstIdx < 0) {
    const unknowns = [];
    for (let c = 0; c < cards.length; c++) {
      if (!cards[c]) continue;
      if (!mem.has(pIdx + '-' + c)) unknowns.push(c);
    }
    if (unknowns.length > 0) {
      worstIdx = unknowns[Math.floor(Math.random() * unknowns.length)];
    }
  }
  return worstIdx;
}

function shouldAiTakeDiscard(pIdx, topDiscard) {
  const value = getCardValue(topDiscard);
  const mem = state.aiMemory[pIdx];
  const cards = state.players[pIdx].cards;

  // Always take a Joker — it's the best card
  if (isJoker(topDiscard)) return true;

  // Take low-value cards or one-eyed king if we have a known high card
  if (value > 4 && !isOneEyedKing(topDiscard)) return false;

  // Find the worst known card to swap with
  let worstIdx = -1;
  let worstVal = -1;
  for (let c = 0; c < cards.length; c++) {
    if (!cards[c]) continue;
    const key = pIdx + '-' + c;
    const known = mem.get(key);
    if (known && getCardValue(known) > value && getCardValue(known) > worstVal) {
      worstVal = getCardValue(known);
      worstIdx = c;
    }
  }

  return worstIdx >= 0;
}

function findAiMatchTargets(pIdx, drawnCard) {
  const mem = state.aiMemory[pIdx];
  const targets = [];

  for (let p = 0; p < state.numPlayers; p++) {
    for (let c = 0; c < state.players[p].cards.length; c++) {
      if (!state.players[p].cards[c]) continue;
      const key = p + '-' + c;
      const known = mem.get(key);
      if (known && known.rank === drawnCard.rank) {
        targets.push({ pIdx: p, cIdx: c });
      }
    }
  }

  return targets;
}

async function aiPerformMatch(pIdx, drawnCard, targets) {
  const player = state.players[pIdx];

  addLog(player.name + ' is matching ' + drawnCard.rank + 's!');
  state.message = player.name + ' is matching ' + drawnCard.rank + 's!';
  render();
  await delay(2000);

  for (const t of targets) {
    const card = state.players[t.pIdx].cards[t.cIdx];
    if (!card) continue;

    if (card.rank === drawnCard.rank) {
      // Correct match — highlight the matched card
      const posDesc = t.pIdx === pIdx ? ownPosDesc(pIdx, t.cIdx) : cardPosDesc(t.pIdx, t.cIdx);
      const matchMsg = player.name + ' matched ' + posDesc + ' (' + cardName(card) + ')!';
      addLog(matchMsg);
      state.message = matchMsg;
      await flashAiHighlight(t.pIdx + '-' + t.cIdx, 2000);

      if (t.pIdx === pIdx) {
        // Own card: discard and remove it
        discardCard(card);
        state.players[t.pIdx].cards[t.cIdx] = null;
        clearMemoryAt(t.pIdx, t.cIdx);
      } else {
        // Opponent's card: discard and give a replacement
        discardCard(card);
        state.players[t.pIdx].cards[t.cIdx] = null;
        clearMemoryAt(t.pIdx, t.cIdx);

        // Give worst card from own hand (never give a known Joker)
        const ownCards = nonNullCardIndices(pIdx);
        if (ownCards.length > 0) {
          let worstIdx = ownCards[0];
          let worstVal = -Infinity;
          for (const ci of ownCards) {
            const key = pIdx + '-' + ci;
            const known = state.aiMemory[pIdx].get(key);
            if (known && known.rank === 'Joker') continue;
            const val = known ? getCardValue(known) : 7;
            if (val > worstVal) {
              worstVal = val;
              worstIdx = ci;
            }
          }
          const giveCard = state.players[pIdx].cards[worstIdx];
          state.players[t.pIdx].cards[t.cIdx] = giveCard;
          state.players[pIdx].cards[worstIdx] = null;
          clearMemoryAt(pIdx, worstIdx);
          clearMemoryAt(t.pIdx, t.cIdx);
          // Highlight both the given-to slot and the emptied slot
          addLog(player.name + ' gave ' + ownPosDesc(pIdx, worstIdx) + ' to ' + cardPosDesc(t.pIdx, t.cIdx) + ' slot.');
          state.message = player.name + ' gave a card to ' + state.players[t.pIdx].name + '.';
          await flashAiHighlight([t.pIdx + '-' + t.cIdx, pIdx + '-' + worstIdx], 2000);
        }
      }
    }
    render();
    await delay(1000);
  }
}

function decideAiAction(pIdx, drawnCard, fromDeck) {
  const mem = state.aiMemory[pIdx];
  const cards = state.players[pIdx].cards;
  const drawnValue = getCardValue(drawnCard);

  // Find worst known card (never consider Jokers as swap candidates)
  let worstIdx = -1;
  let worstVal = -1;
  let unknownIndices = [];

  for (let c = 0; c < cards.length; c++) {
    if (!cards[c]) continue;
    const key = pIdx + '-' + c;
    const known = mem.get(key);
    if (known) {
      if (known.rank === 'Joker') continue; // Never swap out a Joker
      const val = getCardValue(known);
      if (val > worstVal) {
        worstVal = val;
        worstIdx = c;
      }
    } else {
      unknownIndices.push(c);
    }
  }

  // Joker (-1 pts): always keep — swap with worst known or an unknown
  if (isJoker(drawnCard)) {
    if (worstIdx >= 0 && worstVal > -1) {
      return { type: 'swap', cardIdx: worstIdx };
    }
    if (unknownIndices.length > 0) {
      return { type: 'swap', cardIdx: unknownIndices[Math.floor(Math.random() * unknownIndices.length)] };
    }
    // All known cards are Jokers/Red Kings — still swap with highest
    if (worstIdx >= 0) return { type: 'swap', cardIdx: worstIdx };
  }

  // One-eyed king: always swap with worst card
  if (isOneEyedKing(drawnCard)) {
    if (worstIdx >= 0 && worstVal > 0) {
      return { type: 'swap', cardIdx: worstIdx };
    }
    if (unknownIndices.length > 0) {
      return { type: 'swap', cardIdx: unknownIndices[Math.floor(Math.random() * unknownIndices.length)] };
    }
  }

  // Low value cards (1-4): swap if we have worse
  if (drawnValue <= 4) {
    if (worstIdx >= 0 && worstVal > drawnValue) {
      return { type: 'swap', cardIdx: worstIdx };
    }
    if (unknownIndices.length > 0 && Math.random() < 0.5) {
      return { type: 'swap', cardIdx: unknownIndices[Math.floor(Math.random() * unknownIndices.length)] };
    }
  }

  // Medium value (5-6): swap only with known worse
  if (drawnValue <= 6 && worstIdx >= 0 && worstVal > drawnValue + 2) {
    return { type: 'swap', cardIdx: worstIdx };
  }

  // Power cards: use power if drawn from deck
  if (fromDeck && isPowerCard(drawnCard)) {
    const powerType = getPowerType(drawnCard);

    if (powerType === 'peek_self' && unknownIndices.length > 0) {
      return { type: 'power' };
    }
    if (powerType === 'peek_other') {
      // Check if there are unknown opponent cards
      for (let p = 0; p < state.numPlayers; p++) {
        if (p === pIdx) continue;
        for (let c = 0; c < state.players[p].cards.length; c++) {
          if (!state.players[p].cards[c]) continue;
          if (!mem.has(p + '-' + c)) return { type: 'power' };
        }
      }
    }
    if (powerType === 'swap_cards') {
      // Use if we know an opponent has a low card we want
      if (Math.random() < 0.4) return { type: 'power' };
    }
    if (powerType === 'spy_and_swap') {
      // Use the spy & swap if we have unknown cards or known high cards
      if (unknownIndices.length > 0 || worstVal >= 7) return { type: 'power' };
      if (Math.random() < 0.3) return { type: 'power' };
    }
  }

  // High value (7+): discard unless we have known worse
  if (worstIdx >= 0 && worstVal > drawnValue + 3) {
    return { type: 'swap', cardIdx: worstIdx };
  }

  return { type: 'discard' };
}

async function aiUsePower(pIdx, card) {
  const powerType = getPowerType(card);
  const player = state.players[pIdx];
  const mem = state.aiMemory[pIdx];

  if (powerType === 'peek_self') {
    // Peek at an unknown own card
    const unknowns = [];
    for (let c = 0; c < player.cards.length; c++) {
      if (!player.cards[c]) continue;
      if (!mem.has(pIdx + '-' + c)) unknowns.push(c);
    }
    if (unknowns.length > 0) {
      const cIdx = unknowns[Math.floor(Math.random() * unknowns.length)];
      const peeked = player.cards[cIdx];
      setMemory(pIdx, pIdx, cIdx, peeked);
      addLog(player.name + ' peeked at ' + ownPosDesc(pIdx, cIdx) + '.');
      state.message = player.name + ' peeked at ' + ownPosDesc(pIdx, cIdx) + '.';
      await flashAiHighlight(pIdx + '-' + cIdx, 2000);
    }
  } else if (powerType === 'peek_other') {
    // Peek at an unknown opponent card
    const targets = [];
    for (let p = 0; p < state.numPlayers; p++) {
      if (p === pIdx) continue;
      for (let c = 0; c < state.players[p].cards.length; c++) {
        if (!state.players[p].cards[c]) continue;
        if (!mem.has(p + '-' + c)) targets.push({ p, c });
      }
    }
    if (targets.length > 0) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      const peeked = state.players[t.p].cards[t.c];
      setMemory(pIdx, t.p, t.c, peeked);
      addLog(player.name + ' peeked at ' + cardPosDesc(t.p, t.c) + '.');
      state.message = player.name + ' peeked at ' + cardPosDesc(t.p, t.c) + '.';
      await flashAiHighlight(t.p + '-' + t.c, 2000);
    }
  } else if (powerType === 'swap_cards') {
    // Try to swap a known high own card with a known low opponent card
    let bestSwap = null;
    let bestBenefit = 0;

    for (let c = 0; c < player.cards.length; c++) {
      if (!player.cards[c]) continue;
      const ownKey = pIdx + '-' + c;
      const ownKnown = mem.get(ownKey);
      if (!ownKnown) continue;
      if (ownKnown.rank === 'Joker') continue; // Never swap away a Joker
      const ownVal = getCardValue(ownKnown);

      for (let p = 0; p < state.numPlayers; p++) {
        if (p === pIdx) continue;
        for (let oc = 0; oc < state.players[p].cards.length; oc++) {
          if (!state.players[p].cards[oc]) continue;
          const otherKey = p + '-' + oc;
          const otherKnown = mem.get(otherKey);
          if (!otherKnown) continue;
          const otherVal = getCardValue(otherKnown);

          const benefit = ownVal - otherVal;
          if (benefit > bestBenefit) {
            bestBenefit = benefit;
            bestSwap = { p1: pIdx, c1: c, p2: p, c2: oc };
          }
        }
      }
    }

    if (bestSwap && bestBenefit >= 4) {
      // Perform the swap
      const card1 = state.players[bestSwap.p1].cards[bestSwap.c1];
      const card2 = state.players[bestSwap.p2].cards[bestSwap.c2];
      state.players[bestSwap.p1].cards[bestSwap.c1] = card2;
      state.players[bestSwap.p2].cards[bestSwap.c2] = card1;

      // Update all AI memories
      const key1 = bestSwap.p1 + '-' + bestSwap.c1;
      const key2 = bestSwap.p2 + '-' + bestSwap.c2;
      for (let ai = 0; ai < state.numPlayers; ai++) {
        const m1 = state.aiMemory[ai].get(key1);
        const m2 = state.aiMemory[ai].get(key2);
        state.aiMemory[ai].delete(key1);
        state.aiMemory[ai].delete(key2);
        if (m1) state.aiMemory[ai].set(key2, m1);
        if (m2) state.aiMemory[ai].set(key1, m2);
      }
      // Update human memory
      const hm1 = state.humanMemory.get(key1);
      const hm2 = state.humanMemory.get(key2);
      state.humanMemory.delete(key1);
      state.humanMemory.delete(key2);
      if (hm1) state.humanMemory.set(key2, hm1);
      if (hm2) state.humanMemory.set(key1, hm2);

      addLog(player.name + ' swapped ' + ownPosDesc(pIdx, bestSwap.c1) + ' with ' + cardPosDesc(bestSwap.p2, bestSwap.c2) + '!');
      state.message = player.name + ' swapped ' + ownPosDesc(pIdx, bestSwap.c1) + ' with ' + cardPosDesc(bestSwap.p2, bestSwap.c2) + '!';
      await flashAiHighlight([key1, key2], 2500);
    } else {
      // No beneficial cross-player swap available — skip the power
      addLog(player.name + ' found no useful swap and skipped the power.');
      state.message = player.name + ' chose not to swap.';
      render();
      await delay(2000);
    }
  }

  if (powerType === 'spy_and_swap') {
    await aiUseBlackKingPower(pIdx);
  }

  render();
}

async function aiUseBlackKingPower(pIdx) {
  const player = state.players[pIdx];
  const mem = state.aiMemory[pIdx];

  // Step 1: Select one own card and one opponent card
  // Prefer: own card = unknown or known high; opponent card = unknown or known low
  const ownCards = nonNullCardIndices(pIdx);
  const oppCards = [];
  for (let p = 0; p < state.numPlayers; p++) {
    if (p === pIdx) continue;
    for (let c = 0; c < state.players[p].cards.length; c++) {
      if (state.players[p].cards[c]) oppCards.push({ p, c });
    }
  }
  if (ownCards.length === 0 || oppCards.length === 0) return;

  // Pick own card: prefer unknown, then highest known (never pick a known Joker)
  let ownIdx;
  const ownUnknowns = ownCards.filter(c => !mem.has(pIdx + '-' + c));
  if (ownUnknowns.length > 0) {
    ownIdx = ownUnknowns[Math.floor(Math.random() * ownUnknowns.length)];
  } else {
    // Pick the highest valued known card, excluding Jokers
    let bestIdx = ownCards[0];
    let bestVal = -Infinity;
    for (const ci of ownCards) {
      const known = mem.get(pIdx + '-' + ci);
      if (known && known.rank === 'Joker') continue;
      const val = known ? getCardValue(known) : 0;
      if (val > bestVal) { bestVal = val; bestIdx = ci; }
    }
    ownIdx = bestIdx;
  }

  // Pick opponent card: prefer unknown, then lowest known
  let oppTarget;
  const oppUnknowns = oppCards.filter(t => !mem.has(t.p + '-' + t.c));
  if (oppUnknowns.length > 0) {
    oppTarget = oppUnknowns[Math.floor(Math.random() * oppUnknowns.length)];
  } else {
    let bestTarget = oppCards[0];
    let bestVal = Infinity;
    for (const t of oppCards) {
      const known = mem.get(t.p + '-' + t.c);
      const val = known ? getCardValue(known) : 7;
      if (val < bestVal) { bestVal = val; bestTarget = t; }
    }
    oppTarget = bestTarget;
  }

  const ownKey = pIdx + '-' + ownIdx;
  const oppKey = oppTarget.p + '-' + oppTarget.c;
  const oppPlayerName = oppTarget.p === 0 ? 'your' : state.players[oppTarget.p].name + "'s";

  addLog(player.name + ' selected ' + ownPosDesc(pIdx, ownIdx) + ' and ' + cardPosDesc(oppTarget.p, oppTarget.c) + ' for Spy & Swap.');
  state.message = player.name + ' is using Spy & Swap...';
  await flashAiHighlight([ownKey, oppKey], 2000);

  // Step 2: Decide which card to peek at
  // Peek at the unknown one; if both known or both unknown, peek at opponent's
  const ownKnown = mem.has(ownKey);
  const oppKnown = mem.has(oppKey);
  let peekOwn;
  if (!ownKnown && oppKnown) {
    peekOwn = true;
  } else if (ownKnown && !oppKnown) {
    peekOwn = false;
  } else {
    // Both unknown or both known - peek at opponent's card to gain info
    peekOwn = false;
  }

  const peekTarget = peekOwn ? { p: pIdx, c: ownIdx } : { p: oppTarget.p, c: oppTarget.c };
  const peekedCard = state.players[peekTarget.p].cards[peekTarget.c];
  if (peekedCard) {
    setMemory(pIdx, peekTarget.p, peekTarget.c, peekedCard);
  }

  const peekDesc = peekTarget.p === pIdx ? ownPosDesc(pIdx, peekTarget.c) : cardPosDesc(peekTarget.p, peekTarget.c);
  addLog(player.name + ' peeked at ' + peekDesc + '.');
  state.message = player.name + ' peeked at ' + peekDesc + '.';
  await flashAiHighlight(peekTarget.p + '-' + peekTarget.c, 2000);

  // Step 3: Decide whether to swap
  // Get the values (now known after peek)
  const ownCardObj = state.players[pIdx].cards[ownIdx];
  const oppCardObj = state.players[oppTarget.p].cards[oppTarget.c];
  const ownMem = mem.get(ownKey);
  const oppMem = mem.get(oppKey);
  const ownVal = ownMem ? getCardValue(ownMem) : (ownCardObj ? getCardValue(ownCardObj) : 7);
  const oppVal = oppMem ? getCardValue(oppMem) : (oppCardObj ? getCardValue(oppCardObj) : 7);

  // Swap if opponent's card is lower (better for AI) and the difference is meaningful
  const shouldSwap = oppVal < ownVal - 1;

  if (shouldSwap && ownCardObj && oppCardObj) {
    state.players[pIdx].cards[ownIdx] = oppCardObj;
    state.players[oppTarget.p].cards[oppTarget.c] = ownCardObj;

    // Update all memories
    for (let ai = 0; ai < state.numPlayers; ai++) {
      const m1 = state.aiMemory[ai].get(ownKey);
      const m2 = state.aiMemory[ai].get(oppKey);
      state.aiMemory[ai].delete(ownKey);
      state.aiMemory[ai].delete(oppKey);
      if (m1) state.aiMemory[ai].set(oppKey, m1);
      if (m2) state.aiMemory[ai].set(ownKey, m2);
    }
    const hm1 = state.humanMemory.get(ownKey);
    const hm2 = state.humanMemory.get(oppKey);
    state.humanMemory.delete(ownKey);
    state.humanMemory.delete(oppKey);
    if (hm1) state.humanMemory.set(oppKey, hm1);
    if (hm2) state.humanMemory.set(ownKey, hm2);

    addLog(player.name + ' swapped ' + ownPosDesc(pIdx, ownIdx) + ' with ' + cardPosDesc(oppTarget.p, oppTarget.c) + '!');
    state.message = player.name + ' swapped ' + ownPosDesc(pIdx, ownIdx) + ' with ' + cardPosDesc(oppTarget.p, oppTarget.c) + '!';
    await flashAiHighlight([ownKey, oppKey], 2500);
  } else {
    addLog(player.name + ' chose not to swap.');
    state.message = player.name + ' chose not to swap.';
    render();
    await delay(2000);
  }
}

// ---- Screen Management ----
function showStartScreen() {
  resetState();
  match.totalRounds = 1;
  match.currentRound = 0;
  match.matchTotals = [];
  match.roundHistory = [];
  document.getElementById('start-screen').style.display = '';
  document.getElementById('game-screen').style.display = 'none';
  const existing = document.querySelector('.game-over-overlay');
  if (existing) existing.remove();
}

function showGameScreen() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = '';
}

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const playerCount = document.getElementById('player-count');
  const memoryAid = document.getElementById('memory-aid');
  const roundCount = document.getElementById('round-count');
  const customRounds = document.getElementById('custom-rounds');
  roundCount.addEventListener('change', () => {
    customRounds.style.display = roundCount.value === 'custom' ? 'inline-block' : 'none';
  });

  startBtn.addEventListener('click', () => {
    const numPlayers = parseInt(playerCount.value);
    showMemoryAids = memoryAid.checked;
    let totalRounds = 1;
    if (roundCount.value === 'custom') {
      totalRounds = Math.max(1, Math.min(99, parseInt(customRounds.value) || 1));
    } else {
      totalRounds = parseInt(roundCount.value);
    }
    showGameScreen();
    startMatch(numPlayers, totalRounds);
  });

});
