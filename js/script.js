const PREVIEW_PHOTO_OVERRIDES = {};
// ── GALLERY DATA & RENDERING (7 categories, auto-detects uploaded photos) ──
//
// HOW TO ADD PHOTOS: just upload them into the matching GitHub folder —
//   images/handmade/  images/cnc/  images/kada/  images/extra/
//   images/luxury/  images/special/  images/complicated/
// with ANY filename you like (my-photo.jpg, IMG_2044.png, whatever) — no
// renaming needed. The site figures out your GitHub username/repo directly
// from the page's own URL (since it's hosted at yourusername.github.io/repo/)
// and asks GitHub "what files are actually in this folder?" No setup needed.
//
// Using a custom domain instead of the default github.io address? Fill these
// in manually — otherwise leave them blank and auto-detection handles it.
const GITHUB_USER_OVERRIDE = '';   // e.g. 'yourusername' — only needed for a custom domain
const GITHUB_REPO_OVERRIDE = '';   // e.g. 'your-repo-name' — only needed for a custom domain
const GITHUB_BRANCH = 'main';      // change if your default branch is different

const galleryCategories = {
  handmade:    { label: "Hand Made Bangle Design", icon: "✋" },
  cnc:         { label: "CNC Bangle Design",        icon: "⚙" },
  kada:        { label: "Kada Design",               icon: "◎" },
  extra:       { label: "Extra Design Model",        icon: "✦" },
  luxury:      { label: "Luxury Bangle Design",      icon: "♛" },
  special:     { label: "Special Design",            icon: "★" },
  complicated: { label: "Complicated Design Model",  icon: "❖" }
};

const GALLERY_MAX_PROBE = 100;       // fallback-mode upper safety limit per category
const GALLERY_MAX_GAP = 4;           // fallback-mode: stop after this many missing numbers in a row
let galleryRenderToken = 0;          // lets a new tab click cancel an in-progress scan
const githubFolderCache = {};        // avoids re-querying GitHub every time a tab is reopened

// Works out { user, repo } from the current URL if it's a *.github.io address,
// or from the manual overrides above for a custom domain. Returns null if
// neither is available (e.g. testing the file locally) — that just means the
// legacy numbered-file fallback is used instead.
function detectGithubInfo(){
  if (GITHUB_USER_OVERRIDE && GITHUB_REPO_OVERRIDE) {
    return { user: GITHUB_USER_OVERRIDE, repo: GITHUB_REPO_OVERRIDE };
  }
  const host = location.hostname;
  if (!host.endsWith('.github.io')) return null;
  const user = host.split('.')[0];
  const segments = location.pathname.split('/').filter(Boolean);
  // A repo named "username.github.io" is served at the root (no path segment);
  // any other repo name shows up as the first path segment.
  const repo = segments.length > 0 ? segments[0] : (user + '.github.io');
  return { user, repo };
}

// Ask GitHub's API what files actually exist in images/<catKey>/ — works with any filename.
async function fetchGithubFolderImages(catKey){
  if (githubFolderCache[catKey]) return githubFolderCache[catKey];
  const info = detectGithubInfo();
  if (!info) throw new Error('Not running on github.io and no manual override set.');
  const apiUrl = 'https://api.github.com/repos/' + info.user + '/' + info.repo +
                 '/contents/images/' + catKey + '?ref=' + GITHUB_BRANCH;
  const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error('GitHub API error: ' + res.status);
  const list = await res.json();
  const images = (Array.isArray(list) ? list : [])
    .filter(f => f.type === 'file' && /\.(jpe?g|png|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(f => f.download_url);
  githubFolderCache[catKey] = images;
  return images;
}

function probeImage(src){
  return new Promise((resolve) => {
    const m = src.match(/images\/([a-z]+)\/(\d+)\.jpg/);
    const key = m ? (m[1] + '/' + m[2]) : null;
    if (key && PREVIEW_PHOTO_OVERRIDES[key]) { resolve(true); return; }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function buildGalleryItem(catKey, num, src){
  const cat = galleryCategories[catKey];
  const name = cat.label + " " + num;

  const item = document.createElement('div');
  item.className = 'gallery-item real-img';

  const img = document.createElement('img');
  img.src = (PREVIEW_PHOTO_OVERRIDES[catKey + '/' + num]) || src;
  img.alt = name;
  img.loading = 'lazy';
  img.style.cssText = 'width:100%;display:block;object-fit:cover;';

  const overlay = document.createElement('div');
  overlay.className = 'gallery-overlay';
  overlay.innerHTML = '<div style="text-align:center;"><div class="gallery-zoom">⊕</div>' +
    '<div style="font-family:var(--font-tamil);font-size:0.7rem;color:var(--gold-pale);margin-top:0.3rem;">' + name + '</div></div>';

  item.appendChild(img);
  item.appendChild(overlay);
  return item;
}

function buildEmptyState(catKey){
  const cat = galleryCategories[catKey];
  const div = document.createElement('div');
  div.className = 'gallery-empty';
  div.innerHTML = '<span class="gallery-icon-large">' + cat.icon + '</span>' +
    '<span class="gallery-label">இன்னும் படங்கள் பதிவேற்றப்படவில்லை<br>No designs uploaded yet</span>';
  return div;
}

async function renderGallery(catKey){
  const myToken = ++galleryRenderToken;
  const grid = document.getElementById('galleryGrid');
  const metaEl = document.getElementById('galleryMetaText');
  const cat = galleryCategories[catKey];

  grid.innerHTML = '';
  metaEl.textContent = cat.label + ' — Loading...';

  // ── Primary method: ask GitHub what's really in the folder (any filename works) ──
  try {
    const images = await fetchGithubFolderImages(catKey);
    if (myToken !== galleryRenderToken) return;
    if (images.length > 0) {
      images.forEach((src, i) => grid.appendChild(buildGalleryItem(catKey, i + 1, src)));
      metaEl.textContent = cat.label + ' — ' + images.length + ' Designs';
      return;
    } else {
      grid.appendChild(buildEmptyState(catKey));
      metaEl.textContent = cat.label + ' — 0 Designs';
      return;
    }
  } catch (e) {
    console.warn('GitHub folder lookup failed, falling back to numbered-file mode:', e);
    // falls through to the legacy method below
  }

  // ── Fallback method: numbered files (1.jpg, 2.jpg, 3.jpg...) ──
  // Used automatically if GITHUB_USER/GITHUB_REPO above aren't filled in yet,
  // or if the GitHub API call fails for any reason (e.g. rate limit).
  let foundCount = 0;
  let misses = 0;
  for (let n = 1; n <= GALLERY_MAX_PROBE; n++){
    if (myToken !== galleryRenderToken) return;
    const src = 'images/' + catKey + '/' + n + '.jpg';
    const ok = await probeImage(src);
    if (myToken !== galleryRenderToken) return;

    if (ok){
      grid.appendChild(buildGalleryItem(catKey, n, src));
      foundCount++;
      misses = 0;
      metaEl.textContent = cat.label + ' — ' + foundCount + ' Designs';
    } else {
      misses++;
      if (misses >= GALLERY_MAX_GAP) break;
    }
  }

  if (foundCount === 0){
    grid.appendChild(buildEmptyState(catKey));
    metaEl.textContent = cat.label + ' — 0 Designs';
  } else {
    metaEl.textContent = cat.label + ' — ' + foundCount + ' Designs';
  }
}

function switchGallery(catKey, btn){
  document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderGallery(catKey);
}

// ── VIDEOS ──
// Upload video files (any filename, e.g. cutting-demo.mp4) into a "videos"
// folder at the ROOT of your GitHub repo — same level as index.html and
// images/, NOT inside images/. Works exactly like the photo gallery: GitHub
// is asked directly what's in the folder, so any filename works.
let videoListCache = null;

async function fetchGithubVideos(){
  if (videoListCache) return videoListCache;
  const info = detectGithubInfo();
  if (!info) throw new Error('Not running on github.io and no manual override set.');
  const apiUrl = 'https://api.github.com/repos/' + info.user + '/' + info.repo +
                 '/contents/videos?ref=' + GITHUB_BRANCH;
  const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error('GitHub API error: ' + res.status);
  const list = await res.json();
  const videos = (Array.isArray(list) ? list : [])
    .filter(f => f.type === 'file' && /\.(mp4|webm|mov|m4v)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(f => ({ src: f.download_url, name: f.name.replace(/\.[^.]+$/, '') }));
  videoListCache = videos;
  return videos;
}

function buildVideoItem(video, index){
  const wrap = document.createElement('div');
  wrap.className = 'video-item';

  const vid = document.createElement('video');
  vid.src = video.src;
  vid.controls = true;
  vid.preload = 'metadata';
  vid.playsInline = true;

  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = video.name || ('Video ' + (index + 1));

  wrap.appendChild(vid);
  wrap.appendChild(label);
  return wrap;
}

function buildVideoEmptyState(){
  const div = document.createElement('div');
  div.className = 'video-empty';
  div.innerHTML = '<span class="gallery-icon-large">🎬</span>' +
    '<span class="gallery-label">இன்னும் வீடியோக்கள் பதிவேற்றப்படவில்லை<br>No videos uploaded yet</span>';
  return div;
}

async function renderVideos(){
  const grid = document.getElementById('videosGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="video-loading">Loading videos...</div>';
  try {
    const videos = await fetchGithubVideos();
    grid.innerHTML = '';
    if (videos.length === 0) {
      grid.appendChild(buildVideoEmptyState());
      return;
    }
    videos.forEach((v, i) => grid.appendChild(buildVideoItem(v, i)));
  } catch (e) {
    console.warn('Video lookup failed:', e);
    grid.innerHTML = '';
    grid.appendChild(buildVideoEmptyState());
  }
}

if (document.getElementById('videosGrid')) {
  renderVideos();
}

// Lightbox works for all gallery items via event delegation (handles tab switches too)
let lightboxItems = [];
let lightboxIndex = -1;

function getCaptionText(item, img){
  const cap = item.querySelector('[style*="color:var(--gold-pale)"]');
  return cap ? cap.textContent : img.alt;
}

function showLightboxAt(index){
  if (!lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  const img = item.querySelector('img');
  const lbImg = document.getElementById('lightbox-img');
  lbImg.src = img.src;
  lbImg.classList.remove('zoomed');
  lbImg.style.transformOrigin = 'center center';
  document.getElementById('lightbox-caption').textContent = getCaptionText(item, img);
}

const galleryGridEl = document.getElementById('galleryGrid');
if (galleryGridEl) {
  galleryGridEl.addEventListener('click', function(e){
    const item = e.target.closest('.real-img');
    if (!item) return;
    lightboxItems = Array.from(document.querySelectorAll('#galleryGrid .real-img'));
    lightboxIndex = lightboxItems.indexOf(item);
    showLightboxAt(lightboxIndex);
    document.getElementById('lightbox').classList.add('open');
  });
}

document.getElementById('lightbox-prev').addEventListener('click', function(e){
  e.stopPropagation();
  showLightboxAt(lightboxIndex - 1);
});
document.getElementById('lightbox-next').addEventListener('click', function(e){
  e.stopPropagation();
  showLightboxAt(lightboxIndex + 1);
});

// ── LIGHTBOX 2x ZOOM ──
// Click the enlarged image to zoom to 2x, centered on the click point.
// While zoomed, moving the mouse pans around the image. Click again to zoom back out.
(function(){
  const lbImg = document.getElementById('lightbox-img');

  function setZoomOrigin(e){
    const rect = lbImg.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    lbImg.style.transformOrigin = xPct + '% ' + yPct + '%';
  }

  lbImg.addEventListener('click', function(e){
    e.stopPropagation();
    if (!lbImg.classList.contains('zoomed')) {
      setZoomOrigin(e);
      lbImg.classList.add('zoomed');
    } else {
      lbImg.classList.remove('zoomed');
    }
  });

  lbImg.addEventListener('mousemove', function(e){
    if (lbImg.classList.contains('zoomed')) setZoomOrigin(e);
  });
})();

// Initial render (only on the Gallery page, which has #galleryGrid)
if (document.getElementById('galleryGrid')) {
  renderGallery('handmade');
}

// ── HERO BACKGROUND (auto-updates, same idea as the photo gallery) ──
// The hero now supports up to 5 images that crossfade in a repeating slideshow.
//
// To set hero backgrounds: upload up to 5 images (any filenames) into
// images/hero/ (e.g. images/hero/banner-1.jpg, banner-2.jpg, ...) and they're
// picked up automatically and sorted by filename, the same way the gallery
// folders work. If only 1 image is found, it's shown as a static background
// (no slideshow). More than 5 found? Only the first 5 (alphabetically) are used.
//
// Testing locally (not on github.io)? It also checks for fixed filenames
// images/hero-bg-1.jpg ... hero-bg-5.jpg (jpg/jpeg/png/webp), falling back
// further to a single images/hero-bg.jpg / .jpeg / .png / .webp if none of
// the numbered ones exist.
let heroBgCache = null;
const HERO_SLIDE_INTERVAL = 5500; // ms between slides
const HERO_FADE_MS = 2200;        // must roughly match the CSS transition duration

async function fetchGithubHeroImages(){
  if (heroBgCache !== null) return heroBgCache;
  const info = detectGithubInfo();
  if (!info) throw new Error('Not running on github.io and no manual override set.');
  const apiUrl = 'https://api.github.com/repos/' + info.user + '/' + info.repo +
                 '/contents/images/hero?ref=' + GITHUB_BRANCH;
  const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error('GitHub API error: ' + res.status);
  const list = await res.json();
  const images = (Array.isArray(list) ? list : [])
    .filter(f => f.type === 'file' && /\.(jpe?g|png|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .slice(0, 5)
    .map(f => f.download_url);
  heroBgCache = images;
  return heroBgCache;
}

function buildHeroSlides(container, srcs){
  container.innerHTML = '';
  srcs.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero-bg-slide' + (i === 0 ? ' active' : '');
    slide.style.backgroundImage = "url('" + src + "')";
    container.appendChild(slide);
  });

  if (srcs.length <= 1) return; // nothing to cycle

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // keep the first slide static

  let current = 0;
  setInterval(() => {
    const slides = container.querySelectorAll('.hero-bg-slide');
    if (!slides.length) return;
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, HERO_SLIDE_INTERVAL);
}

async function loadHeroBackground(){
  const container = document.querySelector('.hero-bg-slides');
  if (!container) return; // not on a page with the hero section

  // Primary: ask GitHub what's really inside images/hero/ (any filenames work)
  try {
    const srcs = await fetchGithubHeroImages();
    if (srcs && srcs.length) {
      buildHeroSlides(container, srcs);
      return;
    }
  } catch (e) {
    console.warn('GitHub hero image lookup failed, falling back to fixed filenames:', e);
  }

  // Fallback: probe up to 5 numbered filenames directly (useful when testing locally)
  const exts = ['jpg', 'jpeg', 'png', 'webp'];
  const numberedSrcs = [];
  for (let n = 1; n <= 5; n++){
    for (const ext of exts){
      const candidate = 'images/hero-bg-' + n + '.' + ext;
      if (await probeImage(candidate)) {
        numberedSrcs.push(candidate);
        break;
      }
    }
  }
  if (numberedSrcs.length) {
    buildHeroSlides(container, numberedSrcs);
    return;
  }

  // Last resort: a single fixed filename, same as before
  const candidates = ['images/hero-bg.jpg', 'images/hero-bg.jpeg', 'images/hero-bg.png', 'images/hero-bg.webp'];
  for (const src of candidates){
    if (await probeImage(src)) {
      buildHeroSlides(container, [src]);
      return;
    }
  }
  // Nothing found anywhere — hero-bg-slides stays empty, plain gradient shows.
}

loadHeroBackground();

// ── PARTICLES (only on the Home page hero, which has #particles)
(function(){
  const container = document.getElementById('particles');
  if (!container) return;
  const count = 30;
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random()*100}%;
      width: ${Math.random()*3+1}px;
      height: ${Math.random()*3+1}px;
      animation-duration: ${Math.random()*15+8}s;
      animation-delay: ${Math.random()*10}s;
      opacity: ${Math.random()*0.5+0.1};
    `;
    container.appendChild(p);
  }
})();

// ── NAVBAR SCROLL
window.addEventListener('scroll', function(){
  const nb = document.getElementById('navbar');
  if(window.scrollY > 50) nb.classList.add('scrolled');
  else nb.classList.remove('scrolled');
});

// ── MOBILE NAV
function toggleNav(){
  document.getElementById('navLinks').classList.toggle('open');
}
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('open'));
});

// ── SCROLL REVEAL
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if(e.isIntersecting) { e.target.classList.add('visible'); }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── LIGHTBOX (real-img click handling is done via delegation in the gallery script above)
document.getElementById('lightbox').addEventListener('click', function(e){
  if(e.target === this) closeLightbox();
});
function closeLightbox(){
  document.getElementById('lightbox').classList.remove('open');
}
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') showLightboxAt(lightboxIndex + 1);
  if (e.key === 'ArrowLeft') showLightboxAt(lightboxIndex - 1);
});

// ── CONTACT FORM ──
// Static sites can't run a server-side "send email" action on their own, so this
// builds a WhatsApp message from the form fields and automatically opens a chat
// to your business number with everything pre-filled — the visitor just has to
// tap "Send" inside WhatsApp. Change WHATSAPP_NUMBER below if the number changes.
const WHATSAPP_NUMBER = '919965988885';

function handleSubmit(){
  const name = document.getElementById('orderName').value.trim();
  const phone = document.getElementById('orderPhone').value.trim();
  const email = document.getElementById('orderEmail').value.trim();
  const service = document.getElementById('orderService').value;
  const message = document.getElementById('orderMessage').value.trim();
  const btn = event.target;

  if (!name || !phone) {
    alert('பெயர் மற்றும் தொலைபேசி எண்ணை நிரப்பவும் / Please fill in your name and phone number.');
    return;
  }

  const lines = [
    'புதிய ஆர்டர் விசாரணை / New Order Enquiry',
    'பெயர் (Name): ' + name,
    'தொலைபேசி (Phone): ' + phone
  ];
  if (email) lines.push('மின்னஞ்சல் (Email): ' + email);
  if (service) lines.push('சேவை வகை (Service): ' + service);
  if (message) lines.push('செய்தி (Message): ' + message);

  const waText = encodeURIComponent(lines.join('\n'));
  const waUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waText;

  // Open WhatsApp immediately (must happen synchronously in the click handler,
  // otherwise browsers treat it as a blocked popup instead of a user action).
  window.open(waUrl, '_blank');

  // Purely visual feedback on the button — doesn't delay the WhatsApp redirect above.
  btn.disabled = true;
  btn.classList.add('btn-sending');
  btn.innerHTML = '<span class="btn-spinner"></span> அனுப்புகிறது...';

  setTimeout(() => {
    btn.classList.remove('btn-sending');
    btn.classList.add('btn-sent');
    btn.innerHTML = '✓ WhatsApp-க்கு அனுப்பப்பட்டது!';

    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('btn-sent');
      btn.textContent = 'ஆர்டர் அனுப்புங்கள்';
    }, 3200);
  }, 500);
}
