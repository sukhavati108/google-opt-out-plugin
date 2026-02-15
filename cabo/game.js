// ==========================================
// CABO Card Game
// ==========================================

// ---- Constants ----
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const RED_SUITS = new Set(['hearts', 'diamonds']);
const AI_NAMES = ['Alice', 'Bob', 'Carol'];

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
  if (card.rank === 'A') return 1;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return card.suit === 'diamonds' ? 0 : 13;
  return parseInt(card.rank);
}

function cardName(card) {
  if (!card) return '?';
  return card.rank + SUIT_SYMBOLS[card.suit];
}

function isOneEyedKing(card) {
  return card && card.rank === 'K' && card.suit === 'diamonds';
}

function isPowerCard(card) {
  if (!card) return false;
  return ['7','8','9','10','J','Q'].indexOf(card.rank) !== -1;
}

function getPowerType(card) {
  if (!card) return null;
  if (card.rank === '7' || card.rank === '8') return 'peek_self';
  if (card.rank === '9' || card.rank === '10') return 'peek_other';
  if (card.rank === 'J' || card.rank === 'Q') return 'swap_cards';
  return null;
}

function getPowerDescription(card) {
  const type = getPowerType(card);
  if (type === 'peek_self') return 'Peek at one of your own cards';
  if (type === 'peek_other') return "Peek at an opponent's card";
  if (type === 'swap_cards') return 'Swap any two cards on the table';
  return '';
}

function isRedSuit(suit) {
  return RED_SUITS.has(suit);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  pendingGives: [],
  powerSwapFirst: null,
  peekReveal: null, // {pIdx, cIdx} - card to temporarily show face-up
  message: '',
  log: [],
  humanMemory: new Map(),
  aiMemory: [],
  gameOver: false,
  scores: [],
  aiProcessing: false,
  turnLock: false,
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
  state.pendingGives = [];
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
    return { playerIndex: i, name: p.name, score: total, cards };
  });
  state.scores.sort((a, b) => a.score - b.score);
  return state.scores;
}

function endGame() {
  state.gameOver = true;
  state.phase = 'game_over';
  calculateScores();
  state.message = 'Game Over!';
  addLog('Game over! Final scores calculated.');
  render();
}

function nextTurn() {
  if (checkGameEnd()) {
    endGame();
    return;
  }

  if (state.caboCallerIndex !== null) {
    state.turnsUntilEnd--;
    if (state.turnsUntilEnd <= 0) {
      endGame();
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
      endGame();
      return;
    }
  }

  // Reset turn state
  state.drawnCard = null;
  state.drawnFrom = null;
  state.selectedCards.clear();
  state.pendingGives = [];
  state.powerSwapFirst = null;
  state.peekReveal = null;
  state.turnLock = false;

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
  if (state.caboCallerIndex !== null) {
    // Cabo already called, just proceed to next turn
    state.message = msg || 'Done.';
    render();
    setTimeout(() => nextTurn(), 600);
    return;
  }
  state.phase = 'turn_end';
  state.message = msg ? msg + ' End your turn or call Cabo.' : 'End your turn or call Cabo.';
  render();
}

function returnToDrawDecision(msg) {
  state.phase = 'draw_decision';
  state.message = msg || 'You drew ' + cardName(state.drawnCard) + '. What will you do?';
  render();
}

// ---- UI Rendering ----
function render() {
  if (state.phase === 'start') return;
  renderOpponents();
  renderTable();
  renderPlayer();
  renderMessage();
  renderActions();
  renderLog();
  if (state.phase === 'game_over') renderGameOver();
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
    div.classList.add(isRedSuit(card.suit) ? 'card-red' : 'card-black');

    const topCorner = document.createElement('div');
    topCorner.className = 'card-corner card-corner-top';
    topCorner.textContent = card.rank + SUIT_SYMBOLS[card.suit];

    const center = document.createElement('div');
    center.className = 'card-center';
    center.textContent = SUIT_SYMBOLS[card.suit];

    const bottomCorner = document.createElement('div');
    bottomCorner.className = 'card-corner card-corner-bottom';
    bottomCorner.textContent = card.rank + SUIT_SYMBOLS[card.suit];

    div.appendChild(topCorner);
    div.appendChild(center);
    div.appendChild(bottomCorner);
  } else {
    div.classList.add('card-face-down');
    const pattern = document.createElement('div');
    pattern.className = 'card-back-pattern';
    div.appendChild(pattern);
  }

  if (opts.clickable) div.classList.add('card-clickable');
  if (opts.selected) div.classList.add('card-selected');
  if (opts.highlight === 'success') div.classList.add('card-highlight-success');
  if (opts.highlight === 'fail') div.classList.add('card-highlight-fail');
  if (opts.highlight === 'peek') div.classList.add('card-peek');

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

      if (state.phase === 'match_select') clickable = true;
      if (state.phase === 'peek_other') clickable = true;
      if (state.phase === 'swap_cards_1' || state.phase === 'swap_cards_2') clickable = true;

      const highlight = isPeekRevealed ? 'peek' : null;
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
    if (state.phase === 'match_select') clickable = true;
    if (state.phase === 'match_give') clickable = true;
    if (state.phase === 'peek_self') clickable = true;
    if (state.phase === 'swap_cards_1' || state.phase === 'swap_cards_2') clickable = true;

    const highlight = isPeekRevealed ? 'peek' : null;
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
        setTimeout(() => nextTurn(), 1500);
      });
    }
  }

  if (state.phase === 'draw_decision') {
    addButton(area, 'Swap with my card', 'btn btn-secondary', () => {
      state.phase = 'swap_select';
      state.message = 'Click one of your cards to swap with ' + cardName(state.drawnCard) + '.';
      render();
    });

    addButton(area, 'Match', 'btn btn-secondary', () => {
      state.phase = 'match_select';
      state.selectedCards.clear();
      state.message = 'Select cards that are ' + state.drawnCard.rank + 's, then Confirm.';
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

  if (state.phase === 'match_select') {
    addButton(area, 'Confirm Matches', 'btn btn-primary', () => {
      resolveMatches();
    });
    addButton(area, 'Cancel', 'btn btn-secondary', () => {
      state.phase = 'draw_decision';
      state.selectedCards.clear();
      state.message = 'You drew ' + cardName(state.drawnCard) + '. What will you do?';
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
}

function addButton(container, text, className, handler) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className = className;
  btn.addEventListener('click', handler);
  container.appendChild(btn);
}

function renderLog() {
  const logContent = document.getElementById('log-content');
  logContent.innerHTML = '';
  for (const entry of state.log) {
    const div = document.createElement('div');
    div.textContent = entry;
    logContent.appendChild(div);
  }
  logContent.scrollTop = logContent.scrollHeight;
}

function renderGameOver() {
  // Remove any existing overlay
  const existing = document.querySelector('.game-over-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';

  const content = document.createElement('div');
  content.className = 'game-over-content';

  const h2 = document.createElement('h2');
  const winner = state.scores[0];
  h2.textContent = winner.playerIndex === 0 ? 'You Win!' : winner.name + ' Wins!';
  content.appendChild(h2);

  const table = document.createElement('table');
  table.className = 'score-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Player</th><th>Score</th><th>Cards</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const s of state.scores) {
    const tr = document.createElement('tr');
    if (s === winner) tr.className = 'winner';

    const tdName = document.createElement('td');
    tdName.textContent = s.name;
    if (state.caboCallerIndex === s.playerIndex) tdName.textContent += ' (Cabo)';

    const tdScore = document.createElement('td');
    tdScore.textContent = s.score;

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
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  content.appendChild(table);

  addButton(content, 'New Game', 'btn btn-primary', () => {
    overlay.remove();
    showStartScreen();
  });

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

  if (state.phase === 'match_select') {
    const key = pIdx + '-' + cIdx;
    if (state.selectedCards.has(key)) {
      state.selectedCards.delete(key);
    } else {
      state.selectedCards.add(key);
    }
    render();
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

function resolveMatches() {
  if (state.selectedCards.size === 0) {
    state.message = 'No cards selected. Select matching cards or Cancel.';
    render();
    return;
  }

  const drawnRank = state.drawnCard.rank;
  const results = [];
  const correctOwn = [];
  const correctOther = [];
  const wrong = [];

  for (const key of state.selectedCards) {
    const [pStr, cStr] = key.split('-');
    const pIdx = parseInt(pStr);
    const cIdx = parseInt(cStr);
    const card = state.players[pIdx].cards[cIdx];
    if (!card) continue;

    if (card.rank === drawnRank) {
      results.push({ pIdx, cIdx, card, correct: true });
      if (pIdx === 0) correctOwn.push({ pIdx, cIdx, card });
      else correctOther.push({ pIdx, cIdx, card });
    } else {
      results.push({ pIdx, cIdx, card, correct: false });
      wrong.push({ pIdx, cIdx, card });
    }
  }

  // Process correct own matches: remove cards
  for (const m of correctOwn) {
    state.players[m.pIdx].cards[m.cIdx] = null;
    clearMemoryAt(m.pIdx, m.cIdx);
    addLog('Matched your ' + cardName(m.card) + '! Card removed.');
  }

  // Process wrong matches: penalty cards
  for (const m of wrong) {
    addLog('Wrong! ' + cardName(m.card) + ' is not a ' + drawnRank + '. Penalty card!');
    const penalty = drawFromDeck();
    if (penalty) {
      // Add penalty card to human player's hand
      state.players[0].cards.push(penalty);
      // Don't let the player see it
    }
  }

  // Process correct other matches: need to give cards
  if (correctOther.length > 0) {
    // Remove matched opponent cards, queue gives
    for (const m of correctOther) {
      state.players[m.pIdx].cards[m.cIdx] = null;
      clearMemoryAt(m.pIdx, m.cIdx);
      addLog('Matched ' + state.players[m.pIdx].name + "'s " + cardName(m.card) + '!');
      state.pendingGives.push({ pIdx: m.pIdx, cIdx: m.cIdx });
    }

    // Start giving cards (drawn card stays in hand)
    processNextGive();
    return;
  }

  // No opponent matches, return to draw_decision with card still in hand
  let msg = 'Matching done. ';
  msg += correctOwn.length + ' matched';
  if (wrong.length > 0) msg += ', ' + wrong.length + ' penalty card(s)';
  msg += '. Now swap, discard, or use your drawn card.';

  state.selectedCards.clear();
  returnToDrawDecision(msg);
}

function processNextGive() {
  if (state.pendingGives.length === 0) {
    state.selectedCards.clear();
    returnToDrawDecision('All matches resolved! Now swap, discard, or use your drawn card.');
    return;
  }

  const give = state.pendingGives[0];
  const ownCards = nonNullCardIndices(0);
  if (ownCards.length === 0) {
    // No cards to give, skip
    state.pendingGives.shift();
    processNextGive();
    return;
  }

  state.phase = 'match_give';
  state.message = 'Choose one of your cards to give to ' + state.players[give.pIdx].name + '.';
  render();
}

function performGiveCard(cIdx) {
  if (state.pendingGives.length === 0) return;
  const card = state.players[0].cards[cIdx];
  if (!card) return;

  const give = state.pendingGives.shift();

  // Move card from human to opponent's empty slot
  state.players[give.pIdx].cards[give.cIdx] = card;
  state.players[0].cards[cIdx] = null;

  // Nobody sees the replacement
  clearMemoryAt(give.pIdx, give.cIdx);
  clearMemoryAt(0, cIdx);

  addLog('You gave a card to ' + state.players[give.pIdx].name + '.');

  processNextGive();
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

// ---- AI Logic ----
async function runAiTurn(pIdx) {
  const player = state.players[pIdx];
  const aiMem = state.aiMemory[pIdx];

  state.message = player.name + ' is thinking...';
  render();
  await delay(800);

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
  await delay(1000);

  // If taken from discard, always swap with the intended card
  if (!fromDeck) {
    const swapIdx = findAiDiscardSwapTarget(pIdx, drawnCard);
    if (swapIdx >= 0) {
      const oldCard = player.cards[swapIdx];
      player.cards[swapIdx] = drawnCard;
      setMemory(pIdx, pIdx, swapIdx, drawnCard);
      discardCard(oldCard);
      addLog(player.name + ' swapped a card. Discarded ' + cardName(oldCard) + '.');
      state.message = player.name + ' swapped a card. Discarded ' + cardName(oldCard) + '.';
    } else {
      discardCard(drawnCard);
      addLog(player.name + ' discarded ' + cardName(drawnCard) + '.');
      state.message = player.name + ' discarded ' + cardName(drawnCard) + '.';
    }
    state.drawnCard = null;
  } else {
    // Try matching first (only for deck draws)
    const matchTargets = findAiMatchTargets(pIdx, drawnCard);
    if (matchTargets.length > 0) {
      await aiPerformMatch(pIdx, drawnCard, matchTargets);
      state.drawnCard = null;
    } else {
      // Decide what to do with drawn card (deck draw)
      const action = decideAiAction(pIdx, drawnCard, fromDeck);

      if (action.type === 'swap') {
        const oldCard = player.cards[action.cardIdx];
        player.cards[action.cardIdx] = drawnCard;
        setMemory(pIdx, pIdx, action.cardIdx, drawnCard);
        discardCard(oldCard);
        addLog(player.name + ' swapped a card. Discarded ' + cardName(oldCard) + '.');
        state.message = player.name + ' swapped a card. Discarded ' + cardName(oldCard) + '.';
      } else if (action.type === 'power') {
        discardCard(drawnCard);
        addLog(player.name + ' used ' + cardName(drawnCard) + "'s power.");
        state.message = player.name + ' used ' + cardName(drawnCard) + "'s power.";
        render();
        await delay(800);
        await aiUsePower(pIdx, drawnCard);
      } else {
        discardCard(drawnCard);
        addLog(player.name + ' discarded ' + cardName(drawnCard) + '.');
        state.message = player.name + ' discarded ' + cardName(drawnCard) + '.';
      }
      state.drawnCard = null;
    }
  }

  // After action: check if AI wants to call Cabo
  render();
  await delay(800);

  if (state.caboCallerIndex === null && shouldAiCallCabo(pIdx)) {
    state.caboCallerIndex = pIdx;
    state.turnsUntilEnd = state.numPlayers;
    state.message = player.name + ' called CABO!';
    addLog(player.name + ' called CABO!');
    render();
    await delay(1500);
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
  await delay(800);

  for (const t of targets) {
    const card = state.players[t.pIdx].cards[t.cIdx];
    if (!card) continue;

    if (card.rank === drawnCard.rank) {
      // Correct match
      addLog(player.name + ' matched ' + (t.pIdx === pIdx ? 'their own' : state.players[t.pIdx].name + "'s") + ' ' + cardName(card) + '!');

      if (t.pIdx === pIdx) {
        // Own card: just remove it
        state.players[t.pIdx].cards[t.cIdx] = null;
        clearMemoryAt(t.pIdx, t.cIdx);
      } else {
        // Opponent's card: remove and give a replacement
        state.players[t.pIdx].cards[t.cIdx] = null;
        clearMemoryAt(t.pIdx, t.cIdx);

        // Give worst card from own hand
        const ownCards = nonNullCardIndices(pIdx);
        if (ownCards.length > 0) {
          let worstIdx = ownCards[0];
          let worstVal = -1;
          for (const ci of ownCards) {
            const key = pIdx + '-' + ci;
            const known = state.aiMemory[pIdx].get(key);
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
        }
      }
    }
    await delay(500);
  }

  discardCard(drawnCard);
}

function decideAiAction(pIdx, drawnCard, fromDeck) {
  const mem = state.aiMemory[pIdx];
  const cards = state.players[pIdx].cards;
  const drawnValue = getCardValue(drawnCard);

  // Find worst known card
  let worstIdx = -1;
  let worstVal = -1;
  let unknownIndices = [];

  for (let c = 0; c < cards.length; c++) {
    if (!cards[c]) continue;
    const key = pIdx + '-' + c;
    const known = mem.get(key);
    if (known) {
      const val = getCardValue(known);
      if (val > worstVal) {
        worstVal = val;
        worstIdx = c;
      }
    } else {
      unknownIndices.push(c);
    }
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
      addLog(player.name + ' peeked at one of their own cards.');
      state.message = player.name + ' peeked at one of their own cards.';
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
      const targetName = t.p === 0 ? 'your' : state.players[t.p].name + "'s";
      addLog(player.name + ' peeked at ' + targetName + ' card.');
      state.message = player.name + ' peeked at one of ' + targetName + ' cards.';
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

      const name2 = bestSwap.p2 === 0 ? 'your' : state.players[bestSwap.p2].name + "'s";
      addLog(player.name + ' swapped their card with ' + name2 + ' card!');
      state.message = player.name + ' swapped their card with ' + name2 + ' card!';
    } else {
      // Random swap or skip
      addLog(player.name + ' swapped two cards on the table.');
      state.message = player.name + ' swapped two cards randomly.';

      // Do a random swap
      const allPositions = [];
      for (let p = 0; p < state.numPlayers; p++) {
        for (let c = 0; c < state.players[p].cards.length; c++) {
          if (state.players[p].cards[c]) allPositions.push({ p, c });
        }
      }
      if (allPositions.length >= 2) {
        const i1 = Math.floor(Math.random() * allPositions.length);
        let i2 = Math.floor(Math.random() * (allPositions.length - 1));
        if (i2 >= i1) i2++;
        const pos1 = allPositions[i1];
        const pos2 = allPositions[i2];

        const c1 = state.players[pos1.p].cards[pos1.c];
        const c2 = state.players[pos2.p].cards[pos2.c];
        state.players[pos1.p].cards[pos1.c] = c2;
        state.players[pos2.p].cards[pos2.c] = c1;

        const k1 = pos1.p + '-' + pos1.c;
        const k2 = pos2.p + '-' + pos2.c;
        for (let ai = 0; ai < state.numPlayers; ai++) {
          const m1 = state.aiMemory[ai].get(k1);
          const m2 = state.aiMemory[ai].get(k2);
          state.aiMemory[ai].delete(k1);
          state.aiMemory[ai].delete(k2);
          if (m1) state.aiMemory[ai].set(k2, m1);
          if (m2) state.aiMemory[ai].set(k1, m2);
        }
        const hm1 = state.humanMemory.get(k1);
        const hm2 = state.humanMemory.get(k2);
        state.humanMemory.delete(k1);
        state.humanMemory.delete(k2);
        if (hm1) state.humanMemory.set(k2, hm1);
        if (hm2) state.humanMemory.set(k1, hm2);
      }
    }
  }

  render();
}

// ---- Screen Management ----
function showStartScreen() {
  resetState();
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
  const logToggle = document.getElementById('log-toggle');
  const logContent = document.getElementById('log-content');

  startBtn.addEventListener('click', () => {
    const numPlayers = parseInt(playerCount.value);
    showMemoryAids = memoryAid.checked;
    showGameScreen();
    initGame(numPlayers);
    render();
  });

  logToggle.addEventListener('click', () => {
    if (logContent.style.display === 'none') {
      logContent.style.display = '';
      logToggle.textContent = 'Hide Log';
    } else {
      logContent.style.display = 'none';
      logToggle.textContent = 'Game Log';
    }
  });
});
