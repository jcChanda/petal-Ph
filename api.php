<?php
// api.php - router
require_once __DIR__ . '/config.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (PHP_SAPI === 'cli-server') {
    if ($path === '/admin' || $path === '/admin/') {
        readfile(__DIR__ . '/admin.html');
        exit;
    }
    if ($path !== false && strpos($path, '/api') !== 0) {
        $staticExtensions = ['html', 'css', 'js', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'ico', 'woff', 'woff2'];
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if ($path === '/' || (in_array($extension, $staticExtensions, true) && is_file(__DIR__ . $path))) {
            return false;
        }
    }
}
$path = rtrim($path, '/');
if ($path === '') $path = '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// strip leading /api
$apiPath = $path;
if (strpos($apiPath, '/api') === 0) {
    $apiPath = substr($apiPath, 4);
    if ($apiPath === '' || $apiPath === false) $apiPath = '/';
}

// route dispatch
function route($method, $path, $handler) { global $apiPath, $m; if ($_SERVER['REQUEST_METHOD']===$method && $apiPath===$path) { $handler(); exit; } }

$m = $method;

// health
if ($method === 'GET' && $apiPath === '/health') {
    json_response(['status' => 'ok']);
}

// auth
if ($method === 'POST' && $apiPath === '/auth/register') {
    $b = body();
    $email = strtolower(trim($b['email'] ?? ''));
    $password = $b['password'] ?? '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['detail'=>'Enter a valid email address.'],400);
    if (strlen($password) < 12) json_response(['detail'=>'Choose a password with at least 12 characters.'],400);
    $pdo = db();
    $stmt = $pdo->prepare("SELECT email FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) json_response(['detail'=>'An account with this email already exists.'],409);
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $pdo->prepare("INSERT INTO users (email,password_hash,role) VALUES (?,?,?)")->execute([$email,$hash,'customer']);
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $_SESSION['user'] = ['email'=>$email,'role'=>'customer'];
    json_response(['user'=>['email'=>$email,'role'=>'customer']],201);
}

if ($method === 'POST' && $apiPath === '/auth/login') {
    $b = body();
    $email = strtolower(trim($b['email'] ?? ''));
    $password = $b['password'] ?? '';
    $pdo = db();
    $stmt = $pdo->prepare("SELECT email,password_hash,role FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $u = $stmt->fetch();
    if (!$u || !password_verify($password, $u['password_hash'])) json_response(['detail'=>'Email or password is incorrect.'],401);
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $_SESSION['user'] = ['email'=>$u['email'],'role'=>$u['role']];
    json_response(['user'=>['email'=>$u['email'],'role'=>$u['role']]]);
}

if ($method === 'POST' && $apiPath === '/auth/logout') {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $_SESSION = [];
    session_destroy();
    json_response(['status'=>'signed out']);
}

if ($method === 'GET' && $apiPath === '/auth/me') {
    $u = current_user();
    json_response(['user' => $u]);
}

if ($method === 'GET' && $apiPath === '/admin') {
    $u = require_admin();
    json_response(['email'=>$u['email'],'role'=>$u['role']]);
}

if ($method === 'POST' && $apiPath === '/orders/track') {
    $b = body();
    $email = strtolower(trim($b['customer_email'] ?? ''));
    $reference = strtolower(str_replace('-', '', trim($b['order_reference'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['detail'=>'Enter a valid email address.'],400);
    if (!preg_match('/^[a-f0-9]{8,32}$/', $reference)) json_response(['detail'=>'Enter a valid order reference.'],400);
    $stmt = db()->prepare("SELECT id,status,created_at,delivery_date,requested_time,delivery_method FROM orders WHERE customer_email=? AND REPLACE(LOWER(id),'-','') LIKE ? ORDER BY created_at DESC LIMIT 2");
    $stmt->execute([$email, $reference . '%']);
    $orders = $stmt->fetchAll();
    if (!$orders) json_response(['detail'=>'No order matches that reference and email.'],404);
    if (count($orders) > 1) json_response(['detail'=>'That short reference matches more than one order. Enter the full order reference.'],409);
    $order = $orders[0];
    json_response(['order'=>[
        'id'=>$order['id'],
        'status'=>$order['status'],
        'created_at'=>$order['created_at'],
        'delivery_date'=>$order['delivery_date'],
        'requested_time'=>$order['requested_time'],
        'delivery_method'=>$order['delivery_method']
    ]]);
}

if ($method === 'GET' && $apiPath === '/customer/reminders') {
    $user = require_customer();
    $stmt = db()->prepare("SELECT relationship_start_date FROM customer_reminders WHERE customer_email=?");
    $stmt->execute([$user['email']]);
    $row = $stmt->fetch();
    json_response(['relationship_start_date'=>$row['relationship_start_date'] ?? null]);
}

if ($method === 'PUT' && $apiPath === '/customer/reminders') {
    $user = require_customer();
    $b = body();
    $relationshipDate = trim($b['relationship_start_date'] ?? '');
    if ($relationshipDate !== '') {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $relationshipDate);
        if (!$date || $date->format('Y-m-d') !== $relationshipDate) {
            json_response(['detail'=>'Enter a valid relationship start date.'],400);
        }
        if ($relationshipDate > date('Y-m-d', strtotime('+1 day'))) {
            json_response(['detail'=>'The relationship start date cannot be in the future.'],400);
        }
    } else {
        $relationshipDate = null;
    }
    $stmt = db()->prepare("INSERT INTO customer_reminders (customer_email,relationship_start_date) VALUES (?,?) ON CONFLICT(customer_email) DO UPDATE SET relationship_start_date=excluded.relationship_start_date");
    $stmt->execute([$user['email'],$relationshipDate]);
    json_response(['relationship_start_date'=>$relationshipDate]);
}

// products public
if ($method === 'GET' && $apiPath === '/products') {
    $rows = db()->query("SELECT id,name,description,category,price,image,available FROM products ORDER BY created_at, name")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[] = ['id'=>$r['id'],'name'=>$r['name'],'description'=>$r['description'],'category'=>$r['category'],'price'=>(float)$r['price'],'image'=>$r['image'],'available'=>(bool)$r['available']];
    }
    json_response(['products'=>$out]);
}

if ($method === 'POST' && $apiPath === '/orders') {
    $user = require_customer();
    $b = body();
    $name = trim($b['customer_name'] ?? '');
    $phone = trim($b['customer_phone'] ?? '');
    $email = strtolower(trim($b['customer_email'] ?? ''));
    $deliveryMethod = $b['delivery_method'] ?? '';
    $address = trim($b['delivery_address'] ?? '');
    $date = trim($b['delivery_date'] ?? '');
    $requestedTime = trim($b['requested_time'] ?? '');
    $notes = trim($b['delivery_notes'] ?? '');
    $payment = $b['payment_method'] ?? '';
    $items = $b['items'] ?? [];
    if (strlen($name) < 2) json_response(['detail'=>'Invalid name'],400);
    if (strlen($phone) < 7 || strlen($phone) > 30) json_response(['detail'=>'Enter a valid phone number.'],400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['detail'=>'Invalid email'],400);
    if ($email !== $user['email']) json_response(['detail'=>'Your order email must match your signed-in customer account.'],403);
    if (!in_array($deliveryMethod, ['Delivery','Store pickup'])) json_response(['detail'=>'Invalid delivery method'],400);
    if ($deliveryMethod === 'Delivery' && $address === '') json_response(['detail'=>'A delivery address is required.'],400);
    $deliveryDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$deliveryDate || $deliveryDate->format('Y-m-d') !== $date) json_response(['detail'=>'Choose a valid delivery date.'],400);
    if ($date < date('Y-m-d')) json_response(['detail'=>'Delivery date cannot be in the past.'],400);
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $requestedTime)) json_response(['detail'=>'Choose a valid pickup or delivery time.'],400);
    if (!in_array($payment, [
        'GCash (manual confirmation)',
        'Bank transfer (manual confirmation)',
        'Credit/debit card (arrange with shop)',
        'Cash on delivery'
    ], true)) json_response(['detail'=>'Choose a payment preference.'],400);

    // aggregate quantities
    $quantities = [];
    foreach ($items as $it) {
        $id = $it['id'] ?? '';
        $q = (int)($it['quantity'] ?? 0);
        if ($q < 1 || $q > 20) json_response(['detail'=>'Invalid quantity'],400);
        $quantities[$id] = ($quantities[$id] ?? 0) + $q;
    }
    foreach ($quantities as $q) if ($q > 20) json_response(['detail'=>'Maximum quantity per product is 20.'],400);

    $pdo = db();
    $lineItems = [];
    $subtotal = 0.0;
    foreach ($quantities as $pid => $qty) {
        $stmt = $pdo->prepare("SELECT id,name,price,available FROM products WHERE id = ?");
        $stmt->execute([$pid]);
        $prod = $stmt->fetch();
        if (!$prod) json_response(['detail'=>'A product in your bag is no longer available.'],400);
        if (!$prod['available']) json_response(['detail'=>$prod['name'].' is sold out. Please remove it from your bag to continue.'],409);
        $lineTotal = (float)$prod['price'] * $qty;
        $subtotal += $lineTotal;
        $lineItems[] = ['id'=>$prod['id'],'name'=>$prod['name'],'quantity'=>$qty,'unit_price'=>(float)$prod['price'],'line_total'=>$lineTotal];
    }
    $orderId = uuid();
    $pdo->prepare("INSERT INTO orders (id,customer_name,customer_phone,customer_email,delivery_method,delivery_address,delivery_date,requested_time,delivery_notes,payment_method,items,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([$orderId,$name,$phone,$email,$deliveryMethod,$address,$date,$requestedTime,$notes,$payment,json_encode($lineItems),$subtotal]);
    json_response(['order'=>['id'=>$orderId,'status'=>'new','subtotal'=>$subtotal]],201);
}

// admin products
if ($method === 'GET' && $apiPath === '/admin/products') {
    require_admin();
    $rows = db()->query("SELECT id,name,description,category,price,image,available FROM products ORDER BY created_at DESC, name")->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[] = ['id'=>$r['id'],'name'=>$r['name'],'description'=>$r['description'],'category'=>$r['category'],'price'=>(float)$r['price'],'image'=>$r['image'],'available'=>(bool)$r['available']];
    json_response(['products'=>$out]);
}

if ($method === 'POST' && $apiPath === '/admin/products') {
    require_admin();
    $b = body();
    $name = trim($b['name'] ?? '');
    $desc = trim($b['description'] ?? '');
    $cat = $b['category'] ?? '';
    $price = (float)($b['price'] ?? 0);
    $image = $b['image'] ?? '';
    $available = isset($b['available']) ? (bool)$b['available'] : true;
    if (strlen($name) < 2) json_response(['detail'=>'Invalid name'],400);
    if (strlen($desc) < 3) json_response(['detail'=>'Invalid description'],400);
    if (!in_array($cat, ['bouquets','seasonal','subscriptions'])) json_response(['detail'=>'Invalid category'],400);
    if ($price <= 0) json_response(['detail'=>'Invalid price'],400);
    $id = uuid();
    db()->prepare("INSERT INTO products (id,name,description,category,price,image,available) VALUES (?,?,?,?,?,?,?)")
        ->execute([$id,$name,$desc,$cat,$price,$image,$available?1:0]);
    $stmt = db()->prepare("SELECT id,name,description,category,price,image,available FROM products WHERE id=?");
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    json_response(['product'=>['id'=>$r['id'],'name'=>$r['name'],'description'=>$r['description'],'category'=>$r['category'],'price'=>(float)$r['price'],'image'=>$r['image'],'available'=>(bool)$r['available']]],201);
}

// handle /admin/products/{id}
if (preg_match('#^/admin/products/([^/]+)$#', $apiPath, $mm)) {
    $pid = urldecode($mm[1]);
    if ($method === 'PUT') {
        require_admin();
        $b = body();
        $name = trim($b['name'] ?? '');
        $desc = trim($b['description'] ?? '');
        $cat = $b['category'] ?? '';
        $price = (float)($b['price'] ?? 0);
        $image = $b['image'] ?? '';
        $available = isset($b['available']) ? (bool)$b['available'] : true;
        $stmt = db()->prepare("UPDATE products SET name=?,description=?,category=?,price=?,image=?,available=? WHERE id=?");
        $stmt->execute([$name,$desc,$cat,$price,$image,$available?1:0,$pid]);
        if ($stmt->rowCount() === 0) json_response(['detail'=>'Product not found.'],404);
        $s = db()->prepare("SELECT id,name,description,category,price,image,available FROM products WHERE id=?");
        $s->execute([$pid]);
        $r = $s->fetch();
        json_response(['product'=>['id'=>$r['id'],'name'=>$r['name'],'description'=>$r['description'],'category'=>$r['category'],'price'=>(float)$r['price'],'image'=>$r['image'],'available'=>(bool)$r['available']]]);
    }
    if ($method === 'PATCH') {
        require_admin();
        $b = body();
        if (isset($b['available'])) {
            $av = (bool)$b['available'];
            $stmt = db()->prepare("UPDATE products SET available=? WHERE id=?");
            $stmt->execute([$av?1:0,$pid]);
            if ($stmt->rowCount() === 0) { /* check exists */ }
        }
        $s = db()->prepare("SELECT id,name,description,category,price,image,available FROM products WHERE id=?");
        $s->execute([$pid]);
        $r = $s->fetch();
        if (!$r) json_response(['detail'=>'Product not found.'],404);
        json_response(['product'=>['id'=>$r['id'],'name'=>$r['name'],'description'=>$r['description'],'category'=>$r['category'],'price'=>(float)$r['price'],'image'=>$r['image'],'available'=>(bool)$r['available']]]);
    }
    if ($method === 'DELETE') {
        require_admin();
        $stmt = db()->prepare("DELETE FROM products WHERE id=?");
        $stmt->execute([$pid]);
        if ($stmt->rowCount() === 0) json_response(['detail'=>'Product not found.'],404);
        http_response_code(204);
        exit;
    }
}

// admin orders
if ($method === 'GET' && $apiPath === '/admin/orders') {
    require_admin();
    $rows = db()->query("SELECT id,customer_name,customer_phone,customer_email,delivery_method,delivery_address,delivery_date,requested_time,delivery_notes,payment_method,items,subtotal,status,created_at FROM orders ORDER BY created_at DESC")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id'=>$r['id'],'customer_name'=>$r['customer_name'],'customer_phone'=>$r['customer_phone'],
            'customer_email'=>$r['customer_email'],'delivery_method'=>$r['delivery_method'],
            'delivery_address'=>$r['delivery_address'],'delivery_date'=>$r['delivery_date'],
            'requested_time'=>$r['requested_time'],
            'delivery_notes'=>$r['delivery_notes'],'payment_method'=>$r['payment_method'],
            'items'=>json_decode($r['items'],true),'subtotal'=>(float)$r['subtotal'],
            'status'=>$r['status'],'created_at'=>$r['created_at']
        ];
    }
    json_response(['orders'=>$out]);
}

if ($method === 'GET' && $apiPath === '/customer/order-notifications') {
    $user = current_user();
    if (!$user) json_response(['detail'=>'Please sign in.'],401);
    if ($user['role'] !== 'customer') json_response(['detail'=>'Customer access is required.'],403);
    $stmt = db()->prepare("SELECT id,status,created_at FROM orders WHERE customer_email=? AND status IN ('confirmed','completed') ORDER BY created_at DESC");
    $stmt->execute([$user['email']]);
    $notifications = [];
    foreach ($stmt->fetchAll() as $row) {
        $notifications[] = ['id'=>$row['id'],'status'=>$row['status'],'created_at'=>$row['created_at']];
    }
    json_response(['notifications'=>$notifications]);
}

if ($method === 'GET' && $apiPath === '/customer/orders') {
    $user = require_customer();
    $stmt = db()->prepare("SELECT id,status,created_at,delivery_method,delivery_date,requested_time,items,subtotal FROM orders WHERE customer_email=? ORDER BY created_at DESC");
    $stmt->execute([$user['email']]);
    $orders = [];
    foreach ($stmt->fetchAll() as $row) {
        $orders[] = [
            'id'=>$row['id'],
            'status'=>$row['status'],
            'created_at'=>$row['created_at'],
            'delivery_method'=>$row['delivery_method'],
            'delivery_date'=>$row['delivery_date'],
            'requested_time'=>$row['requested_time'],
            'items'=>json_decode($row['items'], true),
            'subtotal'=>(float)$row['subtotal']
        ];
    }
    json_response(['orders'=>$orders]);
}

if (preg_match('#^/admin/orders/([^/]+)$#', $apiPath, $mm) && $method === 'PATCH') {
    require_admin();
    $oid = urldecode($mm[1]);
    $b = body();
    $status = $b['status'] ?? '';
    if (!in_array($status, ['new','confirmed','completed','cancelled'])) json_response(['detail'=>'Invalid status'],400);
    $stmt = db()->prepare("UPDATE orders SET status=? WHERE id=?");
    $stmt->execute([$status,$oid]);
    if ($stmt->rowCount() === 0) json_response(['detail'=>'Order not found.'],404);
    json_response(['id'=>$oid,'status'=>$status]);
}

// fallback
json_response(['detail'=>'Not found'],404);
