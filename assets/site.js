(() => {
    const productCards = [...document.querySelectorAll('.product-card')];
    const products = new Map(productCards.map((card) => [
        card.dataset.productId,
        {
            id: card.dataset.productId,
            name: card.dataset.name,
            price: Number(card.dataset.price)
        }
    ]));
    const storageKey = 'petal-ph-bag';
    const shopMessage = document.getElementById('shop-message');
    const bagItems = document.getElementById('bag-items');
    const bagEmpty = document.getElementById('bag-empty');
    const bagSubtotal = document.getElementById('bag-subtotal');
    const bagCheckoutNote = document.getElementById('bag-checkout-note');
    const bagCount = document.getElementById('bag-count');
    const cartCount = document.getElementById('cart-count');
    const bagLink = document.querySelector('a[href="#bag"]');
    const bag = {};
    let messageTimeout;

    function readSavedBag() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
            return Object.fromEntries(Object.entries(saved).filter(([id, quantity]) =>
                products.has(id) && Number.isSafeInteger(quantity) && quantity > 0
            ));
        } catch (error) {
            console.warn('Petal Ph could not read the saved bag from this browser.', error);
            shopMessage.textContent = 'Your saved bag could not be restored in this browser.';
            return {};
        }
    }

    function saveBag() {
        try {
            localStorage.setItem(storageKey, JSON.stringify(bag));
            return true;
        } catch (error) {
            console.warn('Petal Ph could not save the bag in this browser.', error);
            return false;
        }
    }

    function showShopMessage(message) {
        shopMessage.textContent = message;
        window.clearTimeout(messageTimeout);
        messageTimeout = window.setTimeout(() => {
            shopMessage.textContent = '';
        }, 3500);
    }

    function renderBag() {
        const itemCount = Object.values(bag).reduce((total, quantity) => total + quantity, 0);
        const subtotal = Object.entries(bag).reduce((total, [id, quantity]) =>
            total + products.get(id).price * quantity, 0
        );

        cartCount.textContent = String(itemCount);
        bagCount.textContent = `${itemCount} ${itemCount === 1 ? 'lovely thing' : 'lovely things'}`;
        bagLink.setAttribute('aria-label', `Your bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`);
        bagItems.replaceChildren();
        bagEmpty.classList.toggle('hidden', itemCount > 0);
        bagItems.classList.toggle('hidden', itemCount === 0);
        bagSubtotal.classList.toggle('hidden', itemCount === 0);
        bagCheckoutNote.classList.toggle('hidden', itemCount === 0);
        document.getElementById('bag-total').textContent = `$${subtotal.toLocaleString('en-US')}`;

        for (const [id, quantity] of Object.entries(bag)) {
            const product = products.get(id);
            if (!product) continue;

            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-4 py-4';

            const description = document.createElement('div');
            const title = document.createElement('h3');
            title.className = 'font-serif text-lg';
            title.textContent = product.name;
            const details = document.createElement('p');
            details.className = 'mt-1 text-xs text-ink/60';
            details.textContent = `Quantity: ${quantity} · $${product.price} each`;
            description.append(title, details);

            const amount = document.createElement('div');
            amount.className = 'flex items-center gap-4';
            const linePrice = document.createElement('p');
            linePrice.className = 'text-sm font-semibold';
            linePrice.textContent = `$${(product.price * quantity).toLocaleString('en-US')}`;
            const remove = document.createElement('button');
            remove.className = 'text-xs underline underline-offset-4';
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', `Remove ${product.name} from your bag`);
            remove.addEventListener('click', () => {
                delete bag[id];
                const saved = saveBag();
                renderBag();
                showShopMessage(saved ? `${product.name} removed from your bag.` : `${product.name} removed. The bag could not be saved in this browser.`);
            });
            amount.append(linePrice, remove);
            row.append(description, amount);
            bagItems.append(row);
        }
    }

    Object.assign(bag, readSavedBag());
    renderBag();

    document.querySelectorAll('.filter-button').forEach((button) => {
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            document.querySelectorAll('.filter-button').forEach((filterButton) => {
                const selected = filterButton === button;
                filterButton.setAttribute('aria-pressed', String(selected));
                filterButton.classList.toggle('border-leaf', selected);
                filterButton.classList.toggle('border-transparent', !selected);
                filterButton.classList.toggle('text-ink', selected);
                filterButton.classList.toggle('text-ink/55', !selected);
            });
            productCards.forEach((card) => {
                card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter);
            });
        });
    });

    document.querySelectorAll('.add-to-bag').forEach((button) => {
        button.addEventListener('click', () => {
            const product = products.get(button.closest('.product-card').dataset.productId);
            bag[product.id] = (bag[product.id] || 0) + 1;
            const saved = saveBag();
            renderBag();
            showShopMessage(saved ? `${product.name} added to your bag — lovely choice!` : `${product.name} added, but your bag could not be saved in this browser.`);
        });
    });

    document.getElementById('newsletter-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const email = document.getElementById('email');
        if (!email.reportValidity()) return;
        const message = encodeURIComponent(`Hi Petal Ph! Please add ${email.value.trim()} to your flower newsletter.`);
        window.location.href = `https://wa.me/639385535979?text=${message}`;
    });

    document.getElementById('copyright-year').textContent = String(new Date().getFullYear());
})();
