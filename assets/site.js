(() => {
    let productCards = [...document.querySelectorAll('.product-card')];
    const products = new Map(productCards.map((card) => [
        card.dataset.productId,
        {
            id: card.dataset.productId,
            name: card.dataset.name,
            price: Number(card.dataset.price),
            description: card.querySelector('.product-description').textContent,
            category: card.dataset.category,
            image: card.dataset.image,
            available: true
        }
    ]));
    const productGrid = document.getElementById('product-grid');
    const storageKey = 'petal-ph-bag';
    const shopMessage = document.getElementById('shop-message');
    const bagItems = document.getElementById('bag-items');
    const bagEmpty = document.getElementById('bag-empty');
    const bagSubtotal = document.getElementById('bag-subtotal');
    const bagCheckoutNote = document.getElementById('bag-checkout-note');
    const checkoutSignInButton = document.getElementById('checkout-sign-in');
    const checkoutForm = document.getElementById('checkout-form');
    const bagCount = document.getElementById('bag-count');
    const cartCount = document.getElementById('cart-count');
    const bagLink = document.querySelector('a[href="#bag"]');
    const deliveryMethod = document.getElementById('delivery-method');
    const deliveryAddressFields = document.getElementById('delivery-address-field');
    const deliveryAddress = document.getElementById('delivery-address');
    const deliveryDateLabel = document.getElementById('delivery-date-label');
    const deliveryTimeLabel = document.getElementById('delivery-time-label');
    const checkoutMessage = document.getElementById('checkout-message');
    const placeOrderButton = document.getElementById('place-order-button');
    const bag = {};
    let signedInCustomer = false;
    let signedInAdmin = false;
    let currentFilter = 'all';
    let messageTimeout;

    const priceFormatter = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 2
    });

    function formatPrice(price) {
        return priceFormatter.format(Number(price));
    }

    function renderProducts() {
        productGrid.replaceChildren();
        for (const product of products.values()) {
            const card = document.createElement('article');
            card.className = 'product-card';
            card.dataset.productId = product.id;
            card.dataset.category = product.category;
            card.dataset.name = product.name;
            card.dataset.price = String(product.price);
            card.dataset.image = product.image;

            const imageFrame = document.createElement('div');
            imageFrame.className = 'group relative aspect-[.82] overflow-hidden bg-paper';
            const image = document.createElement('img');
            image.className = 'h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]';
            image.src = product.image;
            image.alt = product.name;
            image.loading = 'lazy';
            image.decoding = 'async';
            imageFrame.append(image);

            const availability = document.createElement('span');
            availability.className = `absolute left-3 top-3 px-3 py-2 text-[9px] font-semibold uppercase tracking-[.13em] ${product.available ? 'bg-paper text-ink' : 'bg-ink text-white'}`;
            availability.textContent = product.available ? 'Available' : 'Sold out';
            imageFrame.append(availability);

            const addButton = document.createElement('button');
            addButton.className = 'add-to-bag absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-paper text-xl transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
            addButton.type = 'button';
            addButton.textContent = product.available ? '+' : '×';
            addButton.disabled = !product.available;
            addButton.setAttribute('aria-label', product.available ? `Add ${product.name} to your bag` : `${product.name} is sold out`);
            imageFrame.append(addButton);

            const details = document.createElement('div');
            details.className = 'flex items-start justify-between gap-3 pt-4';
            const description = document.createElement('div');
            const title = document.createElement('h3');
            title.className = 'font-serif text-lg';
            title.textContent = product.name;
            const text = document.createElement('p');
            text.className = 'product-description mt-1 text-[11px] leading-5 text-ink/60';
            text.textContent = product.description;
            description.append(title, text);
            const price = document.createElement('p');
            price.className = 'pt-1 text-xs font-semibold';
            price.textContent = formatPrice(product.price);
            details.append(description, price);
            card.append(imageFrame, details);
            card.classList.toggle('hidden', currentFilter !== 'all' && product.category !== currentFilter);
            productGrid.append(card);
        }
        productCards = [...productGrid.querySelectorAll('.product-card')];
    }

    function previewRequestedProduct() {
        const productId = new URLSearchParams(window.location.search).get('preview-product');
        if (!productId) return;
        const productCard = [...productGrid.querySelectorAll('.product-card')]
            .find((card) => card.dataset.productId === productId);
        if (!productCard) return;
        productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        productCard.classList.add('ring-2', 'ring-leaf');
        window.setTimeout(() => productCard.classList.remove('ring-2', 'ring-leaf'), 4000);
    }

    async function loadProducts() {
        try {
            const response = await fetch('/api/products', { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Product request failed with status ${response.status}.`);
            const data = await response.json();
            if (!Array.isArray(data.products)) throw new Error('The product list from the server is invalid.');
            products.clear();
            data.products.forEach((product) => products.set(product.id, product));
            for (const id of Object.keys(bag)) {
                if (!products.has(id)) delete bag[id];
            }
            saveBag();
            renderProducts();
            previewRequestedProduct();
            renderBag();
            if (data.products.length === 0) {
                shopMessage.textContent = 'We are preparing the flower collection. Please check back soon.';
            }
        } catch (error) {
            shopMessage.textContent = 'Live product availability is temporarily unavailable. Please try again before placing an order.';
            console.error('Petal Ph could not load products from the shop.', error);
        }
    }

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
        checkoutSignInButton.classList.toggle('hidden', itemCount === 0 || signedInCustomer);
        checkoutForm.classList.toggle('hidden', itemCount === 0 || !signedInCustomer);
        bagCheckoutNote.textContent = signedInCustomer
            ? 'Choose delivery and payment details below to send your order to Petal Ph.'
            : signedInAdmin
                ? 'You’re signed in as the shop admin. Orders require a customer account; sign in with a customer account or create one.'
                : 'Sign in or create a customer account before continuing to checkout.';
        checkoutSignInButton.textContent = signedInAdmin
            ? 'Sign in with customer account'
            : 'Sign in to continue checkout';
        document.getElementById('bag-total').textContent = formatPrice(subtotal);

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
            details.textContent = `Quantity: ${quantity} · ${formatPrice(product.price)} each`;
            description.append(title, details);

            const amount = document.createElement('div');
            amount.className = 'flex items-center gap-4';
            const linePrice = document.createElement('p');
            linePrice.className = 'text-sm font-semibold';
            linePrice.textContent = formatPrice(product.price * quantity);
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
    loadProducts();

    document.querySelectorAll('.filter-button').forEach((button) => {
        button.addEventListener('click', () => {
            currentFilter = button.dataset.filter;
            document.querySelectorAll('.filter-button').forEach((filterButton) => {
                const selected = filterButton === button;
                filterButton.setAttribute('aria-pressed', String(selected));
                filterButton.classList.toggle('border-leaf', selected);
                filterButton.classList.toggle('border-transparent', !selected);
                filterButton.classList.toggle('text-ink', selected);
                filterButton.classList.toggle('text-ink/55', !selected);
            });
            productCards.forEach((card) => {
                card.classList.toggle('hidden', currentFilter !== 'all' && card.dataset.category !== currentFilter);
            });
        });
    });

    function addProductToBag(productId) {
        const product = products.get(productId);
        if (!product || !product.available) return;
        bag[product.id] = (bag[product.id] || 0) + 1;
        const saved = saveBag();
        renderBag();
        showShopMessage(saved ? `${product.name} added to your bag — lovely choice!` : `${product.name} added, but your bag could not be saved in this browser.`);
    }

    productGrid.addEventListener('click', (event) => {
        const button = event.target.closest('.add-to-bag');
        if (!button || button.disabled) return;
        addProductToBag(button.closest('.product-card').dataset.productId);
    });

    document.getElementById('newsletter-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const email = document.getElementById('email');
        if (!email.reportValidity()) return;
        const message = encodeURIComponent(`Hi Petal Ph! Please add ${email.value.trim()} to your flower newsletter.`);
        window.location.href = `https://wa.me/639385537979?text=${message}`;
    });

    deliveryMethod.addEventListener('change', () => {
        const needsAddress = deliveryMethod.value === 'Delivery';
        deliveryAddressFields.classList.toggle('hidden', !needsAddress);
        deliveryAddress.required = needsAddress;
        deliveryDateLabel.textContent = needsAddress ? 'Preferred delivery date' : 'Preferred pickup date';
        deliveryTimeLabel.textContent = needsAddress ? 'Preferred delivery time' : 'Preferred pickup time';
    });
    deliveryMethod.dispatchEvent(new Event('change'));
    const deliveryDateInput = document.getElementById('delivery-date');
    const minimumDeliveryDate = new Date();
    deliveryDateInput.min = `${minimumDeliveryDate.getFullYear()}-${String(minimumDeliveryDate.getMonth() + 1).padStart(2, '0')}-${String(minimumDeliveryDate.getDate()).padStart(2, '0')}`;

    checkoutForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!signedInCustomer) {
            openSignInDialog();
            accountMessage.textContent = signedInAdmin
                ? 'Shop admin accounts cannot place orders. Sign in with a customer account or create one.'
                : 'Sign in or create a customer account before placing your order.';
            return;
        }
        if (!checkoutForm.reportValidity()) return;
        document.getElementById('customer-email').value = signedInCustomerEmail;
        placeOrderButton.disabled = true;
        checkoutMessage.textContent = 'Sending your order...';
        const formData = new FormData(checkoutForm);
        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    customer_name: formData.get('customerName'),
                    customer_phone: formData.get('customerPhone'),
                    customer_email: signedInCustomerEmail,
                    delivery_method: formData.get('deliveryMethod'),
                    delivery_address: formData.get('deliveryAddress') || '',
                    delivery_date: formData.get('deliveryDate') || '',
                    requested_time: formData.get('deliveryTime') || '',
                    delivery_notes: formData.get('deliveryNotes') || '',
                    payment_method: formData.get('paymentMethod'),
                    items: Object.entries(bag).map(([id, quantity]) => ({ id, quantity }))
                })
            });
            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch {
                throw new Error('Sending orders requires the Petal Ph backend. Open the hosted site or run the backend first.');
            }
            if (!response.ok) throw new Error(result.detail || 'Your order could not be submitted.');
            Object.keys(bag).forEach((id) => delete bag[id]);
            saveBag();
            renderBag();
            checkoutForm.reset();
            deliveryMethod.dispatchEvent(new Event('change'));
            checkoutMessage.textContent = `Order sent! Save your full reference ${result.order.id} to track its status. Petal Ph will contact you to confirm the total and payment.`;
        } catch (error) {
            checkoutMessage.textContent = error instanceof TypeError
                ? 'We could not connect to the shop. Please try again in a moment.'
                : error.message;
            console.error('Petal Ph could not submit the order.', error);
        } finally {
            placeOrderButton.disabled = false;
        }
    });

    const orderTrackingForm = document.getElementById('order-tracking-form');
    const orderTrackingButton = document.getElementById('track-order-button');
    const orderTrackingMessage = document.getElementById('order-tracking-message');
    const orderTrackingResult = document.getElementById('order-tracking-result');

    orderTrackingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!orderTrackingForm.reportValidity()) return;
        orderTrackingButton.disabled = true;
        orderTrackingMessage.textContent = 'Looking up your order...';
        orderTrackingResult.classList.add('hidden');
        orderTrackingResult.replaceChildren();
        const formData = new FormData(orderTrackingForm);
        try {
            const response = await fetch('/api/orders/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    order_reference: formData.get('orderReference'),
                    customer_email: formData.get('customerEmail')
                })
            });
            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch {
                throw new Error('Order tracking is unavailable. Open the hosted Petal Ph site or run the backend.');
            }
            if (!response.ok) throw new Error(data.detail || 'Your order could not be found.');

            const statusLabels = {
                new: 'Received — waiting for the shop to confirm',
                confirmed: 'Confirmed — received and being processed',
                completed: 'Completed — processed by the shop',
                cancelled: 'Cancelled'
            };
            const reference = document.createElement('p');
            reference.className = 'font-medium';
            reference.textContent = `Order ${data.order.id.slice(0, 8)}`;
            const status = document.createElement('p');
            status.className = 'mt-1';
            status.textContent = `Status: ${statusLabels[data.order.status] || data.order.status}`;
            const submitted = document.createElement('p');
            submitted.className = 'mt-1 text-xs text-ink/60';
            submitted.textContent = `Placed ${new Date(data.order.created_at).toLocaleString()}`;
            orderTrackingResult.append(reference, status, submitted);
            if (data.order.delivery_date) {
                const delivery = document.createElement('p');
                delivery.className = 'mt-1 text-xs text-ink/60';
                const fulfillment = data.order.delivery_method === 'Store pickup' ? 'pickup' : 'delivery';
                delivery.textContent = `Preferred ${fulfillment} date: ${data.order.delivery_date}`;
                orderTrackingResult.append(delivery);
            }
            if (data.order.requested_time) {
                const fulfillment = data.order.delivery_method === 'Store pickup' ? 'pickup' : 'delivery';
                const time = document.createElement('p');
                time.className = 'mt-1 text-xs text-ink/60';
                time.textContent = `Preferred ${fulfillment} time: ${data.order.requested_time}`;
                orderTrackingResult.append(time);
            }
            orderTrackingResult.classList.remove('hidden');
            orderTrackingMessage.textContent = '';
        } catch (error) {
            orderTrackingMessage.textContent = error instanceof TypeError
                ? 'Could not connect to the shop. Please try again later.'
                : error.message;
            console.error('Petal Ph could not track the order.', error);
        } finally {
            orderTrackingButton.disabled = false;
        }
    });

    const accountDialog = document.getElementById('account-dialog');
    const accountForm = document.getElementById('account-form');
    const accountEmail = document.getElementById('account-email');
    const accountPassword = document.getElementById('account-password');
    const accountSubmit = document.getElementById('account-submit');
    const accountAuthPanel = document.getElementById('account-auth-panel');
    const accountMessage = document.getElementById('account-message');
    const accountLogout = document.getElementById('account-logout');
    const adminDashboardLink = document.getElementById('admin-dashboard-link');
    const accountOrderNotifications = document.getElementById('account-order-notifications');
    const accountOrderNotificationsList = document.getElementById('account-order-notifications-list');
    const customerOrderNotification = document.getElementById('customer-order-notification');
    const customerOrderNotificationMessage = document.getElementById('customer-order-notification-message');
    const customerProfile = document.getElementById('customer-profile');
    const customerProfileEmail = document.getElementById('customer-profile-email');
    const customerOrderHistory = document.getElementById('customer-order-history');
    const customerOrderHistoryMessage = document.getElementById('customer-order-history-message');
    const customerReminderSettings = document.getElementById('customer-reminder-settings');
    const customerReminderForm = document.getElementById('customer-reminder-form');
    const relationshipStartDate = document.getElementById('relationship-start-date');
    const relationshipStartDateDisplay = document.getElementById('relationship-start-date-display');
    const customerReminderMessage = document.getElementById('customer-reminder-message');
    const clearReminderDateButton = document.getElementById('clear-reminder-date');
    const customerReminderNotification = document.getElementById('customer-reminder-notification');
    const customerReminderNotificationMessage = document.getElementById('customer-reminder-notification-message');
    let accountMode = 'sign-in';
    let knownCustomerOrderStatuses = null;
    let accountIsSignedIn = false;
    let signedInCustomerEmail = '';
    let accountStatusReady = false;
    let savedRelationshipStartDate = null;
    let activeReminderKey = null;
    let reminderDismissed = false;

    function updateAccountButtons() {
        const accountButton = document.getElementById('account-button');
        const mobileAccountButton = document.getElementById('mobile-account-button');
        const signInButton = document.getElementById('sign-in-button');
        const mobileSignInButton = document.getElementById('mobile-sign-in-button');
        accountButton.classList.toggle('hidden', !accountIsSignedIn);
        mobileAccountButton.classList.toggle('hidden', !accountIsSignedIn);
        mobileAccountButton.classList.toggle('inline-flex', accountIsSignedIn);
        signInButton.classList.toggle('hidden', accountIsSignedIn);
        mobileSignInButton.classList.toggle('hidden', accountIsSignedIn);
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    relationshipStartDate.max = todayKey;

    function dateOnlyUtc(year, month, day) {
        return Date.UTC(year, month, day);
    }

    function daysFromToday(year, month, day) {
        const todayDate = new Date();
        const todayUtc = dateOnlyUtc(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        return Math.round((dateOnlyUtc(year, month, day) - todayUtc) / 86400000);
    }

    function formatReminderDate(year, month, day) {
        return new Intl.DateTimeFormat('en-PH', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
        }).format(new Date(dateOnlyUtc(year, month, day)));
    }

    function upcomingValentinesReminder() {
        const now = new Date();
        const year = now.getMonth() > 1 || (now.getMonth() === 1 && now.getDate() > 14)
            ? now.getFullYear() + 1
            : now.getFullYear();
        const days = daysFromToday(year, 1, 14);
        if (days < 0 || days > 7) return null;
        const message = days === 0
            ? 'It’s Valentine’s Day! Make someone’s day bloom with a little surprise.'
            : `Valentine’s Day is in ${days} day${days === 1 ? '' : 's'} (${formatReminderDate(year, 1, 14)}). Plan a little surprise.`;
        return { key: `valentines-${year}`, message };
    }

    function upcomingMonthiversaryReminder(startDate) {
        if (!startDate) return null;
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const now = new Date();
        const firstMonthIndex = startYear * 12 + startMonth;
        const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();

        for (let offset = 0; offset <= 2; offset += 1) {
            const monthIndex = currentMonthIndex + offset;
            if (monthIndex < firstMonthIndex) continue;
            const year = Math.floor(monthIndex / 12);
            const month = monthIndex % 12;
            const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            const day = Math.min(startDay, lastDay);
            const days = daysFromToday(year, month, day);
            if (days < 0 || days > 7) continue;
            const message = days === 0
                ? 'Happy monthiversary! Celebrate your special day with something lovely.'
                : `Your monthiversary is in ${days} day${days === 1 ? '' : 's'} (${formatReminderDate(year, month, day)}). Celebrate with something lovely.`;
            return { key: `monthiversary-${year}-${month + 1}-${day}`, message };
        }
        return null;
    }

    function refreshDateReminders() {
        const reminders = [
            upcomingValentinesReminder(),
            signedInCustomer ? upcomingMonthiversaryReminder(savedRelationshipStartDate) : null
        ].filter(Boolean);
        if (reminders.length === 0) {
            activeReminderKey = null;
            reminderDismissed = false;
            customerReminderNotification.classList.add('hidden');
            return;
        }
        const reminderKey = reminders.map((reminder) => reminder.key).join('|');
        if (reminderKey !== activeReminderKey) {
            activeReminderKey = reminderKey;
            reminderDismissed = false;
        }
        if (reminderDismissed) return;
        customerReminderNotificationMessage.textContent = reminders.map((reminder) => reminder.message).join('\n');
        customerReminderNotification.classList.remove('hidden');
    }

    async function readAuthResponse(response) {
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            if (window.location.protocol === 'file:') {
                throw new Error('Sign-in is unavailable in the local file preview. Open the deployed Petal Ph site or run its backend.');
            }
            const responseUrl = new URL(response.url, window.location.href);
            const contentType = response.headers.get('content-type') || 'unknown content type';
            throw new Error(
                `The account endpoint ${responseUrl.pathname} returned HTTP ${response.status} as ${contentType}, not JSON. Open Petal Ph through its running backend and try again.`
            );
        }
        if (!response.ok) {
            const error = new Error((data && data.detail) || 'The account request could not be completed.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    async function refreshAccountStatus() {
        accountAuthPanel.classList.add('hidden');
        accountLogout.classList.add('hidden');
        adminDashboardLink.classList.add('hidden');
        accountOrderNotifications.classList.add('hidden');
        accountOrderNotificationsList.replaceChildren();
        customerProfile.classList.add('hidden');
        customerOrderHistory.replaceChildren();
        customerOrderHistoryMessage.textContent = '';
        customerReminderSettings.classList.add('hidden');
        accountIsSignedIn = false;
        signedInAdmin = false;
        updateAccountButtons();
        signedInCustomer = false;
        savedRelationshipStartDate = null;
        refreshDateReminders();
        if (window.location.protocol === 'file:') {
            accountAuthPanel.classList.remove('hidden');
            accountMessage.textContent = 'Sign-in needs the Petal Ph backend. Open the deployed site or run the backend locally.';
            accountStatusReady = true;
            return;
        }
        try {
            const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
            const data = await readAuthResponse(response);
            if (!data.user) {
                accountAuthPanel.classList.remove('hidden');
                accountStatusReady = true;
                renderBag();
                return;
            }
            accountIsSignedIn = true;
            signedInAdmin = data.user.role === 'admin';
            updateAccountButtons();
            accountMessage.textContent = data.user.role === 'admin'
                ? `Signed in as shop admin: ${data.user.email}.`
                : `Signed in as ${data.user.email}.`;
            accountAuthPanel.classList.add('hidden');
            accountLogout.classList.remove('hidden');
            if (data.user.role === 'admin') adminDashboardLink.classList.remove('hidden');
            signedInCustomer = data.user.role === 'customer';
            signedInCustomerEmail = signedInCustomer ? data.user.email : '';
            accountStatusReady = true;
            renderBag();
            if (!signedInCustomer) knownCustomerOrderStatuses = null;
            if (signedInCustomer) {
                customerProfile.classList.remove('hidden');
                customerProfileEmail.textContent = data.user.email;
                await refreshCustomerOrderHistory();
                await refreshCustomerOrderNotifications();
                await refreshCustomerReminder();
            } else {
                customerProfile.classList.add('hidden');
            }
        } catch (error) {
            accountStatusReady = true;
            renderBag();
            accountAuthPanel.classList.remove('hidden');
            customerProfile.classList.add('hidden');
            accountLogout.classList.add('hidden');
            if (error.status === 401) {
                accountMessage.textContent = error.message;
            } else {
                accountMessage.textContent = 'Could not check your sign-in status. You can still try signing in; if it fails, check that the account service is running.';
            }
            customerOrderHistoryMessage.textContent = 'Could not load your purchase history.';
            console.error('Petal Ph could not check the signed-in account.', error);
        }
    }

    async function refreshCustomerOrderHistory() {
        customerOrderHistoryMessage.textContent = 'Loading purchases...';
        const response = await fetch('/api/customer/orders', { credentials: 'same-origin' });
        const data = await readAuthResponse(response);
        if (!Array.isArray(data.orders)) {
            throw new Error('The purchase history from the server is invalid.');
        }
        customerOrderHistory.replaceChildren();
        if (data.orders.length === 0) {
            customerOrderHistoryMessage.textContent = 'You have no purchases yet.';
            return;
        }

        const statusLabels = {
            new: 'Received — waiting for the shop to confirm',
            confirmed: 'Confirmed — received and being processed',
            completed: 'Completed — processed by the shop',
            cancelled: 'Cancelled'
        };
        for (const order of data.orders) {
            const item = document.createElement('li');
            item.className = 'border border-ink/10 bg-white/60 p-3';
            const reference = document.createElement('p');
            reference.className = 'break-all font-medium';
            reference.textContent = `Reference: ${order.id}`;
            const status = document.createElement('p');
            status.textContent = `Status: ${statusLabels[order.status] || order.status}`;
            const purchaseDate = document.createElement('p');
            purchaseDate.className = 'text-ink/60';
            purchaseDate.textContent = `Purchased: ${new Date(order.created_at).toLocaleString()}`;
            const fulfillment = order.delivery_method === 'Store pickup' ? 'Pickup' : 'Delivery';
            const schedule = document.createElement('p');
            schedule.className = 'text-ink/60';
            schedule.textContent = `${fulfillment}: ${order.delivery_date} at ${order.requested_time}`;
            const items = document.createElement('p');
            items.className = 'mt-1';
            items.textContent = `Items: ${order.items.map((purchase) => `${purchase.name} × ${purchase.quantity}`).join(', ')}`;
            const total = document.createElement('p');
            total.className = 'font-medium';
            total.textContent = `Total: ${priceFormatter.format(Number(order.subtotal))}`;
            const track = element('button', 'mt-2 text-xs font-semibold underline underline-offset-4 hover:text-leaf', 'Track this order');
            track.type = 'button';
            track.addEventListener('click', () => {
                document.getElementById('tracking-reference').value = order.id;
                document.getElementById('tracking-email').value = signedInCustomerEmail;
                accountDialog.close();
                document.getElementById('track-order').scrollIntoView({ behavior: 'smooth', block: 'start' });
                orderTrackingForm.requestSubmit();
            });
            item.append(reference, status, purchaseDate, schedule, items, total, track);
            customerOrderHistory.append(item);
        }
        customerOrderHistoryMessage.textContent = '';
    }

    async function refreshCustomerOrderNotifications() {
        const response = await fetch('/api/customer/order-notifications', { credentials: 'same-origin' });
        const data = await readAuthResponse(response);
        accountOrderNotificationsList.replaceChildren();
        accountOrderNotifications.classList.toggle('hidden', data.notifications.length === 0);

        const currentOrderStatuses = new Map(data.notifications.map((notification) => [notification.id, notification.status]));
        const statusUpdates = knownCustomerOrderStatuses
            ? data.notifications.filter((notification) => knownCustomerOrderStatuses.get(notification.id) !== notification.status)
            : [];
        knownCustomerOrderStatuses = currentOrderStatuses;

        for (const notification of data.notifications) {
            const item = document.createElement('li');
            item.textContent = notification.status === 'completed'
                ? `Your order (reference ${notification.id.slice(0, 8)}) has been processed and completed.`
                : `The shop has received your order (reference ${notification.id.slice(0, 8)}) and is processing it.`;
            accountOrderNotificationsList.append(item);
        }
        if (statusUpdates.length > 0) {
            const latestOrder = statusUpdates[0];
            customerOrderNotificationMessage.textContent = latestOrder.status === 'completed'
                ? `Your order (reference ${latestOrder.id.slice(0, 8)}) has been processed and completed.`
                : `The shop has received your order (reference ${latestOrder.id.slice(0, 8)}) and is processing it.`;
            customerOrderNotification.classList.remove('hidden');
        }
    }

    async function refreshCustomerReminder() {
        const response = await fetch('/api/customer/reminders', { credentials: 'same-origin' });
        const data = await readAuthResponse(response);
        savedRelationshipStartDate = data.relationship_start_date;
        relationshipStartDate.value = savedRelationshipStartDate || '';
        relationshipStartDateDisplay.textContent = savedRelationshipStartDate
            ? `Saved date: ${new Date(`${savedRelationshipStartDate}T00:00:00`).toLocaleDateString()}`
            : 'No date saved.';
        customerReminderSettings.classList.remove('hidden');
        clearReminderDateButton.classList.toggle('hidden', !savedRelationshipStartDate);
        refreshDateReminders();
    }

    function openSignInDialog() {
        if (accountMode !== 'sign-in') {
            document.querySelector('.account-mode[data-mode="sign-in"]').click();
        }
        openAccountDialog();
    }

    function openAccountDialog() {
        accountMessage.textContent = '';
        accountDialog.showModal();
        refreshAccountStatus();
    }

    document.getElementById('account-button').addEventListener('click', openAccountDialog);
    document.getElementById('mobile-account-button').addEventListener('click', openAccountDialog);
    document.getElementById('sign-in-button').addEventListener('click', openSignInDialog);
    document.getElementById('mobile-sign-in-button').addEventListener('click', openSignInDialog);
    document.getElementById('account-close').addEventListener('click', () => accountDialog.close());

    checkoutSignInButton.addEventListener('click', async () => {
        if (!accountStatusReady) await refreshAccountStatus();
        if (signedInCustomer) {
            renderBag();
            checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        if (signedInAdmin) {
            checkoutSignInButton.disabled = true;
            try {
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin'
                });
                await readAuthResponse(response);
                signedInAdmin = false;
                accountIsSignedIn = false;
                signedInCustomer = false;
                signedInCustomerEmail = '';
                accountStatusReady = true;
                accountAuthPanel.classList.remove('hidden');
                accountLogout.classList.add('hidden');
                adminDashboardLink.classList.add('hidden');
                accountOrderNotifications.classList.add('hidden');
                accountOrderNotificationsList.replaceChildren();
                customerProfile.classList.add('hidden');
                customerReminderSettings.classList.add('hidden');
                savedRelationshipStartDate = null;
                updateAccountButtons();
                refreshDateReminders();
                renderBag();
            } catch (error) {
                accountMessage.textContent = error.message || 'Could not switch from the shop admin account.';
                console.error('Petal Ph could not switch from the shop admin account.', error);
                return;
            } finally {
                checkoutSignInButton.disabled = false;
            }
        }
        openSignInDialog();
        accountMessage.textContent = 'Sign in or create a customer account to continue to checkout.';
        accountEmail.focus();
    });

    document.querySelectorAll('.account-mode').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.account-mode').forEach((modeButton) => {
                const selected = modeButton === button;
                modeButton.setAttribute('aria-pressed', String(selected));
                modeButton.classList.toggle('border-leaf', selected);
                modeButton.classList.toggle('border-transparent', !selected);
                modeButton.classList.toggle('text-ink/60', !selected);
            });
            accountMode = button.dataset.mode;
            adminDashboardLink.classList.add('hidden');
            accountPassword.autocomplete = accountMode === 'sign-up' ? 'new-password' : 'current-password';
            accountSubmit.textContent = accountMode === 'sign-up'
                ? 'Create account'
                : accountMode === 'admin' ? 'Admin sign in' : 'Sign in';
            accountMessage.textContent = '';
        });
    });

    accountForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!accountForm.reportValidity()) return;
        if (window.location.protocol === 'file:') {
            accountPassword.value = '';
            accountMessage.textContent = 'Sign-in needs the Petal Ph backend. Open the deployed site or run the backend locally.';
            return;
        }

        accountSubmit.disabled = true;
        accountMessage.textContent = 'Connecting securely...';
        try {
            const response = await fetch(
                accountMode === 'sign-up' ? '/api/auth/register' : '/api/auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        email: accountEmail.value.trim(),
                        password: accountPassword.value
                    })
                }
            );
            const data = await readAuthResponse(response);
            if (accountMode === 'admin') {
                if (data.user.role !== 'admin') {
                    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
                    throw new Error('This account is not authorized for admin access.');
                }
                const adminResponse = await fetch('/api/admin', { credentials: 'same-origin' });
                await readAuthResponse(adminResponse);
                window.location.assign('/admin');
                return;
            }
            accountMessage.textContent = data.user.role === 'admin'
                ? `Signed in as shop admin: ${data.user.email}.`
                : accountMode === 'sign-up'
                    ? 'Your customer account has been created and you are signed in.'
                    : `Signed in as ${data.user.email}.`;
            accountAuthPanel.classList.add('hidden');
            knownCustomerOrderStatuses = null;
            accountLogout.classList.remove('hidden');
            accountIsSignedIn = true;
            updateAccountButtons();
            adminDashboardLink.classList.toggle('hidden', data.user.role !== 'admin');
            signedInCustomer = data.user.role === 'customer';
            signedInAdmin = data.user.role === 'admin';
            signedInCustomerEmail = signedInCustomer ? data.user.email : '';
            accountStatusReady = true;
            renderBag();
            if (signedInCustomer) {
                customerProfile.classList.remove('hidden');
                customerProfileEmail.textContent = data.user.email;
                await refreshCustomerOrderHistory();
                await refreshCustomerOrderNotifications();
                await refreshCustomerReminder();
            } else {
                customerProfile.classList.add('hidden');
                customerReminderSettings.classList.add('hidden');
                savedRelationshipStartDate = null;
                refreshDateReminders();
            }
            if (signedInCustomer) {
                accountDialog.close();
                checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById('customer-name').focus({ preventScroll: true });
            }
        } catch (error) {
            accountMessage.textContent = error.message || 'Could not reach the account service. Please try again.';
            console.error('Petal Ph account request failed.', error);
        } finally {
            accountPassword.value = '';
            accountSubmit.disabled = false;
        }
    });

    customerReminderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!customerReminderForm.reportValidity()) return;
        const saveButton = document.getElementById('save-reminder-date');
        saveButton.disabled = true;
        customerReminderMessage.textContent = 'Saving your date...';
        try {
            const response = await fetch('/api/customer/reminders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    relationship_start_date: relationshipStartDate.value || null
                })
            });
            const data = await readAuthResponse(response);
            savedRelationshipStartDate = data.relationship_start_date;
            relationshipStartDate.value = savedRelationshipStartDate || '';
            relationshipStartDateDisplay.textContent = savedRelationshipStartDate
                ? `Saved date: ${new Date(`${savedRelationshipStartDate}T00:00:00`).toLocaleDateString()}`
                : 'No date saved.';
            clearReminderDateButton.classList.toggle('hidden', !savedRelationshipStartDate);
            customerReminderMessage.textContent = savedRelationshipStartDate
                ? 'Your monthiversary reminder date is saved.'
                : 'Your saved monthiversary date has been removed.';
            refreshDateReminders();
        } catch (error) {
            customerReminderMessage.textContent = error.message || 'Could not save your reminder date.';
            console.error('Petal Ph could not save the customer reminder date.', error);
        } finally {
            saveButton.disabled = false;
        }
    });

    clearReminderDateButton.addEventListener('click', () => {
        relationshipStartDate.value = '';
        customerReminderForm.requestSubmit();
    });

    accountLogout.addEventListener('click', async () => {
        accountLogout.disabled = true;
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });
            await readAuthResponse(response);
            accountMessage.textContent = 'You have signed out.';
            accountLogout.classList.add('hidden');
            accountAuthPanel.classList.remove('hidden');
            adminDashboardLink.classList.add('hidden');
            accountOrderNotifications.classList.add('hidden');
            accountOrderNotificationsList.replaceChildren();
            knownCustomerOrderStatuses = null;
            signedInCustomer = false;
            accountIsSignedIn = false;
            signedInAdmin = false;
            updateAccountButtons();
            signedInCustomerEmail = '';
            accountStatusReady = true;
            renderBag();
            customerProfile.classList.add('hidden');
            customerOrderHistory.replaceChildren();
            customerReminderSettings.classList.add('hidden');
            savedRelationshipStartDate = null;
            refreshDateReminders();
            customerOrderNotification.classList.add('hidden');
            customerOrderNotificationMessage.textContent = '';
        } catch (error) {
            accountMessage.textContent = 'Could not sign out. Please try again.';
            console.error('Petal Ph could not sign out the account.', error);
        } finally {
            accountLogout.disabled = false;
        }
    });

    document.getElementById('customer-order-notification-close').addEventListener('click', () => {
        customerOrderNotification.classList.add('hidden');
    });

    document.getElementById('customer-reminder-notification-close').addEventListener('click', () => {
        reminderDismissed = true;
        customerReminderNotification.classList.add('hidden');
    });

    window.setInterval(() => {
        if (!document.hidden && signedInCustomer) {
            refreshCustomerOrderNotifications().catch((error) => {
                accountMessage.textContent = 'Could not check order updates. Please try again later.';
                console.error('Petal Ph could not check customer order notifications.', error);
            });
        }
    }, 30000);

    window.setInterval(refreshDateReminders, 60000);
    document.getElementById('copyright-year').textContent = String(new Date().getFullYear());
    refreshDateReminders();
    refreshAccountStatus();

    if (new URLSearchParams(window.location.search).get('admin') === 'signin') {
        openAccountDialog();
        document.querySelector('.account-mode[data-mode="admin"]').click();
    }
})();
