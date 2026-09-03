/**
 * AURA Admin — Data Analytics Module
 * --------------------------------------------------------------------------
 * Self-contained, decoupled module for the admin dashboard's "Αναλυτικά
 * Στοιχεία" (Data Analytics) tab. This file is intentionally independent of
 * admin.js: it owns its own auth check, its own tab-switching wiring (it
 * attaches additional listeners to the existing nav-orders / nav-products /
 * nav-customers / nav-support buttons purely to hide the analytics section
 * when the admin navigates away — it never touches admin.js), and its own
 * Firestore reads. Dropping this <script> tag (and its Chart.js dependency)
 * is enough to remove the feature with zero blast radius on the rest of the
 * dashboard.
 *
 * DATA SOURCES
 *   - search_logs    (written by public/js/tracking.js)   -> term, termLower, timestamp
 *   - product_views  (written by public/js/tracking.js)   -> productId, timestamp
 *   - orders         (written server-side by api/create-payment.js)
 *                                                          -> items[].id / items[].title / items[].quantity, createdAt
 *     Sales/order analytics deliberately read from this existing, trustworthy
 *     collection rather than a client-writable "sale event" log — see the
 *     architecture note at the top of tracking.js for why.
 *   - products       (existing collection, `allow read: if true` already)
 *                                                          -> title, cross-referenced by ID for the
 *                                                             "Views per Product" table below. No new
 *                                                             security rule is required for this read.
 *
 * REQUIRED FIRESTORE SECURITY RULES (not part of this repo's tracked files —
 * add these in the Firebase console / firestore.rules):
 *
 *   match /search_logs/{logId} {
 *     allow create: if true;   // anonymous shoppers may log a search
 *     allow read, update, delete: if request.auth != null &&
 *       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *   }
 *   match /product_views/{viewId} {
 *     allow create: if true;   // anonymous shoppers may log a view
 *     allow read, update, delete: if request.auth != null &&
 *       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *   }
 *
 * (The existing `orders` collection's admin-read rule does not need to
 * change — admin.js already reads it successfully today.)
 */

import { app, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, orderBy, getDocs, doc, getDoc, Timestamp, documentId } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHTML } from './sanitize.js';

// Must match the collection names exported by public/js/tracking.js.
const SEARCH_LOGS_COLLECTION = 'search_logs';
const PRODUCT_VIEWS_COLLECTION = 'product_views';
const ORDERS_COLLECTION = 'orders';

const CHART_COLORS = {
    gridLine: 'rgba(148, 163, 184, 0.12)',   // slate-400 @ 12%
    tick: '#94a3b8',                          // slate-400
    line: '#38bdf8',                          // sky-400 accent
    lineFill: 'rgba(56, 189, 248, 0.12)',
    bar: '#a1a1aa',                           // zinc-400
    barHover: '#e4e4e7',                      // zinc-200
    tooltipBg: '#1e293b',                     // slate-800
    tooltipTitle: '#f1f5f9',                  // slate-100
    tooltipBody: '#cbd5e1',                   // slate-300
    tooltipBorder: '#334155',                 // slate-700
    doughnutRamp: ['#f4f4f5', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b']
};

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);

    // --- DOM references -----------------------------------------------
    const navAnalytics = document.getElementById('nav-analytics');
    const analyticsSection = document.getElementById('analytics-section');
    if (!navAnalytics || !analyticsSection) return; // section not present on this page

    const otherNavButtons = ['nav-orders', 'nav-products', 'nav-customers', 'nav-support']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    const otherSections = ['orders-section', 'products-section', 'customers-section', 'support-section']
        .map(id => document.getElementById(id))
        .filter(Boolean);

    const presetSelect = document.getElementById('analytics-range-preset');
    const customRangeWrap = document.getElementById('analytics-custom-range');
    const startDateInput = document.getElementById('analytics-start-date');
    const endDateInput = document.getElementById('analytics-end-date');
    const applyRangeBtn = document.getElementById('analytics-apply-range-btn');
    const rangeSummaryEl = document.getElementById('analytics-range-summary');

    const loadingIndicator = document.getElementById('analytics-loading-indicator');
    const errorNotice = document.getElementById('analytics-error-notice');
    const emptyNotice = document.getElementById('analytics-empty-notice');

    const kpiTotalViewsEl = document.getElementById('kpi-total-views');
    const kpiTotalOrdersEl = document.getElementById('kpi-total-orders');
    const kpiConversionRateEl = document.getElementById('kpi-conversion-rate');

    const viewsCanvas = document.getElementById('views-over-time-chart');
    const wordsCanvas = document.getElementById('top-searched-words-chart');
    const ordersCanvas = document.getElementById('most-ordered-products-chart');
    const ordersLegendEl = document.getElementById('most-ordered-products-legend');
    const recentSearchesEl = document.getElementById('recent-searches-list');
    const viewsPerProductBody = document.getElementById('views-per-product-body');

    // --- State -----------------------------------------------------------
    let isAdminAuthorized = false;
    let hasLoadedOnce = false;
    let currentPreset = presetSelect ? presetSelect.value : '7d';

    let viewsChart = null;
    let wordsChart = null;
    let ordersChart = null;

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = CHART_COLORS.tick;
        Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    }

    // ==========================================
    // 1. AUTH GATING (mirrors admin.js's own admin-role check)
    // ==========================================
    onAuthStateChanged(auth, async (user) => {
        isAdminAuthorized = false;
        if (!user) return;
        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            isAdminAuthorized = userSnap.exists() && userSnap.data().role === 'admin';
        } catch (error) {
            console.error('[admin-analytics] Failed to verify admin role:', error);
            isAdminAuthorized = false;
        }
    });

    // ==========================================
    // 2. TAB WIRING (additive — does not modify admin.js)
    // ==========================================
    function activateAnalyticsTab() {
        otherSections.forEach(sec => sec.classList.add('hidden'));
        otherNavButtons.forEach(btn => {
            btn.classList.remove('text-neutral-900', 'font-semibold');
            btn.classList.remove('border-neutral-900');
            btn.classList.add('text-neutral-400', 'border-transparent');
        });

        analyticsSection.classList.remove('hidden');
        navAnalytics.classList.remove('text-neutral-400', 'border-transparent');
        navAnalytics.classList.add('text-neutral-900', 'font-semibold', 'border-neutral-900');

        if (!hasLoadedOnce) {
            hasLoadedOnce = true;
            loadAnalytics();
        }
    }

    function deactivateAnalyticsTab() {
        analyticsSection.classList.add('hidden');
        navAnalytics.classList.remove('text-neutral-900', 'font-semibold', 'border-neutral-900');
        navAnalytics.classList.add('text-neutral-400', 'border-transparent');
    }

    navAnalytics.addEventListener('click', () => {
        if (!isAdminAuthorized) return;
        activateAnalyticsTab();
    });

    otherNavButtons.forEach(btn => btn.addEventListener('click', deactivateAnalyticsTab));

    // ==========================================
    // 3. DATE RANGE RESOLUTION
    // ==========================================
    function startOfDay(d) {
        const copy = new Date(d);
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    function endOfDay(d) {
        const copy = new Date(d);
        copy.setHours(23, 59, 59, 999);
        return copy;
    }

    /**
     * Returns { start: Date, end: Date } for the currently selected preset,
     * or null if "custom" is selected but the two date inputs aren't both
     * filled in yet (caller should skip fetching in that case).
     */
    function resolveDateRange() {
        const now = new Date();

        if (currentPreset === '7d') {
            const start = startOfDay(now);
            start.setDate(start.getDate() - 6);
            return { start, end: endOfDay(now) };
        }

        if (currentPreset === '30d') {
            const start = startOfDay(now);
            start.setDate(start.getDate() - 29);
            return { start, end: endOfDay(now) };
        }

        if (currentPreset === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            return { start, end: endOfDay(now) };
        }

        if (currentPreset === 'custom') {
            if (!startDateInput || !endDateInput || !startDateInput.value || !endDateInput.value) return null;
            const start = startOfDay(new Date(`${startDateInput.value}T00:00:00`));
            const end = endOfDay(new Date(`${endDateInput.value}T00:00:00`));
            if (start > end) return null;
            return { start, end };
        }

        // Fallback: last 7 days.
        const start = startOfDay(now);
        start.setDate(start.getDate() - 6);
        return { start, end: endOfDay(now) };
    }

    function formatRangeSummary(range) {
        const fmt = (d) => d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
        return `${fmt(range.start)} — ${fmt(range.end)}`;
    }

    // ==========================================
    // 4. FIRESTORE FETCHING (v10 modular syntax, single-field range queries)
    // ==========================================
    async function fetchProductViews(start, end) {
        const q = query(
            collection(db, PRODUCT_VIEWS_COLLECTION),
            where('timestamp', '>=', Timestamp.fromDate(start)),
            where('timestamp', '<=', Timestamp.fromDate(end)),
            orderBy('timestamp', 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data());
    }

    async function fetchSearchLogs(start, end) {
        const q = query(
            collection(db, SEARCH_LOGS_COLLECTION),
            where('timestamp', '>=', Timestamp.fromDate(start)),
            where('timestamp', '<=', Timestamp.fromDate(end)),
            orderBy('timestamp', 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data());
    }

    async function fetchOrdersInRange(start, end) {
        const q = query(
            collection(db, ORDERS_COLLECTION),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end)),
            orderBy('createdAt', 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data());
    }

    // ==========================================
    // 5. AGGREGATION
    // ==========================================
    function dayKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function dayLabel(key) {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' });
    }

    /** Buckets view events per calendar day, seeding every day in range with 0 for a continuous line. */
    function groupViewsByDay(viewDocs, start, end) {
        const buckets = new Map();
        const cursor = startOfDay(start);
        const lastDay = startOfDay(end);
        while (cursor <= lastDay) {
            buckets.set(dayKey(cursor), 0);
            cursor.setDate(cursor.getDate() + 1);
        }
        viewDocs.forEach(v => {
            if (!v.timestamp || typeof v.timestamp.toDate !== 'function') return;
            const key = dayKey(v.timestamp.toDate());
            if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
        });
        return buckets;
    }

    function aggregateTopWords(searchDocs, limit = 10) {
        const counts = new Map();
        searchDocs.forEach(s => {
            const key = (s.termLower || String(s.term || '').toLowerCase()).trim();
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    }

    function getRecentSearches(searchDocs, limit = 15) {
        return searchDocs
            .filter(s => s.timestamp && typeof s.timestamp.toDate === 'function')
            .slice()
            .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
            .slice(0, limit);
    }

    function aggregateOrderedProducts(orderDocs, limit = 8) {
        const counts = new Map(); // productId -> { title, quantity }
        orderDocs.forEach(o => {
            (o.items || []).forEach(item => {
                if (!item || !item.id) return;
                const existing = counts.get(item.id) || { title: item.title || item.id, quantity: 0 };
                existing.quantity += Number(item.quantity) || 0;
                counts.set(item.id, existing);
            });
        });
        return Array.from(counts.entries())
            .map(([id, v]) => ({ id, title: v.title, quantity: v.quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, limit);
    }

    function computeKpis(viewDocs, orderDocs) {
        const totalViews = viewDocs.length;
        const totalOrders = orderDocs.length;
        const conversionRate = totalViews > 0 ? (totalOrders / totalViews) * 100 : 0;
        return { totalViews, totalOrders, conversionRate };
    }

    /** Groups product_views by productId, most-viewed first. */
    function aggregateViewsByProduct(viewDocs, limit = 10) {
        const counts = new Map(); // productId -> count
        viewDocs.forEach(v => {
            if (!v.productId) return;
            counts.set(v.productId, (counts.get(v.productId) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([id, count]) => ({ id, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Resolves a set of product IDs to their titles via a single 'in' query
     * against the (publicly-readable) products collection. IDs belonging to
     * products that have since been deleted simply won't come back in the
     * snapshot — callers should fall back to "Unknown Product" for those.
     */
    async function fetchProductTitles(productIds) {
        const uniqueIds = Array.from(new Set(productIds)).filter(Boolean);
        const titleMap = new Map();
        if (uniqueIds.length === 0) return titleMap;

        try {
            const q = query(collection(db, 'products'), where(documentId(), 'in', uniqueIds));
            const snap = await getDocs(q);
            snap.forEach(docSnap => {
                titleMap.set(docSnap.id, docSnap.data().title || 'Unknown Product');
            });
        } catch (error) {
            console.error('[admin-analytics] Failed to resolve product titles:', error);
        }
        return titleMap;
    }

    // ==========================================
    // 6. RENDERING — KPIs
    // ==========================================
    function renderKpis({ totalViews, totalOrders, conversionRate }) {
        if (kpiTotalViewsEl) kpiTotalViewsEl.textContent = totalViews.toLocaleString('el-GR');
        if (kpiTotalOrdersEl) kpiTotalOrdersEl.textContent = totalOrders.toLocaleString('el-GR');
        if (kpiConversionRateEl) kpiConversionRateEl.textContent = `${conversionRate.toFixed(1)}%`;
    }

    // ==========================================
    // 7. RENDERING — Charts
    // ==========================================
    function renderViewsChart(dayBuckets) {
        if (!viewsCanvas || typeof Chart === 'undefined') return;
        const labels = Array.from(dayBuckets.keys()).map(dayLabel);
        const data = Array.from(dayBuckets.values());

        if (viewsChart) viewsChart.destroy();
        viewsChart = new Chart(viewsCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Προβολές',
                    data,
                    borderColor: CHART_COLORS.line,
                    backgroundColor: CHART_COLORS.lineFill,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: CHART_COLORS.line,
                    pointBorderColor: '#0f172a'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: CHART_COLORS.tooltipBg,
                        titleColor: CHART_COLORS.tooltipTitle,
                        bodyColor: CHART_COLORS.tooltipBody,
                        borderColor: CHART_COLORS.tooltipBorder,
                        borderWidth: 1,
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        grid: { color: CHART_COLORS.gridLine },
                        ticks: { color: CHART_COLORS.tick, maxRotation: 0, autoSkip: true }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: CHART_COLORS.gridLine },
                        ticks: { color: CHART_COLORS.tick, precision: 0 }
                    }
                }
            }
        });
    }

    function renderWordsChart(topWords) {
        if (!wordsCanvas || typeof Chart === 'undefined') return;
        const labels = topWords.map(([term]) => term);
        const data = topWords.map(([, count]) => count);

        if (wordsChart) wordsChart.destroy();
        wordsChart = new Chart(wordsCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Αναζητήσεις',
                    data,
                    backgroundColor: CHART_COLORS.bar,
                    hoverBackgroundColor: CHART_COLORS.barHover,
                    borderRadius: 4,
                    maxBarThickness: 22
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: CHART_COLORS.tooltipBg,
                        titleColor: CHART_COLORS.tooltipTitle,
                        bodyColor: CHART_COLORS.tooltipBody,
                        borderColor: CHART_COLORS.tooltipBorder,
                        borderWidth: 1,
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: CHART_COLORS.gridLine },
                        ticks: { color: CHART_COLORS.tick, precision: 0 }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: CHART_COLORS.tick }
                    }
                }
            }
        });
    }

    function renderOrdersChart(topProducts) {
        if (!ordersCanvas || typeof Chart === 'undefined') return;
        const labels = topProducts.map(p => p.title);
        const data = topProducts.map(p => p.quantity);
        const colors = labels.map((_, i) => CHART_COLORS.doughnutRamp[i % CHART_COLORS.doughnutRamp.length]);

        if (ordersChart) ordersChart.destroy();
        ordersChart = new Chart(ordersCanvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: '#0f172a',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: CHART_COLORS.tooltipBg,
                        titleColor: CHART_COLORS.tooltipTitle,
                        bodyColor: CHART_COLORS.tooltipBody,
                        borderColor: CHART_COLORS.tooltipBorder,
                        borderWidth: 1,
                        padding: 10
                    }
                }
            }
        });

        renderOrdersLegend(topProducts, colors);
    }

    function renderOrdersLegend(topProducts, colors) {
        if (!ordersLegendEl) return;
        if (topProducts.length === 0) {
            ordersLegendEl.innerHTML = `<li class="text-slate-500">Δεν υπάρχουν παραγγελίες για αυτή την περίοδο.</li>`;
            return;
        }
        ordersLegendEl.innerHTML = topProducts.map((p, i) => `
            <li class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 truncate">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${colors[i]};"></span>
                    <span class="truncate">${escapeHTML(p.title)}</span>
                </span>
                <span class="text-slate-500 flex-shrink-0">${p.quantity.toLocaleString('el-GR')}</span>
            </li>
        `).join('');
    }

    function renderRecentSearches(searchDocs) {
        if (!recentSearchesEl) return;
        const recent = getRecentSearches(searchDocs, 15);

        if (recent.length === 0) {
            recentSearchesEl.innerHTML = `<li class="px-1 py-6 text-center text-slate-500 text-sm">Δεν υπάρχουν αναζητήσεις για αυτή την περίοδο.</li>`;
            return;
        }

        recentSearchesEl.innerHTML = recent.map(s => {
            const d = s.timestamp.toDate();
            const timeStr = d.toLocaleString('el-GR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `
                <li class="flex items-center justify-between py-3">
                    <span class="font-sans text-sm text-slate-200 truncate pr-4">${escapeHTML(s.term || '')}</span>
                    <span class="font-sans text-[11px] text-slate-500 whitespace-nowrap">${timeStr}</span>
                </li>
            `;
        }).join('');
    }

    /** Ranks products by view count for the period and renders them into the table body. */
    async function renderViewsPerProductTable(viewDocs) {
        if (!viewsPerProductBody) return;

        const ranked = aggregateViewsByProduct(viewDocs, 10);

        if (ranked.length === 0) {
            viewsPerProductBody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-slate-500 text-sm">Δεν υπάρχουν προβολές για αυτή την περίοδο.</td></tr>`;
            return;
        }

        const titleMap = await fetchProductTitles(ranked.map(r => r.id));
        const maxCount = ranked[0].count || 1;

        viewsPerProductBody.innerHTML = ranked.map((item, index) => {
            const title = titleMap.get(item.id) || 'Unknown Product';
            const barWidth = Math.max(4, Math.round((item.count / maxCount) * 100));
            return `
                <tr class="border-b border-slate-800/60 last:border-0">
                    <td class="py-3 pr-4 align-middle font-sans text-xs text-slate-500">${index + 1}</td>
                    <td class="py-3 pr-4 align-middle">
                        <div class="font-sans text-sm text-slate-200 truncate max-w-[260px] mb-1.5">${escapeHTML(title)}</div>
                        <div class="h-1 w-full max-w-[220px] bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full bg-sky-400 rounded-full" style="width: ${barWidth}%;"></div>
                        </div>
                    </td>
                    <td class="py-3 pl-4 align-middle text-right font-sans text-sm text-slate-100 font-medium whitespace-nowrap">${item.count.toLocaleString('el-GR')}</td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // 8. UI STATE HELPERS
    // ==========================================
    function setLoading(isLoading) {
        if (loadingIndicator) loadingIndicator.classList.toggle('hidden', !isLoading);
    }

    function setError(hasError) {
        if (errorNotice) errorNotice.classList.toggle('hidden', !hasError);
    }

    function setEmpty(isEmpty) {
        if (emptyNotice) emptyNotice.classList.toggle('hidden', !isEmpty);
    }

    // ==========================================
    // 9. MAIN LOAD FLOW
    // ==========================================
    async function loadAnalytics() {
        if (!isAdminAuthorized) return;

        const range = resolveDateRange();
        if (!range) return; // custom range not fully selected yet

        if (rangeSummaryEl) rangeSummaryEl.textContent = formatRangeSummary(range);

        setError(false);
        setEmpty(false);
        setLoading(true);

        try {
            const [viewDocs, searchDocs, orderDocs] = await Promise.all([
                fetchProductViews(range.start, range.end),
                fetchSearchLogs(range.start, range.end),
                fetchOrdersInRange(range.start, range.end)
            ]);

            const dayBuckets = groupViewsByDay(viewDocs, range.start, range.end);
            renderViewsChart(dayBuckets);

            const topWords = aggregateTopWords(searchDocs, 10);
            renderWordsChart(topWords);
            renderRecentSearches(searchDocs);

            const topProducts = aggregateOrderedProducts(orderDocs, 8);
            renderOrdersChart(topProducts);

            renderKpis(computeKpis(viewDocs, orderDocs));

            await renderViewsPerProductTable(viewDocs);

            if (viewDocs.length === 0 && searchDocs.length === 0 && orderDocs.length === 0) {
                setEmpty(true);
            }
        } catch (error) {
            console.error('[admin-analytics] Failed to load analytics:', error);
            setError(true);
        } finally {
            setLoading(false);
        }
    }

    // ==========================================
    // 10. FILTER CONTROL WIRING
    // ==========================================
    if (presetSelect) {
        presetSelect.addEventListener('change', () => {
            currentPreset = presetSelect.value;
            const isCustom = currentPreset === 'custom';
            if (customRangeWrap) {
                customRangeWrap.classList.toggle('hidden', !isCustom);
                customRangeWrap.classList.toggle('flex', isCustom);
            }
            if (!isCustom) loadAnalytics();
        });
    }

    if (applyRangeBtn) {
        applyRangeBtn.addEventListener('click', () => loadAnalytics());
    }
});
