<?php
session_start();

$products = [
    [
        'name' => 'Sunday in the Garden',
        'description' => 'Garden rose, sweet pea & seasonal greens',
        'price' => 68,
        'category' => 'bouquets',
        'image' => 'assets/flower-menu.jpg',
        'alt' => 'A colorful selection of fresh flowers at the Petal Ph flower shop',
        'tag' => 'Bestseller',
    ],
    [
        'name' => 'A Little Wild',
        'description' => 'A flower-filled surprise, wrapped up with love',
        'price' => 54,
        'category' => 'seasonal',
        'image' => 'assets/money-bouquet.jpg',
        'alt' => 'A pink flower arrangement wrapped around a gift of banknotes',
        'tag' => 'A little extra',
    ],
    [
        'name' => 'The Golden Hour',
        'description' => 'Velvety blue roses in a statement arrangement',
        'price' => 72,
        'category' => 'bouquets',
        'image' => 'assets/blue-roses.jpg',
        'alt' => 'A lush bouquet of blue and white roses',
        'tag' => '',
    ],
    [
        'name' => 'Flowers, Every Friday',
        'description' => 'Classic ivory roses with a soft, lovely finish',
        'price' => 48,
        'category' => 'subscriptions',
        'image' => 'assets/white-roses.jpg',
        'alt' => 'A full bouquet of creamy white roses and little daisies',
        'tag' => 'A lovely habit',
    ],
];

function escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function redirectTo(string $section, string $category = 'all'): void
{
    $query = $category === 'all' ? '' : '?category=' . rawurlencode($category);
    header('Location: ' . $query . '#' . $section);
    exit;
}

$categories = ['all', 'bouquets', 'seasonal', 'subscriptions'];
$category = isset($_GET['category']) && in_array($_GET['category'], $categories, true)
    ? $_GET['category']
    : 'all';

if (!isset($_SESSION['cart']) || !is_array($_SESSION['cart'])) {
    $_SESSION['cart'] = [];
}

if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postedToken = is_string($_POST['csrf_token'] ?? null) ? $_POST['csrf_token'] : '';
    if (!hash_equals($_SESSION['csrf_token'], $postedToken)) {
        $_SESSION['flash'] = ['type' => 'error', 'message' => 'That request could not be verified. Please try again.', 'section' => 'shop'];
        redirectTo('shop', $category);
    }

    $action = is_string($_POST['action'] ?? null) ? $_POST['action'] : '';
    if ($action === 'add_to_bag' || $action === 'remove_from_bag') {
        $postedProductId = is_string($_POST['product_id'] ?? null) ? $_POST['product_id'] : '';
        $productId = filter_var($postedProductId, FILTER_VALIDATE_INT);
        if ($productId === false || !array_key_exists($productId, $products)) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'That flower selection is no longer available.', 'section' => 'shop'];
            redirectTo('shop', $category);
        }

        if ($action === 'add_to_bag') {
            $_SESSION['cart'][$productId] = ($_SESSION['cart'][$productId] ?? 0) + 1;
            $_SESSION['flash'] = ['type' => 'success', 'message' => $products[$productId]['name'] . ' added to your bag — lovely choice!', 'section' => 'shop'];
        } else {
            unset($_SESSION['cart'][$productId]);
            $_SESSION['flash'] = ['type' => 'success', 'message' => 'Flower removed from your bag.', 'section' => 'bag'];
        }
        redirectTo($action === 'add_to_bag' ? 'shop' : 'bag', $category);
    }

    if ($action === 'newsletter') {
        $postedEmail = is_string($_POST['email'] ?? null) ? trim($_POST['email']) : '';
        $email = filter_var($postedEmail, FILTER_VALIDATE_EMAIL);
        $recipient = getenv('SHOP_NEWSLETTER_EMAIL');
        if ($email === false) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Please enter a valid email address.', 'section' => 'newsletter'];
        } elseif (!$recipient || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'Our email list is not connected yet. Please contact the shop directly.', 'section' => 'newsletter'];
        } elseif (mail($recipient, 'New Petal Ph newsletter signup', "Newsletter signup request from: {$email}", 'From: ' . $recipient . "\r\nReply-To: " . $email)) {
            $_SESSION['flash'] = ['type' => 'success', 'message' => 'Thanks! Your signup request has been sent.', 'section' => 'newsletter'];
        } else {
            $_SESSION['flash'] = ['type' => 'error', 'message' => 'We could not send your signup just now. Please try again later.', 'section' => 'newsletter'];
        }
        redirectTo('newsletter', $category);
    }

    $_SESSION['flash'] = ['type' => 'error', 'message' => 'That action is not available.', 'section' => 'shop'];
    redirectTo('shop', $category);
}

$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);
$cart = $_SESSION['cart'];
$cartCount = array_sum($cart);
$visibleProducts = $category === 'all'
    ? $products
    : array_filter($products, static fn (array $product): bool => $product['category'] === $category);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#fcf8f6">
    <meta name="description" content="Petal Ph creates joyful flower bouquets and thoughtful gifts, arranged with heart and wrapped by hand.">
    <title>Petal Ph — Flowers for the feeling</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdn.tailwindcss.com">
    <link rel="preload" as="image" href="assets/petal-ph-yellow-bouquet.jpg" fetchpriority="high">
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        paper: '#fcf8f6',
                        ink: '#4c3640',
                        leaf: '#a8546e',
                        blush: '#f3dce1',
                        butter: '#f1e2c9'
                    },
                    fontFamily: {
                        sans: ['DM Sans', 'sans-serif'],
                        serif: ['Playfair Display', 'serif']
                    }
                }
            }
        };
    </script>
    <style>
        html { scroll-behavior: smooth; }
        body { background: #fcf8f6; }
        .hero-image { animation: arrive 1.1s ease-out both; background-image: url('assets/petal-ph-yellow-bouquet.jpg'); background-position: center 42%; background-size: cover; }
        @keyframes arrive {
            from { opacity: 0; transform: scale(1.035); }
            to { opacity: 1; transform: scale(1); }
        }
        .product-card { transition: transform .25s ease, opacity .2s ease; }
        .product-card:hover { transform: translateY(-5px); }
        .ad-stage { perspective: 1200px; }
        .ad-poster {
            transform: rotateY(-9deg) rotateX(3deg) rotateZ(-1deg);
            transform-style: preserve-3d;
            box-shadow: 24px 30px 45px rgba(76, 54, 64, .2), 8px 10px 0 #e8c9d0;
            transition: transform .55s cubic-bezier(.2,.7,.2,1), box-shadow .55s ease;
        }
        .ad-stage:hover .ad-poster,
        .ad-stage:focus-within .ad-poster {
            transform: rotateY(0) rotateX(0) rotateZ(0) translateY(-5px);
            box-shadow: 30px 38px 55px rgba(76, 54, 64, .23), 0 0 0 #e8c9d0;
        }
        @media (prefers-reduced-motion: reduce) {
            .ad-poster { transition: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
        }
    </style>
</head>
<body class="font-sans text-ink antialiased">
    <div class="bg-ink px-4 py-2 text-center text-[10px] font-medium uppercase tracking-[.2em] text-paper sm:text-[11px]">
        A little joy, delivered free on orders over $85
    </div>

    <header class="relative z-20 border-b border-ink/10 bg-paper">
        <nav class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10" aria-label="Main navigation">
            <span class="h-10 w-10 md:hidden" aria-hidden="true"></span>
            <a href="#" class="absolute left-1/2 -translate-x-1/2 font-serif text-[22px] font-semibold tracking-[-.06em] md:static md:translate-x-0 md:text-[25px]">
                <span class="lowercase">petal</span><span class="font-sans text-leaf">Ph</span>
                <span class="mt-0.5 block font-sans text-[7px] font-medium uppercase tracking-[.3em] text-leaf">Flowers &amp; gifts</span>
            </a>
            <div class="hidden items-center gap-8 text-[12px] font-medium tracking-wide md:flex">
                <a class="transition hover:text-leaf" href="#shop">Shop flowers</a>
                <a class="transition hover:text-leaf" href="#our-story">Our little story</a>
                <a class="transition hover:text-leaf" href="#newsletter">Say hello</a>
            </div>
            <a href="#bag" class="flex h-10 items-center gap-2 rounded-full border border-ink/15 px-4 text-xs font-medium transition hover:bg-ink hover:text-paper" aria-label="Your bag, <?= $cartCount ?> <?= $cartCount === 1 ? 'item' : 'items' ?>">
                Bag <span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-leaf px-1 text-[10px] text-white"><?= $cartCount ?></span>
            </a>
        </nav>
        <nav class="border-t border-ink/10 px-6 py-4 md:hidden" aria-label="Mobile navigation">
            <div class="mx-auto flex max-w-7xl flex-col gap-4 text-sm">
                <a href="#shop">Shop flowers</a>
                <a href="#our-story">Our little story</a>
                <a href="#newsletter">Say hello</a>
            </div>
        </nav>
    </header>

    <main>
        <section class="mx-auto grid max-w-7xl gap-8 px-5 pb-16 pt-8 sm:pt-12 md:grid-cols-[.9fr_1.1fr] md:items-center md:gap-12 md:px-10 md:pb-24 md:pt-10">
            <div class="order-2 py-5 md:order-1 md:py-12">
                <p class="mb-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.24em] text-leaf sm:text-[11px]">
                    <span class="h-px w-8 bg-leaf"></span> Your neighborhood flower shop
                </p>
                <h1 class="max-w-xl font-serif text-[clamp(3.4rem,8vw,6.7rem)] leading-[.98] tracking-[-.055em]">
                    Flowers for <span class="italic text-leaf">the</span> feeling.
                </h1>
                <p class="mt-6 max-w-md text-sm leading-7 text-ink/70 sm:text-base">
                    The just-picked, a-little-bit-wild kind. Arranged with heart, wrapped by hand, and ready to make someone's day.
                </p>
                <div class="mt-8 flex flex-wrap items-center gap-5">
                    <a href="#shop" class="inline-flex items-center gap-4 rounded-full bg-ink px-6 py-4 text-xs font-semibold uppercase tracking-[.12em] text-white transition hover:bg-leaf">
                        Find your flowers <span aria-hidden="true">↗</span>
                    </a>
                    <span class="text-[11px] text-ink/55">Made slowly, delivered happily.</span>
                </div>
                <div class="mt-12 flex items-center gap-3 border-t border-ink/10 pt-5">
                    <div class="flex -space-x-2" aria-hidden="true">
                        <span class="h-8 w-8 rounded-full border-2 border-paper bg-blush"></span>
                        <span class="h-8 w-8 rounded-full border-2 border-paper bg-butter"></span>
                        <span class="h-8 w-8 rounded-full border-2 border-paper bg-leaf/70"></span>
                    </div>
                    <p class="text-[11px] text-ink/65"><strong class="text-ink">4.9/5</strong> from flower people like you</p>
                </div>
            </div>
            <div class="hero-image order-1 relative min-h-[390px] overflow-hidden rounded-[48%_48%_5px_5px] bg-blush sm:min-h-[520px] md:order-2" role="img" aria-label="A soft pink and ivory hand-tied bouquet">
                <div class="absolute bottom-5 left-5 rounded-full bg-paper/90 px-4 py-3 text-[10px] font-medium tracking-wide backdrop-blur-sm sm:bottom-7 sm:left-7">
                    <span class="mr-2 text-leaf">✳</span> Picked fresh this morning
                </div>
                <div class="absolute right-4 top-4 flex h-[76px] w-[76px] rotate-12 flex-col items-center justify-center rounded-full bg-butter text-center text-[9px] font-semibold uppercase leading-[1.35] tracking-[.12em] sm:right-7 sm:top-7 sm:h-[88px] sm:w-[88px]">
                    Grown with<br>good things
                    <span class="mt-1 text-base" aria-hidden="true">✳</span>
                </div>
            </div>
        </section>

        <section class="overflow-hidden bg-[#f5e9e7] px-5 py-16 sm:py-20 md:px-10 md:py-24">
            <div class="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2 md:gap-16">
                <div class="max-w-lg">
                    <p class="mb-3 text-[10px] font-semibold uppercase tracking-[.22em] text-leaf">A little love, in full bloom</p>
                    <h2 class="font-serif text-4xl leading-tight tracking-[-.04em] sm:text-5xl">Make their whole day feel like a bouquet.</h2>
                    <p class="mt-5 text-sm leading-7 text-ink/70">Bright, thoughtful, and wrapped with love. Find a flower gift for the people who make your world bloom.</p>
                    <a href="#shop" class="mt-7 inline-flex items-center gap-4 rounded-full bg-ink px-6 py-4 text-xs font-semibold uppercase tracking-[.12em] text-white transition hover:bg-leaf">
                        Shop the collection <span aria-hidden="true">↗</span>
                    </a>
                    <p class="mt-5 text-[11px] text-ink/55">Handcrafted with care at Petal Ph · Davao City</p>
                </div>
                <div class="ad-stage mx-auto w-full max-w-[360px] py-5">
                    <figure class="ad-poster overflow-hidden rounded-[3px] bg-white">
                        <img class="block h-auto w-full" src="assets/petal-ph-ad.jpg" alt="Petal Ph flower and gift advertisement featuring a pastel pink bouquet, with our Davao City location and contact details." loading="lazy" decoding="async">
                    </figure>
                    <p class="mt-7 text-center text-[10px] font-medium uppercase tracking-[.18em] text-leaf">A keepsake moment, from Petal Ph</p>
                </div>
            </div>
        </section>

        <section id="shop" class="bg-[#f0eee6] px-5 py-16 sm:py-20 md:px-10 md:py-24">
            <div class="mx-auto max-w-7xl">
                <div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                    <div>
                        <p class="mb-3 text-[10px] font-semibold uppercase tracking-[.22em] text-leaf">A good bunch goes a long way</p>
                        <h2 class="font-serif text-4xl tracking-[-.04em] sm:text-5xl">A few current favorites.</h2>
                    </div>
                    <a href="#shop" class="w-fit border-b border-leaf pb-1 text-xs font-medium">See all the lovely things <span class="ml-2">↗</span></a>
                </div>
                <form method="get" action="#shop" class="mt-8 flex flex-wrap gap-2" aria-label="Filter flowers">
                    <?php foreach (['all' => 'Everything', 'bouquets' => 'Bouquets', 'seasonal' => 'In season', 'subscriptions' => 'Subscriptions'] as $filter => $label): ?>
                        <button class="rounded-full border px-4 py-2 text-xs font-medium transition <?= $category === $filter ? 'border-leaf text-ink' : 'border-transparent text-ink/55' ?>" type="submit" name="category" value="<?= escape($filter) ?>" aria-pressed="<?= $category === $filter ? 'true' : 'false' ?>"><?= escape($label) ?></button>
                    <?php endforeach; ?>
                </form>
                <div id="product-grid" class="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <?php foreach ($visibleProducts as $productId => $product): ?>
                        <article class="product-card">
                            <div class="group relative aspect-[.82] overflow-hidden bg-paper">
                                <img class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" src="<?= escape($product['image']) ?>" alt="<?= escape($product['alt']) ?>" loading="lazy" decoding="async">
                                <?php if ($product['tag'] !== ''): ?>
                                    <span class="absolute left-3 top-3 bg-paper px-3 py-2 text-[9px] font-semibold uppercase tracking-[.13em]"><?= escape($product['tag']) ?></span>
                                <?php endif; ?>
                                <form method="post" action="<?= $category === 'all' ? '#shop' : '?category=' . escape($category) . '#shop' ?>" class="absolute bottom-3 right-3">
                                    <input type="hidden" name="csrf_token" value="<?= escape($_SESSION['csrf_token']) ?>">
                                    <input type="hidden" name="action" value="add_to_bag">
                                    <input type="hidden" name="product_id" value="<?= $productId ?>">
                                    <button class="flex h-11 w-11 items-center justify-center rounded-full bg-paper text-xl transition hover:bg-ink hover:text-white" type="submit" aria-label="Add <?= escape($product['name']) ?> to your bag">+</button>
                                </form>
                            </div>
                            <div class="flex items-start justify-between gap-3 pt-4">
                                <div>
                                    <h3 class="font-serif text-lg"><?= escape($product['name']) ?></h3>
                                    <p class="mt-1 text-[11px] leading-5 text-ink/60"><?= escape($product['description']) ?></p>
                                </div>
                                <p class="pt-1 text-xs font-semibold">$<?= number_format($product['price']) ?></p>
                            </div>
                        </article>
                    <?php endforeach; ?>
                </div>
                <?php if (($flash['section'] ?? '') === 'shop'): ?>
                    <p class="mt-5 text-sm <?= ($flash['type'] ?? '') === 'error' ? 'text-red-800' : 'text-leaf' ?>" role="status"><?= escape($flash['message']) ?></p>
                <?php endif; ?>
            </div>
        </section>

        <section id="bag" class="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-20">
            <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <p class="mb-3 text-[10px] font-semibold uppercase tracking-[.22em] text-leaf">Saved for a little later</p>
                    <h2 class="font-serif text-4xl tracking-[-.04em]">Your flower bag.</h2>
                </div>
                <p class="text-sm text-ink/60"><?= $cartCount ?> <?= $cartCount === 1 ? 'lovely thing' : 'lovely things' ?></p>
            </div>
            <?php if ($cartCount === 0): ?>
                <p class="mt-6 text-sm text-ink/65">Your bag is waiting for something lovely. <a class="border-b border-leaf text-ink" href="#shop">Find your flowers ↗</a></p>
            <?php else: ?>
                <div class="mt-6 divide-y divide-ink/10 border-y border-ink/10">
                    <?php $subtotal = 0; ?>
                    <?php foreach ($cart as $productId => $quantity): ?>
                        <?php if (isset($products[$productId]) && is_int($quantity) && $quantity > 0): ?>
                            <?php $product = $products[$productId]; $subtotal += $product['price'] * $quantity; ?>
                            <div class="flex items-center justify-between gap-4 py-4">
                                <div>
                                    <h3 class="font-serif text-lg"><?= escape($product['name']) ?></h3>
                                    <p class="mt-1 text-xs text-ink/60">Quantity: <?= $quantity ?> · $<?= number_format($product['price']) ?> each</p>
                                </div>
                                <div class="flex items-center gap-4">
                                    <p class="text-sm font-semibold">$<?= number_format($product['price'] * $quantity) ?></p>
                                    <form method="post" action="#bag">
                                        <input type="hidden" name="csrf_token" value="<?= escape($_SESSION['csrf_token']) ?>">
                                        <input type="hidden" name="action" value="remove_from_bag">
                                        <input type="hidden" name="product_id" value="<?= $productId ?>">
                                        <button class="text-xs underline underline-offset-4" type="submit" aria-label="Remove <?= escape($product['name']) ?> from your bag">Remove</button>
                                    </form>
                                </div>
                            </div>
                        <?php endif; ?>
                    <?php endforeach; ?>
                </div>
                <p class="mt-5 text-right text-sm">Subtotal <strong class="ml-3">$<?= number_format($subtotal) ?></strong></p>
                <p class="mt-2 text-right text-xs text-ink/55">Delivery and checkout can be arranged when you contact the shop.</p>
            <?php endif; ?>
            <?php if (($flash['section'] ?? '') === 'bag'): ?>
                <p class="mt-5 text-sm <?= ($flash['type'] ?? '') === 'error' ? 'text-red-800' : 'text-leaf' ?>" role="status"><?= escape($flash['message']) ?></p>
            <?php endif; ?>
        </section>

        <section id="our-story" class="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:py-20 md:grid-cols-2 md:items-center md:gap-20 md:px-10 md:py-24">
            <div class="relative mx-auto w-full max-w-lg">
                <img class="aspect-[.95] w-full object-cover" src="assets/flower-shop.jpg" alt="Fresh pink flowers displayed in the flower shop" loading="lazy" decoding="async">
                <span class="absolute -bottom-5 -right-3 flex h-24 w-24 rotate-6 items-center justify-center rounded-full bg-butter text-center font-serif text-xs italic leading-5 sm:-right-5 sm:h-28 sm:w-28">A little more<br>heart, always.</span>
            </div>
            <div class="pt-3 md:py-10">
                <p class="mb-3 text-[10px] font-semibold uppercase tracking-[.22em] text-leaf">More garden, less fuss</p>
                <h2 class="max-w-md font-serif text-4xl leading-tight tracking-[-.04em] sm:text-5xl">We believe in flowers just because.</h2>
                <p class="mt-5 max-w-md text-sm leading-7 text-ink/70">
                    A tiny neighborhood studio with a soft spot for seasonal stems, wonky petals, and the everyday occasions that deserve a little something.
                </p>
                <p class="mt-4 max-w-md text-sm leading-7 text-ink/70">
                    We source from nearby growers whenever we can, arrange everything by hand, and send it out with a note in your own words.
                </p>
                <a class="mt-7 inline-flex items-center gap-3 border-b border-leaf pb-1 text-xs font-semibold" href="#newsletter">A bit more about us <span>↗</span></a>
            </div>
        </section>

        <section class="bg-[#e8e8dc] bg-cover bg-center px-5 py-12 text-center sm:py-16" style="background-image: linear-gradient(rgba(252, 248, 246, .84), rgba(252, 248, 246, .84)), url('assets/signature-bouquet.jpg'); background-position: center 38%; background-size: cover;">
            <p class="mx-auto max-w-3xl font-serif text-2xl italic leading-relaxed tracking-[-.02em] sm:text-3xl">
                “The best part of my Friday is the flowers that show up at my door. They feel like a deep breath.”
            </p>
            <p class="mt-5 text-[10px] font-semibold uppercase tracking-[.2em] text-leaf">Maya, flower person since 2021</p>
        </section>

        <section id="newsletter" class="px-5 py-16 sm:py-20 md:py-24">
            <div class="mx-auto max-w-xl text-center">
                <span class="text-2xl text-leaf" aria-hidden="true">✳</span>
                <p class="mt-3 text-[10px] font-semibold uppercase tracking-[.22em] text-leaf">The occasional happy note</p>
                <h2 class="mt-3 font-serif text-4xl tracking-[-.04em] sm:text-5xl">A little sunshine in your inbox.</h2>
                <p class="mx-auto mt-4 max-w-md text-sm leading-6 text-ink/65">New-season flowers, studio notes, and a good excuse to send somebody a bunch.</p>
                <form method="post" action="#newsletter" class="mx-auto mt-7 flex max-w-md border-b border-ink/35 pb-2 text-left">
                    <input type="hidden" name="csrf_token" value="<?= escape($_SESSION['csrf_token']) ?>">
                    <input type="hidden" name="action" value="newsletter">
                    <label for="email" class="sr-only">Your email address</label>
                    <input id="email" name="email" type="email" autocomplete="email" placeholder="Your email address" required class="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-ink/45">
                    <button class="pl-4 text-xs font-semibold uppercase tracking-[.12em] transition hover:text-leaf" type="submit">Count me in ↗</button>
                </form>
                <?php if (($flash['section'] ?? '') === 'newsletter'): ?>
                    <p class="mt-3 text-xs <?= ($flash['type'] ?? '') === 'error' ? 'text-red-800' : 'text-leaf' ?>" role="status"><?= escape($flash['message']) ?></p>
                <?php endif; ?>
            </div>
        </section>
    </main>

    <footer class="bg-ink px-5 py-8 text-paper md:px-10">
        <div class="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <a href="#" class="font-serif text-xl tracking-[-.05em]"><span class="lowercase">petal</span><span class="font-sans text-butter">Ph</span></a>
            <p class="text-[10px] tracking-wide text-paper/65">Made with care, and probably a little soil. © <?= date('Y') ?> Petal Ph.</p>
            <a href="tel:+639385535979" class="text-xs text-paper/80 transition hover:text-white">Call or text +63 938 553 7979 ↗</a>
        </div>
    </footer>

</body>
</html>
