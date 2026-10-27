/* ============ BookHub: data buku dari Open Library API ============ */
// Daftar buku tidak lagi ditulis manual. Semua buku, cover, dan deskripsi diambil
// langsung dari https://openlibrary.org (gratis, tanpa API key).

/* ============ KATEGORI ============ */
// subject = kata kunci subjek yang dipakai untuk mencari buku di API
const categories = [
  { name: "Fiction",          icon: "📖", subject: "fiction",    desc: "Novel dan cerita yang membawamu ke dunia lain." },
  { name: "Non-Fiction",      icon: "📰", subject: "biography",  desc: "Kisah nyata, biografi, dan wawasan dunia." },
  { name: "Self Development", icon: "🌱", subject: "self-help",  desc: "Kebiasaan dan pola pikir untuk berkembang." },
  { name: "Technology",       icon: "💻", subject: "technology", desc: "Pemrograman, AI, dan inovasi digital." },
  { name: "Business",         icon: "📈", subject: "business",   desc: "Strategi, keuangan, dan kepemimpinan." },
  { name: "Education",        icon: "🎓", subject: "education",  desc: "Belajar dan mengajar dengan lebih efektif." },
  { name: "Science",          icon: "🔬", subject: "science",    desc: "Alam semesta, tubuh, dan cara kerja dunia." },
  { name: "History",          icon: "🏛️", subject: "history",    desc: "Peristiwa dan peradaban dari masa lalu." }
];

/* ============ HELPER ============ */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add("hidden"), 2000);
}

try { localStorage.removeItem("ebook-covers"); } catch (e) {} // sisa cache versi lama

// Data buku yang sedang ditampilkan: { id: {id, title, author, coverId, year, cat} }
const bookStore = {};
function remember(list) { list.forEach((b) => { bookStore[b.id] = b; }); }

/* ============ COVER ============ */
const palette = ["#3478F6", "#1B2B4B", "#2A9D8F", "#5B6CFF", "#E76F51", "#264653", "#F4A261", "#8D5A44", "#6B705C", "#C44569", "#4A4E9C", "#2B9348"];

// Cover cadangan (SVG) jika buku tidak punya gambar cover
function generatedCover(book) {
  const color = palette[[...book.title].reduce((s, ch) => s + ch.charCodeAt(0), 0) % palette.length];
  const lines = [];
  let line = "";
  book.title.split(" ").forEach((w) => {
    if ((line + " " + w).trim().length > 13) { lines.push(line.trim()); line = w; }
    else line += " " + w;
  });
  lines.push(line.trim());
  const text = lines.slice(0, 4).map((l, i) =>
    `<text x="24" y="${110 + i * 32}" fill="#fff" font-family="Poppins,Arial,sans-serif" font-size="26" font-weight="700">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <rect width="300" height="450" fill="${color}"/>
    <rect width="14" height="450" fill="#000" opacity=".15"/>
    <circle cx="250" cy="400" r="90" fill="#fff" opacity=".12"/>
    ${text}
    <text x="24" y="415" fill="#fff" opacity=".85" font-family="Poppins,Arial,sans-serif" font-size="15">${esc(book.author)}</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// size: S, M, atau L. ?default=false membuat cover yang tidak ada menghasilkan error -> cadangan dipakai
function coverSrc(b, size) {
  return b.coverId ? `https://covers.openlibrary.org/b/id/${b.coverId}-${size}.jpg?default=false` : generatedCover(b);
}
function fallbackCover(img) {
  img.onerror = null;
  img.src = generatedCover(bookStore[img.dataset.id]);
}

/* ============ AKUN: SIGN IN / SIGN UP / SIGN OUT ============ */
// CATATAN: ini simulasi di browser (localStorage) untuk belajar. Untuk website sungguhan,
// login dan penyimpanan password harus diproses di server.
let currentUser = null;   // { name, email, joined } atau null jika belum sign in
let library = {};         // Format: { "1": { status: "Reading", progress: 40 }, ... }
const profileIcon = $("#profileBtn").innerHTML;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function getUsers() {
  try { return JSON.parse(localStorage.getItem("ebook-users")) || {}; } catch (e) { return {}; }
}
function saveUsers(users) {
  try { localStorage.setItem("ebook-users", JSON.stringify(users)); } catch (e) {}
}
// Hash sederhana (hanya agar password tidak tersimpan sebagai teks biasa)
function hashPassword(text) {
  let h = 5381;
  for (const ch of text) h = (h * 33) ^ ch.charCodeAt(0);
  return String(h >>> 0);
}

// Baca sesi login + koleksi milik user tersebut
function loadSession() {
  let email = null;
  try { email = localStorage.getItem("ebook-session"); } catch (e) {}
  const user = getUsers()[email];
  currentUser = user ? { name: user.name, email: user.email, joined: user.joined } : null;
  library = {};
  if (currentUser) {
    try { library = JSON.parse(localStorage.getItem("ebook-library:" + currentUser.email)) || {}; } catch (e) {}
    // Buang data lama (format ID angka) yang tidak punya judul
    Object.keys(library).forEach((k) => { if (!library[k] || !library[k].title) delete library[k]; });
  }
}

// Koleksi disimpan per akun
function saveLibrary() {
  if (!currentUser) return;
  try { localStorage.setItem("ebook-library:" + currentUser.email, JSON.stringify(library)); } catch (e) {}
}

function startSession(email) {
  try { localStorage.setItem("ebook-session", email); } catch (e) {}
  loadSession(); updateAuthUI(); renderLibrary(); renderAccount();
}

// Mengembalikan pesan error, atau "" jika berhasil
function signUp(name, email, pass, confirm) {
  name = name.trim(); email = email.trim().toLowerCase();
  const users = getUsers();
  if (!name) return "Nama wajib diisi.";
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Format email tidak valid.";
  if (pass.length < 6) return "Password minimal 6 karakter.";
  if (pass !== confirm) return "Konfirmasi password tidak sama.";
  if (users[email]) return "Email sudah terdaftar. Silakan Sign In.";
  users[email] = { name, email, pass: hashPassword(email + pass), joined: new Date().toISOString() };
  saveUsers(users);
  startSession(email);
  return "";
}

function signIn(email, pass) {
  email = email.trim().toLowerCase();
  const user = getUsers()[email];
  if (!user || user.pass !== hashPassword(email + pass)) return "Email atau password salah.";
  startSession(email);
  return "";
}

function signOut() {
  try { localStorage.removeItem("ebook-session"); } catch (e) {}
  loadSession(); updateAuthUI(); renderLibrary(); renderAccount();
  showToast("Kamu sudah Sign Out");
}

// Tampilan tombol profil + menu dropdown sesuai status login
function updateAuthUI() {
  const btn = $("#profileBtn"), menu = $("#profileMenu");
  btn.classList.toggle("signed", !!currentUser);
  if (currentUser) {
    btn.textContent = currentUser.name.charAt(0).toUpperCase();
    menu.innerHTML = `
      <div class="menu-user"><strong>${esc(currentUser.name)}</strong><span>${esc(currentUser.email)}</span></div>
      <a class="menu-item" href="#account">My Account</a>
      <a class="menu-item" href="#library">My Library</a>
      <button class="menu-item" data-signout>Sign Out</button>`;
  } else {
    btn.innerHTML = profileIcon;
    menu.innerHTML = `
      <button class="menu-item" data-auth="signin">Sign In</button>
      <button class="menu-item" data-auth="signup">Sign Up</button>`;
  }
}

function closeProfileMenu() { $("#profileMenu").classList.add("hidden"); }

// Modal Sign In / Sign Up
function openAuth(tab) {
  const signin = tab !== "signup";
  $("#authTitle").textContent = signin ? "Sign In" : "Sign Up";
  $("#signinForm").classList.toggle("hidden", !signin);
  $("#signupForm").classList.toggle("hidden", signin);
  $$(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.auth === (signin ? "signin" : "signup")));
  ["siError", "suError"].forEach((id) => { $("#" + id).textContent = ""; });
  $("#authModal").classList.remove("hidden");
  $(signin ? "#siEmail" : "#suName").focus();
}
function closeAuth() { $("#authModal").classList.add("hidden"); }

// Halaman My Account
function renderAccount() {
  $("#accountGuest").classList.toggle("hidden", !!currentUser);
  $("#accountUser").classList.toggle("hidden", !currentUser);
  if (!currentUser) return;
  const items = Object.values(library);
  $("#acAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
  $("#acName").textContent = currentUser.name;
  $("#acEmail").textContent = currentUser.email;
  $("#acJoined").textContent = "Bergabung " + new Date(currentUser.joined)
    .toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  $("#statTotal").textContent = items.length;
  $("#statReading").textContent = items.filter((i) => i.status === "Reading").length;
  $("#statDone").textContent = items.filter((i) => i.status === "Completed").length;
  $("#apName").value = currentUser.name;
  $("#apEmail").value = currentUser.email;
}

function setupAuth() {
  $("#authClose").addEventListener("click", closeAuth);
  $("#authModal").addEventListener("click", (e) => { if (e.target.id === "authModal") closeAuth(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeAuth(); closeProfileMenu(); } });

  $("#signinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = signIn($("#siEmail").value, $("#siPass").value);
    $("#siError").textContent = err;
    if (!err) { e.target.reset(); closeAuth(); showToast("Selamat datang, " + currentUser.name); }
  });

  $("#signupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = signUp($("#suName").value, $("#suEmail").value, $("#suPass").value, $("#suConfirm").value);
    $("#suError").textContent = err;
    if (!err) { e.target.reset(); closeAuth(); showToast("Akun berhasil dibuat. Selamat datang!"); }
  });

  // Ubah nama
  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#apName").value.trim();
    if (!name) { showToast("Nama tidak boleh kosong"); return; }
    const users = getUsers();
    users[currentUser.email].name = name;
    saveUsers(users);
    loadSession(); updateAuthUI(); renderAccount();
    showToast("Profil diperbarui");
  });

  // Ubah password
  $("#passwordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const users = getUsers(), msg = $("#pwMsg"), email = currentUser.email;
    if (users[email].pass !== hashPassword(email + $("#pwOld").value)) { msg.textContent = "Password saat ini salah."; return; }
    if ($("#pwNew").value.length < 6) { msg.textContent = "Password baru minimal 6 karakter."; return; }
    users[email].pass = hashPassword(email + $("#pwNew").value);
    saveUsers(users);
    msg.textContent = "";
    e.target.reset();
    showToast("Password diperbarui");
  });

  // Hapus akun
  $("#deleteAccount").addEventListener("click", () => {
    if (!confirm("Hapus akun dan seluruh koleksimu? Tindakan ini tidak bisa dibatalkan.")) return;
    const users = getUsers(), email = currentUser.email;
    delete users[email];
    saveUsers(users);
    try { localStorage.removeItem("ebook-library:" + email); } catch (e) {}
    signOut();
    showToast("Akun dihapus");
  });
}


/* ============ API OPEN LIBRARY ============ */
const API = "https://openlibrary.org";
const PAGE_SIZE = 20;
const apiCache = {}; // simpan hasil agar request yang sama tidak diulang

async function getJSON(url) {
  if (apiCache[url]) return apiCache[url];
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  apiCache[url] = await res.json();
  return apiCache[url];
}

// Tebak kategori website dari daftar subjek milik buku
function guessCategory(subjects) {
  const list = (subjects || []).map((s) => s.toLowerCase());
  const found = categories.find((c) => list.some((s) => s === c.subject || s.startsWith(c.subject + " ")));
  return found ? found.name : "General";
}

// Ubah satu hasil API menjadi objek buku sederhana
function toBook(doc, cat) {
  return {
    id: doc.key.replace("/works/", ""),
    title: doc.title,
    author: (doc.author_name && doc.author_name[0]) || "Unknown author",
    coverId: doc.cover_i || 0,
    year: doc.first_publish_year || "",
    cat: cat || guessCategory(doc.subject)
  };
}

// Cari buku: kata kunci + kategori (opsional). Tanpa keduanya = buku paling banyak dibaca.
async function searchBooks({ query = "", cat = "All", page = 1, limit = PAGE_SIZE } = {}) {
  const category = categories.find((c) => c.name === cat);
  const parts = [];
  if (query) parts.push(query);
  if (category) parts.push(`subject:"${category.subject}"`);
  if (!parts.length) parts.push("language:eng");

  const url = `${API}/search.json?q=${encodeURIComponent(parts.join(" "))}`
    + "&fields=key,title,author_name,cover_i,first_publish_year,subject"
    + `&limit=${limit}&page=${page}` + (query ? "" : "&sort=readinglog");
  const data = await getJSON(url);
  return {
    total: data.numFound || 0,
    books: (data.docs || []).filter((d) => d.key && d.title).map((d) => toBook(d, category ? category.name : ""))
  };
}

// Pesan error + tombol "Coba Lagi"
const errorBox = (action) => `
  <div class="empty">
    <p>Gagal memuat data dari Open Library. Periksa koneksi internetmu.</p>
    <button class="btn light" data-retry="${action}">Coba Lagi</button>
  </div>`;
const loadingBox = (text) => `<p class="empty">${text}</p>`;

/* ============ KARTU BUKU ============ */
function bookCard(b) {
  return `
    <article class="card book">
      <img src="${coverSrc(b, "M")}" alt="Cover ${esc(b.title)}" data-read="${esc(b.id)}" data-id="${esc(b.id)}" loading="lazy" onerror="fallbackCover(this)">
      <h3>${esc(b.title)}</h3>
      <p class="author">${esc(b.author)}</p>
      <span class="tag">${esc(b.cat)}</span>
      <button class="btn" data-read="${esc(b.id)}">Read</button>
    </article>`;
}

/* ============ HOME: POPULAR BOOKS ============ */
async function loadPopular() {
  $("#popularGrid").innerHTML = loadingBox("Memuat buku populer...");
  try {
    const r = await searchBooks({ limit: 5 });
    remember(r.books);
    $("#popularGrid").innerHTML = r.books.map(bookCard).join("");
  } catch (e) {
    $("#popularGrid").innerHTML = errorBox("popular");
  }
}

/* ============ BOOKS: SEARCH + FILTER + LOAD MORE ============ */
const bookState = { query: "", cat: "All", page: 1, shown: 0 };
let bookReq = 0, booksLoaded = false, booksDirty = false;

async function loadBooks(reset = true) {
  const req = ++bookReq; // untuk mengabaikan hasil lama jika pengguna mengetik lagi
  booksLoaded = true;
  if (reset) {
    bookState.page = 1; bookState.shown = 0;
    $("#booksGrid").innerHTML = loadingBox("Memuat buku...");
    $("#bookCount").textContent = "";
    $("#loadMore").classList.add("hidden");
  } else {
    bookState.page++;
  }
  $("#loadMore").disabled = true;

  try {
    const r = await searchBooks(bookState);
    if (req !== bookReq) return;
    remember(r.books);
    const html = r.books.map(bookCard).join("");
    $("#booksGrid").innerHTML = reset
      ? (html || `<div class="empty">Tidak ada buku yang cocok. Coba kata kunci lain.</div>`)
      : $("#booksGrid").innerHTML + html;
    bookState.shown += r.books.length;
    $("#bookCount").textContent = `${r.total.toLocaleString("id-ID")} buku ditemukan`;
    $("#loadMore").classList.toggle("hidden", !r.books.length || bookState.shown >= r.total);
  } catch (e) {
    if (req !== bookReq) return;
    if (reset) { $("#booksGrid").innerHTML = errorBox("books"); }
    else { bookState.page--; showToast("Gagal memuat buku berikutnya"); }
  }
  $("#loadMore").disabled = false;
}

function setupBookFilters() {
  $("#bookCategory").innerHTML = ["All", ...categories.map((c) => c.name)]
    .map((c) => `<option value="${c}">${c === "All" ? "Semua kategori" : c}</option>`).join("");

  let timer;
  $("#bookSearch").addEventListener("input", (e) => {   // tunggu sebentar setelah berhenti mengetik
    clearTimeout(timer);
    timer = setTimeout(() => { bookState.query = e.target.value.trim(); loadBooks(true); }, 450);
  });
  $("#bookCategory").addEventListener("change", (e) => { bookState.cat = e.target.value; loadBooks(true); });
  $("#loadMore").addEventListener("click", () => loadBooks(false));
}

// Cari dari navbar / hero, atau buka Books dengan kategori tertentu
function openBooks(query, cat) {
  bookState.query = query; bookState.cat = cat;
  $("#bookSearch").value = query; $("#bookCategory").value = cat;
  booksDirty = true;
  if (location.hash === "#books") showPage(); else location.hash = "books";
}

/* ============ CATEGORIES ============ */
let countsLoaded = false, currentCategory = "";

function renderCategories() {
  $("#categoryGrid").innerHTML = categories.map((c) => `
    <button class="card cat-card" data-cat="${c.name}">
      <div class="icon">${c.icon}</div>
      <h3>${c.name}</h3>
      <p>${c.desc}</p>
      <span class="count">...</span>
    </button>`).join("");
}

// Jumlah buku per kategori diambil dari API (limit=0 -> hanya mengambil total)
function loadCategoryCounts() {
  countsLoaded = true;
  categories.forEach(async (c, i) => {
    const el = $$(".cat-card .count")[i];
    try {
      const url = `${API}/search.json?q=${encodeURIComponent(`subject:"${c.subject}"`)}&limit=0&fields=key`;
      el.textContent = (await getJSON(url)).numFound.toLocaleString("id-ID") + " buku";
    } catch (e) { el.textContent = "Lihat buku"; }
  });
}

async function showCategory(name) {
  currentCategory = name;
  $$(".cat-card").forEach((el) => el.classList.toggle("active", el.dataset.cat === name));
  $("#categoryTitle").textContent = name;
  $("#categoryBooks").innerHTML = loadingBox("Memuat buku...");
  $("#categoryResult").classList.remove("hidden");
  $("#categoryResult").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const r = await searchBooks({ cat: name });
    if (name !== currentCategory) return;
    remember(r.books);
    $("#categoryBooks").innerHTML = r.books.map(bookCard).join("");
  } catch (e) {
    if (name === currentCategory) $("#categoryBooks").innerHTML = errorBox("category");
  }
}

/* ============ MY LIBRARY ============ */
let libraryFilter = "All";

function statusFromProgress(p) {
  return p >= 100 ? "Completed" : p > 0 ? "Reading" : "Not Started";
}

function renderLibrary() {
  if (!currentUser) {
    $("#libraryGrid").innerHTML = `
      <div class="empty">
        <p>Sign in untuk melihat dan menyimpan koleksimu.</p>
        <button class="btn" data-auth="signin">Sign In</button>
      </div>`;
    return;
  }
  const ids = Object.keys(library).filter((id) => libraryFilter === "All" || library[id].status === libraryFilter);
  if (!ids.length) {
    $("#libraryGrid").innerHTML = `
      <div class="empty">
        <p>Belum ada buku di sini.</p>
        <a href="#books" class="btn">Jelajahi Buku</a>
      </div>`;
    return;
  }
  $("#libraryGrid").innerHTML = ids.map((id) => {
    const item = library[id];
    const b = { id, title: item.title, author: item.author, coverId: item.coverId, cat: item.cat };
    bookStore[id] = bookStore[id] || b;
    const css = item.status.replace(" ", "").toLowerCase();
    const bar = item.status === "Reading"
      ? `<div class="progress"><span style="width:${item.progress}%"></span></div>
         <p class="progress-label">${item.progress}% selesai</p>` : "";
    return `
      <article class="card book">
        <img src="${coverSrc(b, "M")}" alt="Cover ${esc(b.title)}" data-read="${esc(id)}" data-id="${esc(id)}" loading="lazy" onerror="fallbackCover(this)">
        <h3>${esc(b.title)}</h3>
        <p class="author">${esc(b.author)}</p>
        <p class="status ${css}">${item.status}</p>
        ${bar}
        <button class="btn" data-read="${esc(id)}">Continue Reading</button>
        <button class="remove" data-remove="${esc(id)}">Remove</button>
      </article>`;
  }).join("");
}

/* ============ MODAL BACA ============ */
let currentId = null;

async function loadDescription(id) {
  $("#mDesc").textContent = "Memuat deskripsi...";
  let text = "Deskripsi belum tersedia.";
  try {
    const work = await getJSON(`${API}/works/${id}.json`);
    let d = work.description;
    if (d && d.value) d = d.value;
    if (d) text = String(d).split(/\r?\n\r?\n/)[0];
    if (text.length > 500) text = text.slice(0, 500).trim() + "...";
  } catch (e) { text = "Deskripsi tidak dapat dimuat."; }
  if (id === currentId) $("#mDesc").textContent = text;
}

function openBook(id) {
  const b = bookStore[id];
  if (!b) return;
  const item = library[id];
  currentId = id;

  const img = $("#mCover");
  img.dataset.id = id;
  img.onerror = function () { fallbackCover(this); };
  img.src = coverSrc(b, "L");
  img.alt = "Cover " + b.title;
  $("#mCat").textContent = b.cat;
  $("#mTitle").textContent = b.title;
  $("#mAuthor").textContent = "oleh " + b.author + (b.year ? " · " + b.year : "");
  loadDescription(id);
  $("#mText").innerHTML = `
    <p><strong>Tampilan membaca</strong></p>
    <p>Geser slider di bawah untuk menandai sejauh mana kamu sudah membaca. Setiap perubahan tersimpan di My Library dan bisa dilanjutkan kapan saja.</p>
    <p><a class="link" href="https://openlibrary.org/works/${esc(id)}" target="_blank" rel="noopener">Lihat buku ini di Open Library</a></p>`;

  $("#mProgress").value = item ? item.progress : 0;
  $("#mPercent").textContent = (item ? item.progress : 0) + "%";
  $("#mStatus").value = item ? item.status : "Not Started";
  $("#mSave").textContent = item ? "Update Library" : "Save to Library";

  $("#modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modal").classList.add("hidden");
  document.body.style.overflow = "";
}

function saveCurrent() {
  if (!currentUser) {
    openAuth("signin");
    showToast("Sign in dulu untuk menyimpan ke My Library");
    return;
  }
  const b = bookStore[currentId];
  // Simpan data buku ikut di library, karena buku berasal dari API
  library[currentId] = {
    title: b.title, author: b.author, coverId: b.coverId, cat: b.cat,
    status: $("#mStatus").value, progress: Number($("#mProgress").value)
  };
  saveLibrary();
  renderLibrary();
  $("#mSave").textContent = "Update Library";
  showToast("Tersimpan di My Library");
}

function setupModal() {
  $("#mProgress").addEventListener("input", (e) => {
    $("#mPercent").textContent = e.target.value + "%";
    $("#mStatus").value = statusFromProgress(Number(e.target.value));
  });
  $("#mStatus").addEventListener("change", (e) => {
    const s = e.target.value, p = $("#mProgress");
    if (s === "Completed") p.value = 100;
    if (s === "Not Started") p.value = 0;
    if (s === "Reading" && (p.value == 0 || p.value == 100)) p.value = 10;
    $("#mPercent").textContent = p.value + "%";
  });
  $("#mSave").addEventListener("click", saveCurrent);
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

/* ============ NAVIGASI ANTAR HALAMAN ============ */
function showPage() {
  const page = location.hash.replace("#", "") || "home";
  const valid = ["home", "books", "categories", "library", "about", "account"];
  const name = valid.includes(page) ? page : "home";

  $$(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + name));
  $$(".nav-links a").forEach((a) => a.classList.toggle("active", a.dataset.page === name));
  $("#navLinks").classList.remove("open");
  window.scrollTo(0, 0);

  if (name === "books" && (!booksLoaded || booksDirty)) { booksDirty = false; loadBooks(true); }
  if (name === "categories" && !countsLoaded) loadCategoryCounts();
  if (name === "library") renderLibrary();
  if (name === "account") renderAccount();
}

/* ============ EVENT UTAMA ============ */
const retryActions = { popular: loadPopular, books: () => loadBooks(true), category: () => showCategory(currentCategory) };

function setupEvents() {
  document.addEventListener("click", (e) => {
    const read  = e.target.closest("[data-read]");
    const cat   = e.target.closest("[data-cat]");
    const del   = e.target.closest("[data-remove]");
    const auth  = e.target.closest("[data-auth]");
    const retry = e.target.closest("[data-retry]");
    if (auth) openAuth(auth.dataset.auth);
    if (e.target.closest("[data-signout]")) signOut();
    if (e.target.closest("#profileMenu .menu-item")) closeProfileMenu();
    if (retry) retryActions[retry.dataset.retry]();
    if (read) openBook(read.dataset.read);
    if (cat)  showCategory(cat.dataset.cat);
    if (del) {
      delete library[del.dataset.remove];
      saveLibrary(); renderLibrary();
      showToast("Dihapus dari My Library");
    }
  });

  $("#categoryClose").addEventListener("click", () => {
    $("#categoryResult").classList.add("hidden");
    $$(".cat-card").forEach((el) => el.classList.remove("active"));
  });
  $("#categoryMore").addEventListener("click", () => openBooks("", currentCategory));

  $("#libraryTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    libraryFilter = tab.dataset.status;
    $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    renderLibrary();
  });

  // Pencarian dari navbar & hero
  $("#navSearch").addEventListener("submit", (e) => { e.preventDefault(); openBooks($("#navSearchInput").value.trim(), "All"); $("#navSearchInput").value = ""; });
  $("#heroSearch").addEventListener("submit", (e) => { e.preventDefault(); openBooks($("#heroSearchInput").value.trim(), "All"); });

  $("#menuToggle").addEventListener("click", () => $("#navLinks").classList.toggle("open"));

  // Menu profil (dropdown)
  $("#profileBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#profileMenu").classList.toggle("hidden"); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".account-menu")) closeProfileMenu(); });

  window.addEventListener("hashchange", showPage);
}

/* ============ MULAI ============ */
loadSession();
updateAuthUI();
setupAuth();
renderCategories();
setupBookFilters();
setupModal();
setupEvents();
showPage();
loadPopular();