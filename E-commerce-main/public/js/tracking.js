/**
 * AURA Analytics Tracking Module
 * --------------------------------------------------------------------------
 * Lightweight, decoupled, fire-and-forget client-side event logger.
 *
 * This module writes two kinds of low-stakes UX telemetry directly from the
 * browser to Firestore:
 *   - search_logs     { term, termLower, timestamp }
 *   - product_views   { productId, timestamp }
 *
 * ARCHITECTURE NOTE — why there is no `trackOrder()` / sales logger here:
 * Order/sale events are intentionally NOT written by this module. Orders are
 * already created exclusively server-side (Admin SDK, api/create-payment.js)
 * after price/stock have been re-verified, and that `orders` collection is
 * the trustworthy source of truth for revenue analytics (it already carries
 * `createdAt` and `items[].id` / `items[].quantity`). Letting the browser log
 * its own "I made a sale" event would let anyone forge fake conversions by
 * calling this module directly from devtools — that's a data-integrity risk
 * with zero benefit, since the real order record already exists. Admin
 * analytics (public/js/admin-analytics.js) reads sales/order time-series
 * straight from the authoritative `orders` collection instead.
 *
 * Design choices:
 *   - Every write is wrapped in scheduleIdle() so it never competes with
 *     interaction/render work on the main thread, and every write is
 *     fire-and-forget (callers never await these — a slow or failed network
 *     write must never block or break the shopping experience).
 *   - Product view logging is de-duplicated per browser tab session (via
 *     sessionStorage) so refreshing or re-rendering the same product page
 *     repeatedly doesn't inflate the view count.
 *   - Both writers fail silently (console.warn only) — analytics must never
 *     throw into calling code.
 */

import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firestore collection names. If you rename these, also update the matching
// literals in public/js/admin-analytics.js.
export const SEARCH_LOGS_COLLECTION = 'search_logs';
export const PRODUCT_VIEWS_COLLECTION = 'product_views';

const MIN_SEARCH_TERM_LENGTH = 2;
const MAX_SEARCH_TERM_LENGTH = 100;
const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes per product, per tab

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/**
 * Runs `task` when the browser is idle (or on the next macrotask if the
 * browser doesn't support requestIdleCallback), so a tracking write never
 * competes with a click handler, animation, or render pass.
 */
function scheduleIdle(task) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(task, { timeout: 2000 });
    } else {
        setTimeout(task, 0);
    }
}

/**
 * sessionStorage can throw (Safari private mode, storage disabled, quota
 * exceeded, etc). Every call site below is wrapped so tracking degrades to
 * "always log, never dedupe" rather than ever breaking the page.
 */
function readSession(key) {
    try {
        return window.sessionStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function writeSession(key, value) {
    try {
        window.sessionStorage.setItem(key, value);
    } catch (error) {
        // Storage unavailable or full — analytics is best-effort, ignore.
    }
}

function wasRecentlyViewed(productId) {
    const raw = readSession(`aura_view_${productId}`);
    if (!raw) return false;
    const lastViewedAt = parseInt(raw, 10);
    if (!Number.isFinite(lastViewedAt)) return false;
    return (Date.now() - lastViewedAt) < VIEW_DEDUPE_WINDOW_MS;
}

function markViewed(productId) {
    writeSession(`aura_view_${productId}`, String(Date.now()));
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Logs that a shopper viewed a product's detail page.
 * De-duplicated per product, per browser tab session, for 30 minutes, so
 * repeated renders/refreshes of the same product page don't inflate counts.
 *
 * @param {string} productId - Firestore document ID of the viewed product.
 */
export function trackProductView(productId) {
    if (!productId || typeof productId !== 'string') return;
    if (wasRecentlyViewed(productId)) return;

    // Mark immediately (synchronously) so rapid duplicate calls in the same
    // tick are still caught even though the write itself is deferred.
    markViewed(productId);

    scheduleIdle(() => {
        addDoc(collection(db, PRODUCT_VIEWS_COLLECTION), {
            productId,
            timestamp: serverTimestamp()
        }).catch((error) => {
            console.warn('[tracking] Failed to log product view:', error && error.message);
        });
    });
}

/**
 * Logs a completed search query. Call this once per submitted search
 * (e.g. on form submit or debounced input-settled), not on every keystroke.
 *
 * @param {string} term - The raw search term as typed by the shopper.
 */
export function trackSearch(term) {
    if (typeof term !== 'string') return;

    const trimmed = term.trim();
    if (trimmed.length < MIN_SEARCH_TERM_LENGTH) return;

    const safeTerm = trimmed.slice(0, MAX_SEARCH_TERM_LENGTH);
    const termLower = safeTerm.toLowerCase();

    scheduleIdle(() => {
        addDoc(collection(db, SEARCH_LOGS_COLLECTION), {
            term: safeTerm,
            termLower,
            timestamp: serverTimestamp()
        }).catch((error) => {
            console.warn('[tracking] Failed to log search:', error && error.message);
        });
    });
}
