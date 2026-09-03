import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHTML } from './sanitize.js';

let allProducts = [];
let ratingsMap = {}; 

document.addEventListener('DOMContentLoaded', async () => {
    ensureFontAwesome();
    await fetchAndRenderProducts();
    initCategoryFilters();
});

function ensureFontAwesome() {
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(link);
    }
}

async function fetchAndRenderProducts() {
    const productGrid = document.getElementById('product-grid');
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

        renderGrid(allProducts);
    } catch (error) {
        console.error("Error fetching products from Firebase:", error);
        if (productGrid) {
            productGrid.innerHTML = `<p class="col-span-full text-center text-stone-500">Failed to load collection. Please try again later.</p>`;
        }
    }
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
    return `<div class="flex items-center">${starsHtml}</div>`;
}

function renderGrid(productsToRender) {
    const productGrid = document.getElementById('product-grid');
    if (!productGrid) return;

    let htmlString = "";
    productsToRender.forEach((product) => {
        const hoverImg = product.hoverImage ? product.hoverImage : product.image;
        const ratingData = ratingsMap[product.id] || { sum: 0, count: 0 };
        const ratingHTML = generateStarsHTML(ratingData);
        
        const isOutOfStock = product.stock <= 0;
        const btnClasses = isOutOfStock
            ? `grid-add-to-cart-btn absolute bottom-6 left-6 right-6 bg-stone-300 text-stone-500 font-sans text-sm tracking-wide py-3.5 rounded-md opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-sm z-20 cursor-not-allowed pointer-events-auto`
            : `grid-add-to-cart-btn absolute bottom-6 left-6 right-6 bg-stone-900 text-white font-sans text-sm tracking-wide py-3.5 rounded-md opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-sm z-20 hover:bg-stone-800 pointer-events-auto`;
        const btnText = isOutOfStock ? `Out of Stock` : `Add to Cart`;
        const btnDisabled = isOutOfStock ? `disabled` : ``;

        htmlString += `
            <a href="product.html?id=${escapeHTML(product.id)}" class="product-card group flex flex-col gap-5 cursor-pointer transition-all" data-category="${escapeHTML(product.categories || '')}">
                <div class="relative aspect-[4/5] overflow-hidden bg-stone-100 rounded-md">
                    <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.title)}" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out group-hover:opacity-0 z-10">
                    <img src="${escapeHTML(hoverImg)}" alt="${escapeHTML(product.title)} Lifestyle" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out opacity-0 group-hover:opacity-100 z-0">
                    
                    <div class="absolute inset-0 bg-stone-900/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none"></div>
                    
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
                <div class="flex justify-between items-start">
                    <div class="flex flex-col gap-1.5">
                        <h3 class="font-serif text-lg text-stone-900 leading-none">${escapeHTML(product.title)}</h3>
                        ${ratingHTML}
                    </div>
                    <span class="font-sans text-stone-900 font-medium">€${(product.price || 0).toLocaleString()}</span>
                </div>
            </a>
        `;
    });

    if (productsToRender.length === 0) {
        htmlString = `<p class="col-span-full text-center text-stone-500 py-12">No pieces found in this category.</p>`;
    }

    productGrid.innerHTML = htmlString;
    initGridAddToCart();
}

function initCategoryFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const mainFilterBtns = Array.from(filterButtons).filter(btn => !btn.classList.contains('nav-filter'));

    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const selectedCategory = btn.getAttribute('data-category');

            if (btn.classList.contains('filter-btn')) {
                mainFilterBtns.forEach(b => {
                    b.classList.remove('border-stone-900', 'text-stone-900');
                    b.classList.add('border-transparent', 'text-stone-500');
                });
                btn.classList.remove('border-transparent', 'text-stone-500');
                btn.classList.add('border-stone-900', 'text-stone-900');
            }

            const filtered = selectedCategory === 'all' 
                ? allProducts 
                : allProducts.filter(p => p.categories && p.categories.includes(selectedCategory));

            renderGrid(filtered);

            if (btn.classList.contains('nav-filter')) {
                document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function initGridAddToCart() {
    const gridBtns = document.querySelectorAll('.grid-add-to-cart-btn:not([disabled])');
    gridBtns.forEach(btn => {
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
            const originalText = "Add to Cart";

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
