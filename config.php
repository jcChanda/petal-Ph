<?php
// config.php
declare(strict_types=1);

define('DB_PATH', __DIR__ . '/petal_ph.db');
define('ADMIN_EMAIL', 'petalphofficial@gmail.com');
$adminPassword = getenv('ADMIN_PASSWORD');
if ($adminPassword === false || strlen($adminPassword) < 16) {
    throw new RuntimeException('Set ADMIN_PASSWORD to a unique value of at least 16 characters.');
}
define('ADMIN_PASSWORD', $adminPassword);

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    init_db($pdo);
    return $pdo;
}

function init_db(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('customer','admin')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL CHECK (price >= 0),
        image TEXT NOT NULL,
        available INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        delivery_method TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_date TEXT NOT NULL,
        requested_time TEXT NOT NULL DEFAULT '',
        delivery_notes TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        items TEXT NOT NULL,
        subtotal REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','completed','cancelled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $orderColumns = $pdo->query("PRAGMA table_info(orders)")->fetchAll();
    if (!in_array('requested_time', array_column($orderColumns, 'name'), true)) {
        $pdo->exec("ALTER TABLE orders ADD COLUMN requested_time TEXT NOT NULL DEFAULT ''");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_reminders (
        customer_email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
        relationship_start_date TEXT
    )");
    // Keep the configured admin credentials in sync with the local account.
    $stmt = $pdo->prepare("SELECT password_hash, role FROM users WHERE email = ?");
    $stmt->execute([ADMIN_EMAIL]);
    $admin = $stmt->fetch();
    if (!$admin) {
        $hash = password_hash(ADMIN_PASSWORD, PASSWORD_DEFAULT);
        $ins = $pdo->prepare("INSERT INTO users (email,password_hash,role) VALUES (?,?,?)");
        $ins->execute([ADMIN_EMAIL, $hash, 'admin']);
    } elseif ($admin['role'] !== 'admin' || !password_verify(ADMIN_PASSWORD, $admin['password_hash'])) {
        $hash = password_hash(ADMIN_PASSWORD, PASSWORD_DEFAULT);
        $update = $pdo->prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE email = ?");
        $update->execute([$hash, ADMIN_EMAIL]);
    }
    // seed products
    $count = (int)$pdo->query("SELECT COUNT(*) FROM products")->fetchColumn();
    if ($count === 0) {
        $products = [
            ['sunday-garden','Sunday in the Garden','Garden rose, sweet pea & seasonal greens','bouquets',68,'assets/sunday-in-the-garden.png'],
            ['a-little-wild','A Little Wild','A flower-filled surprise, wrapped up with love','seasonal',54,'assets/little-wild-bouquet.png'],
            ['money-bouquet','Money Bouquet','A hand-arranged flower bouquet with a thoughtful cash gift','bouquets',54,'assets/money-bouquet.png'],
            ['golden-hour','The Golden Hour','Velvety blue roses in a statement arrangement','bouquets',72,'assets/blue-roses.jpg'],
            ['friday-flowers','Flowers, Every Friday','Classic ivory roses with a soft, lovely finish','subscriptions',48,'assets/white-roses.jpg'],
        ];
        $ins = $pdo->prepare("INSERT INTO products (id,name,description,category,price,image) VALUES (?,?,?,?,?,?)");
        foreach ($products as $p) $ins->execute($p);
    }
    $moneyBouquet = $pdo->prepare("INSERT INTO products (id,name,description,category,price,image) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING");
    $moneyBouquet->execute(['money-bouquet','Money Bouquet','A hand-arranged flower bouquet with a thoughtful cash gift','bouquets',54,'assets/money-bouquet.png']);
    $seasonalProduct = $pdo->prepare("INSERT INTO products (id,name,description,category,price,image) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING");
    $seasonalProduct->execute(['berry','Berry','A bold red seasonal rose bouquet wrapped in crimson','seasonal',899,'assets/berry-bouquet.png']);
    $seasonalProduct->execute(['lady-monroe','Lady Monroe','A romantic red rose bouquet with a white orchid in a keepsake box','seasonal',1000,'assets/lady-monroe.png']);
    $subscriptionProduct = $pdo->prepare("INSERT INTO products (id,name,description,category,price,image) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING");
    $subscriptionProduct->execute(['sunny-days-subscription','Sunny Days Subscription','A sunny mix of sunflowers and white blooms for your flower subscription','subscriptions',1500,'assets/sunny-days-subscription.png']);
    $updateLittleWildImage = $pdo->prepare("UPDATE products SET image = ? WHERE id = ? AND image = ?");
    $updateLittleWildImage->execute(['assets/little-wild-bouquet.png','a-little-wild','assets/money-bouquet.jpg']);
    $updateSundayGardenImage = $pdo->prepare("UPDATE products SET image = ? WHERE id = ? AND image = ?");
    $updateSundayGardenImage->execute(['assets/sunday-in-the-garden.png','sunday-garden','assets/flower-menu.jpg']);
}

function json_response($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw ?: '{}', true);
    return is_array($d) ? $d : [];
}

function current_user(): ?array {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    if (empty($_SESSION['user'])) return null;
    return $_SESSION['user'];
}

function require_admin(): array {
    $u = current_user();
    if (!$u) json_response(['detail' => 'Please sign in.'], 401);
    if ($u['role'] !== 'admin') json_response(['detail' => 'Admin access is required.'], 403);
    return $u;
}

function require_customer(): array {
    $u = current_user();
    if (!$u) json_response(['detail' => 'Please sign in.'], 401);
    if ($u['role'] !== 'customer') json_response(['detail' => 'Customer access is required.'], 403);
    return $u;
}

function uuid(): string {
    return sprintf('%s-%s-%s-%s-%s',
        bin2hex(random_bytes(4)), bin2hex(random_bytes(2)),
        bin2hex(random_bytes(2)), bin2hex(random_bytes(2)),
        bin2hex(random_bytes(6)));
}
