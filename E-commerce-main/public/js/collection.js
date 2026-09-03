import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHTML } from './sanitize.js';

let allProducts = [];
let ratingsMap = {}; 

document.addEventListener('DOMContentLoaded', async () => {
    ensureFontAwesome();
    await fetchAndRenderCollection();
    initFilters();
});

function ensureFontAwesome() {
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(link);
    }
}

async function fetchAndRenderCollection() {
    const productGrid = document.getElementById('product-grid');
    const countDisplay = document.getElementById('item-count');

    try {
        const reviewsSnap = await getDocs(collection(db, "reviews"));
        reviewsSnap.forEach(doc => {
            const data = doc.data();
            if (!ratingsMap[data.productId]) {
                ratingsMap[data.productId] = { sum: 0, count: 0 };
            }
            ratingsMap[data.productId].sum += Number(data.rating) || 0;
            ratingsMap[data.productId].count += 1;
        });

        const querySnapshot = await getDocs(collection(db, "products"));
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status !== 'hidden') {
                allProducts.push({ id: doc.id, ...data });
            }
        });

        applyFilters();
    } catch (error) {
        console.error("Error fetching collection from Firebase:", error);
        if (productGrid) productGrid.innerHTML = `<p class="col-span-full text-center text-stone-500">Failed to load collection. Please try again later.</p>`;
        if (countDisplay) countDisplay.textContent = "Error loading pieces";
    }
}

function applyFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search') ? urlParams.get('search').toLowerCase() : null;
    
    const activeCategoryBtn = document.querySelector('.filter-btn.border-stone-900');
    const selectedCategory = activeCategoryBtn ? activeCategoryBtn.getAttribute('data-filter') : 'all';
    
    const minPriceInput = document.getElementById('min-price').value;
    const maxPriceInput = document.getElementById('max-price').value;
    const minPrice = minPriceInput ? parseFloat(minPriceInput) : 0;
    const maxPrice = maxPriceInput ? parseFloat(maxPriceInput) : Infinity;

    const filteredProducts = allProducts.filter(p => {
        let matchesSearch = true;
        if (searchQuery) {
            const titleMatch = p.title && p.title.toLowerCase().includes(searchQuery);
            const descMatch = (p.desc && p.desc.toLowerCase().includes(searchQuery)) || 
                              (p.description && p.description.toLowerCase().includes(searchQuery));
            const skuMatch = p.sku && p.sku.toLowerCase().includes(searchQuery);
            matchesSearch = titleMatch || descMatch || skuMatch;
        }
        let matchesCategory = true;
        if (selectedCategory !== 'all') {
            const categories = p.categories || "";
            matchesCategory = categories.split(' ').includes(selectedCategory);
        }
        const price = p.price || 0;
        const matchesPrice = price >= minPrice && price <= maxPrice;
        return matchesSearch && matchesCategory && matchesPrice;
    });

    renderGrid(filteredProducts);
}

function generateStarsHTML(ratingObj) {
    if (!ratingObj || ratingObj.count === 0 || isNaN(ratingObj.sum) || isNaN(ratingObj.count)) {
        return `<span class="font-sans text-[10px] tracking-widest uppercase text-stone-400">No reviews yet</span>`;
    }
    const exactAvg = ratingObj.sum / ratingObj.count;
    const roundedAvg = Math.round(exactAvg);
    
    let starsHtml = '<div class="flex gap-[2px] text-xs">';
    for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="fa-solid fa-star ${i <= roundedAvg ? 'text-stone-900' : 'text-stone-200'}"></i>`;
    }
    starsHtml += `</div><span class="font-sans text-xs text-stone-500 ml-2">(${ratingObj.count})</span>`;
    return `<div class="flex items-center justify-center">${starsHtml}</div>`;
}

function renderGrid(productsToRender) {
    const productGrid = document.getElementById('product-grid');
    const countDisplay = document.getElementById('item-count');
    if (!productGrid) return;

    let htmlString = "";
    let index = 0;

    productsToRender.forEach((product) => {
        const mtClass = (index % 3 === 1) ? "lg:mt-24" : "";
        const hoverImg = product.hoverImage ? product.hoverImage : product.image;
        const ratingData = ratingsMap[product.id] || { sum: 0, count: 0 };
        const ratingHTML = generateStarsHTML(ratingData);
        
        const isOutOfStock = product.stock <= 0;
        const btnClasses = isOutOfStock
            ? `quick-add-btn absolute bottom-0 left-0 w-full bg-stone-300 text-stone-500 font-sans text-xs tracking-widest uppercase py-5 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out z-20 cursor-not-allowed`
            : `quick-add-btn absolute bottom-0 left-0 w-full bg-stone-900 text-white font-sans text-xs tracking-widest uppercase py-5 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out z-20 hover:bg-stone-800`;
        const btnText = isOutOfStock ? `Out of Stock` : `Quick Add`;
        const btnDisabled = isOutOfStock ? `disabled` : ``;

        htmlString += `
            <a href="product.html?id=${escapeHTML(product.id)}" class="product-card fade-in-up group flex flex-col gap-6 ${mtClass}" data-category="${escapeHTML(product.categories || '')}">
                <div class="relative aspect-[4/5] overflow-hidden bg-stone-100">
                    <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.title)}" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out group-hover:opacity-0 z-10">
                    <img src="${escapeHTML(hoverImg)}" alt="${escapeHTML(product.title)} Lifestyle" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out opacity-0 group-hover:opacity-100 z-0">
                    
                    <button class="${btnClasses}" ${btnDisabled}
                        data-id="${escapeHTML(product.id)}"
                        data-title="${escapeHTML(product.title)}"
                        data-sku="${escapeHTML(product.sku || '')}"
                        data-price="${escapeHTML(product.price)}"
                        data-image="${escapeHTML(product.image)}"
                        data-stock="${escapeHTML(product.stock || 0)}">
                        ${btnText}
                    </button>
                </div>
                <div class="flex flex-col items-center text-center">
                    <h2 class="font-serif text-xl text-stone-900 mb-2">${escapeHTML(product.title)}</h2>
                    <div class="mb-3">${ratingHTML}</div>
                    <p class="font-sans text-sm text-stone-500">€${product.price.toLocaleString()}</p>
                </div>
            </a>
        `;
        index++;
    });

    if (productsToRender.length === 0) {
        htmlString = `<p class="col-span-full text-center text-stone-500 py-12">No pieces found matching your criteria.</p>`;
    }

    productGrid.innerHTML = htmlString;

    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search');
    
    if (countDisplay) {
        if (searchQuery) {
            countDisplay.textContent = `Search results for: '${escapeHTML(searchQuery)}' (${productsToRender.length})`;
        } else {
            countDisplay.textContent = `Showing ${productsToRender.length} piece${productsToRender.length !== 1 ? 's' : ''}`;
        }
    }

    initScrollAnimations();
    initQuickAdd();
}

function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const applyPriceBtn = document.getElementById('apply-price-filter');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => {
                b.classList.remove('border-stone-900', 'text-stone-900');
                b.classList.add('border-transparent', 'text-stone-400');
            });
            btn.classList.remove('border-transparent', 'text-stone-400');
            btn.classList.add('border-stone-900', 'text-stone-900');

            const url = new URL(window.location);
            if (url.searchParams.has('search')) {
                url.searchParams.delete('search');
                window.history.pushState({}, '', url);
            }
            applyFilters();
        });
    });

    if (applyPriceBtn) {
        applyPriceBtn.addEventListener('click', () => applyFilters());
    }
}

function initScrollAnimations() {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in-up').forEach(el => { observer.observe(el); });
}

function initQuickAdd() {
    const addBtns = document.querySelectorAll('.quick-add-btn:not([disabled])');
    addBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const productData = {
                id: btn.getAttribute('data-id'),
                title: btn.getAttribute('data-title'),
                sku: btn.getAttribute('data-sku'),
                price: parseInt(btn.getAttribute('data-price')),
                image: btn.getAttribute('data-image'),
                stock: parseInt(btn.getAttribute('data-stock'))
            };

            const success = window.addToCart(productData);
            const originalText = "Quick Add";

            if (success) {
                btn.textContent = 'Added';
                btn.classList.remove('bg-stone-900', 'hover:bg-stone-800');
                btn.classList.add('bg-stone-400', 'text-stone-900');
            } else {
                btn.textContent = 'Max Limit Reached';
                btn.classList.remove('bg-stone-900', 'hover:bg-stone-800');
                btn.classList.add('bg-stone-300', 'text-stone-600');
            }

            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('bg-stone-400', 'bg-stone-300', 'text-stone-900', 'text-stone-600');
                btn.classList.add('bg-stone-900', 'hover:bg-stone-800');
            }, 2000);
        });
    });
}
