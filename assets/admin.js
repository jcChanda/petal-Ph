(() => {
    const ordersList = document.getElementById('orders-list');
    const orderNotification = document.getElementById('order-notification');
    const productsList = document.getElementById('products-list');
    const dashboardMessage = document.getElementById('dashboard-message');
    const productForm = document.getElementById('product-form');
    const addProductButton = document.getElementById('add-product-button');
    const productImageSelect = document.getElementById('product-image');
    const productImagePreview = document.getElementById('product-image-preview');
    const productImageUpload = document.getElementById('product-image-upload');
    const uploadProductImageButton = document.getElementById('upload-product-image');
    const productImageUploadMessage = document.getElementById('product-image-upload-message');
    const priceFormatter = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 2
    });

    async function apiRequest(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            credentials: 'same-origin',
            headers: {
                ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });
        if (response.status === 401 || response.status === 403) {
            window.location.replace('/?admin=signin');
            throw new Error('Admin sign-in is required.');
        }
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'The request could not be completed.');
        }
        return response.status === 204 ? null : response.json();
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function connectImageUpload(fileInput, uploadButton, message, imageSelect, imagePreview, productNameInput) {
        uploadButton.addEventListener('click', async () => {
            const file = fileInput.files[0];
            if (!file) {
                message.textContent = 'Choose an image file first.';
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                message.textContent = 'Product images must be 5 MB or smaller.';
                return;
            }
            if (productNameInput.value.trim().length < 2) {
                message.textContent = 'Enter the product name before uploading its photo.';
                productNameInput.focus();
                return;
            }

            const formData = new FormData();
            formData.append('image', file);
            formData.append('product_name', productNameInput.value.trim());
            uploadButton.disabled = true;
            message.textContent = 'Uploading and checking image...';
            try {
                const result = await apiRequest('/api/admin/images', {
                    method: 'POST',
                    body: formData
                });
                const imagePath = result.image;
                if (!imagePath || !/^assets\/[a-z0-9-]+\.(png|jpg|webp)$/.test(imagePath)) {
                    throw new Error('The server returned an invalid image path.');
                }

                const option = document.createElement('option');
                option.value = imagePath;
                option.textContent = imagePath.split('/').pop();
                imageSelect.add(option);
                imageSelect.value = imagePath;
                imagePreview.src = imagePath;
                fileInput.value = '';
                message.textContent = `Photo uploaded as ${option.textContent} and selected for this product. Save the product to publish it.`;
            } catch (error) {
                message.textContent = error.message;
            } finally {
                uploadButton.disabled = false;
            }
        });
    }

    function renderOrders(orders) {
        ordersList.replaceChildren();
        if (orders.length === 0) {
            ordersList.append(element('p', 'border border-ink/10 bg-white/60 p-5 text-sm text-ink/65', 'No orders yet. New storefront orders will appear here.'));
            return;
        }

        for (const order of orders) {
            const card = element('article', 'border border-ink/10 bg-white/70 p-5');
            const header = element('div', 'flex flex-wrap items-start justify-between gap-4');
            const heading = element('div', '');
            heading.append(
                element('h3', 'font-serif text-xl', `Order ${order.id.slice(0, 8)}`),
                element('p', 'mt-1 text-xs text-ink/55', new Date(order.created_at).toLocaleString())
            );
            const status = document.createElement('select');
            status.className = 'border border-ink/15 bg-white px-3 py-2 text-xs';
            status.setAttribute('aria-label', `Order ${order.id.slice(0, 8)} status`);
            for (const value of ['new', 'confirmed', 'completed', 'cancelled']) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value[0].toUpperCase() + value.slice(1);
                option.selected = value === order.status;
                status.append(option);
            }
            status.addEventListener('change', async () => {
                status.disabled = true;
                const nextStatus = status.value;
                try {
                    await apiRequest(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: nextStatus })
                    });
                    order.status = nextStatus;
                    dashboardMessage.textContent = 'Order status updated.';
                } catch (error) {
                    dashboardMessage.textContent = error.message;
                    status.value = order.status;
                } finally {
                    status.disabled = false;
                }
            });
            header.append(heading, status);

            const fulfillment = order.delivery_method === 'Store pickup' ? 'pickup' : 'delivery';
            const customer = element('div', 'mt-4 grid gap-2 border-t border-ink/10 pt-4 text-sm sm:grid-cols-2');
            customer.append(
                element('p', '', `Customer: ${order.customer_name}`),
                element('p', '', `Phone: ${order.customer_phone}`),
                element('p', '', `Email: ${order.customer_email}`),
                element('p', '', `Payment: ${order.payment_method}`),
                element('p', '', `Method: ${order.delivery_method}`),
                element('p', '', `Address: ${order.delivery_address || 'Store pickup'}`),
                element('p', '', `Preferred ${fulfillment} date: ${order.delivery_date || 'Not specified'}`),
                element('p', '', `Preferred ${fulfillment} time: ${order.requested_time || 'Not specified'}`),
                element('p', '', `Notes: ${order.delivery_notes || 'None'}`)
            );
            const items = element('ul', 'mt-4 space-y-1 border-t border-ink/10 pt-4 text-sm');
            for (const item of order.items) {
                items.append(element('li', '', `${item.name} × ${item.quantity} — ${priceFormatter.format(Number(item.line_total))}`));
            }
            card.append(header, customer, items, element('p', 'mt-4 text-right text-sm font-semibold', `Subtotal: ${priceFormatter.format(Number(order.subtotal))}`));
            ordersList.append(card);
        }
    }

    function renderProducts(products) {
        productsList.replaceChildren();
        if (products.length === 0) {
            productsList.append(element('p', 'border border-ink/10 bg-white/60 p-5 text-sm text-ink/65', 'No products yet. Add one above.'));
            return;
        }

        for (const product of products) {
            const card = element('article', 'flex gap-4 border border-ink/10 bg-white/70 p-4');
            const image = document.createElement('img');
            image.className = 'h-24 w-20 shrink-0 object-cover';
            image.src = product.image;
            image.alt = product.name;
            image.loading = 'lazy';
            const details = element('div', 'min-w-0 flex-1');
            details.append(
                element('h3', 'font-serif text-lg', product.name),
                element('p', 'mt-1 line-clamp-2 text-xs leading-5 text-ink/60', product.description),
                element('p', 'mt-2 text-xs font-semibold', `${priceFormatter.format(Number(product.price))} · ${product.category}`)
            );
            const badge = element(
                'span',
                `mt-2 inline-block text-[10px] font-semibold uppercase tracking-[.14em] ${product.available ? 'text-leaf' : 'text-ink/50'}`,
                product.available ? 'Available' : 'Sold out'
            );
            const actions = element('div', 'mt-3 flex flex-wrap gap-3');
            const edit = element('button', 'text-xs underline underline-offset-4', 'Edit product');
            edit.type = 'button';
            edit.addEventListener('click', () => {
                const form = element('form', 'grid w-full gap-3');
                const name = document.createElement('input');
                name.className = 'w-full border border-ink/15 bg-white px-3 py-2 text-sm';
                name.setAttribute('aria-label', 'Product name');
                name.minLength = 2;
                name.maxLength = 100;
                name.required = true;
                name.value = product.name;

                const description = document.createElement('textarea');
                description.className = 'w-full border border-ink/15 bg-white px-3 py-2 text-sm';
                description.setAttribute('aria-label', 'Product description');
                description.minLength = 3;
                description.maxLength = 500;
                description.required = true;
                description.rows = 3;
                description.value = product.description;

                const category = document.createElement('select');
                category.className = 'w-full border border-ink/15 bg-white px-3 py-2 text-sm';
                category.setAttribute('aria-label', 'Product category');
                for (const option of document.getElementById('product-category').options) {
                    category.add(option.cloneNode(true));
                }
                category.value = product.category;

                const price = document.createElement('input');
                price.className = 'w-full border border-ink/15 bg-white px-3 py-2 text-sm';
                price.type = 'number';
                price.min = '0.01';
                price.max = '1000000';
                price.step = '0.01';
                price.setAttribute('aria-label', 'Product price in PHP');
                price.required = true;
                price.value = product.price;

                const imageSelect = document.createElement('select');
                imageSelect.className = 'w-full border border-ink/15 bg-white px-3 py-2 text-sm';
                imageSelect.setAttribute('aria-label', 'Product image');
                for (const option of productImageSelect.options) {
                    imageSelect.add(option.cloneNode(true));
                }
                if (![...imageSelect.options].some((option) => option.value === product.image)) {
                    const currentImage = document.createElement('option');
                    currentImage.value = product.image;
                    currentImage.textContent = `Current image (${product.image.split('/').pop()})`;
                    imageSelect.add(currentImage);
                }
                imageSelect.value = product.image;
                const imagePreview = document.createElement('img');
                imagePreview.className = 'h-32 w-28 border border-ink/10 object-cover';
                imagePreview.src = product.image;
                imagePreview.alt = `Preview of ${product.name}`;
                imageSelect.addEventListener('change', () => {
                    imagePreview.src = imageSelect.value;
                });
                const uploadLabel = element('label', 'block text-xs font-medium', 'Or upload a PNG, JPEG, or WebP photo');
                const imageUpload = document.createElement('input');
                imageUpload.className = 'block w-full text-xs file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:text-xs file:font-medium file:text-white';
                imageUpload.type = 'file';
                imageUpload.accept = 'image/png,image/jpeg,image/webp';
                const uploadButton = element('button', 'w-fit rounded-full border border-ink/20 px-4 py-2 text-xs transition hover:bg-white disabled:opacity-60', 'Upload photo');
                uploadButton.type = 'button';
                const uploadMessage = element('p', 'min-h-4 text-xs text-leaf');
                uploadMessage.setAttribute('role', 'status');
                uploadMessage.setAttribute('aria-live', 'polite');
                const uploadControls = element('div', 'grid gap-2');
                uploadLabel.htmlFor = `product-image-upload-${product.id}`;
                imageUpload.id = uploadLabel.htmlFor;
                uploadControls.append(uploadLabel, imageUpload, uploadButton, uploadMessage);
                connectImageUpload(imageUpload, uploadButton, uploadMessage, imageSelect, imagePreview, name);

                const controls = element('div', 'flex flex-wrap gap-3');
                const save = element('button', 'rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-leaf', 'Save changes');
                save.type = 'submit';
                const cancel = element('button', 'rounded-full border border-ink/20 px-4 py-2 text-xs hover:bg-white', 'Cancel');
                cancel.type = 'button';
                cancel.addEventListener('click', loadDashboard);
                controls.append(save, cancel);
                form.append(name, description, category, price, imageSelect, imagePreview, uploadControls, controls);
                form.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (!form.reportValidity()) return;
                    save.disabled = true;
                    dashboardMessage.textContent = `Saving ${product.name}...`;
                    try {
                        await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                                name: name.value,
                                description: description.value,
                                category: category.value,
                                price: Number(price.value),
                                image: imageSelect.value,
                                available: product.available
                            })
                        });
                        await loadDashboard();
                        dashboardMessage.textContent = 'Product updated on the storefront.';
                    } catch (error) {
                        dashboardMessage.textContent = error.message;
                        save.disabled = false;
                    }
                });
                card.replaceChildren(form);
            });
            const availability = element('button', 'text-xs underline underline-offset-4', product.available ? 'Mark sold out' : 'Mark available');
            availability.type = 'button';
            availability.addEventListener('click', async () => {
                availability.disabled = true;
                try {
                    await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ available: !product.available })
                    });
                    await loadDashboard();
                    dashboardMessage.textContent = `${product.name} marked ${product.available ? 'sold out' : 'available'}.`;
                } catch (error) {
                    dashboardMessage.textContent = error.message;
                    availability.disabled = false;
                }
            });
            const preview = element('a', 'text-xs underline underline-offset-4 hover:text-leaf', 'Preview in customer view ↗');
            const previewUrl = new URL('/', window.location.href);
            previewUrl.searchParams.set('preview-product', product.id);
            previewUrl.hash = 'shop';
            preview.href = previewUrl.href;
            preview.target = '_blank';
            preview.rel = 'noopener noreferrer';
            const remove = element('button', 'text-xs text-red-700 underline underline-offset-4', 'Remove');
            remove.type = 'button';
            remove.addEventListener('click', async () => {
                if (!window.confirm(`Remove "${product.name}" from the store?`)) return;
                remove.disabled = true;
                try {
                    await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
                    await loadDashboard();
                    dashboardMessage.textContent = `${product.name} was removed.`;
                } catch (error) {
                    dashboardMessage.textContent = error.message;
                    remove.disabled = false;
                }
            });
            actions.append(edit, availability, preview, remove);
            details.append(badge, actions);
            card.append(image, details);
            productsList.append(card);
        }
    }

    let knownOrderIds = null;

    async function loadDashboard({ notifyNewOrders = knownOrderIds !== null, quiet = false } = {}) {
        if (!quiet) dashboardMessage.textContent = 'Loading dashboard...';
        try {
            const [orders, products] = await Promise.all([
                apiRequest('/api/admin/orders'),
                apiRequest('/api/admin/products')
            ]);
            const currentOrderIds = new Set(orders.orders.map((order) => order.id));
            const newOrders = knownOrderIds && notifyNewOrders
                ? orders.orders.filter((order) => !knownOrderIds.has(order.id))
                : [];
            knownOrderIds = currentOrderIds;
            renderOrders(orders.orders);
            renderProducts(products.products);
            if (newOrders.length > 0) {
                const latestOrder = newOrders[0];
                orderNotification.textContent = newOrders.length === 1
                    ? `New order received from ${latestOrder.customer_name} — Order ${latestOrder.id.slice(0, 8)}.`
                    : `${newOrders.length} new orders received. The latest is Order ${latestOrder.id.slice(0, 8)}.`;
                orderNotification.classList.remove('hidden');
            }
            if (!quiet) dashboardMessage.textContent = '';
        } catch (error) {
            dashboardMessage.textContent = error.message;
        }
    }

    productForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!productForm.reportValidity()) return;
        addProductButton.disabled = true;
        dashboardMessage.textContent = 'Adding product...';
        try {
            await apiRequest('/api/admin/products', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('product-name').value,
                    description: document.getElementById('product-description').value,
                    category: document.getElementById('product-category').value,
                    price: Number(document.getElementById('product-price').value),
                    image: document.getElementById('product-image').value,
                    available: true
                })
            });
            productForm.reset();
            await loadDashboard();
            dashboardMessage.textContent = 'Product added to the storefront.';
        } catch (error) {
            dashboardMessage.textContent = error.message;
        } finally {
            addProductButton.disabled = false;
        }
    });

    productImageSelect.addEventListener('change', () => {
        productImagePreview.src = productImageSelect.value;
    });

    connectImageUpload(
        productImageUpload,
        uploadProductImageButton,
        productImageUploadMessage,
        productImageSelect,
        productImagePreview,
        document.getElementById('product-name')
    );

    document.getElementById('refresh-orders').addEventListener('click', () => {
        loadDashboard({ notifyNewOrders: true });
    });
    document.getElementById('dashboard-signout').addEventListener('click', async () => {
        try {
            await apiRequest('/api/auth/logout', { method: 'POST' });
            window.location.replace('/');
        } catch (error) {
            dashboardMessage.textContent = error.message;
        }
    });

    loadDashboard();
    window.setInterval(() => {
        if (!document.hidden) loadDashboard({ notifyNewOrders: true, quiet: true });
    }, 30000);
})();
