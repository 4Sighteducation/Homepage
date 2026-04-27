/**
 * VESPA Activity Hub (v1a)
 * Replaces the legacy "Worksheets" + "Curriculum" pages with a single improved hub.
 *
 * Runs on Knack scenes:
 * - scene_1169 (Worksheets)
 * - scene_1234 (Curriculum)
 *
 * Data source:
 * - Supabase `public.activity_kb` (AI KB table) for library + curriculum generation.
 *   We prefer fields: activity_code, name, vespa_element, level, short_summary, long_summary, pdf_link, pathway
 *
 * Notes:
 * - This file is intentionally framework-free (no React) to match Knack integration style.
 * - It gracefully degrades if `activity_kb.pathway` column doesn't exist yet (defaults to "both").
 */
(function () {
  'use strict';

  const BUILD = 'activityHub1c';
  const SCENES = new Set(['scene_1169', 'scene_1234', 'scene_1294']);

  // Supabase (public anon) — same project used by the other VESPA apps.
  const SUPABASE_URL_DEFAULT = 'https://qcdcdzfanrlvdcagmwmg.supabase.co';
  const SUPABASE_ANON_DEFAULT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZGNkemZhbnJsdmRjYWdtd21nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MDc4MjYsImV4cCI6MjA2OTQ4MzgyNn0.ahntO4OGSBfR2vnP_gMxfaRggP4eD5mejzq5sZegmME';

  const MONTHS = [
    'September', 'October', 'November', 'December',
    'January', 'February', 'March', 'April', 'May', 'June', 'July'
  ];
  const MONTH_INDEX = MONTHS.reduce((acc, m, i) => { acc[m] = i; return acc; }, {});
  const TERMS = {
    'Autumn 1': ['September', 'October'],
    'Autumn 2': ['November', 'December'],
    'Spring 1': ['January', 'February'],
    'Spring 2': ['March'],
    'Summer 1': ['April', 'May'],
    'Summer 2': ['June', 'July'],
  };
  const PROFILES = ['Low', 'Low-Mid', 'Mid', 'Mid-High', 'High'];
  const PROFILE_DESCS = {
    'Low': 'Significant support needed. Foundations of effort, organisation, and confidence.',
    'Low-Mid': 'Some foundations but inconsistent. Building routine and self-awareness.',
    'Mid': 'Solid students needing stretching. Balanced mix across all VESPA elements.',
    'Mid-High': 'Strong students ready for advanced strategies. Practice-focused.',
    'High': 'High-performers aiming for top grades. Advanced practice and independence.',
  };

  const VESPA = {
    VISION:   { label: 'Vision',   color: '#ff8f00', bg: '#FFF3E0' },
    EFFORT:   { label: 'Effort',   color: '#86b4f0', bg: '#E3F2FD' },
    SYSTEMS:  { label: 'Systems',  color: '#72cb44', bg: '#E8F5E9' },
    PRACTICE: { label: 'Practice', color: '#7f31a4', bg: '#F3E5F5' },
    ATTITUDE: { label: 'Attitude', color: '#f032e6', bg: '#FCE4EC' },
  };

  function pick(obj, key, fallback) {
    try {
      const v = obj && obj[key];
      return (v === undefined || v === null || v === '') ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function firstString(obj, keys) {
    try {
      for (const k of (keys || [])) {
        const v = obj && obj[k];
        const s = String(v || '').trim();
        if (s) return s;
      }
    } catch (_) {}
    return '';
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (k === 'class') n.className = v;
        else if (k === 'style') n.setAttribute('style', v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v === false || v === null || v === undefined) return;
        else n.setAttribute(k, String(v));
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c === null || c === undefined) return;
        if (typeof c === 'string') n.appendChild(document.createTextNode(c));
        else n.appendChild(c);
      });
    }
    return n;
  }

  function cleanupAssetModal() {
    try {
      const m = document.getElementById('vah-asset-mask');
      if (m) m.remove();
      const d = document.getElementById('vah-asset-modal');
      if (d) d.remove();
      if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', window.__vahAssetModalKeydown, true);
      }
      delete window.__vahAssetModalKeydown;
    } catch (_) {}
  }

  function toGoogleSlidesEmbedUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const hostOk = /(^|\.)docs\.google\.com$/i.test(u.hostname);
      const isSlides = u.pathname.includes('/presentation/');
      if (!hostOk || !isSlides) return raw;

      if (u.pathname.includes('/embed')) return u.toString();

      // Typical edit URL: /presentation/d/<id>/edit...
      u.pathname = u.pathname.replace(/\/edit.*/i, '/embed');
      u.search = 'start=false&loop=false&delayms=3000';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return raw;
    }
  }

  function openAssetModal({ title, url, kind }) {
    const raw = String(url || '').trim();
    if (!raw) return;

    cleanupAssetModal();

    const finalUrl = (kind === 'slides') ? toGoogleSlidesEmbedUrl(raw) : raw;

    const mask = el('div', {
      id: 'vah-asset-mask',
      style: 'position:fixed;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);z-index:12000',
      onclick: () => cleanupAssetModal(),
    });

    const modal = el('div', {
      id: 'vah-asset-modal',
      style: 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(1100px,94vw);height:min(92vh,860px);background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,0.25);z-index:12001;display:flex;flex-direction:column;overflow:hidden',
      onclick: (e) => { e.stopPropagation(); },
    });

    const header = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid #E2E8F0;background:linear-gradient(180deg,#fff,#FAFBFC)' }, [
      el('div', { style: 'font-weight:900;color:#0F172A;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, title || 'Preview'),
      el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        el('a', { href: raw, target: '_blank', rel: 'noopener noreferrer', style: 'font-size:12px;font-weight:900;color:#1E40AF;text-decoration:none;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:7px 10px' }, 'Open in new tab'),
        el('button', { style: 'border:none;background:#F1F5F9;color:#64748B;border-radius:10px;padding:7px 10px;cursor:pointer;font-weight:900', onclick: () => cleanupAssetModal() }, '✕'),
      ]),
    ]);

    const iframe = el('iframe', {
      src: finalUrl,
      style: 'flex:1;border:0;width:100%;background:#fff',
      allowfullscreen: 'true',
    });

    const footer = el('div', { style: 'padding:8px 14px;border-top:1px solid #E2E8F0;background:#fff;color:#94A3B8;font-size:11px;font-weight:800' }, [
      el('span', null, `If the preview is blank, use “Open in new tab”.`),
    ]);

    modal.appendChild(header);
    modal.appendChild(iframe);
    modal.appendChild(footer);

    document.body.appendChild(mask);
    document.body.appendChild(modal);

    // ESC closes
    try {
      window.__vahAssetModalKeydown = function (e) {
        if (e && (e.key === 'Escape' || e.key === 'Esc')) cleanupAssetModal();
      };
      document.addEventListener('keydown', window.__vahAssetModalKeydown, true);
    } catch (_) {}
  }

  async function supabaseFetch({ url, anon, path, query }) {
    const u = `${url.replace(/\/$/, '')}${path}${query || ''}`;
    const r = await fetch(u, {
      method: 'GET',
      headers: {
        'apikey': anon,
        'Authorization': `Bearer ${anon}`,
        'Accept': 'application/json',
      },
    });
    const text = await r.text();
    const json = text ? (() => { try { return JSON.parse(text); } catch (_) { return null; } })() : null;
    return { ok: r.ok, status: r.status, text, json };
  }

  function normalizeTitle(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    // Remove legacy prefix like "S7-" / "S2 - " etc.
    let n = raw.replace(/^S\d+\s*[-–]\s*/i, '').trim();
    // Fix known typos / awkward ordering seen in KB.
    // (We keep this list tiny and deterministic; the proper fix is in the KB data.)
    n = n.replace(/\bMatrics\s+Eisenhower\b/i, 'Eisenhower Matrix');
    n = n.replace(/\bEisenhowever\b/i, 'Eisenhower');
    n = n.replace(/\bProactive\s+vs\s+Re-Active\b/i, 'Proactive vs Reactive');
    n = n.replace(/\bBecoming\s+Indestractable\b/i, 'Becoming Indistractable');
    n = n.replace(/\bIndisctractible\b/i, 'Becoming Indistractable');
    n = n.replace(/\bThe\s+Peleton\b/i, 'The Peloton');
    n = n.replace(/\bCheck\s+ahead,\s*Check\s+Back\b/i, 'Check Ahead, Check Back');
    n = n.replace(/\bTest\s+your\s+Future\s+Self\b/i, 'Test Your Future Self');
    n = n.replace(/\bRed\s+Flag\s+Rescue\s+Plans\b/i, 'Red Flags and Rescue Plans');
    n = n.replace(/\bRed\s+Flag\s+Rescue\b/i, 'Red Flags and Rescue Plans');
    n = n.replace(/\bBoosters\s*&\s*Sappers\s+\(energy\s+Makes\s+Time\)\b/i, 'Boosters and Sappers (Energy Makes Time)');
    n = n.replace(/\bBoosters\s+vs\s+Sappers\b/i, 'Boosters and Sappers (Energy Makes Time)');
    return n;
  }

  function normalizeMonthName(month) {
    const raw = String(month || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'febuary') return 'February';
    if (MONTH_INDEX[raw] !== undefined) return raw;
    const title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return (MONTH_INDEX[title] !== undefined) ? title : '';
  }

  function monthDistance(a, b) {
    const ma = normalizeMonthName(a);
    const mb = normalizeMonthName(b);
    if (!ma || !mb) return 99;
    const ia = MONTH_INDEX[ma];
    const ib = MONTH_INDEX[mb];
    const diff = Math.abs(ia - ib);
    // Circular academic year distance (Sep..Jul)
    return Math.min(diff, MONTHS.length - diff);
  }

  function normalizeSummaryText(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    // Some KB rows contain placeholder text from failed generation.
    if (/^llm\s*error\b/i.test(t)) return '';
    if (/^error\b/i.test(t) && t.length <= 60) return '';
    return t;
  }

  function deriveBookFromLevel(level) {
    const lv = String(level || '').trim();
    if (lv === '3') return 'A Level Mindset';
    if (lv === '2') return 'GCSE Mindset';
    return 'VESPA Handbook';
  }

  async function loadActivityKb(cfg) {
    const url = pick(cfg, 'supabaseUrl', SUPABASE_URL_DEFAULT);
    const anon = pick(cfg, 'supabaseAnon', SUPABASE_ANON_DEFAULT);

    // Prefer selecting `pathway` if it exists.
    const baseSelect = 'activity_code,name,vespa_element,level,short_summary,long_summary,keywords,pdf_link,updated_at';
    const withPathway = `${baseSelect},pathway`;

    const try1 = await supabaseFetch({
      url,
      anon,
      path: '/rest/v1/activity_kb',
      query: `?select=${encodeURIComponent(withPathway)}&order=${encodeURIComponent('vespa_element.asc,name.asc')}`,
    });

    if (try1.ok && Array.isArray(try1.json)) {
      return try1.json.map((r) => {
        const summary = normalizeSummaryText(r.short_summary);
        const guidance = normalizeSummaryText(r.long_summary) || summary;
        const level = String(r.level || '');
        return ({
          id: String(r.activity_code || '').trim(),
          name: normalizeTitle(r.name || ''),
          element: (r.vespa_element || '').toUpperCase(),
          level,
          book: deriveBookFromLevel(level),
          pathway: (r.pathway || 'both'),
          summary,
          guidance,
          pdf: r.pdf_link || '',
          slides: '',
          slidesCy: '',
          keywords: r.keywords,
        });
      }).filter((a) => a.id);
    }

    // If `pathway` doesn't exist yet, Supabase returns 400 with message about column.
    const try2 = await supabaseFetch({
      url,
      anon,
      path: '/rest/v1/activity_kb',
      query: `?select=${encodeURIComponent(baseSelect)}&order=${encodeURIComponent('vespa_element.asc,name.asc')}`,
    });

    if (try2.ok && Array.isArray(try2.json)) {
      return try2.json.map((r) => {
        const summary = normalizeSummaryText(r.short_summary);
        const guidance = normalizeSummaryText(r.long_summary) || summary;
        const level = String(r.level || '');
        return ({
          id: String(r.activity_code || '').trim(),
          name: normalizeTitle(r.name || ''),
          element: (r.vespa_element || '').toUpperCase(),
          level,
          book: deriveBookFromLevel(level),
          pathway: 'both',
          summary,
          guidance,
          pdf: r.pdf_link || '',
          slides: '',
          slidesCy: '',
          keywords: r.keywords,
        });
      }).filter((a) => a.id);
    }

    const errMsg = `[ActivityHub] Failed to load activity_kb. try1=${try1.status} try2=${try2.status}`;
    // eslint-disable-next-line no-console
    console.error(errMsg, { try1, try2 });
    throw new Error(errMsg);
  }

  function getCurrentLang() {
    try {
      if (window.Weglot && typeof window.Weglot.getCurrentLang === 'function') {
        const lang = window.Weglot.getCurrentLang();
        if (lang) return String(lang);
      }
    } catch (_) {}
    try {
      const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem('vespaPreferredLanguage') : null;
      if (stored) return String(stored);
    } catch (_) {}
    return 'en';
  }

  async function loadAssetsByActivityCode(cfg) {
    const url = pick(cfg, 'supabaseUrl', SUPABASE_URL_DEFAULT);
    const anon = pick(cfg, 'supabaseAnon', SUPABASE_ANON_DEFAULT);

    // Prefer a canonical view if present; fall back to raw activities.
    const try1 = await supabaseFetch({
      url,
      anon,
      path: '/rest/v1/activities_canonical',
      query: `?select=${encodeURIComponent('activity_code,content')}`,
    });
    const try2 = (!try1.ok) ? await supabaseFetch({
      url,
      anon,
      path: '/rest/v1/activities',
      query: `?select=${encodeURIComponent('activity_code,content')}`,
    }) : null;

    const rows = (try1.ok && Array.isArray(try1.json)) ? try1.json
      : (try2 && try2.ok && Array.isArray(try2.json)) ? try2.json
        : [];

    const map = {};
    rows.forEach((r) => {
      const code = String(r.activity_code || '').trim();
      if (!code) return;
      const c = (r && r.content && typeof r.content === 'object') ? r.content : {};
      const pdfEn = String(c.pdf_url_en || c.pdf_url || '').trim();
      const pdfCy = String(c.pdf_url_cy || '').trim();
      const slidesEn = firstString(c, ['slides_url_en', 'slides_url', 'slides_embed_url_en', 'slides_embed_url', 'slides_link']);
      const slidesCy = firstString(c, ['slides_url_cy', 'slides_embed_url_cy']);
      if (!map[code]) map[code] = {};
      if (pdfEn) map[code].pdfEn = pdfEn;
      if (pdfCy) map[code].pdfCy = pdfCy;
      if (slidesEn) map[code].slidesEn = slidesEn;
      if (slidesCy) map[code].slidesCy = slidesCy;
    });
    return map;
  }

  async function loadScheduleTargetsByCode(cfg) {
    const url = pick(cfg, 'supabaseUrl', SUPABASE_URL_DEFAULT);
    const anon = pick(cfg, 'supabaseAnon', SUPABASE_ANON_DEFAULT);
    const q = `?select=${encodeURIComponent('activity_code,canonical_name,target_month,tolerance_months,book')}&book=eq.${encodeURIComponent('VESPA Handbook')}`;
    const resp = await supabaseFetch({
      url,
      anon,
      path: '/rest/v1/activity_schedule_targets',
      query: q,
    });
    if (!resp.ok || !Array.isArray(resp.json)) return {};
    const map = {};
    resp.json.forEach((r) => {
      const code = String(r.activity_code || '').trim();
      if (!code) return;
      map[code] = {
        canonicalName: String(r.canonical_name || '').trim(),
        targetMonth: normalizeMonthName(r.target_month),
        toleranceMonths: Number.isFinite(Number(r.tolerance_months)) ? Number(r.tolerance_months) : 1,
      };
    });
    return map;
  }

  function weightsForProfile(profile, pathway) {
    const base = {
      'Low':      { EFFORT: 3,   SYSTEMS: 2.5, ATTITUDE: 2,   VISION: 1.5, PRACTICE: 1 },
      'Low-Mid':  { EFFORT: 2.5, SYSTEMS: 2,   ATTITUDE: 2,   VISION: 1.5, PRACTICE: 1.5 },
      'Mid':      { VISION: 2,   PRACTICE: 2,  SYSTEMS: 2,    EFFORT: 1.5, ATTITUDE: 1.5 },
      'Mid-High': { PRACTICE: 2.5, VISION: 2,  SYSTEMS: 2,    EFFORT: 1.5, ATTITUDE: 1.5 },
      'High':     { PRACTICE: 3, VISION: 2.5,  SYSTEMS: 1.5,  EFFORT: 1,   ATTITUDE: 2 },
    }[profile] || {};

    // Override for vocational.
    if (pathway === 'vocational') return { SYSTEMS: 3, EFFORT: 2.5, ATTITUDE: 1.5, VISION: 1.5, PRACTICE: 1 };
    if (pathway === 'academic') return { PRACTICE: 3, VISION: 2, SYSTEMS: 1.5, EFFORT: 1.5, ATTITUDE: 1.5 };
    return base;
  }

  function generateCurriculum({ allActivities, yearGroup, profile, pathway, includeQuestionnaire, activitiesPerMonth }) {
    const isKS4 = Number(yearGroup) <= 11;
    const level = isKS4 ? '2' : '3';
    const w = weightsForProfile(profile, pathway);

    const pool = allActivities.filter((a) => {
      const lvlOk = (a.level === level || a.level === '' || a.level == null);
      // Pathway semantics:
      // - 'both' = suitable for either pathway
      // - 'academic' / 'vocational' = more suitable for that pathway
      // For programme generation, we still want vocational-tagged activities to remain available to
      // academic programmes (they're "more vocational", not "vocational-only").
      const ap = String(a.pathway || '').trim().toLowerCase();
      const sel = String(pathway || '').trim().toLowerCase();
      const pwOk = (ap === '' || ap === 'both')
        || (ap === sel)
        || (sel === 'academic' && ap === 'vocational');
      return lvlOk && pwOk;
    });

    const qSessions = includeQuestionnaire ? [
      { month: 'September', name: 'Questionnaire Cycle 1', element: 'VISION', qType: 'QUESTIONNAIRE', guidance: 'Allow at least 20 minutes. Students discuss results and print report. Emphasize no right/wrong answers.' },
      { month: 'September', name: 'Reflection & Coaching 1', element: 'VISION', qType: 'COACHING', guidance: 'Tutor-led coaching using questionnaire report. Students produce reflections and commitments across VESPA.' },
      { month: 'January', name: 'Questionnaire Cycle 2', element: 'VISION', qType: 'QUESTIONNAIRE', guidance: 'Second cycle. Compare with Cycle 1. Celebrate improvements and discuss strategies.' },
      { month: 'January', name: 'Reflection & Coaching 2', element: 'VISION', qType: 'COACHING', guidance: 'Review progress since Cycle 1. Update commitments. Peer coaching works well.' },
      { month: 'April', name: 'Questionnaire Cycle 3', element: 'VISION', qType: 'QUESTIONNAIRE', guidance: 'Final cycle. Celebrate growth. Compare all results; evidence for portfolios/personal statements.' },
      { month: 'April', name: 'Reflection & Coaching 3', element: 'VISION', qType: 'COACHING', guidance: 'Final reflection. Summarise VESPA journey and strategies that worked.' },
    ] : [];

    const qm = {};
    qSessions.forEach((q) => { qm[q.month] = (qm[q.month] || 0) + 1; });

    // Balanced selection:
    // - Tracks element deficits vs desired proportions
    // - Encourages per-month variety (avoids same element repeats inside a month)
    let seq = 1;
    const used = new Set();
    const curriculum = [];

    const weights = Object.assign({ VISION: 1, EFFORT: 1, SYSTEMS: 1, PRACTICE: 1, ATTITUDE: 1 }, w || {});
    const wSum = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
    const wNorm = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, (Number(v) || 0) / wSum]));
    const counts = { VISION: 0, EFFORT: 0, SYSTEMS: 0, PRACTICE: 0, ATTITUDE: 0 };

    function chooseElement({ avoidEls }) {
      const avoid = new Set(avoidEls || []);
      // Prefer biggest deficit: desired - actual
      let best = null;
      let bestDef = -Infinity;
      Object.keys(counts).forEach((k) => {
        const desired = (wNorm[k] || 0) * Math.max(1, (Object.values(counts).reduce((a, b) => a + b, 0) + 1));
        const def = desired - counts[k];
        const penalty = avoid.has(k) ? 0.35 : 0; // mild penalty (still allow if needed)
        const score = def - penalty + (Math.random() * 0.02);
        if (score > bestDef) { bestDef = score; best = k; }
      });
      return best || 'VISION';
    }

    function pickActivityForElement(elKey, month) {
      const candidates = pool.filter((a) => !used.has(a.id) && a.element === elKey);
      if (!candidates.length) return null;
      // Prefer schedule-window alignment first, then nearest target month, then PDF availability.
      candidates.sort((a, b) => {
        const aTarget = normalizeMonthName(a.targetMonth || '');
        const bTarget = normalizeMonthName(b.targetMonth || '');
        const aTol = Number.isFinite(Number(a.toleranceMonths)) ? Number(a.toleranceMonths) : 1;
        const bTol = Number.isFinite(Number(b.toleranceMonths)) ? Number(b.toleranceMonths) : 1;
        const aDist = aTarget ? monthDistance(month, aTarget) : 99;
        const bDist = bTarget ? monthDistance(month, bTarget) : 99;
        const aInWindow = aTarget ? (aDist <= aTol ? 1 : 0) : 0;
        const bInWindow = bTarget ? (bDist <= bTol ? 1 : 0) : 0;
        if (aInWindow !== bInWindow) return bInWindow - aInWindow;
        if (aDist !== bDist) return aDist - bDist;
        if ((b.pdf ? 1 : 0) !== (a.pdf ? 1 : 0)) return (b.pdf ? 1 : 0) - (a.pdf ? 1 : 0);
        return 0;
      });
      return candidates[0];
    }

    qSessions.forEach((q) => {
      curriculum.push({
        id: `Q${seq}`,
        uid: `Q${seq}`,
        isQ: true,
        qType: q.qType,
        sequence: seq++,
        month: q.month,
        name: q.name,
        element: q.element,
        guidance: q.guidance,
        summary: '',
        pdf: '',
        pdfCy: '',
        book: isKS4 ? 'GCSE Mindset' : 'A Level Mindset',
        yearGroup,
        profile,
        pathway,
      });
      if (counts[q.element] !== undefined) counts[q.element] += 1;
    });

    MONTHS.forEach((month) => {
      const avail = Math.max(0, Number(activitiesPerMonth) - (qm[month] || 0));
      if (avail <= 0) return;

      const monthEls = curriculum.filter((c) => c.month === month).map((c) => c.element);
      for (let i = 0; i < avail; i++) {
        const elKey = chooseElement({ avoidEls: monthEls });
        let a = pickActivityForElement(elKey, month);
        if (!a) {
          // fallback: any activity not used yet
          a = pool
            .filter((x) => !used.has(x.id))
            .sort((x, y) => {
              const xTarget = normalizeMonthName(x.targetMonth || '');
              const yTarget = normalizeMonthName(y.targetMonth || '');
              const xDist = xTarget ? monthDistance(month, xTarget) : 99;
              const yDist = yTarget ? monthDistance(month, yTarget) : 99;
              return xDist - yDist;
            })[0] || null;
        }
        if (!a) break;
        used.add(a.id);
        monthEls.push(a.element);
        if (counts[a.element] !== undefined) counts[a.element] += 1;
        curriculum.push({
          id: a.id,
          uid: a.uid || a.id,
          isQ: false,
          qType: null,
          sequence: seq++,
          month,
          name: a.name,
          element: a.element,
          guidance: a.guidance,
          summary: a.summary,
          pdf: a.pdf,
          pdfCy: a.pdfCy || '',
          book: a.level === '3' ? 'A Level Mindset' : a.level === '2' ? 'GCSE Mindset' : 'VESPA Handbook',
          yearGroup,
          profile,
          pathway,
        });
      }
    });

    return curriculum.sort((a, b) => {
      const d = MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
      if (d !== 0) return d;
      if (a.isQ && !b.isQ) return -1;
      if (!a.isQ && b.isQ) return 1;
      return a.sequence - b.sequence;
    });
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map((c) => {
      const s = String(c ?? '');
      // wrap if contains comma or quote or newline
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function normalizeMode(mode) {
    // Backwards compat (older state used "builder")
    if (mode === 'builder') return 'curriculum';
    if (mode === 'saved') return 'saved';
    return mode;
  }

  function getCurrentUserEmail() {
    try {
      if (typeof Knack !== 'undefined' && typeof Knack.getUserAttributes === 'function') {
        const u = Knack.getUserAttributes();
        if (u && u.email) return String(u.email).trim().toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  function currLibraryStorageKey() {
    const email = getCurrentUserEmail();
    return `vespa.curriculumLibrary.v1.${email || 'anon'}`;
  }

  function loadCurriculumLibrary() {
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(currLibraryStorageKey()) : null;
      if (!raw) return [];
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch (_) {
      return [];
    }
  }

  function saveCurriculumLibrary(items) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(currLibraryStorageKey(), JSON.stringify(items || []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function pathwayLabel(pw) {
    if (!pw) return '';
    if (pw === 'academic') return 'Academic';
    if (pw === 'vocational') return 'Vocational';
    if (pw === 'both') return 'Mixed';
    return String(pw);
  }

  function pathwayChip(pw) {
    if (!pw || pw === 'both') return null;
    const isAcademic = pw === 'academic';
    const c = isAcademic ? { bg: '#EDE9FE', fg: '#6D28D9', label: '📝 Academic' } : { bg: '#FEF3C7', fg: '#92400E', label: '🔧 Vocational' };
    return el('span', {
      style: `font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${c.bg};color:${c.fg};white-space:nowrap`,
    }, c.label);
  }

  function elementBadge(elKey, size) {
    const v = VESPA[elKey];
    if (!v) return null;
    const isSm = size === 'sm';
    return el('span', {
      style: `font-size:${isSm ? 11 : 13}px;font-weight:900;padding:3px ${isSm ? 8 : 11}px;border-radius:99px;background:${v.bg};color:${v.color};border:1px solid ${v.color}25;white-space:nowrap`,
    }, v.label);
  }

  function qBadge(type) {
    if (!type) return null;
    const c = type === 'QUESTIONNAIRE' ? { bg: '#DBEAFE', fg: '#1D4ED8', label: '📋 Questionnaire' } : { bg: '#FEF3C7', fg: '#92400E', label: '🗣 Coaching' };
    return el('span', {
      style: `font-size:11px;font-weight:900;padding:3px 9px;border-radius:99px;background:${c.bg};color:${c.fg};text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap`,
    }, c.label);
  }

  function bookPill(book) {
    if (!book) return null;
    return el('span', {
      style: 'font-size:12px;background:#F1F5F9;color:#64748B;padding:3px 11px;border-radius:99px;font-weight:800;white-space:nowrap',
    }, book);
  }

  function vespabar(items) {
    const counts = { VISION: 0, EFFORT: 0, SYSTEMS: 0, PRACTICE: 0, ATTITUDE: 0 };
    (items || []).forEach((i) => { if (counts[i.element] !== undefined) counts[i.element] += 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const bar = el('div', { style: 'display:flex;flex-direction:column;gap:5px;margin:10px 0 14px' }, [
      el('div', { style: 'display:flex;height:8px;border-radius:99px;overflow:hidden;background:#E2E8F0' },
        Object.keys(counts).map((k) => el('div', { style: `width:${(counts[k] / total) * 100}%;background:${VESPA[k].color};transition:width 0.4s` }))
      ),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, Object.keys(counts).map((k) => (
        el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:12px' }, [
          el('div', { style: `width:8px;height:8px;border-radius:2px;background:${VESPA[k].color}` }),
          el('span', { style: 'font-weight:900;color:#475569' }, VESPA[k].label),
          el('span', { style: 'color:#94A3B8;font-weight:800' }, String(counts[k])),
        ])
      ))),
    ]);
    return bar;
  }

  function resequence(curr) {
    const c = (curr || []).slice();
    c.forEach((item, idx) => { item.sequence = idx + 1; });
    return c;
  }

  function sortCurriculum(curr) {
    const c = (curr || []).slice();
    c.sort((a, b) => {
      const d = MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
      if (d !== 0) return d;
      if (a.isQ && !b.isQ) return -1;
      if (!a.isQ && b.isQ) return 1;
      return (a.sequence || 0) - (b.sequence || 0);
    });
    return c;
  }

  function makeLibraryFiltered(state) {
    const s = String(state.libSearch || '').trim().toLowerCase();
    return state.allActivities.filter((a) => {
      if (s) {
        const hay = `${a.name || ''} ${a.element || ''} ${a.summary || ''} ${a.guidance || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (state.libFilterEl && a.element !== state.libFilterEl) return false;
      if (state.libFilterPathway) {
        const ap = String(a.pathway || '').trim().toLowerCase();
        const fp = String(state.libFilterPathway || '').trim().toLowerCase();
        // In the Activity Library, "Vocational" should mean explicitly tagged vocational,
        // so staff see the curated set (not the entire 'both' pool).
        if (fp && ap !== fp) return false;
      }
      if (state.libFilterLevel) {
        if (state.libFilterLevel !== '' && a.level !== state.libFilterLevel) return false;
      }
      if (state.libFilterBook) {
        if (a.book !== state.libFilterBook) return false;
      }
      return true;
    });
  }

  function setFocusRestore(state, key, posStart, posEnd) {
    try {
      state.__restoreFocus = {
        key: String(key || ''),
        posStart: (typeof posStart === 'number') ? posStart : null,
        posEnd: (typeof posEnd === 'number') ? posEnd : null,
      };
    } catch (_) {}
  }

  function restoreFocusIfNeeded(state, root) {
    try {
      const r = state.__restoreFocus;
      if (!r || !r.key) return;
      // Use a microtask so DOM is fully attached.
      Promise.resolve().then(() => {
        const eln = qs(`[data-focus-key="${r.key}"]`, root);
        if (!eln) return;
        if (document.activeElement !== eln) eln.focus();
        if (typeof r.posStart === 'number' && typeof eln.setSelectionRange === 'function') {
          const pe = (typeof r.posEnd === 'number') ? r.posEnd : r.posStart;
          try { eln.setSelectionRange(r.posStart, pe); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  function ensureUids(curr) {
    const c = (curr || []).slice();
    const hasCrypto = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function');
    c.forEach((it, idx) => {
      if (!it.uid) {
        it.uid = hasCrypto ? crypto.randomUUID() : `uid_${Date.now()}_${Math.random().toString(16).slice(2)}_${idx}`;
      }
    });
    return c;
  }

  function moveItemByUid(state, draggedUid, targetUid, targetMonth) {
    const curr = ensureUids(state.curriculum || []);
    const fromIdx = curr.findIndex((x) => x.uid === draggedUid);
    if (fromIdx < 0) return;
    const item = curr[fromIdx];
    curr.splice(fromIdx, 1);

    // Update month if dropping into another month
    if (targetMonth) item.month = targetMonth;

    let toIdx = -1;
    if (targetUid) {
      toIdx = curr.findIndex((x) => x.uid === targetUid);
    }
    if (toIdx < 0) {
      // insert after last item in target month if possible, else end
      if (targetMonth) {
        let lastIdx = -1;
        curr.forEach((x, i) => { if (x.month === targetMonth) lastIdx = i; });
        toIdx = (lastIdx >= 0) ? (lastIdx + 1) : curr.length;
      } else {
        toIdx = curr.length;
      }
    }
    curr.splice(toIdx, 0, item);
    state.curriculum = resequence(sortCurriculum(curr));
  }

  function addActivityToCurriculum(state, a, month, insertBeforeUid) {
    if (!state || !a || !a.id || !month) return;
    if (!state.settings) return;
    const s = state.settings;
    const curr = ensureUids(state.curriculum || []);
    const used = new Set(curr.map((c) => c.id));
    if (used.has(a.id)) return;

    const hasCrypto = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function');
    const uid = hasCrypto ? crypto.randomUUID() : `uid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const newItem = {
      id: a.id,
      uid,
      name: a.name,
      element: a.element,
      month,
      guidance: a.guidance,
      summary: a.summary,
      pdf: a.pdf,
      pdfCy: a.pdfCy || '',
      slides: a.slides || '',
      slidesCy: a.slidesCy || '',
      sequence: 0,
      yearGroup: s.yearGroup,
      profile: s.profile,
      pathway: s.pathway,
      qType: null,
      isQ: false,
      book: a.book,
      level: a.level,
    };

    // Insert before specific uid if provided, otherwise append then sort.
    if (insertBeforeUid) {
      const idx = curr.findIndex((x) => x.uid === insertBeforeUid);
      if (idx >= 0) {
        curr.splice(idx, 0, newItem);
        state.curriculum = resequence(sortCurriculum(curr));
        return;
      }
    }

    state.curriculum = resequence(sortCurriculum([...(curr || []), newItem]));
  }

  function ensureStyles() {
    const id = 'vespa-activity-hub-styles';
    const existing = document.getElementById(id);
    const css = `
      #vespa-activity-hub-root{font-family:'Nunito',system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
      #vespa-activity-hub-root *{box-sizing:border-box}
      #vespa-activity-hub-root ::-webkit-scrollbar{width:6px;height:6px}
      #vespa-activity-hub-root ::-webkit-scrollbar-track{background:transparent}
      #vespa-activity-hub-root ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:99px}
      #vespa-activity-hub-root ::-webkit-scrollbar-thumb:hover{background:#94A3B8}

      .vah-shell{background:#F1F5F9;min-height:100vh;font-size:18px}
      .vah-hero{background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 50%,#1E40AF 100%);color:#fff;padding:20px 28px 0;position:relative;overflow:hidden}
      .vah-hero::before{content:'';position:absolute;top:0;left:-100%;width:200%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent);animation:heroShimmer 8s ease-in-out infinite}
      @keyframes heroShimmer{0%,100%{transform:translateX(-25%)}50%{transform:translateX(25%)}}
      .vah-hero-inner{max-width:1200px;margin:0 auto}
      .vah-hero h1{font-size:23px;font-weight:900;margin:0;color:#fff !important;text-shadow:0 2px 14px rgba(0,0,0,0.35)}
      .vah-hero p{margin:2px 0 0;color:rgba(255,255,255,0.92);font-size:12px;font-weight:700}
      .vah-hero-top{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px}

      .vah-content{max-width:1280px;margin:0 auto;padding:0 28px 60px}

      .vah-tabs{display:flex;gap:3px}
      .vah-tab{border:none;border-radius:12px 12px 0 0;padding:10px 18px;font-size:14px;font-weight:900;cursor:pointer;transition:all 0.2s ease;position:relative}
      .vah-tab.is-active{background:#fff;color:#1E293B}
      .vah-tab:not(.is-active){background:rgba(255,255,255,0.08);color:#93C5FD}
      .vah-tab:not(.is-active):hover{background:rgba(255,255,255,0.12);color:#fff;transform:translateY(-1px)}
      .vah-tab:focus-visible{outline:2px solid #60A5FA;outline-offset:2px}

      .vah-panel{background:#F8FAFC;border-radius:0 16px 16px 16px;padding:22px 24px;animation:vahFadeUp 0.3s ease;box-shadow:0 4px 20px rgba(15,23,42,0.04)}
      .vah-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
      .vah-card{background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:26px;box-shadow:0 2px 8px rgba(0,0,0,0.04),0 1px 2px rgba(0,0,0,0.02);transition:box-shadow 0.2s ease,transform 0.2s ease}
      .vah-card:hover{box-shadow:0 8px 24px rgba(0,0,0,0.08),0 2px 6px rgba(0,0,0,0.04)}

      .vah-btn{border:none;border-radius:10px;padding:9px 13px;font-weight:900;font-size:13px;cursor:pointer;transition:all 0.15s ease;display:inline-flex;align-items:center;gap:6px}
      .vah-btn:focus-visible{outline:2px solid #3B82F6;outline-offset:2px}
      .vah-btn.primary{background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;box-shadow:0 2px 8px rgba(30,64,175,0.3)}
      .vah-btn.primary:hover{background:linear-gradient(135deg,#1E3A8A,#2563EB);box-shadow:0 4px 12px rgba(30,64,175,0.4);transform:translateY(-1px)}
      .vah-btn.primary:active{transform:translateY(0);box-shadow:0 1px 4px rgba(30,64,175,0.3)}
      .vah-btn.ghost{background:#fff;border:1px solid #E2E8F0;color:#475569}
      .vah-btn.ghost:hover{background:#F8FAFC;border-color:#CBD5E1;color:#1E293B}
      .vah-btn.ghost:active{background:#F1F5F9}

      .vah-input{background:#fff;border:2px solid #E2E8F0;border-radius:12px;padding:9px 13px;font-size:14px;min-width:220px;flex:1;outline:none;transition:border-color 0.15s ease,box-shadow 0.15s ease}
      .vah-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
      .vah-pill{display:inline-flex;align-items:center;gap:6;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:900;border:1px solid #E2E8F0;background:#fff;color:#475569}
      .vah-pill.is-on{background:#1E40AF;color:#fff;border-color:#1E40AF}
      .vah-pill{transition:all 0.15s ease}

      .vah-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}
      .vah-item{background:#fff;border:1px solid #E2E8F0;border-left:4px solid #CBD5E1;border-radius:14px;padding:14px 16px;cursor:pointer;transition:all 0.2s ease;position:relative}
      .vah-item:hover{box-shadow:0 8px 24px rgba(0,0,0,0.08);transform:translateY(-2px)}
      .vah-item:active{transform:translateY(0)}
      .vah-item[draggable="true"]{cursor:grab}
      .vah-item[draggable="true"]:active{cursor:grabbing;opacity:0.85}
      .vah-item h3{margin:0 0 4px;font-size:18px;font-weight:900;color:#0F172A}
      .vah-item .meta{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
      .vah-item .desc{color:#64748B;font-size:16px;line-height:1.55}
      .vah-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:900;white-space:nowrap}
      .vah-badge.q{background:#DBEAFE;color:#1D4ED8}
      .vah-badge.c{background:#FEF3C7;color:#92400E}
      .vah-drawer-mask{position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(4px);z-index:10000;animation:fadeIn 0.2s ease}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      .vah-drawer{position:fixed;top:0;right:0;bottom:0;width:min(540px,92vw);background:#fff;z-index:10001;box-shadow:-8px 0 30px rgba(0,0,0,0.15);display:flex;flex-direction:column;animation:slideIn 0.25s ease}
      @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
      .vah-drawer .hd{padding:16px 18px;border-bottom:1px solid #E2E8F0;background:linear-gradient(180deg,#fff,#FAFBFC)}
      .vah-drawer .bd{padding:14px 18px;overflow:auto;flex:1;overscroll-behavior:contain}
      .vah-drawer .x{border:none;background:none;cursor:pointer;font-size:20px;color:#94A3B8;padding:4px;border-radius:6px;transition:all 0.15s ease}
      .vah-drawer .x:hover{background:#F1F5F9;color:#64748B}
      .vah-kv{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 14px}
      .vah-kv > div{background:#F8FAFC;border-radius:10px;padding:10px 12px;border:1px solid #E2E8F0}
      .vah-kv .k{font-size:11px;font-weight:900;color:#94A3B8;text-transform:uppercase;letter-spacing:0.06em}
      .vah-kv .v{font-size:13px;font-weight:800;color:#334155}
      .vah-muted{color:#94A3B8;font-size:13px}
      .vah-month{margin:14px 0}
      .vah-month-hd{display:flex;align-items:center;gap:10px;margin-bottom:8px}
      .vah-month-tag{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;box-shadow:0 2px 8px rgba(30,64,175,0.25)}
      .vah-actions{display:flex;gap:8px;flex-wrap:wrap}

      .vah-topbar{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px}
      .vah-viewtoggle{display:flex;background:#fff;border-radius:10px;padding:3px;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
      .vah-viewtoggle button{padding:5px 12px;border:none;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;background:transparent;color:#64748B;transition:all 0.15s ease}
      .vah-viewtoggle button:hover:not(.is-on){background:#F1F5F9;color:#475569}
      .vah-viewtoggle button.is-on{background:#1E40AF;color:#fff;box-shadow:0 1px 3px rgba(30,64,175,0.3)}
      .vah-table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden}
      .vah-table th,.vah-table td{padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:14px;vertical-align:top;word-break:break-word;white-space:normal}
      .vah-table th{background:#F8FAFC;color:#475569;font-weight:900;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em}
      .vah-table tr:last-child td{border-bottom:none}
      .vah-table tr:hover td{background:#FAFBFC}
      @media print{
        .vah-hero,.vah-tabs,.vah-topbar .vah-row button,.vah-side,.vah-warn{display:none !important}
        .vah-panel{padding:0 !important;background:#fff !important}
        .vah-shell{background:#fff !important}
      }
      .vah-warn{background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:1px solid #FCD34D;border-radius:12px;padding:12px 16px;font-size:12px;color:#92400E;display:flex;align-items:center;gap:8px;margin:10px 0 12px;box-shadow:0 2px 8px rgba(251,191,36,0.15)}
      .vah-chipbtn{padding:7px 13px;border-radius:99px;border:none;font-size:13px;font-weight:900;cursor:pointer;transition:all 0.15s ease}
      .vah-chipbtn:focus-visible{outline:2px solid #3B82F6;outline-offset:2px}
      .vah-chipbtn:hover{transform:translateY(-1px);box-shadow:0 2px 6px rgba(0,0,0,0.10)}
      .vah-chipbtn:active{transform:translateY(0)}

      .vah-search{flex:1;min-width:230px;display:flex;align-items:center;gap:9px;background:#fff;border-radius:12px;padding:9px 13px;border:2px solid #E2E8F0;transition:border-color 0.15s ease,box-shadow 0.15s ease}
      .vah-search:focus-within{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
      .vah-search input{flex:1;border:none;background:transparent;outline:none;font-size:14px;font-family:inherit}
      .vah-search input::placeholder{color:#94A3B8}

      .vah-layout{display:flex;gap:14px;align-items:flex-start}
      .vah-main{flex:1;min-width:0}
      .vah-side{width:380px;min-width:320px;position:sticky;top:12px;align-self:flex-start;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06)}
      @media (max-width: 1100px){
        .vah-layout{flex-direction:column}
        .vah-side{width:100%;position:relative;top:auto}
      }
      .vah-yearbtn{width:86px;height:86px;border-radius:16px;border:2px solid #E2E8F0;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:all 0.2s ease}
      .vah-yearbtn:hover{border-color:#93C5FD;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.08)}
      .vah-yearbtn.is-on{border:3px solid #1E40AF;background:#EFF6FF}
      .vah-yearbtn .n{font-size:26px;font-weight:900;color:#64748B}
      .vah-yearbtn.is-on .n{color:#1E40AF}
      .vah-yearbtn .t{font-size:10px;font-weight:800;color:#94A3B8}
      .vah-optbtn{width:180px;padding:20px 14px;border-radius:16px;border:2px solid #E2E8F0;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;transition:all 0.2s ease}
      .vah-optbtn:hover{border-color:#93C5FD;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.08)}
      .vah-optbtn.is-on{border:2px solid #1E40AF;background:#EFF6FF}
      .vah-optbtn .i{font-size:30px}
      .vah-optbtn .l{font-size:14px;font-weight:900;color:#1E293B}
      .vah-optbtn.is-on .l{color:#1E40AF}
      .vah-optbtn .d{font-size:11px;color:#64748B;line-height:1.3}
      .vah-profbtn{padding:11px 15px;border-radius:12px;border:2px solid #E2E8F0;background:#fff;cursor:pointer;text-align:left;transition:all 0.2s ease}
      .vah-profbtn:hover{border-color:#93C5FD;background:#FAFBFC}
      .vah-profbtn.is-on{border:2px solid #1E40AF;background:#EFF6FF}
      .vah-profbtn .l{font-weight:900;font-size:14px;color:#1E293B;margin-bottom:1px}
      .vah-profbtn.is-on .l{color:#1E40AF}
      .vah-profbtn .d{font-size:11px;color:#64748B;line-height:1.4}
      .vah-stepbar{display:flex;gap:4px;margin-bottom:22px}
      .vah-stepbar > div{flex:1;height:4px;border-radius:99px;background:#E2E8F0}
      .vah-stepbar > div.is-on{background:#1E40AF}

      @keyframes vahFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    `;
    if (existing) {
      existing.textContent = css;
      return;
    }
    document.head.appendChild(el('style', { id }, css));
  }

  function render(root, state) {
    // Clean up body-level modal nodes that are not inside the root (Knack is SPA).
    // Without this, the Add-to-month modal can get "stuck" across re-renders.
    try {
      const oldOverlay = document.getElementById('vah-add-overlay');
      if (oldOverlay) oldOverlay.remove();
      const oldModal = document.getElementById('vah-add-modal');
      if (oldModal) oldModal.remove();
    } catch (_) {}

    root.innerHTML = '';
    ensureStyles();

    const mode = normalizeMode(state.mode || 'curriculum');
    const shell = el('div', { class: 'vah-shell' });
    const hero = el('div', { class: 'vah-hero' }, [
      el('div', { class: 'vah-hero-inner' }, [
        el('div', { class: 'vah-hero-top' }, [
        el('div', null, [
          el('div', { style: 'font-size:10px;font-weight:900;color:rgba(255,255,255,0.92);text-transform:uppercase;letter-spacing:0.15em' }, 'VESPA Academy'),
          el('h1', null, 'Activities & Curriculum'),
          el('p', null, `${state.allActivities.length} real activities • Build, edit, and export bespoke programmes`),
        ]),
        ]),
        el('div', { class: 'vah-tabs' }, [
          el('button', {
            class: `vah-tab ${mode === 'curriculum' ? 'is-active' : ''}`,
            onclick: () => { state.mode = 'curriculum'; state.drawerItem = null; render(root, state); },
          }, '📋 Curriculum Builder'),
          el('button', {
            class: `vah-tab ${mode === 'library' ? 'is-active' : ''}`,
            onclick: () => { state.mode = 'library'; state.drawerItem = null; render(root, state); },
          }, '📚 Activity Library'),
          el('button', {
            class: `vah-tab ${mode === 'saved' ? 'is-active' : ''}`,
            onclick: () => { state.mode = 'saved'; state.drawerItem = null; render(root, state); },
          }, '💾 Curriculum Library'),
        ]),
      ])
    ]);

    const content = el('div', { class: 'vah-content' });
    const panel = el('div', { class: 'vah-panel' });

    const currentLang = getCurrentLang();

    if (mode === 'saved') {
      const saved = loadCurriculumLibrary();
      const q = String(state.savedSearch || '').trim().toLowerCase();
      const filtered = saved.filter((p) => {
        if (!q) return true;
        const hay = `${p.name || ''} ${p.yearGroup || ''} ${p.profile || ''} ${p.pathway || ''}`.toLowerCase();
        return hay.includes(q);
      }).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

      panel.appendChild(el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px' }, [
        el('div', { class: 'vah-search', style: 'flex:1;min-width:260px' }, [
          el('span', { style: 'color:#94A3B8' }, '🔍'),
          el('input', {
            value: state.savedSearch || '',
            'data-focus-key': 'savedSearch',
            placeholder: `Search ${saved.length} saved curricula...`,
            oninput: (e) => {
              state.savedSearch = e.target.value;
              setFocusRestore(state, 'savedSearch', e.target.selectionStart, e.target.selectionEnd);
              render(root, state);
            },
          }),
          (state.savedSearch ? el('button', { style: 'background:none;border:none;cursor:pointer;color:#94A3B8', onclick: () => { state.savedSearch = ''; render(root, state); } }, '✕') : null),
        ].filter(Boolean)),
        el('button', {
          class: 'vah-btn ghost',
          onclick: () => {
            // Import from JSON file
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'application/json';
            inp.onchange = async () => {
              try {
                const f = inp.files && inp.files[0];
                if (!f) return;
                const txt = await f.text();
                const j = JSON.parse(txt);
                const arr = Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : null);
                if (!arr) return;
                const existing = loadCurriculumLibrary();
                // merge by id if present, else append
                const byId = new Map(existing.map((x) => [x.id, x]));
                arr.forEach((x) => {
                  const id = x && x.id ? x.id : null;
                  if (id && byId.has(id)) byId.set(id, { ...byId.get(id), ...x, updatedAt: new Date().toISOString() });
                  else existing.push({ ...x, id: id || `plan_${Date.now()}_${Math.random().toString(16).slice(2)}` });
                });
                saveCurriculumLibrary(existing);
                render(root, state);
              } catch (_) {}
            };
            inp.click();
          },
        }, '⬆ Import JSON'),
        el('button', {
          class: 'vah-btn ghost',
          onclick: () => downloadJson(`VESPA_CurriculumLibrary_${getCurrentUserEmail() || 'export'}.json`, loadCurriculumLibrary()),
        }, '⬇ Export JSON'),
      ]));

      panel.appendChild(el('div', { class: 'vah-muted', style: 'margin-bottom:10px' }, 'Saved programmes are stored in this browser for the current user. Use Export/Import to move between devices.'));

      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px' });
      filtered.forEach((p) => {
        const card = el('div', { class: 'vah-item', style: 'border-left-color:#0F766E;cursor:default' }, [
          el('div', { class: 'meta' }, [
            el('span', { class: 'vah-pill' }, `Year ${p.yearGroup || ''}`),
            el('span', { class: 'vah-pill' }, pathwayLabel(p.pathway || '')),
            el('span', { class: 'vah-pill' }, p.profile || ''),
          ].filter(Boolean)),
          el('h3', null, p.name || 'Untitled curriculum'),
          el('div', { class: 'desc' }, `${(p.count || 0)} activities • Updated ${String(p.updatedAt || '').slice(0, 10)}`),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' }, [
            el('button', {
              class: 'vah-btn primary',
              onclick: () => {
                if (!p.settings || !p.curriculum) return;
                state.mode = 'curriculum';
                state.settings = p.settings;
                state.curriculum = ensureUids(p.curriculum);
                state.curriculum = resequence(sortCurriculum(state.curriculum));
                state.currView = 'month';
                state.editing = false;
                state.showPool = false;
                state.drawerItem = null;
                render(root, state);
              },
            }, 'Load'),
            el('button', {
              class: 'vah-btn ghost',
              onclick: () => downloadJson(`VESPA_Curriculum_${(p.name || 'untitled').replace(/[^a-z0-9_-]+/gi,'_')}.json`, p),
            }, 'Download'),
            el('button', {
              class: 'vah-btn ghost',
              onclick: () => {
                const lib = loadCurriculumLibrary().filter((x) => x.id !== p.id);
                saveCurriculumLibrary(lib);
                render(root, state);
              },
            }, 'Delete'),
          ]),
        ]);
        grid.appendChild(card);
      });

      if (!filtered.length) {
        grid.appendChild(el('div', { style: 'padding:24px;text-align:center;color:#94A3B8;font-size:13px;grid-column:1/-1' }, 'No saved curricula yet. Build one, then use “Save” in the Curriculum Builder.'));
      }
      panel.appendChild(grid);

    } else if (mode === 'library') {
      const filtered = makeLibraryFiltered(state);
      const topFilters = el('div', { style: 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center' }, [
        el('div', { class: 'vah-search', style: 'flex:0 1 340px;max-width:340px' }, [
          el('span', { style: 'color:#94A3B8' }, '🔍'),
          el('input', {
            value: state.libSearch || '',
            'data-focus-key': 'libSearch',
            placeholder: `Search ${state.allActivities.length} activities...`,
            oninput: (e) => {
              state.libSearch = e.target.value;
              setFocusRestore(state, 'libSearch', e.target.selectionStart, e.target.selectionEnd);
              render(root, state);
            },
          }),
          (state.libSearch ? el('button', { style: 'background:none;border:none;cursor:pointer;color:#94A3B8', onclick: () => { state.libSearch = ''; render(root, state); } }, '✕') : null),
        ].filter(Boolean)),
        el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap' },
          Object.keys(VESPA).map((k) => {
            const v = VESPA[k];
            const isOn = state.libFilterEl === k;
            return el('button', {
              class: 'vah-chipbtn',
              style: `background:${isOn ? v.color : v.bg};color:${isOn ? '#fff' : v.color}`,
              onclick: () => { state.libFilterEl = (isOn ? null : k); render(root, state); },
            }, v.label);
          })
        ),
        el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap' }, [
          { v: '2', l: 'KS4' }, { v: '3', l: 'KS5' }, { v: '', l: 'All' },
        ].map((lv) => {
          const isOn = state.libFilterLevel === lv.v;
          return el('button', {
            class: 'vah-chipbtn',
            style: `background:${isOn ? '#1E293B' : '#E2E8F0'};color:${isOn ? '#fff' : '#475569'};font-weight:800`,
            onclick: () => { state.libFilterLevel = (isOn ? null : lv.v); render(root, state); },
          }, lv.l);
        })),
        el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap' }, [
          { v: 'vocational', l: 'Vocational' }, { v: '', l: 'All' },
        ].map((pw) => {
          const isOn = (state.libFilterPathway || '') === pw.v;
          return el('button', {
            class: 'vah-chipbtn',
            style: `background:${isOn ? '#0B4A6F' : '#E2E8F0'};color:${isOn ? '#fff' : '#475569'};font-weight:900`,
            onclick: () => { state.libFilterPathway = (isOn || !pw.v) ? null : pw.v; render(root, state); },
          }, pw.l);
        })),
        el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap' }, [
          { v: 'A Level Mindset', l: 'A Level' },
          { v: 'GCSE Mindset', l: 'GCSE' },
          { v: 'VESPA Handbook', l: 'Handbook' },
          { v: '', l: 'All' },
        ].map((b) => {
          const isOn = (state.libFilterBook || '') === b.v;
          return el('button', {
            class: 'vah-chipbtn',
            style: `background:${isOn ? '#0F766E' : '#E2E8F0'};color:${isOn ? '#fff' : '#475569'};font-weight:800`,
            onclick: () => { state.libFilterBook = (isOn ? null : b.v); render(root, state); },
          }, b.l);
        })),
      ]);

      panel.appendChild(topFilters);
      panel.appendChild(el('div', { class: 'vah-muted', style: 'margin-bottom:10px' }, `Showing ${filtered.length} of ${state.allActivities.length}`));

      const grid = el('div', { class: 'vah-grid' });
      filtered.forEach((item) => {
        const v = VESPA[item.element] || VESPA.VISION;
        const card = el('div', { class: 'vah-item', style: `border-left-color:${v.color}` });
        card.appendChild(el('div', { class: 'meta' }, [
          elementBadge(item.element, null),
          item.isQ ? qBadge(item.qType) : null,
          pathwayChip(item.pathway),
          bookPill(item.book),
        ].filter(Boolean)));
        card.appendChild(el('h3', null, item.name));
        card.appendChild(el('div', { class: 'desc' }, item.summary || item.guidance || ''));
        card.addEventListener('click', () => { state.drawerItem = item; render(root, state); });
        grid.appendChild(card);
      });
      panel.appendChild(grid);
      if (!filtered.length) {
        panel.appendChild(el('div', { style: 'text-align:center;padding:36px 20px;color:#94A3B8' }, [
          el('div', { style: 'font-size:30px;margin-bottom:4px' }, '🔍'),
          el('div', { style: 'font-size:13px;font-weight:900' }, 'No activities found'),
        ]));
      }
    } else {
      // Curriculum builder
      const wizardStep = Number(state.wizardStep || 0);

      function renderWizard() {
        const step = Number(state.wizardStep || 0);
        const steps = [0, 1, 2, 3, 4];
        const card = el('div', { class: 'vah-card', style: 'max-width:660px;margin:0 auto' }, []);
        card.appendChild(el('div', { class: 'vah-stepbar' }, steps.map((i) => el('div', { class: i <= step ? 'is-on' : '' }))));
        const header = el('div', { style: 'text-align:center;margin-bottom:18px' }, []);
        card.appendChild(header);

        const goNext = (n) => { state.wizardStep = n; render(root, state); };

        if (step === 0) {
          header.appendChild(el('div', { style: 'font-size:34px;margin-bottom:4px' }, '🎯'));
          header.appendChild(el('div', { style: 'font-size:19px;font-weight:900;color:#0F172A;margin:0 0 3px' }, 'Which year group?'));
          header.appendChild(el('div', { class: 'vah-muted' }, 'Determines KS4 vs KS5 activity selection'));
          card.appendChild(el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center' }, [9, 10, 11, 12, 13].map((y) => {
            const isOn = Number(state.tmp.yearGroup || 0) === y;
            return el('button', {
              class: `vah-yearbtn ${isOn ? 'is-on' : ''}`,
              onclick: () => { state.tmp.yearGroup = y; goNext(1); },
            }, [el('div', { class: 'n' }, String(y)), el('div', { class: 't' }, 'Year')]);
          })));
        }

        if (step === 1) {
          header.appendChild(el('div', { style: 'font-size:19px;font-weight:900;color:#0F172A;margin:0 0 3px' }, 'Academic or Vocational?'));
          header.appendChild(el('div', { class: 'vah-muted' }, 'Tailors activity selection — vocational prioritises Systems & Effort for coursework management'));
          const opts = [
            { v: 'academic', i: '📝', l: 'Academic', d: 'A-Levels, GCSEs — exam techniques, revision strategies, mark schemes' },
            { v: 'vocational', i: '🔧', l: 'Vocational', d: 'BTECs, T-Levels — project management, coursework deadlines, organisation' },
            { v: 'both', i: '📚', l: 'Mixed', d: 'All activities — for mixed cohorts or general pastoral programmes' },
          ];
          card.appendChild(el('div', { style: 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap' }, opts.map((o) => {
            const isOn = state.tmp.pathway === o.v;
            return el('button', {
              class: `vah-optbtn ${isOn ? 'is-on' : ''}`,
              onclick: () => { state.tmp.pathway = o.v; goNext(2); },
            }, [
              el('div', { class: 'i' }, o.i),
              el('div', { class: 'l' }, o.l),
              el('div', { class: 'd' }, o.d),
            ]);
          })));
        }

        if (step === 2) {
          header.appendChild(el('div', { style: 'font-size:19px;font-weight:900;color:#0F172A;margin:0 0 3px' }, 'Student profile?'));
          header.appendChild(el('div', { class: 'vah-muted' }, 'Low profiles get more foundations, High profiles get stretch'));
          card.appendChild(el('div', { style: 'display:flex;flex-direction:column;gap:6px;max-width:430px;margin:0 auto' }, PROFILES.map((p) => {
            const isOn = state.tmp.profile === p;
            return el('button', { class: `vah-profbtn ${isOn ? 'is-on' : ''}`, onclick: () => { state.tmp.profile = p; goNext(3); } }, [
              el('div', { class: 'l' }, p),
              el('div', { class: 'd' }, PROFILE_DESCS[p] || ''),
            ]);
          })));
        }

        if (step === 3) {
          header.appendChild(el('div', { style: 'font-size:19px;font-weight:900;color:#0F172A;margin:0 0 3px' }, 'Include VESPA Questionnaire?'));
          header.appendChild(el('div', { class: 'vah-muted' }, '3 cycles (Sept, Jan, April) + coaching sessions = 6 slots'));
          const opts = [
            { v: true, i: '📋', l: 'Yes', d: '3 questionnaire + 3 coaching' },
            { v: false, i: '✕', l: 'No', d: 'All slots for activities' },
          ];
          card.appendChild(el('div', { style: 'display:flex;gap:14px;justify-content:center;flex-wrap:wrap' }, opts.map((o) => {
            const isOn = state.tmp.includeQuestionnaire === o.v;
            return el('button', { class: `vah-optbtn ${isOn ? 'is-on' : ''}`, onclick: () => { state.tmp.includeQuestionnaire = o.v; goNext(4); } }, [
              el('div', { class: 'i' }, o.i),
              el('div', { class: 'l' }, o.l),
              el('div', { class: 'd' }, o.d),
            ]);
          })));
        }

        if (step === 4) {
          header.appendChild(el('div', { style: 'font-size:19px;font-weight:900;color:#0F172A;margin:0 0 3px' }, 'Activities per month?'));
          header.appendChild(el('div', { class: 'vah-muted' }, `Default 2, max 4${state.tmp.includeQuestionnaire ? ' (questionnaire uses some slots)' : ''}`));
          const pm = Number(state.tmp.activitiesPerMonth || 2);
          const totalSlots = pm * MONTHS.length;
          card.appendChild(el('div', { style: 'max-width:380px;margin:0 auto;text-align:center' }, [
            el('div', { style: 'display:flex;gap:10px;justify-content:center;margin-bottom:16px' }, [1, 2, 3, 4].map((n) => {
              const isOn = pm === n;
              return el('button', {
                style: `width:56px;height:56px;border-radius:14px;border:${isOn ? '3px' : '2px'} solid ${isOn ? '#1E40AF' : '#E2E8F0'};background:${isOn ? '#EFF6FF' : '#fff'};cursor:pointer;font-size:22px;font-weight:900;color:${isOn ? '#1E40AF' : '#64748B'}`,
                onclick: () => { state.tmp.activitiesPerMonth = n; render(root, state); },
              }, String(n));
            })),
            el('div', { style: 'font-size:12px;color:#64748B;margin-bottom:20px' },
              `${pm}/month = ${totalSlots} slots${state.tmp.includeQuestionnaire ? ` (6 questionnaire = ${Math.max(0, totalSlots - 6)} activities)` : ''}`
            ),
            el('button', {
              style: `padding:12px 36px;border-radius:14px;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;border:none;font-size:15px;font-weight:900;cursor:pointer`,
              onclick: () => {
                const yearGroup = Number(state.tmp.yearGroup || 0);
                const pathway = state.tmp.pathway || '';
                const profile = state.tmp.profile || '';
                if (!yearGroup || !pathway || !profile) return;
                const settings = {
                  yearGroup,
                  pathway,
                  profile,
                  includeQuestionnaire: !!state.tmp.includeQuestionnaire,
                  activitiesPerMonth: Number(state.tmp.activitiesPerMonth || 2),
                };
                state.settings = settings;
                state.curriculum = generateCurriculum({ allActivities: state.allActivities, ...settings });
                state.curriculum = resequence(sortCurriculum(state.curriculum));
                state.currView = 'month';
                state.editing = false;
                render(root, state);
              },
            }, '✨ Generate Curriculum'),
          ]));
        }

        if (step > 0) {
          card.appendChild(el('button', {
            style: 'margin-top:14px;background:none;border:none;color:#64748B;font-size:12px;font-weight:800;cursor:pointer;display:block;margin:14px auto 0',
            onclick: () => { state.wizardStep = Math.max(0, step - 1); render(root, state); },
          }, '← Back'));
        }

        return card;
      }

      function usedIdsSet() {
        return new Set((state.curriculum || []).map((c) => c.id));
      }

      function activityPool({ usedIds, pathway, level, onAdd }) {
        const poolWrap = el('div', { style: 'background:#fff;borderRadius:16px;border:1px solid #E2E8F0' });
        const top = el('div', { style: 'padding:12px 16px;border-bottom:1px solid #E2E8F0' });
        const search = String(state.poolSearch || '');
        const filterEl = state.poolFilterEl || null;
        const pool = state.allActivities.filter((a) => {
          if (usedIds && usedIds.has(a.id)) return false;
          if (level && a.level && a.level !== level && a.level !== '') return false;
          if (pathway && a.pathway && !(a.pathway === 'both' || a.pathway === pathway)) return false;
          if (filterEl && a.element !== filterEl) return false;
          if (search) {
            const s = search.toLowerCase();
            const hay = `${a.name || ''} ${a.summary || ''} ${a.guidance || ''}`.toLowerCase();
            if (!hay.includes(s)) return false;
          }
          return true;
        });

        top.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, [
          el('div', { class: 'vah-search', style: 'min-width:260px' }, [
            el('span', { style: 'color:#94A3B8' }, '🔍'),
            el('input', {
              value: search,
              'data-focus-key': 'poolSearch',
              placeholder: `Search ${pool.length} available...`,
              oninput: (e) => {
                state.poolSearch = e.target.value;
                setFocusRestore(state, 'poolSearch', e.target.selectionStart, e.target.selectionEnd);
                render(root, state);
              },
            }),
          ]),
          el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap' },
            Object.keys(VESPA).map((k) => {
              const v = VESPA[k];
              const isOn = filterEl === k;
              return el('button', {
                class: 'vah-chipbtn',
                style: `background:${isOn ? v.color : v.bg};color:${isOn ? '#fff' : v.color};font-size:10px`,
                onclick: () => { state.poolFilterEl = isOn ? null : k; render(root, state); },
              }, v.label);
            })
          ),
        ]));
        poolWrap.appendChild(top);

        const grid = el('div', { style: 'max-height:320px;overflow:auto;padding:10px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px' });
        pool.slice(0, 60).forEach((a) => {
          const v = VESPA[a.element] || VESPA.VISION;
          const card = el('div', {
            style: `background:#fff;border-radius:8px;padding:8px 10px;border-left:3px solid ${v.color};border:1px solid #E2E8F0;cursor:grab;transition:all 0.15s`,
            draggable: 'true',
            onclick: () => onAdd(a),
          }, [
            el('div', { style: 'display:flex;align-items:center;gap:4px;margin-bottom:2px;flex-wrap:wrap' }, [
              el('span', { style: 'font-weight:900;font-size:12px;color:#1E293B' }, a.name),
              elementBadge(a.element, 'sm'),
            ]),
              el('div', { style: 'font-size:10px;color:#64748B;line-height:1.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis' }, a.summary || a.guidance || ''),
          ]);
          card.addEventListener('dragstart', (e) => {
            try {
              e.dataTransfer.setData('text/plain', `ADD:${String(a.id)}`);
              e.dataTransfer.effectAllowed = 'copy';
            } catch (_) {}
          });
          card.addEventListener('mouseenter', () => { card.style.background = v.bg; card.style.borderColor = v.color; });
          card.addEventListener('mouseleave', () => { card.style.background = '#fff'; card.style.borderColor = '#E2E8F0'; });
          grid.appendChild(card);
        });
        if (!pool.length) {
          grid.appendChild(el('div', { style: 'padding:20px;text-align:center;color:#94A3B8;font-size:12px;grid-column:1/-1' }, 'No matching activities'));
        }
        poolWrap.appendChild(grid);
        return poolWrap;
      }

      function curriculumHeader() {
        const s = state.settings;
        if (!s) return null;
        const pw = (s.pathway === 'academic') ? 'Academic' : (s.pathway === 'vocational') ? 'Vocational' : 'Mixed';
        const right = el('div', { class: 'vah-row', style: 'gap:5px;flex-wrap:wrap;align-items:center' }, []);

        const editBtn = el('button', {
          style: `padding:5px 12px;background:${state.editing ? '#FEF2F2' : '#fff'};color:${state.editing ? '#DC2626' : '#475569'};border:${state.editing ? '2px solid #FCA5A5' : '1px solid #E2E8F0'};border-radius:10px;font-size:11px;font-weight:900;cursor:pointer`,
          onclick: () => { state.editing = !state.editing; state.showPool = !!state.editing; render(root, state); },
        }, state.editing ? '✓ Done' : '✏️ Edit');
        right.appendChild(editBtn);

        const viewToggle = el('div', { class: 'vah-viewtoggle' }, [
          { id: 'month', l: 'Month' }, { id: 'term', l: 'Term' }, { id: 'year', l: 'Year' }, { id: 'table', l: 'Table' },
        ].map((v) => el('button', {
          class: (state.currView === v.id ? 'is-on' : ''),
          onclick: () => { state.currView = v.id; render(root, state); },
        }, v.l)));
        right.appendChild(viewToggle);

        right.appendChild(el('button', {
          style: 'padding:5px 12px;background:#fff;color:#475569;border:1px solid #E2E8F0;border-radius:10px;font-size:11px;font-weight:900;cursor:pointer',
          onclick: () => {
            const rows = [['Sequence', 'Month', 'Activity', 'VESPA Element', 'Book', 'Pathway', 'Profile', 'Tutor Guidance']];
            (state.curriculum || []).forEach((i) => rows.push([
              i.sequence,
              i.month,
              i.name,
              (VESPA[i.element] ? VESPA[i.element].label : i.element),
              i.book || '',
              i.isQ ? (i.qType || '') : (s.pathway || ''),
              s.profile,
              i.guidance || i.summary || '',
            ]));
            downloadCsv(`VESPA_Curriculum_Y${s.yearGroup}_${s.profile}.csv`, rows);
          },
        }, '📥 CSV'));
        right.appendChild(el('button', {
          style: 'padding:5px 12px;background:#fff;color:#475569;border:1px solid #E2E8F0;border-radius:10px;font-size:11px;font-weight:900;cursor:pointer',
          onclick: () => window.print(),
        }, '🖨 Print'));
        right.appendChild(el('button', {
          style: 'padding:5px 12px;background:#ECFDF5;color:#065F46;border:1px solid #6EE7B7;border-radius:10px;font-size:11px;font-weight:900;cursor:pointer',
          onclick: () => {
            if (!state.settings || !(state.curriculum || []).length) return;
            const nameDefault = `Y${s.yearGroup} ${pw} ${s.profile}`;
            const name = String(window.prompt('Name this curriculum', nameDefault) || '').trim();
            if (!name) return;
            const now = new Date().toISOString();
            const hasCrypto = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function');
            const id = hasCrypto ? crypto.randomUUID() : `plan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
            const entry = {
              id,
              name,
              createdAt: now,
              updatedAt: now,
              ownerEmail: getCurrentUserEmail() || '',
              yearGroup: s.yearGroup,
              pathway: s.pathway,
              profile: s.profile,
              count: (state.curriculum || []).length,
              settings: state.settings,
              curriculum: state.curriculum,
            };
            const lib = loadCurriculumLibrary();
            lib.unshift(entry);
            saveCurriculumLibrary(lib.slice(0, 100)); // cap
            state.mode = 'saved';
            render(root, state);
          },
        }, '💾 Save'));
        right.appendChild(el('button', {
          style: 'padding:5px 12px;background:#fff;color:#475569;border:1px solid #E2E8F0;border-radius:10px;font-size:11px;font-weight:900;cursor:pointer',
          onclick: () => { state.settings = null; state.curriculum = []; state.editing = false; state.showPool = false; state.drawerItem = null; state.wizardStep = 0; render(root, state); },
        }, '↻ Rebuild'));

        return el('div', { class: 'vah-topbar' }, [
          el('div', null, [
            el('div', { style: 'font-size:17px;font-weight:900;color:#0F172A;margin:"0 0 2px"' }, `Year ${s.yearGroup} — ${s.profile} — ${pw}`),
            el('div', { style: 'font-size:11px;color:#64748B;font-weight:800' }, `${(state.curriculum || []).length} activities${s.includeQuestionnaire ? ' • Questionnaire included' : ''}`),
          ]),
          right,
        ]);
      }

      function activityCard(item, idxGlobal) {
        const v = VESPA[item.element] || VESPA.VISION;
        const uid = item.uid || item.id;
        const draggable = !!state.editing && !item.isQ;
        const row = el('div', {
          class: 'vah-item',
          style: `border-left-color:${v.color}`,
          draggable: draggable ? 'true' : null,
          'data-uid': uid,
        });
        const meta = el('div', { class: 'meta' }, [
          elementBadge(item.element),
          item.isQ ? qBadge(item.qType) : null,
          pathwayChip(item.pathway),
          bookPill(item.book),
        ].filter(Boolean));
        const title = el('div', { style: 'font-weight:900;font-size:12px;color:#1E293B;display:flex;align-items:center;gap:6px;flex-wrap:wrap' }, [
          el('span', null, `${item.sequence}. ${item.name}`),
        ]);
        const desc = el('div', { class: 'desc' }, item.summary || item.guidance || '');
        row.appendChild(meta);
        row.appendChild(title);
        row.appendChild(desc);

        if (state.editing && !item.isQ) {
          const controls = el('div', { style: 'display:flex;gap:6px;margin-top:8px;justify-content:flex-end' }, [
            el('button', {
              style: 'border:1px solid #E2E8F0;background:#fff;border-radius:8px;padding:2px 8px;cursor:pointer;font-weight:900;color:#64748B',
              onclick: (e) => {
                e.stopPropagation();
                const c = (state.curriculum || []).slice();
                const idx = c.findIndex((x) => (x.uid || x.id) === uid);
                if (idx < 0) return;
                // move within the same month only
                let ni = idx - 1;
                while (ni >= 0 && c[ni] && c[ni].month !== item.month) ni -= 1;
                if (ni < 0) return;
                [c[idx], c[ni]] = [c[ni], c[idx]];
                const c2 = resequence(c);
                state.curriculum = resequence(sortCurriculum(c2));
                render(root, state);
              },
            }, '↑'),
            el('button', {
              style: 'border:1px solid #E2E8F0;background:#fff;border-radius:8px;padding:2px 8px;cursor:pointer;font-weight:900;color:#64748B',
              onclick: (e) => {
                e.stopPropagation();
                const c = (state.curriculum || []).slice();
                const idx = c.findIndex((x) => (x.uid || x.id) === uid);
                if (idx < 0) return;
                // move within the same month only
                let ni = idx + 1;
                while (ni < c.length && c[ni] && c[ni].month !== item.month) ni += 1;
                if (ni >= c.length) return;
                [c[idx], c[ni]] = [c[ni], c[idx]];
                const c2 = resequence(c);
                state.curriculum = resequence(sortCurriculum(c2));
                render(root, state);
              },
            }, '↓'),
            el('button', {
              style: 'border:1px solid #FCA5A5;background:#FEF2F2;border-radius:8px;padding:2px 8px;cursor:pointer;font-weight:900;color:#DC2626',
              onclick: (e) => {
                e.stopPropagation();
                const c = (state.curriculum || []).slice();
                const idx = c.findIndex((x) => (x.uid || x.id) === uid);
                if (idx < 0) return;
                c.splice(idx, 1);
                state.curriculum = resequence(sortCurriculum(c));
                render(root, state);
              },
            }, '✕'),
          ]);
          row.appendChild(controls);
        }

        if (draggable) {
          row.addEventListener('dragstart', (e) => {
            try {
              e.dataTransfer.setData('text/plain', String(uid));
              e.dataTransfer.effectAllowed = 'move';
            } catch (_) {}
          });
          row.addEventListener('dragover', (e) => { e.preventDefault(); });
          row.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dragged = (e.dataTransfer && e.dataTransfer.getData) ? e.dataTransfer.getData('text/plain') : '';
            if (!dragged) return;
            if (String(dragged).startsWith('ADD:')) {
              const id = String(dragged).slice(4);
              const a = (state.allActivities || []).find((x) => x.id === id);
              if (a) {
                addActivityToCurriculum(state, a, item.month, uid);
                render(root, state);
              }
              return;
            }
            if (dragged === uid) return;
            moveItemByUid(state, dragged, uid, item.month);
            render(root, state);
          });
        }

        row.addEventListener('click', () => { state.drawerItem = item; render(root, state); });
        return row;
      }

      if (!state.settings) {
        panel.appendChild(el('div', { style: 'text-align:center;margin-bottom:22px' }, [
          el('div', { style: 'font-size:34px;margin-bottom:4px' }, '🎯'),
          el('div', { style: 'font-size:18px;font-weight:900;color:#0F172A;margin:"0 0 3px"' }, 'Build Your Annual Programme'),
          el('div', { class: 'vah-muted' }, 'Answer a few questions, then edit freely'),
        ]));
        panel.appendChild(renderWizard());
      } else {
        panel.appendChild(curriculumHeader());
        if (state.editing) {
          panel.appendChild(el('div', { class: 'vah-warn' }, [
            el('span', { style: 'font-size:14px' }, '✏️'),
            el('span', null, 'Edit Mode: use ↑ ↓ to move, ✕ to remove, click a card to view details. Use the pool below or + Add buttons to add activities.'),
          ]));
        }

        state.curriculum = ensureUids(state.curriculum || []);
        panel.appendChild(vespabar(state.curriculum || []));

        const s = state.settings;
        const currView = state.currView || 'month';

        if (currView === 'month') {
          const layout = el('div', { class: 'vah-layout' });
          const main = el('div', { class: 'vah-main' });

          MONTHS.forEach((month) => {
            const items = (state.curriculum || []).filter((c) => c.month === month);
            if (!items.length) return;
            const monthBox = el('div', { style: 'margin-bottom:16px' });
            const left = el('div', { style: 'flex:1' }, [
              el('div', { style: 'font-size:13px;font-weight:900;color:#1E293B' }, month),
              el('div', { style: 'font-size:10px;color:#94A3B8;font-weight:800' }, `${items.length} ${items.length === 1 ? 'activity' : 'activities'}`),
            ]);
            const hd = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:7px' }, [
              el('div', { style: 'width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900' }, month.slice(0, 3).toUpperCase()),
              left,
              (state.editing ? el('button', {
                style: 'font-size:10px;font-weight:900;color:#1E40AF;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:7px;padding:4px 10px;cursor:pointer',
                onclick: () => { state.addMonth = month; render(root, state); },
              }, '+ Add') : null),
            ].filter(Boolean));
            monthBox.appendChild(hd);

            const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px;padding-left:42px' });
            if (state.editing) {
              list.addEventListener('dragover', (e) => { e.preventDefault(); });
              list.addEventListener('drop', (e) => {
                e.preventDefault();
                const dragged = (e.dataTransfer && e.dataTransfer.getData) ? e.dataTransfer.getData('text/plain') : '';
                if (!dragged) return;
                if (String(dragged).startsWith('ADD:')) {
                  const id = String(dragged).slice(4);
                  const a = (state.allActivities || []).find((x) => x.id === id);
                  if (a) {
                    addActivityToCurriculum(state, a, month, null);
                    render(root, state);
                  }
                  return;
                }
                // Dropping an existing curriculum card inserts at end of that month
                moveItemByUid(state, dragged, null, month);
                render(root, state);
              });
            }
            items.forEach((it) => {
              const idxGlobal = (state.curriculum || []).indexOf(it);
              list.appendChild(activityCard(it, idxGlobal));
            });
            monthBox.appendChild(list);
            main.appendChild(monthBox);
          });

          layout.appendChild(main);

          if (state.editing) {
            const usedIds = usedIdsSet();
            const lv = (Number(s.yearGroup) <= 11) ? '2' : '3';
            const side = el('div', { class: 'vah-side' }, [
              el('div', { style: 'font-weight:900;color:#0F172A;margin:2px 0 8px' }, 'Activity Pool'),
              el('div', { class: 'vah-muted', style: 'margin-bottom:10px' }, 'Drag into a month (or click to add)'),
              activityPool({
                usedIds,
                pathway: s.pathway || 'both',
                level: lv,
                onAdd: (a) => {
                  // default click behaviour: add to month with fewest items
                  const counts = {};
                  MONTHS.forEach((m) => { counts[m] = (state.curriculum || []).filter((c) => c.month === m).length; });
                  const minMonth = MONTHS.reduce((best, m) => (counts[m] < counts[best] ? m : best), MONTHS[0]);
                  addActivityToCurriculum(state, a, minMonth, null);
                  render(root, state);
                },
              }),
            ]);
            layout.appendChild(side);
          }

          panel.appendChild(layout);
        } else if (currView === 'table') {
          const rows = (state.curriculum || []).slice().sort((a, b) => {
            const d = MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
            if (d !== 0) return d;
            return (a.sequence || 0) - (b.sequence || 0);
          });
          const table = el('table', { class: 'vah-table' }, [
            el('thead', null, [
              el('tr', null, [
                el('th', null, '#'),
                el('th', null, 'Month'),
                el('th', null, 'VESPA'),
                el('th', null, 'Activity'),
                el('th', null, 'Book'),
                el('th', null, 'Link'),
              ]),
            ]),
            el('tbody', null, rows.map((i) => {
              const v = VESPA[i.element] ? VESPA[i.element].label : i.element;
              const link = (i.pdf || i.pdfCy) ? el('a', {
                href: (currentLang === 'cy' && i.pdfCy) ? i.pdfCy : i.pdf,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: 'color:#1E40AF;font-weight:900;text-decoration:none',
              }, 'Open PDF') : el('span', { style: 'color:#94A3B8' }, '-');
              return el('tr', null, [
                el('td', null, String(i.sequence || '')),
                el('td', null, String(i.month || '')),
                el('td', null, String(v || '')),
                el('td', null, String(i.name || '')),
                el('td', null, String(i.book || '')),
                el('td', null, [link]),
              ]);
            })),
          ]);
          panel.appendChild(table);
        } else if (currView === 'term') {
          const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px' });
          Object.entries(TERMS).forEach(([term, months]) => {
            const ti = (state.curriculum || []).filter((c) => months.includes(c.month));
            const card = el('div', { style: 'background:#fff;border-radius:14px;padding:14px;border:1px solid #E2E8F0' });
            card.appendChild(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, [
              el('div', null, [
                el('div', { style: 'font-size:13px;font-weight:900;color:#1E293B' }, term),
                el('div', { style: 'font-size:10px;color:#94A3B8;font-weight:800' }, `${months.join(' & ')} • ${ti.length}`),
              ]),
              (state.editing ? el('button', { style: 'font-size:10px;font-weight:900;color:#1E40AF;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:3px 9px;cursor:pointer', onclick: () => { state.addMonth = months[0]; render(root, state); } }, '+') : null),
            ].filter(Boolean)));
            const list = el('div', { style: 'display:flex;flex-direction:column;gap:5px' });
            if (ti.length) {
              ti.forEach((it) => list.appendChild(activityCard(it, (state.curriculum || []).indexOf(it))));
            } else {
              list.appendChild(el('div', { style: 'padding:12px;text-align:center;color:#CBD5E1;font-size:11px' }, 'No activities'));
            }
            card.appendChild(list);
            grid.appendChild(card);
          });
          panel.appendChild(grid);
        } else {
          // year view (group by term)
          Object.entries(TERMS).forEach(([term, months]) => {
            const ti = (state.curriculum || []).filter((c) => months.includes(c.month));
            if (!ti.length) return;
            const wrap = el('div', { style: 'margin-bottom:14px' });
            wrap.appendChild(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' }, [
              el('div', { style: 'font-size:11px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.08em' }, term),
              (state.editing ? el('button', { style: 'font-size:10px;font-weight:900;color:#1E40AF;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:3px 9px;cursor:pointer', onclick: () => { state.addMonth = months[0]; render(root, state); } }, '+') : null),
            ].filter(Boolean)));
            const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:6px' });
            ti.forEach((it) => grid.appendChild(activityCard(it, (state.curriculum || []).indexOf(it))));
            wrap.appendChild(grid);
            panel.appendChild(wrap);
          });
        }

        // Activity pool now appears as a right-hand panel in Month view (edit mode).
      }
    }

    content.appendChild(panel);
    shell.appendChild(hero);
    shell.appendChild(content);
    root.appendChild(shell);

    restoreFocusIfNeeded(state, root);

    // Weglot: translate newly injected DOM (Supabase-loaded copy included).
    try {
      if (typeof window !== 'undefined') {
        if (typeof window.__vespaRequestWeglotRefresh === 'function') {
          window.__vespaRequestWeglotRefresh('activityHub render');
        } else if (window.Weglot && typeof window.Weglot.refresh === 'function') {
          window.Weglot.refresh();
        }
      }
    } catch (_) {}

    // Add-to-month modal (edit mode)
    if (state.addMonth && state.settings) {
      const month = state.addMonth;
      const s = state.settings;
      const usedIds = new Set((state.curriculum || []).map((c) => c.id));
      const lv = (Number(s.yearGroup) <= 11) ? '2' : '3';
      const overlay = el('div', { id: 'vah-add-overlay', style: 'position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(4px);z-index:11000', onclick: () => { state.addMonth = null; render(root, state); } });
      const modal = el('div', { id: 'vah-add-modal', style: 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(540px,92vw);max-height:78vh;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.2);z-index:11001;display:flex;flex-direction:column' });
      modal.appendChild(el('div', { style: 'padding:16px 20px 12px;border-bottom:1px solid #E2E8F0' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px' }, [
          el('div', { style: 'font-size:16px;font-weight:900;color:#0F172A' }, `Add to ${month}`),
          el('button', { style: 'background:none;border:none;cursor:pointer;color:#94A3B8;font-size:16px', onclick: (e) => { e.stopPropagation(); state.addMonth = null; render(root, state); } }, '✕'),
        ]),
      ]));
      modal.appendChild(el('div', { style: 'flex:1;overflow:auto;padding:12px 20px' }, [
        (function () {
          const pool = el('div', { style: 'background:#fff;borderRadius:0' });
          // Reuse pool UI
          const onAdd = (a) => {
            const newItem = {
              id: a.id,
              uid: a.uid || a.id,
              name: a.name,
              element: a.element,
              month,
              guidance: a.guidance,
              summary: a.summary,
              pdf: a.pdf,
              pdfCy: a.pdfCy || '',
        slides: a.slides || '',
        slidesCy: a.slidesCy || '',
              sequence: 0,
              yearGroup: s.yearGroup,
              profile: s.profile,
              pathway: s.pathway,
              qType: null,
              isQ: false,
              book: a.book,
            };
            state.curriculum = resequence(sortCurriculum([...(state.curriculum || []), newItem]));
            state.addMonth = null;
            render(root, state);
          };
          // Minimal embedded pool
          const tmpState = { poolSearch: state.poolSearch || '', poolFilterEl: state.poolFilterEl || null };
          state.poolSearch = tmpState.poolSearch;
          state.poolFilterEl = tmpState.poolFilterEl;
          return (function () {
            // inline pool rendering (same as above activityPool)
            const wrap = el('div', { style: 'background:#fff;border:1px solid #E2E8F0;border-radius:16px' });
            const top = el('div', { style: 'padding:12px 16px;border-bottom:1px solid #E2E8F0' });
            const search = String(state.poolSearch || '');
            const filterEl = state.poolFilterEl || null;
            const list = state.allActivities.filter((a) => {
              if (usedIds.has(a.id)) return false;
              if (lv && a.level && a.level !== lv && a.level !== '') return false;
              if (s.pathway && a.pathway && !(a.pathway === 'both' || a.pathway === s.pathway)) return false;
              if (filterEl && a.element !== filterEl) return false;
              if (search) {
                const ss = search.toLowerCase();
                const hay = `${a.name || ''} ${a.summary || ''} ${a.guidance || ''}`.toLowerCase();
                if (!hay.includes(ss)) return false;
              }
              return true;
            });
            top.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, [
              el('div', { class: 'vah-search', style: 'min-width:260px' }, [
                el('span', { style: 'color:#94A3B8' }, '🔍'),
                el('input', {
                  value: search,
                  'data-focus-key': 'poolSearch',
                  placeholder: `Search ${list.length} available...`,
                  oninput: (e) => {
                    state.poolSearch = e.target.value;
                    setFocusRestore(state, 'poolSearch', e.target.selectionStart, e.target.selectionEnd);
                    render(root, state);
                  },
                }),
              ]),
              el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap' },
                Object.keys(VESPA).map((k) => {
                  const v = VESPA[k];
                  const isOn = filterEl === k;
                  return el('button', {
                    class: 'vah-chipbtn',
                    style: `background:${isOn ? v.color : v.bg};color:${isOn ? '#fff' : v.color};font-size:10px`,
                    onclick: () => { state.poolFilterEl = isOn ? null : k; render(root, state); },
                  }, v.label);
                })
              ),
            ]));
            wrap.appendChild(top);
            const grid = el('div', { style: 'max-height:56vh;overflow:auto;padding:10px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px' });
            list.slice(0, 80).forEach((a) => {
              const v = VESPA[a.element] || VESPA.VISION;
              const card = el('div', {
                style: `background:#fff;border-radius:8px;padding:8px 10px;border-left:3px solid ${v.color};border:1px solid #E2E8F0;cursor:pointer;transition:all 0.15s`,
                onclick: () => onAdd(a),
              }, [
                el('div', { style: 'display:flex;align-items:center;gap:4px;margin-bottom:2px;flex-wrap:wrap' }, [
                  el('span', { style: 'font-weight:900;font-size:12px;color:#1E293B' }, a.name),
                  elementBadge(a.element, 'sm'),
                ]),
                el('div', { style: 'font-size:10px;color:#64748B;line-height:1.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis' }, a.summary || a.guidance || ''),
              ]);
              card.addEventListener('mouseenter', () => { card.style.background = v.bg; card.style.borderColor = v.color; });
              card.addEventListener('mouseleave', () => { card.style.background = '#fff'; card.style.borderColor = '#E2E8F0'; });
              grid.appendChild(card);
            });
            if (!list.length) grid.appendChild(el('div', { style: 'padding:20px;text-align:center;color:#94A3B8;font-size:12px;grid-column:1/-1' }, 'No matching activities'));
            wrap.appendChild(grid);
            return wrap;
          })();
        })(),
      ]));
      document.body.appendChild(overlay);
      document.body.appendChild(modal);
    }

    // Drawer
    if (state.drawerItem) {
      // Close any existing asset preview (prevents stuck overlays in SPA)
      cleanupAssetModal();

      const item = state.drawerItem;
      const v = VESPA[item.element] || VESPA.VISION;
      const mask = el('div', { class: 'vah-drawer-mask', onclick: () => { state.drawerItem = null; render(root, state); } });
      const drawer = el('div', { class: 'vah-drawer' });

      function drawerAlternatives() {
        if (!state.settings) return [];
        if (!state.editing || item.isQ) return [];
        const s = state.settings;
        const lv = (Number(s.yearGroup) <= 11) ? '2' : '3';
        const used = new Set((state.curriculum || []).map((c) => c.id));
        used.delete(item.id);
        const alts = (state.allActivities || []).filter((a) => {
          if (!a || !a.id) return false;
          if (used.has(a.id)) return false;
          if (a.element !== item.element) return false;
          if (lv && a.level && a.level !== lv && a.level !== '') return false;
          if (s.pathway && a.pathway && !(a.pathway === 'both' || a.pathway === s.pathway || a.pathway === '')) return false;
          return true;
        });
        // prefer ones with assets
        alts.sort((a, b) => ((b.pdf || b.pdfCy) ? 1 : 0) - ((a.pdf || a.pdfCy) ? 1 : 0));
        return alts.slice(0, 8);
      }

      function swapDrawerItem(toAct) {
        const curr = ensureUids(state.curriculum || []);
        const uid = item.uid || item.id;
        const idx = curr.findIndex((c) => (c.uid || c.id) === uid);
        if (idx < 0) return;
        const existing = curr[idx];
        const next = {
          ...existing,
          id: toAct.id,
          name: toAct.name,
          element: toAct.element,
          guidance: toAct.guidance,
          summary: toAct.summary,
          pdf: toAct.pdf,
          pdfCy: toAct.pdfCy || '',
        slides: toAct.slides || '',
        slidesCy: toAct.slidesCy || '',
          book: toAct.book || existing.book,
          pathway: toAct.pathway || existing.pathway,
          level: toAct.level || existing.level,
          isQ: false,
          qType: null,
        };
        curr[idx] = next;
        state.curriculum = resequence(sortCurriculum(curr));
        state.drawerItem = next;
        render(root, state);
      }
      const hd = el('div', { class: 'hd', style: `background:linear-gradient(135deg,${v.bg},#fff)` }, [
        el('div', { class: 'vah-row', style: 'justify-content:space-between;align-items:flex-start' }, [
          el('div', null, [
            el('div', { class: 'vah-row', style: 'gap:6px;margin-bottom:6px' }, [
              elementBadge(item.element),
              item.isQ ? qBadge(item.qType) : null,
              item.level ? el('span', { class: 'vah-pill' }, `Level ${item.level}`) : null,
              pathwayChip(item.pathway),
              bookPill(item.book),
            ].filter(Boolean)),
            el('div', { style: 'font-size:20px;font-weight:900;color:#0F172A' }, item.name || ''),
          ]),
          el('button', { class: 'x', onclick: (e) => { e.stopPropagation(); state.drawerItem = null; render(root, state); } }, '✕'),
        ]),
      ]);
      const bd = el('div', { class: 'bd' }, [
        item.summary ? el('div', {
          style: `font-size:13px;color:#475569;line-height:1.7;margin-bottom:12px;font-style:italic;border-left:3px solid ${v.color}55;padding-left:12px`,
        }, item.summary) : null,
        el('div', { class: 'vah-kv' }, [
          item.month ? el('div', null, [el('div', { class: 'k' }, 'Month'), el('div', { class: 'v' }, item.month)]) : null,
          item.sequence ? el('div', null, [el('div', { class: 'k' }, 'Sequence'), el('div', { class: 'v' }, `#${item.sequence}`)]) : null,
          item.profile ? el('div', null, [el('div', { class: 'k' }, 'Profile'), el('div', { class: 'v' }, item.profile)]) : null,
          item.yearGroup ? el('div', null, [el('div', { class: 'k' }, 'Year Group'), el('div', { class: 'v' }, `Year ${item.yearGroup}`)]) : null,
        ].filter(Boolean)),
        el('div', { style: 'font-size:11px;font-weight:900;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px' }, 'Tutor guidance'),
        el('div', { style: `background:linear-gradient(135deg,${v.bg}88,#F8FAFC);border:1px solid #E2E8F0;border-radius:12px;padding:12px 12px;font-size:13px;line-height:1.75;color:#334155` }, item.guidance || ''),
        el('div', { class: 'vah-row', style: 'margin-top:12px;gap:8px;flex-wrap:wrap' }, [
          (item.pdf || item.pdfCy) ? el('button', {
            class: 'vah-btn primary',
            style: 'display:inline-flex;align-items:center;gap:6px',
            onclick: (e) => {
              e.stopPropagation();
              const u = (currentLang === 'cy' && item.pdfCy) ? item.pdfCy : item.pdf;
              openAssetModal({ title: `${item.name || 'Activity'} — PDF`, url: u, kind: 'pdf' });
            },
          }, (currentLang === 'cy' && item.pdfCy) ? '⬇ Open PDF (Cymraeg)' : '⬇ Open PDF') : null,
          (item.slides || item.slidesCy) ? el('button', {
            class: 'vah-btn ghost',
            style: 'display:inline-flex;align-items:center;gap:6px',
            onclick: (e) => {
              e.stopPropagation();
              const u = (currentLang === 'cy' && item.slidesCy) ? item.slidesCy : item.slides;
              openAssetModal({ title: `${item.name || 'Activity'} — Slides`, url: u, kind: 'slides' });
            },
          }, (currentLang === 'cy' && item.slidesCy) ? '🖥 Launch Slides (Cymraeg)' : '🖥 Launch Slides') : null,
        ].filter(Boolean)),

        (state.editing && !item.isQ && state.settings) ? el('div', { style: 'margin-top:14px' }, [
          el('div', { style: 'font-size:11px;font-weight:900;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px' }, 'Swap activity (same VESPA element)'),
          (function () {
            const alts = drawerAlternatives();
            if (!alts.length) return el('div', { style: 'font-size:12px;color:#94A3B8;font-weight:800' }, 'No alternatives available with current filters.');
            const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
            alts.forEach((a) => {
              wrap.appendChild(el('button', {
                style: 'text-align:left;border:1px solid #E2E8F0;background:#fff;border-radius:12px;padding:10px 10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px',
                onclick: (e) => { e.stopPropagation(); swapDrawerItem(a); },
              }, [
                el('div', null, [
                  el('div', { style: 'font-weight:900;color:#0F172A;font-size:12px' }, a.name || ''),
                  el('div', { style: 'font-size:10px;color:#64748B;font-weight:800' }, (a.summary || a.guidance || '').slice(0, 110)),
                ]),
                el('div', { style: 'font-size:10px;font-weight:900;color:#1E40AF;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:999px;padding:4px 8px;white-space:nowrap' }, 'Swap'),
              ]));
            });
            return wrap;
          })(),
        ]) : null,
      ].filter(Boolean));
      drawer.appendChild(hd);
      drawer.appendChild(bd);
      document.body.appendChild(mask);
      document.body.appendChild(drawer);

      // Clean up any previous drawer nodes (keep only latest)
      qsa('.vah-drawer-mask').slice(0, -1).forEach((n) => n.remove());
      qsa('.vah-drawer').slice(0, -1).forEach((n) => n.remove());
    } else {
      qsa('.vah-drawer-mask').forEach((n) => n.remove());
      qsa('.vah-drawer').forEach((n) => n.remove());
    }
  }

  async function mountForScene(sceneKey, cfg) {
    if (!SCENES.has(sceneKey)) return;

    const sceneId = `kn-${sceneKey}`;
    const sceneEl = document.getElementById(sceneId);
    if (!sceneEl) return;

    // Redirect legacy pages to the new combined Curriculum page (so old bookmarks still work)
    // Only do this if we're on the old routes and not already on the new one.
    try {
      const hash = String(window.location.hash || '');
      const isLegacy = (sceneKey === 'scene_1169' || sceneKey === 'scene_1234');
      const isAlreadyNew = hash.includes('curriculum-builder');
      if (isLegacy && !isAlreadyNew) {
        window.location.hash = '#curriculum-builder/';
        return;
      }
    } catch (_) {}

    // Mount point
    // - New loader page: mount into rich text content (same pattern as other custom apps)
    // - Legacy scenes: fall back to the scene element (but typically redirected above)
    const defaultSelector = (sceneKey === 'scene_1294')
      ? '#view_3280 .kn-rich_text__content'
      : null;
    const preferredSelector = pick(cfg, 'elementSelector', defaultSelector);
    const preferredMount = preferredSelector ? qs(preferredSelector) : null;

    // On the new hub scene, never mount into the whole scene as a fallback.
    // The loader may fire on an earlier view render; wait until the rich text view exists.
    if (sceneKey === 'scene_1294' && !preferredMount) return;

    // Idempotency guard per scene (set only once we're sure we can mount).
    const guardKey = `__VESPA_ACTIVITY_HUB_${sceneKey}_${BUILD}`;
    if (window[guardKey]) return;
    window[guardKey] = true;

    const mountRoot = preferredMount || sceneEl;

    // Hide Knack-rendered views in the scene (only on the legacy replacement scenes).
    // On the new loader scene, we render inside the rich text view and don't need to hide the whole scene.
    if (sceneKey !== 'scene_1294') {
      try {
        qsa('.kn-view, .view, .kn-form, .kn-asset, .kn-entries', sceneEl).forEach((n) => {
          if (n && n.id !== 'vespa-activity-hub-root') n.style.display = 'none';
        });
      } catch (_) {}
    }

    // Root container
    let root = qs('#vespa-activity-hub-root', mountRoot);
    if (!root) {
      root = el('div', { id: 'vespa-activity-hub-root' });
      mountRoot.appendChild(root);
    }

    root.innerHTML = '<div style="padding:14px;color:#64748B;font-weight:700">Loading Activities Hub…</div>';

    const state = {
      mode: 'curriculum',
      allActivities: [],
      // library state (matches JSX style)
      libSearch: '',
      libFilterEl: null,
      libFilterPathway: null, // 'vocational' | null
      libFilterLevel: null, // '2' | '3' | '' | null
      libFilterBook: null, // 'A Level Mindset' | 'GCSE Mindset' | 'VESPA Handbook' | '' | null
      // pool state (editing)
      poolSearch: '',
      poolFilterEl: null,
      savedSearch: '',
      drawerItem: null,
      settings: null,
      curriculum: [],
      currView: 'month',
      editing: false,
      showPool: false,
      addMonth: null,
      wizardStep: 0,
      assetsByCode: {},
      tmp: { yearGroup: '', pathway: '', profile: '', includeQuestionnaire: true, activitiesPerMonth: 2 },
    };

    try {
      state.allActivities = await loadActivityKb(cfg);
      // Overlay canonical names + schedule targets (hard month with +/- tolerance window).
      try {
        const scheduleByCode = await loadScheduleTargetsByCode(cfg);
        state.allActivities = state.allActivities.map((a) => {
          const sch = scheduleByCode[a.id] || null;
          return {
            ...a,
            name: sch?.canonicalName ? normalizeTitle(sch.canonicalName) : normalizeTitle(a.name || ''),
            targetMonth: sch?.targetMonth || '',
            toleranceMonths: Number.isFinite(Number(sch?.toleranceMonths)) ? Number(sch.toleranceMonths) : 1,
          };
        });
      } catch (_) {}
      // Merge in Welsh/English PDF URLs from the activities table (if readable)
      try {
        state.assetsByCode = await loadAssetsByActivityCode(cfg);
        state.allActivities = state.allActivities.map((a) => {
          const assets = state.assetsByCode[a.id] || {};
          const pdfEn = a.pdf || assets.pdfEn || '';
          const pdfCy = assets.pdfCy || '';
          const slidesEn = a.slides || assets.slidesEn || '';
          const slidesCy = assets.slidesCy || '';
          return { ...a, pdf: pdfEn, pdfCy, slides: slidesEn, slidesCy };
        });
      } catch (_) {}
      render(root, state);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ActivityHub] Failed to initialise', e);
      root.innerHTML = `
        <div style="padding:14px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:12px;color:#991B1B">
          <div style="font-weight:900;margin-bottom:6px">Activities Hub failed to load</div>
          <div style="font-size:12px;line-height:1.5">
            This page needs Supabase access to <code>public.activity_kb</code>.
            Check RLS/read access + network, then refresh.
          </div>
        </div>`;
    }
  }

  // Initializer for the multi-app loader
  function initializeVespaActivityHub() {
    const cfg = window.VESPA_ACTIVITY_HUB_CONFIG || {};
    const sceneKey = cfg.sceneKey || (window.Knack && Knack.scene && Knack.scene.key) || null;
    if (!sceneKey) return;
    mountForScene(sceneKey, cfg);
  }

  // Expose initializer (loader calls this)
  window.initializeVespaActivityHub = initializeVespaActivityHub;

  // Also hook scene renders for navigation within the same session.
  if (typeof $ !== 'undefined' && $.on) {
    // (jQuery in Knack) - no-op; .on is not a function on $
  }
  try {
    if (typeof jQuery !== 'undefined') {
      jQuery(document).on('knack-scene-render.any', function (_e, scene) {
        if (!scene || !scene.key) return;
        const cfg = window.VESPA_ACTIVITY_HUB_CONFIG || {};
        mountForScene(scene.key, cfg);
      });
    }
  } catch (_) {}
})();

