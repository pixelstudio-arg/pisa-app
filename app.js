'use strict';
/* Pisa — app de carta, pedidos y gestión (demo).
   Sin backend: el estado vive en localStorage y se sincroniza entre pestañas
   con el evento "storage". Cliente: index.html?mesa=7 · Gestión: index.html#admin */

// ───────────────────────── utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Math.round(n || 0).toLocaleString('es-AR');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hhmm = ts => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const ago = ts => { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`; };
const isToday = ts => new Date(ts).toDateString() === new Date().toDateString();

const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('No se pudo guardar (almacenamiento lleno)'); } },
};
const K = { menu: 'pisa_menu', custom: 'pisa_custom', orders: 'pisa_orders', calls: 'pisa_calls' };
// datos internos del local (stock, proveedores, pedidos a proveedores): solo los lee y escribe el dueño logueado
const KP = { stock: 'pisa_stock', prov: 'pisa_prov', porders: 'pisa_porders' };
const PRIV_KEYS = Object.values(KP);
const CFG = typeof PISA_CONFIG !== 'undefined' ? PISA_CONFIG : {};

// ───────────────────────── sincronización (Firebase Realtime Database, opcional)
// localStorage es la copia local que lee toda la app; si hay Firebase configurado,
// cada registro se escribe también en /pisa/<clave>/<id> y los cambios remotos
// se vuelcan a localStorage y disparan el mismo refresco que entre pestañas.
let REMOTE = null, AUTH = null, online = false, authReady = false, remoteFailed = false;
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
async function initRemote() {
  const cfg = CFG.firebase;
  if (!cfg || !cfg.databaseURL) return;
  try {
    const v = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(v + 'firebase-app-compat.js');
    await loadScript(v + 'firebase-database-compat.js');
    await loadScript(v + 'firebase-auth-compat.js');
    const db = firebase.initializeApp(cfg).database();
    AUTH = firebase.auth();
    PRIV = db.ref('pisa_priv');
    AUTH.onAuthStateChanged(u => { authReady = true; privSync(u); if (isAdmin()) boot(); });
    REMOTE = db.ref('pisa');
    Object.values(K).forEach(k => REMOTE.child(k).on('value', s => applyRemote(k, s.val())));
    db.ref('.info/connected').on('value', s => { online = !!s.val(); netState(); });
  } catch { remoteFailed = true; if (isAdmin()) boot(); else toast('Sin conexión con el servidor. Revisá internet.'); }
  netState();
}
function netState() {
  const n = $('#netstate'); if (!n) return;
  n.className = 'net ' + (REMOTE ? (online ? 'on' : 'off') : 'local');
  n.textContent = REMOTE ? (online ? 'En línea' : 'Sin conexión') : 'Modo local';
}
function applyRemote(k, val) {
  const next = k === K.menu ? (val || {}) : Object.values(val || {}).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const nv = JSON.stringify(next), ov = localStorage.getItem(k) ?? (k === K.menu ? '{}' : '[]');
  if (nv === ov) return;
  localStorage.setItem(k, nv);
  onExternalChange(k, ov, nv);
}
let PRIV = null, privOn = false;
function privSync(u) { // los datos privados solo se descargan con sesión iniciada y se borran del equipo al salir
  if (u && !privOn) { privOn = true; PRIV_KEYS.forEach(k => PRIV.child(k).on('value', s => applyRemote(k, s.val()), () => {})); }
  else if (!u) { if (privOn) PRIV_KEYS.forEach(k => PRIV.child(k).off()); privOn = false; PRIV_KEYS.forEach(k => localStorage.removeItem(k)); }
}
function remotePut(k, id, val) {
  const ref = PRIV_KEYS.includes(k) ? PRIV : REMOTE;
  if (ref) ref.child(k + '/' + id).set(val).catch(() => toast('No se pudo sincronizar. Revisá la conexión.'));
}
function saveRec(k, rec) {
  const a = LS.get(k, []), x = a.findIndex(r => r.id === rec.id);
  if (x < 0) a.push(rec); else a[x] = rec;
  LS.set(k, a); remotePut(k, rec.id, rec);
}
function delRec(k, id) { LS.set(k, LS.get(k, []).filter(r => r.id !== id)); remotePut(k, id, null); }

const MESA = Math.max(1, Math.min(99, parseInt(new URLSearchParams(location.search).get('mesa')) || 7));
const CART_KEY = 'pisa_cart_' + MESA;
const CAT_ONE = { entradas: 'Entrada', napoletanas: 'Napoletana', portenas: 'Porteña al molde', rellenas: 'Rellena', entrepanes: 'Entre panes', otras: 'Otras opciones', sinalcohol: 'Bebida', conalcohol: 'Bebida' };
const STAT = [
  { id: 'nuevo', label: 'Recibido', msg: 'Recibimos tu pedido' },
  { id: 'preparando', label: 'En el horno', msg: 'Tu pedido ya está en el horno 🔥' },
  { id: 'listo', label: 'Listo', msg: '¡Tu pedido está listo! Ya sale para tu mesa' },
  { id: 'entregado', label: 'En tu mesa', msg: 'Pedido entregado. ¡Buen provecho!' },
];
const CALLS = {
  mozo: { label: 'Llamar al mozo', hint: 'Se acerca a tu mesa', icon: 'bell' },
  cuenta: { label: 'Pedir la cuenta', hint: 'Elegís cómo pagar', icon: 'bill' },
  cubiertos: { label: 'Cubiertos y servilletas', hint: 'Te los llevamos', icon: 'fork' },
  otro: { label: 'Otra cosa', hint: 'Contanos qué necesitás', icon: 'chat' },
};

const ICON = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  bill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 3c-2 2-3 5-3 8h3v10"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4M12 12 4.2 7.5"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h18M5 8l1 12M19 8l-1 12M8 8v5h8V8"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};

// ───────────────────────── datos
function getMenu() {
  const ov = LS.get(K.menu, {});
  return [...ITEMS, ...LS.get(K.custom, [])].map(i => ({ ...i, ...(ov[i.id] || {}) }));
}
let MENU = getMenu();
const byId = id => MENU.find(i => i.id === id);
const hasOptions = i => !!i.ind || i.cat === 'portenas';
const getOrders = () => LS.get(K.orders, []).filter(o => o && o.id && Array.isArray(o.items) && o.items.length); // ignora registros incompletos
const getCalls = () => LS.get(K.calls, []);
let cart = (() => { try { return JSON.parse(sessionStorage.getItem(CART_KEY)) || []; } catch { return []; } })();
const saveCart = () => sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
const cartCount = () => cart.reduce((s, l) => s + l.qty, 0);
const cartTotal = () => cart.reduce((s, l) => s + l.qty * l.unit, 0);

function media(i, cls) {
  if (i.video) return `<video class="${cls}" src="${esc(i.video)}" ${i.img ? `poster="${esc(i.img)}"` : ''} autoplay muted loop playsinline></video>`;
  if (i.img) return `<img class="${cls}" src="${esc(i.img)}" alt="${esc(i.name)}" loading="lazy">`;
  return `<div class="${cls} ph"><img src="img/logo.jpg" alt="" loading="lazy"></div>`;
}

// ───────────────────────── toasts y hojas (sheets)
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}
let currentSheet = null;
function openSheet(name, html, cls = '') {
  currentSheet = name;
  const s = $('#sheet');
  s.className = cls + ' open';
  s.innerHTML = `<button class="x" data-act="close" aria-label="Cerrar">×</button><div class="sheet-scroll">${html}</div>`;
  $('#backdrop').classList.add('open');
  document.body.classList.add('lock');
}
function setSheet(html) { const sc = $('#sheet .sheet-scroll'); if (sc) sc.innerHTML = html; }
function closeSheet() {
  currentSheet = null;
  $('#sheet').classList.remove('open');
  $('#backdrop').classList.remove('open');
  document.body.classList.remove('lock');
  const v = $('#sheet video'); if (v) v.pause();
}

// ═════════════════════════ CLIENTE
let query = '', onlyVeg = false, spy = null;

function openState() {
  const d = new Date(), day = d.getDay(), h = d.getHours();
  const open = (day !== 1 && h >= 20) || (day !== 2 && h < 1);
  if (open) return { open, text: 'Abierto ahora' };
  return { open, text: day === 1 ? 'Abre el martes · 20 h' : 'Abre hoy · 20 h' };
}

function itemRow(i) {
  return `<article class="item reveal ${i.available ? '' : 'off'}" data-act="open-item" data-id="${i.id}">
    <div class="item-body">
      <h3>${esc(i.name)}${i.veg ? '<span class="veg" title="Vegetariana">V</span>' : ''}</h3>
      ${i.hot ? '<span class="hot">De las más pedidas</span>' : ''}
      ${i.desc ? `<p>${esc(i.desc)}</p>` : ''}
      <div class="price">${money(i.price)}${i.ind ? `<small>Individual ${money(i.ind)}</small>` : ''}</div>
    </div>
    <div class="item-media">${media(i, 'thumb')}${i.available
      ? `<button class="add" data-act="add" data-id="${i.id}" aria-label="Agregar ${esc(i.name)}">+</button>`
      : '<span class="soldout">Agotado</span>'}</div>
  </article>`;
}

function menuHTML() {
  const q = query.trim().toLowerCase();
  const match = i => (!onlyVeg || i.veg) && (!q || (i.name + ' ' + i.desc).toLowerCase().includes(q));
  const out = CATS.map(c => {
    const items = MENU.filter(i => i.cat === c.id && match(i));
    if (!items.length) return '';
    return `<section class="cat" id="cat-${c.id}" data-cat="${c.id}">
      <header><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></header>
      ${items.map(itemRow).join('')}
    </section>`;
  }).join('');
  return out || `<div class="empty"><img src="img/logo.jpg" alt=""><p>No encontramos nada con esa búsqueda.</p><button class="btn ghost" data-act="clear-search">Ver toda la carta</button></div>`;
}

function renderClient() {
  const st = openState();
  const feat = MENU.filter(i => i.hot && i.img && i.available);
  $('#app').innerHTML = `
  <div class="phone">
    <header class="hero">
      <div class="hero-bg" style="background-image:url(img/pepperoni.jpg)"></div>
      <div class="hero-top">
        <span class="chip solid">Mesa ${MESA}</span>
        <button class="chip" data-act="info">${ICON.pin} Info del local</button>
      </div>
      <div class="hero-brand">
        <h1 class="logo">Pisa</h1>
        <p class="tag">${esc(PISA.tagline)}</p>
        <p class="claim">Napoletana contemporánea y al molde estilo porteña. Pedí desde tu mesa.</p>
        <div class="hero-meta">
          <span class="dot ${st.open ? 'on' : ''}">${st.text}</span>
          <button class="ratebtn" data-act="reviews">★ ${String(PISA.rating).replace('.', ',')} · ${PISA.reviews} reseñas ›</button>
        </div>
      </div>
    </header>
    <div class="checker"></div>

    <section class="featured">
      <h2>Las más pedidas</h2>
      <div class="rail">${feat.map(i => `
        <button class="fcard" data-act="open-item" data-id="${i.id}">
          ${media(i, 'fimg')}
          <span class="fcat">${esc(CAT_ONE[i.cat])}</span>
          <strong>${esc(i.name)}</strong>
          <em>${money(i.ind || i.price)}</em>
        </button>`).join('')}
      </div>
    </section>

    <div class="tools">
      <div class="searchrow">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Buscar en la carta…" autocomplete="off" value="${esc(query)}"></label>
        <button class="vegbtn ${onlyVeg ? 'on' : ''}" data-act="veg" aria-pressed="${onlyVeg}">V <span>Veggie</span></button>
      </div>
      <nav class="pills" id="pills">${CATS.map(c => `<button data-act="cat" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</nav>
    </div>

    <main id="menu">${menuHTML()}</main>

    <footer class="foot">
      <div class="checker"></div>
      <p class="logo sm">Pisa</p>
      <p>${esc(PISA.address)}<br>${esc(PISA.hours)}</p>
      <p class="fine">Demo · precios según carta publicada, sujetos a confirmación.</p>
    </footer>

    <button class="cartbar" id="cartbar" data-act="cart"></button>
    <nav class="bottom">
      <button data-act="top">${ICON.menu}<span>Carta</span></button>
      <button class="bellbtn" data-act="waiter" id="bellbtn"><i>${ICON.bell}</i><span>Mozo</span></button>
      <button data-act="mesa" id="mesabtn">${ICON.table}<span>Mi mesa</span></button>
    </nav>
  </div>`;
  afterMenuRender();
  updateBars();
}

function afterMenuRender() {
  // aparición suave + scrollspy de categorías
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => io.observe(el));
  if (spy) spy.disconnect();
  spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setPill(e.target.dataset.cat); }), { rootMargin: '-140px 0px -65% 0px' });
  $$('#menu .cat').forEach(s => spy.observe(s));
  $$('#pills button').forEach(b => b.hidden = !$('#cat-' + b.dataset.cat));
}
function setPill(cat) {
  const pills = $('#pills'); if (!pills) return;
  $$('button', pills).forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
  const b = $(`button[data-cat="${cat}"]`, pills);
  if (b) pills.scrollTo({ left: b.offsetLeft - pills.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
}
function rerenderMenu() { const m = $('#menu'); if (m) { m.innerHTML = menuHTML(); afterMenuRender(); } }

function updateBars() {
  const bar = $('#cartbar'); if (!bar) return;
  const n = cartCount();
  bar.classList.toggle('show', n > 0);
  bar.innerHTML = `<b>${n}</b><span>Ver mi pedido</span><strong>${money(cartTotal())}</strong>`;
  const mine = getOrders().filter(o => o.mesa === MESA && !o.paid);
  const active = mine.filter(o => o.status !== 'entregado').length;
  $('#mesabtn').classList.toggle('badge', active > 0);
  $('#bellbtn').classList.toggle('ringing', getCalls().some(c => c.mesa === MESA && c.status === 'pendiente'));
}

// ── producto
let P = null;
function pUnit() {
  const i = byId(P.id);
  let u = P.variant === 'ind' && i.ind ? i.ind : i.price;
  if (P.half) { const h = byId(P.half); if (h) u = Math.max(u, h.price); }
  return u + P.extras.reduce((t, id) => t + (EXTRAS.find(e => e.id === id)?.price || 0), 0);
}
// ingredientes que se pueden quitar: los que define el producto (ing) o los que se leen de la descripción
function ingredients(i) {
  if (!CUSTOM_CATS.includes(i.cat)) return [];
  if (Array.isArray(i.ing)) return i.ing;
  return (i.desc || '').replace(/\.$/, '').split(/,| y | e /).map(t => t.trim())
    .filter(t => t.length > 1 && t.length <= 32 && t.split(' ').length <= 4)
    .map(t => t[0].toUpperCase() + t.slice(1));
}
const pMods = () => [...P.removed.map(n => 'Sin ' + n.toLowerCase()), ...P.extras.map(id => 'Extra ' + (EXTRAS.find(e => e.id === id)?.name || '').toLowerCase())];
function openProduct(id) {
  const i = byId(id); if (!i) return;
  P = { id, variant: 'entera', half: '', qty: 1, removed: [], extras: [] };
  openSheet('product', `
    <div class="p-media">${media(i, 'p-img')}<span class="p-badge">${esc(CAT_ONE[i.cat])}</span></div>
    <div class="p-body">
      <h2>${esc(i.name)}${i.veg ? '<span class="veg">V</span>' : ''}</h2>
      ${i.desc ? `<p class="p-desc">${esc(i.desc)}</p>` : ''}
      <div id="p-dyn"></div>
    </div>`, 'product');
  renderPDyn();
}
function renderPDyn() {
  const i = byId(P.id), box = $('#p-dyn'); if (!i || !box) return;
  const note = $('#p-note')?.value || '';
  const others = MENU.filter(x => x.cat === 'portenas' && x.id !== i.id && x.available);
  const ings = ingredients(i);
  box.innerHTML = `
    ${i.ind ? `<div class="opt-title">Tamaño</div>
      <div class="opts">
        <button class="opt ${P.variant === 'entera' ? 'on' : ''}" data-act="p-variant" data-v="entera"><span>Entera</span><b>${money(i.price)}</b></button>
        <button class="opt ${P.variant === 'ind' ? 'on' : ''}" data-act="p-variant" data-v="ind"><span>Individual</span><b>${money(i.ind)}</b></button>
      </div>` : ''}
    ${i.cat === 'portenas' ? `<div class="opt-title">¿Mitad y mitad?</div>
      <select id="p-half" class="select">
        <option value="">No, toda de ${esc(i.name)}</option>
        ${others.map(o => `<option value="${o.id}" ${P.half === o.id ? 'selected' : ''}>½ ${esc(o.name)} · ${money(o.price)}</option>`).join('')}
      </select>
      ${P.half ? '<p class="hint">Se toma el valor de la mitad de mayor precio.</p>' : ''}` : ''}
    ${ings.length ? `<div class="opt-title">Quitar ingredientes</div>
      <div class="chips">${ings.map(n => `<button class="chipbtn rm ${P.removed.includes(n) ? 'on' : ''}" data-act="p-rm" data-n="${esc(n)}" aria-pressed="${P.removed.includes(n)}">${P.removed.includes(n) ? 'Sin ' : ''}${esc(n)}</button>`).join('')}</div>` : ''}
    ${CUSTOM_CATS.includes(i.cat) ? `<div class="opt-title">Agregar extras</div>
      <div class="chips">${EXTRAS.map(e => `<button class="chipbtn ex ${P.extras.includes(e.id) ? 'on' : ''}" data-act="p-ex" data-x="${e.id}" aria-pressed="${P.extras.includes(e.id)}">+ ${esc(e.name)}<small>${e.price ? money(e.price) : ''}</small></button>`).join('')}</div>
      <p class="hint">Los extras agregan un costo adicional al pedido.</p>` : ''}
    <div class="opt-title">Aclaraciones</div>
    <textarea id="p-note" rows="2" maxlength="140" placeholder="Sin cebolla, bien cocida, para compartir…">${esc(note)}</textarea>
    <div class="p-foot">
      <div class="stepper"><button data-act="p-qty" data-d="-1" aria-label="Menos">−</button><b>${P.qty}</b><button data-act="p-qty" data-d="1" aria-label="Más">+</button></div>
      ${i.available
        ? `<button class="btn primary grow" data-act="p-add">Agregar <span>${money(pUnit() * P.qty)}</span></button>`
        : '<button class="btn grow" disabled>Agotado por hoy</button>'}
    </div>`;
}
function addLine(i, { variant = 'entera', half = '', note = '', qty = 1, unit, mods = [] } = {}) {
  const h = half ? byId(half) : null;
  const name = h ? `½ ${i.name} + ½ ${h.name}` : i.name;
  const sub = [CAT_ONE[i.cat], i.ind ? (variant === 'ind' ? 'Individual' : 'Entera') : ''].filter(Boolean).join(' · ');
  const key = [i.id, variant, half, note, mods.join(',')].join('|');
  const ex = cart.find(l => l.key === key);
  if (ex) ex.qty += qty; else cart.push({ key, id: i.id, name, sub, note, mods, qty, unit: unit ?? i.price, img: i.img || '' });
  saveCart(); updateBars();
  const bar = $('#cartbar'); bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump');
  if (navigator.vibrate) navigator.vibrate(12);
}
function fly(fromEl) {
  const bar = $('#cartbar'); if (!fromEl || !bar || !fromEl.animate) return;
  const a = fromEl.getBoundingClientRect(), b = bar.getBoundingClientRect();
  const d = document.createElement('i'); d.className = 'flydot';
  d.style.left = a.left + a.width / 2 - 9 + 'px'; d.style.top = a.top + a.height / 2 - 9 + 'px';
  document.body.appendChild(d);
  d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${b.left + 30 - a.left - a.width / 2}px,${b.top + 20 - a.top - a.height / 2}px) scale(.3)`, opacity: .4 }],
    { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' }).onfinish = () => d.remove();
}

// ── carrito / pedido
function cartHTML() {
  if (!cart.length) return `<div class="empty"><img src="img/logo.jpg" alt=""><p>Todavía no agregaste nada.</p><button class="btn ghost" data-act="close">Volver a la carta</button></div>`;
  const note = $('#c-note')?.value || '';
  return `<div class="pad">
    <h2 class="sh-title">Tu pedido <small>Mesa ${MESA}</small></h2>
    <ul class="lines">${cart.map((l, x) => `
      <li>
        <div class="l-info"><strong>${esc(l.name)}</strong><span>${esc(l.sub)}</span>${(l.mods || []).length ? `<i class="mods">${esc(l.mods.join(' · '))}</i>` : ''}${l.note ? `<em>“${esc(l.note)}”</em>` : ''}</div>
        <div class="stepper sm"><button data-act="c-qty" data-x="${x}" data-d="-1" aria-label="Menos">−</button><b>${l.qty}</b><button data-act="c-qty" data-x="${x}" data-d="1" aria-label="Más">+</button></div>
        <b class="l-price">${money(l.unit * l.qty)}</b>
      </li>`).join('')}</ul>
    <textarea id="c-note" rows="2" maxlength="160" placeholder="Nota para la cocina (opcional)">${esc(note)}</textarea>
    <div class="total"><span>Total</span><strong>${money(cartTotal())}</strong></div>
    <button class="btn primary block" data-act="send-order">Enviar pedido a cocina</button>
    <p class="hint center">Lo recibe el local al instante. Pagás al final, en la mesa.</p>
  </div>`;
}
function sendOrder() {
  if (!cart.length) return;
  const orders = getOrders();
  const o = { id: uid(), n: 101 + orders.length, mesa: MESA, items: cart, note: ($('#c-note')?.value || '').trim(), total: cartTotal(), status: 'nuevo', ts: Date.now(), paid: false };
  saveRec(K.orders, o);
  cart = []; saveCart(); updateBars(); snapshot();
  openSheet('mesa', `<div class="sent"><div class="okring">${ICON.check}</div><h2>¡Pedido enviado!</h2><p>Pedido #${o.n} · Mesa ${MESA}. Ya lo tiene la cocina.</p></div>` + mesaHTML(), 'mesa');
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
}

// ── mi mesa (seguimiento)
function stepsHTML(o) {
  const at = STAT.findIndex(s => s.id === o.status);
  return `<ol class="steps">${STAT.map((s, x) => `<li class="${x < at ? 'done' : x === at ? 'now' : ''}"><i>${x < at ? ICON.check : ''}</i><span>${s.label}</span></li>`).join('')}</ol>`;
}
function mesaHTML() {
  const mine = getOrders().filter(o => o.mesa === MESA && !o.paid).reverse();
  if (!mine.length) return `<div class="empty"><img src="img/logo.jpg" alt=""><p>Tu mesa todavía no tiene pedidos.</p><button class="btn ghost" data-act="close">Ver la carta</button></div>`;
  const total = mine.reduce((s, o) => s + o.total, 0);
  return `<div class="pad">
    <h2 class="sh-title">Mi mesa <small>Mesa ${MESA}</small></h2>
    ${mine.map(o => `<div class="ocard">
      <div class="o-head"><strong>Pedido #${o.n}</strong><span>${hhmm(o.ts)}</span></div>
      ${stepsHTML(o)}
      <ul class="o-items">${o.items.map(l => `<li><span>${l.qty}× ${esc(l.name)}${(l.mods || []).length ? `<i class="mods">${esc(l.mods.join(' · '))}</i>` : ''}</span><b>${money(l.unit * l.qty)}</b></li>`).join('')}</ul>
    </div>`).join('')}
    <div class="total"><span>Cuenta de la mesa</span><strong>${money(total)}</strong></div>
    <button class="btn primary block" data-act="call" data-type="cuenta">Pedir la cuenta</button>
    <button class="linkbtn" data-act="reviews">¿Cómo estuvo todo? Mirá o dejá tu reseña</button>
  </div>`;
}

// ── llamar al mozo
let callStep = null;
function waiterHTML() {
  const pend = getCalls().filter(c => c.mesa === MESA && c.status === 'pendiente');
  const last = getCalls().filter(c => c.mesa === MESA).slice(-1)[0];
  let top = '';
  if (pend.length) top = `<div class="callstate"><div class="bigbell">${ICON.bell}</div><h3>Ya avisamos</h3><p>${pend.map(c => esc(CALLS[c.type].label + (c.detail ? ' · ' + c.detail : ''))).join('<br>')}</p><span class="wait">Esperando al mozo…</span></div>`;
  else if (last && last.status === 'atendido' && Date.now() - last.tsDone < 120000) top = `<div class="callstate ok"><div class="okring">${ICON.check}</div><h3>El mozo va en camino</h3><p>Mesa ${MESA}</p></div>`;
  let extra = '';
  if (callStep === 'cuenta') extra = `<div class="opt-title">¿Cómo querés pagar?</div><div class="opts three">${['Efectivo', 'Tarjeta', 'Transferencia / QR'].map(m => `<button class="opt" data-act="call-send" data-type="cuenta" data-detail="${m}"><span>${m}</span></button>`).join('')}</div>`;
  if (callStep === 'otro') extra = `<div class="opt-title">¿Qué necesitás?</div><textarea id="call-text" rows="2" maxlength="120" placeholder="Ej.: una silla más, otra panera…"></textarea><button class="btn primary block" data-act="call-send" data-type="otro">Avisar al mozo</button>`;
  return `<div class="pad">
    <h2 class="sh-title">¿Qué necesitás? <small>Mesa ${MESA}</small></h2>
    ${top}
    <div class="callgrid">${Object.entries(CALLS).map(([t, c]) => `
      <button class="callopt ${callStep === t ? 'on' : ''}" data-act="call" data-type="${t}"><i>${ICON[c.icon]}</i><strong>${c.label}</strong><span>${c.hint}</span></button>`).join('')}
    </div>
    ${extra}
  </div>`;
}
function sendCall(type, detail = '') {
  const calls = getCalls();
  if (calls.some(c => c.mesa === MESA && c.type === type && c.status === 'pendiente')) { toast('Ese aviso ya está enviado'); return; }
  saveRec(K.calls, { id: uid(), mesa: MESA, type, detail, ts: Date.now(), status: 'pendiente' });
  callStep = null; snapshot(); updateBars();
  openSheet('waiter', waiterHTML(), 'waiter');
  toast('Listo, avisamos al mozo', 'ok');
  if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
}

function reviewsHTML() {
  const full = Math.round(PISA.rating);
  return `<div class="pad info">
    <h2 class="sh-title" style="padding:0">Reseñas</h2>
    <div class="ratebig">${String(PISA.rating).replace('.', ',')}</div>
    <div class="stars" aria-label="${PISA.rating} de 5 estrellas">${'★'.repeat(full)}<i>${'★'.repeat(5 - full)}</i></div>
    <p class="tag">${PISA.reviews} opiniones en Google</p>
    <a class="btn primary block" href="${PISA.reviewsUrl}" target="_blank" rel="noopener">Leer las reseñas</a>
    <a class="btn ghost block" href="${PISA.reviewsUrl}" target="_blank" rel="noopener">Dejar mi reseña</a>
    <p class="hint">Se abren en Google Maps, en la ficha de Pisa.</p>
  </div>`;
}
function infoHTML() {
  return `<div class="pad info">
    <img class="mascot" src="img/logo.jpg" alt="Mascota de Pisa">
    <h2 class="logo">Pisa</h2>
    <p class="tag">${esc(PISA.claim)}</p>
    <ul class="facts">
      <li><span>Dirección</span><b>${esc(PISA.address)}</b></li>
      <li><span>Horario</span><b>${esc(PISA.hours)}</b></li>
      <li><span>Teléfono</span><b>${esc(PISA.phone)}</b></li>
    </ul>
    <div class="links">
      <a class="btn ghost" href="${PISA.maps}" target="_blank" rel="noopener">Cómo llegar</a>
      <a class="btn ghost" href="${PISA.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn ghost" href="${PISA.instagram}" target="_blank" rel="noopener">Instagram</a>
      <button class="btn ghost" data-act="reviews">Reseñas</button>
    </div>
  </div>`;
}

// avisos en vivo cuando el local cambia un estado
let snap = {};
function snapshot() {
  snap = {};
  getOrders().filter(o => o.mesa === MESA).forEach(o => snap['o' + o.id] = o.status);
  getCalls().filter(c => c.mesa === MESA).forEach(c => snap['c' + c.id] = c.status);
}
function clientSync(key) {
  if (key === K.menu || key === K.custom) { MENU = getMenu(); rerenderMenu(); return; }
  getOrders().filter(o => o.mesa === MESA).forEach(o => {
    if (snap['o' + o.id] && snap['o' + o.id] !== o.status) { toast(`#${o.n} · ` + STAT.find(s => s.id === o.status).msg, 'ok'); if (navigator.vibrate) navigator.vibrate(60); }
  });
  getCalls().filter(c => c.mesa === MESA).forEach(c => {
    if (snap['c' + c.id] === 'pendiente' && c.status === 'atendido') toast('El mozo va en camino a tu mesa', 'ok');
  });
  snapshot(); updateBars();
  if (currentSheet === 'mesa') setSheet(mesaHTML());
  if (currentSheet === 'waiter') setSheet(waiterHTML());
}

// ═════════════════════════ GESTIÓN
let admTab = sessionStorage.getItem('pisa_tab') || 'live';
let admQ = '';

function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; const ctx = beep.ctx || (beep.ctx = new C());
    [880, 1175].forEach((f, x) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination); const t = ctx.currentTime + x * .16; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.start(t); o.stop(t + .32); });
  } catch { /* sin audio */ }
}

function renderAdmin() {
  $('#app').innerHTML = `
  <div class="adm">
    <header class="adm-top">
      <div class="adm-brand"><span class="logo sm">Pisa</span><em>Gestión del salón</em></div>
      <nav class="adm-tabs">
        <button data-act="tab" data-tab="live">En vivo <b id="livecount"></b></button>
        <button data-act="tab" data-tab="carta">Carta</button>
        <button data-act="tab" data-tab="resumen">Resumen</button>
        <button data-act="tab" data-tab="stock">Stock <b id="stockcount"></b></button>
        <button data-act="tab" data-tab="qr">Mesas y QR</button>
      </nav>
      <span id="netstate" class="net"></span>
      <a class="btn ghost sm" href="./?mesa=1" target="_blank" rel="noopener">Ver app del cliente ↗</a>
      ${AUTH && AUTH.currentUser ? '<button class="btn ghost sm" data-act="pass-form">Cambiar contraseña</button>' : ''}
      <button class="btn ghost sm" data-act="logout">Salir</button>
    </header>
    <main id="adm-main"></main>
  </div>`;
  renderAdmMain();
}
function renderAdmMain() {
  $$('.adm-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === admTab));
  const pend = getCalls().filter(c => c.status === 'pendiente').length + getOrders().filter(o => o.status === 'nuevo').length;
  const lc = $('#livecount'); lc.textContent = pend || ''; lc.hidden = !pend;
  const low = lowStock().length, sc = $('#stockcount'); sc.textContent = low || ''; sc.hidden = !low; sc.title = low ? `${low} insumos por reponer` : '';
  $('#adm-main').innerHTML = admTab === 'live' ? liveHTML() : admTab === 'carta' ? cartaHTML() : admTab === 'qr' ? qrHTML() : admTab === 'stock' ? stockHTML() : resumenHTML();
}
function qrHTML() {
  const base = location.origin + location.pathname, local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  return `<div class="qrs">
    <div class="carta-bar no-print">
      <p class="hint">Un código por mesa. Imprimilos y pegalos en cada mesa: el cliente lo escanea y la app ya sabe en qué mesa está.</p>
      <span class="qr-actions"><button class="btn primary sm" data-act="qr-pdf">Descargar PDF</button>
      <button class="btn ghost sm" data-act="print">Imprimir</button></span>
    </div>
    ${local ? '<p class="warn no-print">Estás en una dirección local: estos QR solo funcionan en esta computadora. Generalos de nuevo desde la app publicada antes de imprimir.</p>' : ''}
    <div class="qrgrid">${Array.from({ length: PISA.tables }, (_, x) => {
      const u = `${base}?mesa=${x + 1}`; let svg = '';
      try { const q = qrcode(0, 'M'); q.addData(u); q.make(); svg = q.createSvgTag(6, 0); } catch { svg = `<code>${esc(u)}</code>`; }
      return `<div class="qrcard"><span class="logo sm">Pisa</span>${svg}<strong>Mesa ${x + 1}</strong><small>Escaneá, mirá la carta y pedí desde tu mesa</small></div>`;
    }).join('')}</div>
  </div>`;
}

function orderCard(o) {
  const next = { nuevo: ['preparando', 'Aceptar · al horno'], preparando: ['listo', 'Marcar listo'], listo: ['entregado', 'Entregado en mesa'] }[o.status];
  return `<div class="kcard ${o.status}">
    <div class="k-head"><strong>Mesa ${o.mesa}</strong><span>#${o.n} · ${ago(o.ts)}</span></div>
    <ul>${o.items.map(l => `<li><b>${l.qty}×</b> ${esc(l.name)} <small>${esc(l.sub)}</small>${(l.mods || []).length ? `<i class="mods">${esc(l.mods.join(' · '))}</i>` : ''}${l.note ? `<em>${esc(l.note)}</em>` : ''}</li>`).join('')}</ul>
    ${o.note ? `<p class="k-note">Nota: ${esc(o.note)}</p>` : ''}
    <div class="k-foot"><span>${money(o.total)}</span>${next ? `<button class="btn primary sm" data-act="o-next" data-id="${o.id}" data-s="${next[0]}">${next[1]}</button>` : ''}</div>
  </div>`;
}
function liveHTML() {
  const orders = getOrders().filter(o => !o.paid), calls = getCalls().filter(c => c.status === 'pendiente');
  const col = (s, title) => { const l = orders.filter(o => o.status === s); return `<div class="kcol"><h3>${title}<b>${l.length}</b></h3>${l.map(o => { try { return orderCard(o); } catch { return ''; } }).join('') || '<p class="k-empty">Sin pedidos</p>'}</div>`; };
  return `<div class="live">
    <aside class="callcol">
      <h3>Llamados de mesa<b>${calls.length}</b></h3>
      ${calls.map(c => `<div class="ccard ${c.type}">
        <i>${ICON[CALLS[c.type].icon]}</i>
        <div><strong>Mesa ${c.mesa}</strong><span>${esc(CALLS[c.type].label)}${c.detail ? ' · ' + esc(c.detail) : ''}</span><small>${ago(c.ts)}</small></div>
        <button class="btn primary sm" data-act="c-done" data-id="${c.id}">Atender</button>
      </div>`).join('') || '<p class="k-empty">Nadie está llamando</p>'}
      <div class="sim"><p>Para probar sin celular:</p>
        <button class="btn ghost sm" data-act="sim-order">Simular pedido</button>
        <button class="btn ghost sm" data-act="sim-call">Simular llamado</button>
      </div>
    </aside>
    <section class="kanban">${col('nuevo', 'Nuevos')}${col('preparando', 'En el horno')}${col('listo', 'Listos para llevar')}</section>
  </div>`;
}

function cartaHTML() {
  const q = admQ.trim().toLowerCase();
  return `<div class="carta">
    <div class="carta-bar">
      <label class="search">${ICON.search}<input id="adm-q" type="search" placeholder="Buscar producto…" value="${esc(admQ)}"></label>
      <button class="btn primary sm" data-act="new-item">+ Nuevo producto</button>
    </div>
    ${CATS.map(c => {
      const items = MENU.filter(i => i.cat === c.id && (!q || i.name.toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<h3 class="carta-cat">${esc(c.name)} <small>${items.length} productos</small></h3>
      <div class="rows">${items.map(i => `<div class="row ${i.available ? '' : 'off'}" data-id="${i.id}">
        <button class="r-media" data-act="edit-media" data-id="${i.id}" title="Cambiar foto o video">${media({ ...i, video: '' }, 'r-thumb')}<span>${i.video ? 'Video' : 'Foto'}</span></button>
        <div class="r-name"><strong>${esc(i.name)}${i.veg ? '<span class="veg">V</span>' : ''}</strong><span>${esc(i.desc)}</span></div>
        <label class="r-price"><small>${i.ind ? 'Entera' : 'Precio'}</small><input type="number" min="0" step="500" value="${i.price}" data-f="price" data-id="${i.id}"></label>
        ${i.ind ? `<label class="r-price"><small>Individual</small><input type="number" min="0" step="500" value="${i.ind}" data-f="ind" data-id="${i.id}"></label>` : '<span></span>'}
        <label class="switch"><input type="checkbox" ${i.available ? 'checked' : ''} data-f="available" data-id="${i.id}"><i></i><span>${i.available ? 'Disponible' : 'Agotado'}</span></label>
        ${i.custom ? `<button class="btn ghost sm" data-act="del-item" data-id="${i.id}">Eliminar</button>` : '<span></span>'}
      </div>`).join('')}</div>`;
    }).join('')}
  </div>`;
}

// ───────────────────────── resumen: tablero de ventas por día / semana / mes / año
// El "día" del local va de 6 a 6: lo que se vende pasada la medianoche cuenta para esa noche.
const DAY = 864e5, SHIFT = 6 * 36e5;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DSEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const PER = { dia: 'Día', semana: 'Semana', mes: 'Mes', anio: 'Año' };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const bday = ts => { const d = new Date(ts - SHIFT); d.setHours(0, 0, 0, 0); return d; };
const kmoney = n => n >= 1e6 ? '$' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + ' k' : money(n);
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
let dash = (() => { try { return { per: 'semana', off: 0, metric: 'ventas', demo: false, ...JSON.parse(sessionStorage.getItem('pisa_dash')) }; } catch { return { per: 'semana', off: 0, metric: 'ventas', demo: false }; } })();
const saveDash = () => sessionStorage.setItem('pisa_dash', JSON.stringify(dash));

function periodRange(per, off) {
  const t = bday(Date.now()); let a, b;
  if (per === 'dia') { a = new Date(t); a.setDate(a.getDate() + off); b = new Date(a); b.setDate(b.getDate() + 1); }
  else if (per === 'semana') { a = new Date(t); a.setDate(a.getDate() - (a.getDay() + 6) % 7 + off * 7); b = new Date(a); b.setDate(b.getDate() + 7); }
  else if (per === 'mes') { a = new Date(t.getFullYear(), t.getMonth() + off, 1); b = new Date(a.getFullYear(), a.getMonth() + 1, 1); }
  else { a = new Date(t.getFullYear() + off, 0, 1); b = new Date(a.getFullYear() + 1, 0, 1); }
  return { a, b, from: +a + SHIFT, to: +b + SHIFT };
}
function periodLabel(per, r, off) {
  const a = r.a, e = new Date(+r.b - DAY);
  if (per === 'dia') return off === 0 ? 'Hoy' : off === -1 ? 'Ayer' : `${cap(DSEM[a.getDay()])} ${a.getDate()} ${MES[a.getMonth()]}`;
  if (per === 'semana') return off === 0 ? 'Esta semana' : off === -1 ? 'Semana pasada' : `${a.getDate()} ${MES[a.getMonth()]} – ${e.getDate()} ${MES[e.getMonth()]}`;
  if (per === 'mes') return `${cap(MESL[a.getMonth()])} ${a.getFullYear()}`;
  return String(a.getFullYear());
}
function periodSub(per, r) {
  const a = r.a, e = new Date(+r.b - DAY);
  if (per === 'dia') return `${DSEM[a.getDay()]} ${a.getDate()} de ${MESL[a.getMonth()]}`;
  if (per === 'semana') return `del ${a.getDate()} ${MES[a.getMonth()]} al ${e.getDate()} ${MES[e.getMonth()]}`;
  return '';
}
function buckets(per, r) {
  const out = [];
  if (per === 'dia') for (let h = 0; h < 24; h++) { const f = r.from + h * 36e5, hr = (h + 6) % 24; out.push({ f, t: f + 36e5, l: `${hr}:00 a ${(hr + 1) % 24}:00`, s: hr + 'h' }); }
  else if (per === 'anio') for (let m = 0; m < 12; m++) { const a = new Date(r.a.getFullYear(), m, 1), b = new Date(r.a.getFullYear(), m + 1, 1); out.push({ f: +a + SHIFT, t: +b + SHIFT, l: `${cap(MESL[m])} ${a.getFullYear()}`, s: MES[m], dp: 'mes', dd: +a }); }
  else for (let d = new Date(r.a); d < r.b; d.setDate(d.getDate() + 1)) { const nd = new Date(d); nd.setDate(nd.getDate() + 1); out.push({ f: +d + SHIFT, t: +nd + SHIFT, l: `${cap(DSEM[d.getDay()])} ${d.getDate()} de ${MESL[d.getMonth()]}`, s: per === 'semana' ? `${DSEM[d.getDay()]} ${d.getDate()}` : String(d.getDate()), dp: 'dia', dd: +d }); }
  return out;
}
function offFor(per, ts) {
  const t = bday(Date.now()), d = new Date(ts);
  return per === 'dia' ? Math.round((d - t) / DAY) : (d.getFullYear() - t.getFullYear()) * 12 + d.getMonth() - t.getMonth();
}
function stats(os, cs) {
  const ventas = os.reduce((s, o) => s + (o.total || 0), 0), at = cs.filter(c => c.tsDone);
  return {
    ventas, pedidos: os.length, ticket: os.length ? ventas / os.length : 0,
    unidades: os.reduce((s, o) => s + o.items.reduce((a, l) => a + (l.qty || 0), 0), 0),
    llamados: cs.length, resp: at.length ? at.reduce((s, c) => s + (c.tsDone - c.ts), 0) / at.length : 0,
  };
}
function deltaHTML(cur, prev, lowerIsBetter) {
  if (!prev) return cur ? '<em class="dl">sin datos para comparar</em>' : '<em class="dl">&nbsp;</em>';
  const p = (cur - prev) / prev * 100, up = p >= 0, good = lowerIsBetter ? !up : up;
  if (Math.abs(p) < 0.5) return '<em class="dl">igual que antes</em>';
  return `<em class="dl ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(p).toLocaleString('es-AR', { maximumFractionDigits: Math.abs(p) < 10 ? 1 : 0 })}%</em>`;
}
const mins = ms => ms ? (ms < 60000 ? Math.round(ms / 1000) + ' s' : (ms / 60000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' min') : '—';

// Datos de ejemplo: solo se generan en memoria para mostrar el tablero; nunca se guardan.
let DEMO = null;
function demoData() {
  if (DEMO) return DEMO;
  let seed = 917; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pool = MENU.filter(i => i.available && i.price > 0), w = pool.map(i => i.hot ? 4 : i.cat === 'sinalcohol' || i.cat === 'conalcohol' ? 3 : 1), tw = w.reduce((a, b) => a + b, 0);
  const pick = () => { let x = rnd() * tw; for (let k = 0; k < pool.length; k++) { x -= w[k]; if (x <= 0) return pool[k]; } return pool[0]; };
  const orders = [], calls = [], now = Date.now(), start = new Date(bday(now).getFullYear() - 1, 0, 1), span = (now - start) / DAY;
  let n = 1000;
  for (let d = new Date(start); +d <= now; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); if (wd === 1) continue; // lunes cerrado
    const f = [1.3, 0, .75, .8, 1, 1.55, 1.75][wd] * (1 + .12 * Math.sin((d.getMonth() + 1) / 12 * 2 * Math.PI)) * (0.85 + (+d - +start) / DAY / span * .3);
    const cnt = Math.round(26 * f * (.8 + rnd() * .4));
    for (let k = 0; k < cnt; k++) {
      const mn = 20 * 60 + Math.round((rnd() + rnd() + rnd()) / 3 * 300) - 20, ts = +d + mn * 60000;
      if (ts > now) continue;
      const items = []; for (let j = 0, L = 1 + Math.floor(rnd() * 3.5); j < L; j++) { const i = pick(); items.push({ id: i.id, name: i.name, qty: 1 + (rnd() < .25 ? 1 : 0), unit: i.price }); }
      orders.push({ id: 'd' + n, n: n++, mesa: 1 + Math.floor(rnd() * PISA.tables), items, total: items.reduce((s, l) => s + l.qty * l.unit, 0), ts, status: 'entregado', paid: true });
      if (rnd() < .45) calls.push({ id: 'dc' + n, mesa: 1, type: ['mozo', 'cuenta', 'cubiertos'][Math.floor(rnd() * 3)], ts: ts + 9e5, tsDone: ts + 9e5 + (40 + rnd() * 260) * 1000, status: 'atendido' });
    }
  }
  return DEMO = { orders, calls };
}
const dOrders = () => dash.demo ? demoData().orders : getOrders();
const dCalls = () => dash.demo ? demoData().calls : getCalls();

function hbars(rows, fmt, empty) { // filas de barras horizontales: [nombre, valor, detalle]
  if (!rows.length) return `<p class="k-empty">${empty}</p>`;
  const max = Math.max(...rows.map(r => r[1])) || 1;
  return `<div class="hbars">${rows.map(([n, v, d]) => `<div class="hb" title="${esc(n)}: ${esc(fmt(v))}${d ? ' · ' + esc(d) : ''}"><span>${esc(n)}</span><b>${fmt(v)}</b>${d ? `<small>${esc(d)}</small>` : ''}<i style="--w:${Math.max(3, v / max * 100)}%"></i></div>`).join('')}</div>`;
}
function colChart(bs, vals, fmt, tipFor, drill) { // gráfico de columnas con eje, tooltip y barras tocables
  const max = niceMax(Math.max(...vals)), n = bs.length, step = n > 16 ? (n > 24 ? 3 : 2) : 1;
  return `<div class="cchart" style="--n:${n}">
    <div class="c-grid">${[1, .5, 0].map(g => `<span style="--y:${g * 100}%"><b>${fmt(max * g)}</b></span>`).join('')}</div>
    <div class="c-cols">${bs.map((b, x) => {
      const v = vals[x], h = v / max * 100, edge = x < Math.max(2, n * .2) ? 'el' : x >= Math.min(n - 2, n * .8) ? 'er' : '';
      const tag = drill && b.dp ? `button data-act="drill" data-p="${b.dp}" data-d="${b.dd}"` : 'div tabindex="0"';
      return `<${tag} class="col ${edge} ${v ? '' : 'zero'}" style="--h:${h}%" aria-label="${esc(b.l)}: ${esc(tipFor(x))}"><i></i><span class="tip"><b>${esc(b.l)}</b>${tipFor(x)}</span><em>${x % step === 0 ? esc(b.s) : ''}</em></${tag.split(' ')[0]}>`;
    }).join('')}</div>
  </div>`;
}

function resumenHTML() {
  const per = dash.per, r = periodRange(per, dash.off), pr = periodRange(per, dash.off - 1);
  const all = dOrders(), allc = dCalls();
  const inR = (x, R) => x.ts >= R.from && x.ts < R.to;
  const os = all.filter(o => inR(o, r)), cs = allc.filter(c => inR(c, r));
  // el período en curso se compara con el anterior hasta el mismo momento (no contra el período completo)
  if (dash.off === 0) pr.to = Math.min(pr.to, pr.from + (Date.now() - r.from));
  const S = stats(os, cs), P = stats(all.filter(o => inR(o, pr)), allc.filter(c => inR(c, pr)));
  const vs = (dash.off === 0 ? { dia: 'vs. ayer a esta hora', semana: 'vs. semana pasada a esta altura', mes: 'vs. mes pasado a esta altura', anio: 'vs. año pasado a esta altura' } : { dia: 'vs. día anterior', semana: 'vs. semana anterior', mes: 'vs. mes anterior', anio: 'vs. año anterior' })[per];

  // gráfico principal
  let bs = buckets(per, r);
  const agg = bs.map(b => { const l = os.filter(o => o.ts >= b.f && o.ts < b.t); return { v: l.reduce((s, o) => s + o.total, 0), n: l.length }; });
  let lo = 0, hi = bs.length - 1;
  if (per === 'dia') { // solo el horario con movimiento (mínimo 19 a 1 h)
    const used = agg.map((a, x) => a.n ? x : -1).filter(x => x >= 0);
    lo = Math.min(13, used[0] ?? 13); hi = Math.max(19, used[used.length - 1] ?? 19);
  }
  bs = bs.slice(lo, hi + 1); const ag = agg.slice(lo, hi + 1);
  const isV = dash.metric === 'ventas', vals = ag.map(a => isV ? a.v : a.n);
  const chart = os.length ? colChart(bs, vals, isV ? kmoney : v => String(Math.round(v)), x => `${money(ag[x].v)} · ${ag[x].n} ${ag[x].n === 1 ? 'pedido' : 'pedidos'}`, per !== 'dia')
    : `<div class="c-empty"><p>No hay ventas registradas en este período.</p>${dash.demo ? '' : '<button class="btn ghost sm" data-act="dash-demo">Ver con datos de ejemplo</button>'}</div>`;

  // productos, categorías, horas y mesas
  const prod = {}, cat = {}, hrs = {}, mesas = {};
  os.forEach(o => {
    const h = new Date(o.ts).getHours(); hrs[h] = (hrs[h] || 0) + 1;
    mesas[o.mesa] = (mesas[o.mesa] || 0) + o.total;
    o.items.forEach(l => {
      const p = prod[l.name] || (prod[l.name] = { q: 0, v: 0 }); p.q += l.qty; p.v += l.qty * (l.unit || 0);
      const it = byId(l.id), c = CATS.find(c => c.id === (it && it.cat)); const cn = c ? c.name : 'Otros';
      cat[cn] = (cat[cn] || 0) + l.qty * (l.unit || 0);
    });
  });
  const tops = Object.entries(prod).sort((a, b) => b[1].q - a[1].q).slice(0, 8).map(([n, p]) => [n, p.q, money(p.v)]);
  const ctot = Object.values(cat).reduce((a, b) => a + b, 0) || 1;
  const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([n, v]) => [n, v, Math.round(v / ctot * 100) + '% de lo vendido']);
  const hours = [18, 19, 20, 21, 22, 23, 0, 1, 2].map(h => ({ f: 0, t: 0, l: `${h}:00 a ${(h + 1) % 24}:00`, s: h + 'h', n: hrs[h] || 0 }));
  const mrows = Object.entries(mesas).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, v]) => ['Mesa ' + m, v, '']);

  // frases para leer rápido
  const ins = [];
  if (os.length) {
    if (per !== 'dia') { const bx = ag.reduce((b, a, x) => a.v > ag[b].v ? x : b, 0); ins.push(['Mejor ' + (per === 'anio' ? 'mes' : 'día'), bs[bx].l, money(ag[bx].v)]); }
    const ph = Object.entries(hrs).sort((a, b) => b[1] - a[1])[0]; ins.push(['Hora pico', `${ph[0]}:00 a ${(+ph[0] + 1) % 24}:00`, `${ph[1].toLocaleString('es-AR')} pedidos`]);
    if (tops[0]) ins.push(['Producto estrella', tops[0][0], `${tops[0][1].toLocaleString('es-AR')} vendidos`]);
  }

  const open = getOrders().filter(o => !o.paid);
  const kpi = (lab, val, d, hint) => `<div class="kpi"><span>${lab}</span><strong>${val}</strong>${d}${hint ? `<small>${hint}</small>` : ''}</div>`;
  return `<div class="dash">
    <div class="dash-bar">
      <div class="seg" role="tablist">${Object.entries(PER).map(([k, l]) => `<button data-act="dash-per" data-p="${k}" class="${k === per ? 'on' : ''}" role="tab" aria-selected="${k === per}">${l}</button>`).join('')}</div>
      <div class="dnav">
        <button class="ibtn" data-act="dash-off" data-d="-1" aria-label="Período anterior">‹</button>
        <div><strong>${periodLabel(per, r, dash.off)}</strong><small>${periodSub(per, r)}</small></div>
        <button class="ibtn" data-act="dash-off" data-d="1" aria-label="Período siguiente" ${dash.off >= 0 ? 'disabled' : ''}>›</button>
        ${dash.off ? '<button class="btn ghost sm" data-act="dash-now">Volver a hoy</button>' : ''}
      </div>
      <div class="dash-tools">
        <label class="switch"><input type="checkbox" id="dash-demo" ${dash.demo ? 'checked' : ''}><i></i><span>Datos de ejemplo</span></label>
        <button class="btn ghost sm" data-act="dash-csv" ${os.length ? '' : 'disabled'}>Descargar planilla</button>
      </div>
    </div>
    ${dash.demo ? '<p class="demo-note">Estás viendo <b>datos de ejemplo</b> para mostrar cómo funciona el tablero. No son ventas reales. Apagá el interruptor para ver las tuyas.</p>' : ''}
    <div class="kpis k6">
      ${kpi('Ventas', money(S.ventas), deltaHTML(S.ventas, P.ventas), vs)}
      ${kpi('Pedidos', S.pedidos.toLocaleString('es-AR'), deltaHTML(S.pedidos, P.pedidos), vs)}
      ${kpi('Ticket promedio', money(S.ticket), deltaHTML(S.ticket, P.ticket), 'por pedido')}
      ${kpi('Productos vendidos', S.unidades.toLocaleString('es-AR'), deltaHTML(S.unidades, P.unidades), vs)}
      ${kpi('Llamados al mozo', S.llamados.toLocaleString('es-AR'), deltaHTML(S.llamados, P.llamados, true), 'menos es mejor')}
      ${kpi('Tiempo de respuesta', mins(S.resp), deltaHTML(S.resp, P.resp, true), 'promedio para atender un llamado')}
    </div>
    ${ins.length ? `<div class="insights">${ins.map(([a, b, c]) => `<div><span>${a}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join('')}</div>` : ''}
    <div class="panel chart-panel">
      <header><h3>${isV ? 'Ventas' : 'Pedidos'} ${{ dia: 'por hora', semana: 'por día', mes: 'por día', anio: 'por mes' }[per]}</h3>
        <div class="seg sm"><button data-act="dash-metric" data-m="ventas" class="${isV ? 'on' : ''}">Ventas</button><button data-act="dash-metric" data-m="pedidos" class="${isV ? '' : 'on'}">Pedidos</button></div></header>
      ${chart}
      ${os.length && per !== 'dia' ? `<p class="hint">Tocá una barra para ver ese ${per === 'anio' ? 'mes' : 'día'} en detalle.</p>` : ''}
    </div>
    <div class="grid3">
      <div class="panel"><h3>Lo más vendido</h3>${hbars(tops, v => v.toLocaleString('es-AR') + ' u.', 'Sin ventas en este período')}</div>
      <div class="panel"><h3>Ventas por categoría</h3>${hbars(cats, kmoney, 'Sin ventas en este período')}</div>
      <div class="panel"><h3>Horarios con más pedidos</h3>${os.length ? colChart(hours, hours.map(h => h.n), v => String(Math.round(v)), x => `${hours[x].n} pedidos`, false) : '<p class="k-empty">Sin ventas en este período</p>'}</div>
    </div>
    <div class="two">
      <div class="panel"><h3>Mesas que más facturan</h3>${hbars(mrows, kmoney, 'Sin ventas en este período')}</div>
      <div class="panel"><h3>Salón ahora</h3><div class="mesas">${Array.from({ length: PISA.tables }, (_, x) => {
        const m = x + 1, ms = open.filter(o => o.mesa === m), t = ms.reduce((s, o) => s + o.total, 0);
        return `<div class="mesa ${ms.length ? 'busy' : ''}"><strong>${m}</strong>${ms.length ? `<span>${money(t)}</span><button class="btn ghost sm" data-act="close-mesa" data-m="${m}">Cobrar y cerrar</button>` : '<span>Libre</span>'}</div>`;
      }).join('')}</div></div>
    </div>
  </div>`;
}
function dashCSV() {
  const r = periodRange(dash.per, dash.off), os = dOrders().filter(o => o.ts >= r.from && o.ts < r.to);
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Hora', 'Mesa', 'Pedido', 'Productos', 'Total'].join(';'), ...os.map(o => { const d = new Date(o.ts); return [d.toLocaleDateString('es-AR'), hhmm(o.ts), o.mesa, o.n, q(o.items.map(l => `${l.qty}x ${l.name}`).join(', ')), Math.round(o.total)].join(';'); })];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `pisa-ventas-${periodLabel(dash.per, r, dash.off).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-')}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Planilla descargada (se abre con Excel)', 'ok');
}

// ───────────────────────── stock, proveedores y pedidos a proveedores
const UNITS = ['kg', 'g', 'l', 'u', 'paquete', 'caja', 'atado', 'docena'];
const SCATS = ['Harinas y masa', 'Quesos', 'Fiambres y carnes', 'Verduras', 'Salsas y conservas', 'Bebidas', 'Descartables', 'Limpieza', 'Otros'];
const getStock = () => LS.get(KP.stock, []), getProv = () => LS.get(KP.prov, []), getPO = () => LS.get(KP.porders, []);
const lvl = s => (+s.qty || 0) <= 0 ? 'out' : (+s.qty || 0) <= (+s.min || 0) ? 'low' : 'ok';
const lowStock = () => getStock().filter(s => lvl(s) !== 'ok');
const qfmt = v => (+v || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const provName = id => (getProv().find(p => p.id === id) || {}).name || '';
const suggest = s => Math.max(0, Math.ceil((+s.min || 0) * 2 - (+s.qty || 0)));
const waNum = ph => { let d = String(ph || '').replace(/\D/g, ''); if (!d) return ''; d = d.replace(/^0+/, ''); if (!d.startsWith('54')) d = '549' + d; return d; };
let stk = { view: sessionStorage.getItem('pisa_stk') || 'inv', q: '', cat: '', low: false }, PO = null;
const STOCK_SEED = [
  ['Harina 0000', 'Harinas y masa', 'kg', 40, 20], ['Levadura fresca', 'Harinas y masa', 'kg', 2, 1], ['Sal fina', 'Harinas y masa', 'kg', 5, 2],
  ['Mozzarella', 'Quesos', 'kg', 18, 10], ['Parmesano', 'Quesos', 'kg', 3, 1.5], ['Provolone', 'Quesos', 'kg', 2, 1], ['Roquefort', 'Quesos', 'kg', 1, 1],
  ['Jamón cocido', 'Fiambres y carnes', 'kg', 4, 2], ['Salame', 'Fiambres y carnes', 'kg', 2, 1], ['Panceta', 'Fiambres y carnes', 'kg', 1.5, 1],
  ['Cebolla', 'Verduras', 'kg', 10, 5], ['Morrón', 'Verduras', 'kg', 3, 2], ['Albahaca', 'Verduras', 'atado', 4, 3], ['Rúcula', 'Verduras', 'atado', 2, 4],
  ['Tomate triturado', 'Salsas y conservas', 'kg', 24, 12], ['Aceite de oliva', 'Salsas y conservas', 'l', 6, 3], ['Aceitunas', 'Salsas y conservas', 'kg', 2, 1],
  ['Gaseosas', 'Bebidas', 'u', 48, 24], ['Agua mineral', 'Bebidas', 'u', 30, 24], ['Cerveza', 'Bebidas', 'u', 36, 24],
  ['Cajas de pizza', 'Descartables', 'u', 80, 100], ['Servilletas', 'Descartables', 'paquete', 10, 5], ['Detergente', 'Limpieza', 'l', 5, 2],
];

function stockHTML() {
  const views = [['inv', 'Inventario'], ['prov', 'Proveedores'], ['ped', 'Pedidos']];
  const pend = getPO().filter(p => p.status !== 'recibido').length;
  return `<div class="stk">
    <div class="seg stk-views">${views.map(([k, l]) => `<button data-act="s-view" data-v="${k}" class="${stk.view === k ? 'on' : ''}">${l}${k === 'ped' && pend ? ` <b>${pend}</b>` : ''}</button>`).join('')}</div>
    ${stk.view === 'prov' ? provHTML() : stk.view === 'ped' ? pedHTML() : invHTML()}
  </div>`;
}
function invHTML() {
  const all = getStock();
  if (!all.length) return `<div class="s-empty"><img src="img/logo.jpg" alt=""><h3>Todavía no cargaste insumos</h3>
    <p>Anotá lo que usás en la cocina (harina, muzzarella, bebidas…) con la cantidad que tenés y el mínimo que no querés que falte. La app te avisa cuando algo se está terminando.</p>
    <div class="s-empty-btns"><button class="btn primary" data-act="s-seed">Empezar con una lista típica de pizzería</button><button class="btn ghost" data-act="s-new">Cargar uno por uno</button></div></div>`;
  const q = stk.q.trim().toLowerCase();
  const list = all.filter(s => (!stk.cat || s.cat === stk.cat) && (!stk.low || lvl(s) !== 'ok') && (!q || s.name.toLowerCase().includes(q)))
    .sort((a, b) => ({ out: 0, low: 1, ok: 2 })[lvl(a)] - ({ out: 0, low: 1, ok: 2 })[lvl(b)] || a.name.localeCompare(b.name));
  const low = all.filter(s => lvl(s) === 'low').length, out = all.filter(s => lvl(s) === 'out').length;
  const val = all.reduce((t, s) => t + (+s.qty || 0) * (+s.cost || 0), 0);
  const cats = SCATS.filter(c => all.some(s => s.cat === c));
  return `<div class="kpis">
      <button class="kpi kbtn ${!stk.low ? 'on' : ''}" data-act="s-low" data-v="0"><span>Insumos cargados</span><strong>${all.length}</strong><small>Ver todos</small></button>
      <button class="kpi kbtn warnk ${stk.low ? 'on' : ''}" data-act="s-low" data-v="1"><span>Por reponer</span><strong>${low + out}</strong><small>${out ? `${out} sin stock · ` : ''}tocá para ver</small></button>
      <div class="kpi"><span>Pedidos en camino</span><strong>${getPO().filter(p => p.status === 'enviado').length}</strong><small>enviados a proveedores</small></div>
      <div class="kpi"><span>Valor del stock</span><strong>${val ? kmoney(val) : '—'}</strong><small>${val ? 'según el costo cargado' : 'cargá el costo de cada insumo'}</small></div>
    </div>
    <div class="carta-bar">
      <label class="search">${ICON.search}<input id="stk-q" type="search" placeholder="Buscar insumo…" value="${esc(stk.q)}"></label>
      <select id="stk-cat" class="select sm" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>${cats.map(c => `<option ${c === stk.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <span class="grow"></span>
      ${low + out ? '<button class="btn ghost sm" data-act="po-auto">Armar pedidos de lo que falta</button>' : ''}
      <button class="btn primary sm" data-act="s-new">+ Insumo</button>
    </div>
    <div class="rows srows">${list.map(s => {
      const l = lvl(s), pct = Math.min(100, (+s.qty || 0) / Math.max(+s.min || 1, .01) / 2 * 100), stepv = s.unit === 'g' ? 100 : 1;
      return `<div class="srow ${l}">
        <div class="s-name"><strong>${esc(s.name)}</strong><span>${esc(s.cat)}${s.prov && provName(s.prov) ? ' · ' + esc(provName(s.prov)) : ''}</span></div>
        <div class="s-qty"><button data-act="s-step" data-id="${s.id}" data-d="-${stepv}" aria-label="Restar">−</button><input type="number" min="0" step="any" inputmode="decimal" value="${+s.qty || 0}" data-sq="${s.id}" aria-label="Cantidad de ${esc(s.name)}"><button data-act="s-step" data-id="${s.id}" data-d="${stepv}" aria-label="Sumar">+</button><span>${esc(s.unit)}</span></div>
        <div class="s-lvl"><i style="--w:${pct}%"></i><small>Mínimo ${qfmt(s.min)} ${esc(s.unit)}</small></div>
        <span class="pill ${l}">${{ ok: 'Bien', low: 'Queda poco', out: 'Sin stock' }[l]}</span>
        <button class="btn ghost sm" data-act="s-edit" data-id="${s.id}">Editar</button>
      </div>`;
    }).join('') || '<p class="k-empty">No hay insumos con ese filtro.</p>'}</div>`;
}
function provHTML() {
  const ps = getProv(), st = getStock();
  return `<div class="carta-bar"><p class="hint">Tus proveedores con su WhatsApp. Desde acá les mandás el pedido armado con un toque.</p><span class="grow"></span><button class="btn primary sm" data-act="p-new">+ Proveedor</button></div>
    ${ps.length ? `<div class="pgrid">${ps.map(p => {
      const its = st.filter(s => s.prov === p.id), lo = its.filter(s => lvl(s) !== 'ok').length, wa = waNum(p.phone);
      return `<div class="pcard">
        <div class="p-head"><strong>${esc(p.name)}</strong>${p.rubro ? `<span>${esc(p.rubro)}</span>` : ''}</div>
        <p class="p-meta">${its.length} insumos${lo ? ` · <b>${lo} por reponer</b>` : ''}${p.days ? `<br>Entrega: ${esc(p.days)}` : ''}${p.phone ? `<br>${esc(p.phone)}` : ''}</p>
        <div class="p-actions">
          <button class="btn primary sm" data-act="po-new" data-p="${p.id}">Hacer pedido</button>
          ${wa ? `<a class="btn ghost sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost sm" href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ''))}">Llamar</a>` : ''}
          <button class="btn ghost sm" data-act="p-edit" data-id="${p.id}">Editar</button>
        </div>
      </div>`;
    }).join('')}</div>` : '<div class="s-empty"><h3>Sin proveedores todavía</h3><p>Cargá a quién le comprás cada cosa (nombre y WhatsApp). Después, en cada insumo elegís su proveedor y la app arma los pedidos sola.</p><button class="btn primary" data-act="p-new">Cargar el primero</button></div>'}`;
}
function poTotal(p) { const st = getStock(); return p.lines.reduce((t, l) => t + l.qty * (+(st.find(s => s.id === l.sid) || {}).cost || 0), 0); }
function poCard(p) {
  const pv = getProv().find(x => x.id === p.prov), t = poTotal(p);
  const when = p.status === 'recibido' ? 'Recibido ' + new Date(p.tsRec).toLocaleDateString('es-AR') : p.status === 'enviado' ? 'Enviado ' + new Date(p.tsSent).toLocaleDateString('es-AR') : 'Creado ' + new Date(p.ts).toLocaleDateString('es-AR');
  return `<div class="kcard po ${p.status}">
    <div class="k-head"><strong>${esc(pv ? pv.name : 'Proveedor borrado')}</strong><span>${when}</span></div>
    <ul>${p.lines.map(l => `<li><b>${qfmt(l.qty)} ${esc(l.unit)}</b> ${esc(l.name)}</li>`).join('')}</ul>
    ${p.note ? `<p class="k-note">Nota: ${esc(p.note)}</p>` : ''}
    <div class="k-foot"><span>${t ? '≈ ' + money(t) : ''}</span><span class="po-btns">
      ${p.status === 'borrador' ? `<button class="btn ghost sm" data-act="po-edit" data-id="${p.id}">Editar</button><button class="btn primary sm" data-act="po-send" data-id="${p.id}">Enviar por WhatsApp</button>` : ''}
      ${p.status === 'enviado' ? `<button class="btn ghost sm" data-act="po-send" data-id="${p.id}">Reenviar</button><button class="btn primary sm" data-act="po-rec" data-id="${p.id}">Llegó: sumar al stock</button>` : ''}
      ${p.status !== 'recibido' ? `<button class="btn ghost sm" data-act="po-del" data-id="${p.id}" aria-label="Borrar pedido">Borrar</button>` : ''}
    </span></div>
  </div>`;
}
function pedHTML() {
  const ps = getPO().slice().sort((a, b) => b.ts - a.ts);
  const col = (s, title, lim) => { const l = ps.filter(p => p.status === s).slice(0, lim || 99); return `<div class="kcol"><h3>${title}<b>${ps.filter(p => p.status === s).length}</b></h3>${l.map(poCard).join('') || '<p class="k-empty">Nada por acá</p>'}</div>`; };
  return `<div class="carta-bar"><p class="hint">Armá el pedido, mandalo por WhatsApp y cuando llegue tocá “Llegó”: se suma solo al stock.</p><span class="grow"></span>
      ${lowStock().length ? '<button class="btn ghost sm" data-act="po-auto">Armar pedidos de lo que falta</button>' : ''}
      <button class="btn primary sm" data-act="po-new">+ Pedido</button></div>
    <div class="kanban">${col('borrador', 'Por enviar')}${col('enviado', 'En camino')}${col('recibido', 'Recibidos', 12)}</div>`;
}
function stockForm(s) {
  const ps = getProv();
  return `<div class="pad form"><h2 class="sh-title">${s ? 'Editar insumo' : 'Nuevo insumo'}</h2>
    <label>Nombre<input id="sf-name" maxlength="60" value="${s ? esc(s.name) : ''}" placeholder="Ej.: Mozzarella"></label>
    <div class="frow"><label>Categoría<select id="sf-cat" class="select">${SCATS.map(c => `<option ${s && s.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Unidad<select id="sf-unit" class="select">${UNITS.map(u => `<option ${s && s.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
    <div class="frow"><label>Cantidad que hay<input id="sf-qty" type="number" min="0" step="any" inputmode="decimal" value="${s ? +s.qty || 0 : ''}"></label>
    <label>Avisarme cuando quede<input id="sf-min" type="number" min="0" step="any" inputmode="decimal" value="${s ? +s.min || 0 : ''}"></label></div>
    <div class="frow"><label>Costo por unidad ($)<input id="sf-cost" type="number" min="0" step="any" inputmode="decimal" value="${s && s.cost ? s.cost : ''}" placeholder="Opcional"></label>
    <label>Proveedor<select id="sf-prov" class="select"><option value="">Sin asignar</option>${ps.map(p => `<option value="${p.id}" ${s && s.prov === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
    ${ps.length ? '' : '<p class="hint">Todavía no cargaste proveedores: lo podés asignar después.</p>'}
    <button class="btn primary block" data-act="s-save" ${s ? `data-id="${s.id}"` : ''}>Guardar</button>
    ${s ? `<button class="linkbtn" data-act="s-del" data-id="${s.id}">Borrar este insumo</button>` : ''}
  </div>`;
}
function provForm(p) {
  return `<div class="pad form"><h2 class="sh-title">${p ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
    <label>Nombre<input id="pf-name" maxlength="60" value="${p ? esc(p.name) : ''}" placeholder="Ej.: Lácteos del Centro"></label>
    <label>Qué te vende<input id="pf-rubro" maxlength="60" value="${p ? esc(p.rubro || '') : ''}" placeholder="Ej.: quesos y fiambres"></label>
    <label>WhatsApp o teléfono<input id="pf-phone" type="tel" maxlength="30" value="${p ? esc(p.phone || '') : ''}" placeholder="Con característica, ej.: 351 555 1234"></label>
    <label>Días de entrega<input id="pf-days" maxlength="60" value="${p ? esc(p.days || '') : ''}" placeholder="Ej.: martes y viernes a la mañana"></label>
    <button class="btn primary block" data-act="p-save" ${p ? `data-id="${p.id}"` : ''}>Guardar</button>
    ${p ? `<button class="linkbtn" data-act="p-del" data-id="${p.id}">Borrar este proveedor</button>` : ''}
  </div>`;
}
function poForm() {
  const ps = getProv(), st = getStock(), pv = ps.find(p => p.id === PO.prov);
  const list = st.filter(s => PO.all || s.prov === PO.prov || PO.q[s.id] > 0).sort((a, b) => ({ out: 0, low: 1, ok: 2 })[lvl(a)] - ({ out: 0, low: 1, ok: 2 })[lvl(b)] || a.name.localeCompare(b.name));
  return `<div class="pad form"><h2 class="sh-title">Pedido a proveedor</h2>
    ${ps.length ? `<label>Proveedor<select id="po-prov" class="select">${ps.map(p => `<option value="${p.id}" ${p.id === PO.prov ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : '<p class="warn">Primero cargá un proveedor en la pestaña Proveedores.</p>'}
    <div class="po-lines">${list.length ? list.map(s => `<label class="po-line ${lvl(s)}"><span><strong>${esc(s.name)}</strong><small>Hay ${qfmt(s.qty)} ${esc(s.unit)} · mínimo ${qfmt(s.min)}</small></span>
      <span class="po-q"><input type="number" min="0" step="any" inputmode="decimal" data-poq="${s.id}" value="${PO.q[s.id] || ''}" placeholder="0"><em>${esc(s.unit)}</em></span></label>`).join('')
      : `<p class="hint">${pv ? 'Este proveedor todavía no tiene insumos asignados.' : ''} Tocá “Ver todos los insumos” para elegir.</p>`}</div>
    <button class="linkbtn" data-act="po-all">${PO.all ? 'Ver solo los de este proveedor' : 'Ver todos los insumos'}</button>
    <label>Nota para el proveedor<textarea id="po-note" rows="2" maxlength="200" placeholder="Opcional">${esc(PO.note || '')}</textarea></label>
    <div class="po-actions"><button class="btn ghost block" data-act="po-save">Guardar para después</button><button class="btn primary block" data-act="po-save" data-send="1">Enviar por WhatsApp</button></div>
  </div>`;
}
function poRead() { // vuelca el formulario abierto al pedido en edición
  const p = $('#po-prov'); if (p) PO.prov = p.value;
  $$('[data-poq]').forEach(i => { const v = Math.max(0, +i.value || 0); if (v) PO.q[i.dataset.poq] = v; else delete PO.q[i.dataset.poq]; });
  const n = $('#po-note'); if (n) PO.note = n.value.trim();
}
function poOpen(prov, q = {}, id = null) {
  const ps = getProv(); PO = { id, prov: prov || (ps[0] && ps[0].id) || '', q, note: '', all: false };
  if (!id) getStock().filter(s => s.prov === PO.prov && lvl(s) !== 'ok' && !(s.id in PO.q)).forEach(s => { if (suggest(s)) PO.q[s.id] = suggest(s); });
  openSheet('po', poForm(), 'modal');
}
function poMessage(p) {
  const pv = getProv().find(x => x.id === p.prov) || {};
  return `Hola${pv.name ? ' ' + pv.name : ''}, te escribo de Pisa (${PISA.address || 'Lima 917'}). Te quería hacer este pedido:\n\n${p.lines.map(l => `• ${qfmt(l.qty)} ${l.unit} de ${l.name}`).join('\n')}${p.note ? `\n\nNota: ${p.note}` : ''}\n\n¡Muchas gracias!`;
}
function poSend(p) {
  const pv = getProv().find(x => x.id === p.prov), wa = pv && waNum(pv.phone);
  if (!wa) { toast('Cargá el WhatsApp del proveedor para enviarle el pedido'); return false; }
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(poMessage(p))}`, '_blank', 'noopener');
  saveRec(KP.porders, { ...p, status: 'enviado', tsSent: Date.now() });
  return true;
}

function setOverride(id, patch) {
  const custom = LS.get(K.custom, []), c = custom.find(i => i.id === id);
  if (c) saveRec(K.custom, Object.assign(c, patch));
  else { const ov = LS.get(K.menu, {}); ov[id] = { ...(ov[id] || {}), ...patch }; LS.set(K.menu, ov); remotePut(K.menu, id, ov[id]); }
  MENU = getMenu();
}
function fileToDataURL(file) { // achica la foto para que entre en localStorage
  return new Promise((res, rej) => {
    const im = new Image(), url = URL.createObjectURL(file);
    im.onload = () => { const s = Math.min(1, 720 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .8)); };
    im.onerror = rej; im.src = url;
  });
}
function mediaForm(i) {
  return `<div class="pad form">
    <h2 class="sh-title">${i ? 'Foto y video' : 'Nuevo producto'} ${i ? `<small>${esc(i.name)}</small>` : ''}</h2>
    ${i ? '' : `
      <label>Nombre<input id="f-name" maxlength="50" placeholder="Ej.: Pisa de la semana"></label>
      <label>Descripción<textarea id="f-desc" rows="2" maxlength="160"></textarea></label>
      <div class="frow"><label>Categoría<select id="f-cat" class="select">${CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label>Precio<input id="f-price" type="number" min="0" step="500" placeholder="0"></label></div>
      <label class="check"><input id="f-veg" type="checkbox"> Vegetariana</label>`}
    <label>Foto <input id="f-file" type="file" accept="image/*"></label>
    <label>…o URL de la foto<input id="f-img" placeholder="https://…" value="${i && i.img && !i.img.startsWith('data:') ? esc(i.img) : ''}"></label>
    <label>URL del video (mp4, opcional)<input id="f-video" placeholder="https://…/video.mp4" value="${i ? esc(i.video || '') : ''}"></label>
    <p class="hint">Si cargás un video, en la app del cliente se reproduce en loop y sin sonido en lugar de la foto.</p>
    <button class="btn primary block" data-act="${i ? 'save-media' : 'save-item'}" ${i ? `data-id="${i.id}"` : ''}>Guardar</button>
  </div>`;
}
async function readMediaForm(prevImg = '') {
  const f = $('#f-file').files[0]; let im = $('#f-img').value.trim() || prevImg;
  if (f) im = await fileToDataURL(f);
  return { img: im, video: $('#f-video').value.trim() };
}
function simulate(kind) {
  const mesa = 1 + Math.floor(Math.random() * PISA.tables);
  if (kind === 'call') {
    const type = ['mozo', 'cuenta', 'cubiertos'][Math.floor(Math.random() * 3)];
    saveRec(K.calls, { id: uid(), mesa, type, detail: type === 'cuenta' ? 'Tarjeta' : '', ts: Date.now(), status: 'pendiente' });
  } else {
    const pool = MENU.filter(i => i.available), items = [];
    for (let x = 0; x < 2 + Math.floor(Math.random() * 2); x++) { const i = pool[Math.floor(Math.random() * pool.length)]; items.push({ key: uid(), id: i.id, name: i.name, sub: CAT_ONE[i.cat], note: '', qty: 1 + Math.floor(Math.random() * 2), unit: i.price, img: i.img || '' }); }
    const orders = getOrders();
    saveRec(K.orders, { id: uid(), n: 101 + orders.length, mesa, items, note: '', total: items.reduce((s, l) => s + l.qty * l.unit, 0), status: 'nuevo', ts: Date.now(), paid: false });
  }
  beep(); renderAdmMain();
}

// ═════════════════════════ acciones (delegación de eventos)
const isAdmin = () => location.hash === '#admin';
const ACT = {
  close: closeSheet,
  info: () => openSheet('info', infoHTML(), 'info'),
  reviews: () => openSheet('reviews', reviewsHTML(), 'info'),
  top: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  veg: () => { onlyVeg = !onlyVeg; const b = $('.vegbtn'); b.classList.toggle('on', onlyVeg); b.setAttribute('aria-pressed', onlyVeg); rerenderMenu(); },
  'clear-search': () => { query = ''; onlyVeg = false; $('#q').value = ''; $('.vegbtn').classList.remove('on'); rerenderMenu(); },
  cat: t => { const s = $('#cat-' + t.dataset.cat); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 128, behavior: 'smooth' }); },
  'open-item': t => openProduct(t.dataset.id),
  add: t => { const i = byId(t.dataset.id); if (!i) return; if (hasOptions(i)) return openProduct(i.id); addLine(i); fly(t); toast(`${i.name} agregado`); },
  'p-variant': t => { P.variant = t.dataset.v; renderPDyn(); },
  'p-rm': t => { const n = t.dataset.n, x = P.removed.indexOf(n); if (x < 0) P.removed.push(n); else P.removed.splice(x, 1); renderPDyn(); },
  'p-ex': t => { const id = t.dataset.x, x = P.extras.indexOf(id); if (x < 0) P.extras.push(id); else P.extras.splice(x, 1); renderPDyn(); },
  'p-qty': t => { P.qty = Math.max(1, Math.min(20, P.qty + +t.dataset.d)); renderPDyn(); },
  'p-add': () => { const i = byId(P.id); addLine(i, { variant: P.variant, half: P.half, note: $('#p-note').value.trim(), qty: P.qty, unit: pUnit(), mods: pMods() }); closeSheet(); toast(`${P.qty}× ${i.name} en tu pedido`, 'ok'); },
  cart: () => openSheet('cart', cartHTML(), 'cart'),
  'c-qty': t => { const l = cart[+t.dataset.x]; if (!l) return; l.qty += +t.dataset.d; if (l.qty < 1) cart.splice(+t.dataset.x, 1); saveCart(); updateBars(); setSheet(cartHTML()); },
  'send-order': sendOrder,
  mesa: () => openSheet('mesa', mesaHTML(), 'mesa'),
  waiter: () => { callStep = null; openSheet('waiter', waiterHTML(), 'waiter'); },
  call: t => { const ty = t.dataset.type; if (ty === 'cuenta' || ty === 'otro') { callStep = ty; openSheet('waiter', waiterHTML(), 'waiter'); } else sendCall(ty); },
  'call-send': t => { const ty = t.dataset.type, d = ty === 'otro' ? ($('#call-text').value.trim()) : t.dataset.detail; if (ty === 'otro' && !d) return toast('Contanos qué necesitás'); sendCall(ty, d); },

  // gestión
  tab: t => { admTab = t.dataset.tab; sessionStorage.setItem('pisa_tab', admTab); renderAdmMain(); },
  'o-next': t => { const os = getOrders(), o = os.find(x => x.id === t.dataset.id); if (o) { o.status = t.dataset.s; saveRec(K.orders, o); renderAdmMain(); } },
  'c-done': t => { const cs = getCalls(), c = cs.find(x => x.id === t.dataset.id); if (c) { c.status = 'atendido'; c.tsDone = Date.now(); saveRec(K.calls, c); renderAdmMain(); } },
  print: () => window.print(),
  'qr-pdf': async () => {
    try {
      if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      const url = location.origin + location.pathname, cols = 3, rows = 4, m = 10, cw = (210 - 2 * m) / cols, ch = (297 - 2 * m) / rows;
      for (let i = 0; i < PISA.tables; i++) {
        const k = i % (cols * rows);
        if (i && k === 0) doc.addPage();
        const x = m + (k % cols) * cw, y = m + Math.floor(k / cols) * ch, cx = x + cw / 2;
        doc.setDrawColor(200); doc.setLineWidth(.2); doc.roundedRect(x + 2, y + 2, cw - 4, ch - 4, 3, 3);
        doc.setTextColor(224, 40, 43); doc.setFont('times', 'bolditalic'); doc.setFontSize(22); doc.text('Pisa', cx, y + 11.5, { align: 'center' });
        const q = qrcode(0, 'M'); q.addData(`${url}?mesa=${i + 1}`); q.make();
        const n = q.getModuleCount(), size = 38, c = size / n, qx = cx - size / 2, qy = y + 15;
        doc.setFillColor(0, 0, 0);
        for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (q.isDark(r, cc)) doc.rect(qx + cc * c, qy + r * c, c + .03, c + .03, 'F');
        doc.setTextColor(31, 26, 23); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(`Mesa ${i + 1}`, cx, qy + size + 7, { align: 'center' });
        doc.setTextColor(107, 98, 90); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text('Escaneá, mirá la carta y pedí desde tu mesa', cx, qy + size + 11.5, { align: 'center' });
      }
      doc.save('pisa-qr-mesas.pdf');
      toast('PDF descargado', 'ok');
    } catch { toast('No se pudo generar el PDF. Revisá la conexión.'); }
  },
  login: async () => {
    const u = $('#lg-user').value.trim().toLowerCase(), p = $('#lg-pass').value;
    if (!u || !p) return toast('Completá usuario y contraseña');
    try { await AUTH.signInWithEmailAndPassword(u.includes('@') ? u : `${u}@${CFG.firebase.authDomain}`, p); }
    catch (e) { toast(e.code === 'auth/network-request-failed' ? 'Sin conexión. Revisá internet.' : e.code === 'auth/too-many-requests' ? 'Demasiados intentos. Esperá unos minutos.' : 'Usuario o contraseña incorrectos'); $('#lg-pass').value = ''; }
  },
  logout: () => { if (AUTH) AUTH.signOut(); else boot(); },
  'pass-form': () => openSheet('pass', `<div class="pad form"><h2 class="sh-title">Cambiar contraseña</h2>
    <label>Nueva contraseña (mínimo 8 caracteres)<input id="np1" type="password" autocomplete="new-password"></label>
    <label>Repetir contraseña<input id="np2" type="password" autocomplete="new-password"></label>
    <button class="btn primary block" data-act="pass-save">Guardar</button></div>`, 'modal'),
  'pass-save': async () => {
    const a = $('#np1').value, b = $('#np2').value;
    if (a.length < 8) return toast('Usá al menos 8 caracteres');
    if (a !== b) return toast('Las contraseñas no coinciden');
    try { await AUTH.currentUser.updatePassword(a); closeSheet(); toast('Contraseña actualizada', 'ok'); }
    catch (e) { toast(e.code === 'auth/requires-recent-login' ? 'Por seguridad, salí, volvé a entrar y probá de nuevo.' : 'No se pudo cambiar la contraseña'); }
  },
  'sim-order': () => simulate('order'),
  'sim-call': () => simulate('call'),
  'close-mesa': t => { const m = +t.dataset.m; if (!confirm(`¿Cobrar y cerrar la mesa ${m}?`)) return; getOrders().filter(o => o.mesa === m && !o.paid).forEach(o => saveRec(K.orders, { ...o, paid: true, status: 'entregado' })); getCalls().filter(c => c.mesa === m && c.status === 'pendiente').forEach(c => saveRec(K.calls, { ...c, status: 'atendido', tsDone: Date.now() })); renderAdmMain(); },
  'edit-media': t => openSheet('media', mediaForm(byId(t.dataset.id)), 'modal'),
  'new-item': () => openSheet('media', mediaForm(null), 'modal'),
  'save-media': async t => { const i = byId(t.dataset.id); setOverride(i.id, await readMediaForm(i.img)); closeSheet(); renderAdmMain(); toast('Guardado', 'ok'); },
  'save-item': async () => {
    const name = $('#f-name').value.trim(), price = +$('#f-price').value;
    if (!name || !price) return toast('Completá nombre y precio');
    const m = await readMediaForm();
    saveRec(K.custom, { id: 'x-' + uid(), ts: Date.now(), cat: $('#f-cat').value, name, desc: $('#f-desc').value.trim(), price, veg: $('#f-veg').checked, available: true, custom: true, ...m });
    MENU = getMenu(); closeSheet(); renderAdmMain(); toast('Producto creado', 'ok');
  },
  'del-item': t => { if (!confirm('¿Eliminar este producto?')) return; delRec(K.custom, t.dataset.id); MENU = getMenu(); renderAdmMain(); },

  // tablero
  'dash-per': t => { dash.per = t.dataset.p; dash.off = 0; saveDash(); renderAdmMain(); },
  'dash-off': t => { dash.off = Math.min(0, dash.off + +t.dataset.d); saveDash(); renderAdmMain(); },
  'dash-now': () => { dash.off = 0; saveDash(); renderAdmMain(); },
  'dash-metric': t => { dash.metric = t.dataset.m; saveDash(); renderAdmMain(); },
  'dash-demo': () => { dash.demo = true; saveDash(); renderAdmMain(); },
  'dash-csv': dashCSV,
  drill: t => { dash.per = t.dataset.p; dash.off = offFor(dash.per, +t.dataset.d); saveDash(); renderAdmMain(); window.scrollTo({ top: 0, behavior: 'smooth' }); },

  // stock
  's-view': t => { stk.view = t.dataset.v; sessionStorage.setItem('pisa_stk', stk.view); renderAdmMain(); },
  's-low': t => { stk.low = t.dataset.v === '1'; renderAdmMain(); },
  's-seed': () => { const now = Date.now(); STOCK_SEED.forEach(([name, cat, unit, qty, min], x) => saveRec(KP.stock, { id: 's-' + uid(), ts: now + x, name, cat, unit, qty, min, cost: 0, prov: '' })); renderAdmMain(); toast('Lista cargada: ajustá las cantidades reales', 'ok'); },
  's-new': () => openSheet('stk', stockForm(null), 'modal'),
  's-edit': t => openSheet('stk', stockForm(getStock().find(s => s.id === t.dataset.id)), 'modal'),
  's-step': t => { const s = getStock().find(x => x.id === t.dataset.id); if (!s) return; s.qty = Math.max(0, Math.round(((+s.qty || 0) + +t.dataset.d) * 100) / 100); saveRec(KP.stock, s); renderAdmMain(); },
  's-save': t => {
    const name = $('#sf-name').value.trim(); if (!name) return toast('Poné el nombre del insumo');
    const old = t.dataset.id ? getStock().find(s => s.id === t.dataset.id) : null, n = v => Math.max(0, +v || 0);
    saveRec(KP.stock, { ...(old || { id: 's-' + uid(), ts: Date.now() }), name, cat: $('#sf-cat').value, unit: $('#sf-unit').value, qty: n($('#sf-qty').value), min: n($('#sf-min').value), cost: n($('#sf-cost').value), prov: $('#sf-prov').value });
    closeSheet(); renderAdmMain(); toast('Insumo guardado', 'ok');
  },
  's-del': t => { if (!confirm('¿Borrar este insumo?')) return; delRec(KP.stock, t.dataset.id); closeSheet(); renderAdmMain(); },
  'p-new': () => openSheet('prov', provForm(null), 'modal'),
  'p-edit': t => openSheet('prov', provForm(getProv().find(p => p.id === t.dataset.id)), 'modal'),
  'p-save': t => {
    const name = $('#pf-name').value.trim(); if (!name) return toast('Poné el nombre del proveedor');
    const old = t.dataset.id ? getProv().find(p => p.id === t.dataset.id) : null;
    saveRec(KP.prov, { ...(old || { id: 'p-' + uid(), ts: Date.now() }), name, rubro: $('#pf-rubro').value.trim(), phone: $('#pf-phone').value.trim(), days: $('#pf-days').value.trim() });
    closeSheet(); renderAdmMain(); toast('Proveedor guardado', 'ok');
  },
  'p-del': t => {
    if (!confirm('¿Borrar este proveedor? Sus insumos quedan sin proveedor asignado.')) return;
    delRec(KP.prov, t.dataset.id); getStock().filter(s => s.prov === t.dataset.id).forEach(s => saveRec(KP.stock, { ...s, prov: '' }));
    closeSheet(); renderAdmMain();
  },
  'po-new': t => poOpen(t.dataset.p),
  'po-edit': t => { const p = getPO().find(x => x.id === t.dataset.id); if (!p) return; const q = {}; p.lines.forEach(l => q[l.sid] = l.qty); poOpen(p.prov, q, p.id); PO.note = p.note || ''; setSheet(poForm()); },
  'po-all': () => { poRead(); PO.all = !PO.all; setSheet(poForm()); },
  'po-save': t => {
    poRead(); if (!PO.prov) return toast('Elegí un proveedor');
    const st = getStock(), lines = Object.entries(PO.q).map(([sid, qty]) => { const s = st.find(x => x.id === sid); return s && { sid, name: s.name, unit: s.unit, qty }; }).filter(Boolean);
    if (!lines.length) return toast('Poné la cantidad de al menos un insumo');
    const old = PO.id ? getPO().find(p => p.id === PO.id) : null;
    const rec = { ...(old || { id: 'po-' + uid(), ts: Date.now(), status: 'borrador' }), prov: PO.prov, lines, note: PO.note };
    saveRec(KP.porders, rec);
    const sent = t.dataset.send ? poSend(rec) : false;
    closeSheet(); stk.view = 'ped'; sessionStorage.setItem('pisa_stk', 'ped'); renderAdmMain();
    if (!t.dataset.send) toast('Pedido guardado en “Por enviar”', 'ok'); else if (sent) toast('Pedido enviado. Cuando llegue, tocá “Llegó”', 'ok');
  },
  'po-send': t => { const p = getPO().find(x => x.id === t.dataset.id); if (p && poSend(p)) { renderAdmMain(); toast('Se abrió WhatsApp con el pedido', 'ok'); } },
  'po-rec': t => {
    const p = getPO().find(x => x.id === t.dataset.id); if (!p || !confirm('¿Llegó el pedido? Las cantidades se suman al stock.')) return;
    const st = getStock(); p.lines.forEach(l => { const s = st.find(x => x.id === l.sid); if (s) saveRec(KP.stock, { ...s, qty: Math.round(((+s.qty || 0) + l.qty) * 100) / 100 }); });
    saveRec(KP.porders, { ...p, status: 'recibido', tsRec: Date.now() }); renderAdmMain(); toast('Stock actualizado', 'ok');
  },
  'po-del': t => { if (!confirm('¿Borrar este pedido?')) return; delRec(KP.porders, t.dataset.id); renderAdmMain(); },
  'po-auto': () => {
    const low = lowStock(), drafts = getPO().filter(p => p.status === 'borrador'); let made = 0;
    const byProv = {}; low.filter(s => s.prov && suggest(s)).forEach(s => (byProv[s.prov] = byProv[s.prov] || []).push(s));
    Object.entries(byProv).forEach(([prov, its]) => {
      const d = drafts.find(p => p.prov === prov), lines = d ? d.lines.slice() : [];
      its.forEach(s => { if (!lines.some(l => l.sid === s.id)) lines.push({ sid: s.id, name: s.name, unit: s.unit, qty: suggest(s) }); });
      saveRec(KP.porders, { ...(d || { id: 'po-' + uid(), ts: Date.now(), status: 'borrador', note: '' }), prov, lines }); made++;
    });
    const sinProv = low.filter(s => !s.prov).length;
    stk.view = 'ped'; sessionStorage.setItem('pisa_stk', 'ped'); renderAdmMain();
    toast(made ? `${made} ${made === 1 ? 'pedido armado' : 'pedidos armados'}. Revisalos y enviálos${sinProv ? ` · ${sinProv} insumos no tienen proveedor` : ''}` : sinProv ? 'Asigná un proveedor a cada insumo para armar los pedidos solos' : 'No hay nada por reponer', made ? 'ok' : '');
  },
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t && ACT[t.dataset.act]) ACT[t.dataset.act](t, e);
});
$('#backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('input', e => {
  if (e.target.id === 'q') { query = e.target.value; rerenderMenu(); }
  if (e.target.id === 'adm-q') { admQ = e.target.value; const pos = e.target.selectionStart; renderAdmMain(); const n = $('#adm-q'); n.focus(); n.setSelectionRange(pos, pos); }
  if (e.target.id === 'stk-q') { stk.q = e.target.value; const pos = e.target.selectionStart; renderAdmMain(); const n = $('#stk-q'); n.focus(); n.setSelectionRange(pos, pos); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'p-half') { P.half = t.value; renderPDyn(); return; }
  if (t.id === 'dash-demo') { dash.demo = t.checked; saveDash(); renderAdmMain(); return; }
  if (t.id === 'stk-cat') { stk.cat = t.value; renderAdmMain(); return; }
  if (t.id === 'po-prov') { poRead(); PO.prov = t.value; if (!PO.id) PO.q = {}; getStock().filter(s => s.prov === PO.prov && lvl(s) !== 'ok' && !(s.id in PO.q)).forEach(s => { if (suggest(s)) PO.q[s.id] = suggest(s); }); setSheet(poForm()); return; }
  if (t.dataset.sq) { const s = getStock().find(x => x.id === t.dataset.sq); if (s) { s.qty = Math.max(0, Math.round((+t.value || 0) * 100) / 100); saveRec(KP.stock, s); t.blur(); renderAdmMain(); } return; }
  if (t.dataset.f && t.dataset.id) {
    if (t.dataset.f === 'available') {
      setOverride(t.dataset.id, { available: t.checked });
      const row = t.closest('.row'); row.classList.toggle('off', !t.checked); $('.switch span', row).textContent = t.checked ? 'Disponible' : 'Agotado';
    } else {
      const v = Math.max(0, Math.round(+t.value || 0)); t.value = v; setOverride(t.dataset.id, { [t.dataset.f]: v }); toast('Precio actualizado', 'ok');
    }
  }
});
function onExternalChange(key, oldValue, newValue) {
  if (isAdmin()) {
    if (!$('#adm-main')) return; // pantalla de clave
    MENU = getMenu();
    if (key === K.orders || key === K.calls) {
      const count = k => { try { return JSON.parse(k || '[]').length; } catch { return 0; } };
      if (count(newValue) > count(oldValue)) beep();
    }
    const ae = document.activeElement; // no pisar lo que el dueño está escribiendo
    if (ae && ae.matches && ae.matches('#adm-main input, #adm-main select, #adm-main textarea')) return;
    if (admTab !== 'carta' && currentSheet === null) renderAdmMain();
  } else clientSync(key);
}
window.addEventListener('storage', e => {
  if (e.key && (Object.values(K).includes(e.key) || PRIV_KEYS.includes(e.key))) onExternalChange(e.key, e.oldValue, e.newValue);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'lg-pass' || e.target.id === 'lg-user')) ACT.login(); });
setInterval(() => { if (isAdmin() && admTab === 'live' && currentSheet === null) renderAdmMain(); }, 30000);

function boot() {
  closeSheet();
  document.body.classList.toggle('admin', isAdmin());
  document.title = isAdmin() ? 'Pisa · Gestión' : 'Pisa · Carta y pedidos';
  MENU = getMenu();
  if (!isAdmin()) { renderClient(); snapshot(); }
  else if (!(CFG.firebase && CFG.firebase.databaseURL)) renderAdmin(); // modo local, sin servidor
  else if (AUTH && AUTH.currentUser) renderAdmin();
  else {
    const head = '<div class="pinbox"><img src="img/logo.jpg" alt=""><h1 class="logo">Pisa</h1><p>Panel de gestión</p>';
    if (remoteFailed) $('#app').innerHTML = head + '<p class="warn">Sin conexión con el servidor. Revisá internet y recargá la página.</p></div>';
    else if (!authReady) $('#app').innerHTML = head + '<p class="hint">Conectando…</p></div>';
    else {
      $('#app').innerHTML = head + `<input id="lg-user" type="text" autocomplete="username" autocapitalize="none" placeholder="Usuario" aria-label="Usuario">
        <input id="lg-pass" type="password" autocomplete="current-password" placeholder="Contraseña" aria-label="Contraseña">
        <button class="btn primary block" data-act="login">Entrar</button><a class="hint" href="./">Volver a la carta</a></div>`;
      $('#lg-user').focus();
    }
  }
  netState();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', boot);
boot();
initRemote();
