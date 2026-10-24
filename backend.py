import json
import io
import logging
import os
import re
import secrets
import sqlite3
import unicodedata
import warnings
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import jwt
import psycopg
from PIL import Image, ImageOps, UnidentifiedImageError
from psycopg.types.json import Jsonb
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pwdlib import PasswordHash
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


ROOT = Path(__file__).resolve().parent
LOGGER = logging.getLogger(__name__)
PASSWORD_HASHER = PasswordHash.recommended()
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SESSION_COOKIE = "petal_ph_session"
SESSION_LIFETIME = timedelta(hours=8)
MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PRODUCT_IMAGE_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_PRODUCT_IMAGE_PIXELS


class Settings:
    def __init__(self) -> None:
        self.environment = os.environ.get("ENVIRONMENT", "production").lower()
        self.database_url = os.environ.get(
            "DATABASE_URL",
            "sqlite:///petal_ph_dev.db" if self.environment == "development" else "",
        )
        self.jwt_secret = os.environ.get("JWT_SECRET", "")
        if not self.jwt_secret and self.environment == "development":
            self.jwt_secret = secrets.token_urlsafe(32)
        self.admin_email = os.environ.get(
            "ADMIN_EMAIL",
            "petalphofficial@gmail.com" if self.environment == "development" else "",
        ).strip().lower()
        self.admin_password = os.environ.get("ADMIN_PASSWORD", "")

    def validate(self) -> None:
        is_sqlite = self.database_url.startswith("sqlite:///")
        if is_sqlite and self.environment != "development":
            raise RuntimeError("SQLite may only be used with ENVIRONMENT=development.")
        if not is_sqlite and not self.database_url.startswith(("postgres://", "postgresql://")):
            raise RuntimeError(
                "Set DATABASE_URL to a PostgreSQL connection URL, or use SQLite with ENVIRONMENT=development."
            )
        if len(self.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET must contain at least 32 characters.")
        if not EMAIL_PATTERN.fullmatch(self.admin_email):
            raise RuntimeError("ADMIN_EMAIL must be a valid email address.")
        if len(self.admin_password) < 16:
            raise RuntimeError(
                "ADMIN_PASSWORD must be at least 16 characters. Set it privately in your environment."
            )


settings: Settings | None = None


class SQLiteConnection:
    def __init__(self, database_path: Path) -> None:
        self.connection = sqlite3.connect(database_path, timeout=10)

    def __enter__(self):
        return self

    def __exit__(self, exception_type, exception, traceback) -> bool:
        try:
            if exception_type is None:
                self.connection.commit()
            else:
                self.connection.rollback()
        finally:
            self.connection.close()
        return False

    def execute(self, query: str, parameters: tuple = ()):
        query = re.sub(r"%s(?:::jsonb)?", "?", query)
        query = re.sub(r"\s+FOR UPDATE\b", "", query, flags=re.IGNORECASE)
        sqlite_parameters = tuple(
            str(value) if isinstance(value, Decimal) else value
            for value in parameters
        )
        return self.connection.execute(query, sqlite_parameters)


def connect_database():
    if settings is None:
        raise RuntimeError("The account service has not finished starting.")
    if settings.database_url.startswith("sqlite:///"):
        database_path = Path(settings.database_url.removeprefix("sqlite:///"))
        if not database_path.is_absolute():
            database_path = ROOT / database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
        return SQLiteConnection(database_path)
    return psycopg.connect(settings.database_url, sslmode="require")


def initialize_database() -> None:
    if settings is None:
        raise RuntimeError("The account service configuration is missing.")
    admin_hash = PASSWORD_HASHER.hash(settings.admin_password)
    with connect_database() as connection:
        if settings.database_url.startswith("sqlite:///"):
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    category TEXT NOT NULL,
                    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
                    image TEXT NOT NULL,
                    available INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS orders (
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
                    subtotal NUMERIC(10, 2) NOT NULL,
                    status TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'confirmed', 'completed', 'cancelled')),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS customer_reminders (
                    customer_email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
                    relationship_start_date TEXT
                )
                """
            )
        else:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    category TEXT NOT NULL,
                    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
                    image TEXT NOT NULL,
                    available BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS orders (
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
                    items JSONB NOT NULL,
                    subtotal NUMERIC(10, 2) NOT NULL,
                    status TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'confirmed', 'completed', 'cancelled')),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS customer_reminders (
                    customer_email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
                    relationship_start_date DATE
                )
                """
            )
        if settings.database_url.startswith("sqlite:///"):
            order_columns = connection.execute("PRAGMA table_info(orders)").fetchall()
            has_requested_time = any(column[1] == "requested_time" for column in order_columns)
            if not has_requested_time:
                connection.execute(
                    "ALTER TABLE orders ADD COLUMN requested_time TEXT NOT NULL DEFAULT ''"
                )
        else:
            connection.execute(
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS requested_time TEXT NOT NULL DEFAULT ''"
            )
        connection.execute(
            """
            INSERT INTO users (email, password_hash, role)
            VALUES (%s, %s, 'admin')
            ON CONFLICT (email) DO UPDATE
            SET password_hash = EXCLUDED.password_hash, role = 'admin'
            """,
            (settings.admin_email, admin_hash),
        )
        starter_products = [
            ("sunday-garden", "Sunday in the Garden", "Garden rose, sweet pea & seasonal greens", "bouquets", 68, "assets/sunday-in-the-garden.png"),
            ("a-little-wild", "A Little Wild", "A flower-filled surprise, wrapped up with love", "seasonal", 54, "assets/little-wild-bouquet.png"),
            ("money-bouquet", "Money Bouquet", "A hand-arranged flower bouquet with a thoughtful cash gift", "bouquets", 54, "assets/money-bouquet.png"),
            ("berry", "Berry", "A bold red seasonal rose bouquet wrapped in crimson", "seasonal", 899, "assets/berry-bouquet.png"),
            ("lady-monroe", "Lady Monroe", "A romantic red rose bouquet with a white orchid in a keepsake box", "seasonal", 1000, "assets/lady-monroe.png"),
            ("golden-hour", "The Golden Hour", "Velvety blue roses in a statement arrangement", "bouquets", 72, "assets/blue-roses.jpg"),
            ("friday-flowers", "Flowers, Every Friday", "Classic ivory roses with a soft, lovely finish", "subscriptions", 48, "assets/white-roses.jpg"),
            ("sunny-days-subscription", "Sunny Days Subscription", "A sunny mix of sunflowers and white blooms for your flower subscription", "subscriptions", 1500, "assets/sunny-days-subscription.png"),
        ]
        for product in starter_products:
            connection.execute(
                """
                INSERT INTO products (id, name, description, category, price, image)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                product,
            )
        connection.execute(
            "UPDATE products SET image = %s WHERE id = %s AND image = %s",
            ("assets/little-wild-bouquet.png", "a-little-wild", "assets/money-bouquet.jpg"),
        )
        connection.execute(
            "UPDATE products SET image = %s WHERE id = %s AND image = %s",
            ("assets/sunday-in-the-garden.png", "sunday-garden", "assets/flower-menu.jpg"),
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    global settings
    settings = Settings()
    settings.validate()
    initialize_database()
    yield


app = FastAPI(title="Petal Ph", lifespan=lifespan)
app.state.limiter = Limiter(key_func=get_remote_address)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")


@app.middleware("http")
async def set_security_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
    return response


class Credentials(BaseModel):
    email: Annotated[str, Field(min_length=3, max_length=254)]
    password: Annotated[str, Field(min_length=1, max_length=256)]

    @field_validator("email")
    @classmethod
    def normalize_and_validate_email(cls, email: str) -> str:
        normalized = email.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class ProductInput(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=100)]
    description: Annotated[str, Field(min_length=3, max_length=500)]
    category: Annotated[str, Field(pattern=r"^(bouquets|seasonal|subscriptions)$")]
    price: Annotated[float, Field(gt=0, le=1000000)]
    image: Annotated[str, Field(pattern=r"^assets/[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$")]
    available: bool = True

    @field_validator("name", "description")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class ProductAvailability(BaseModel):
    available: bool


class OrderStatusInput(BaseModel):
    status: Annotated[str, Field(pattern=r"^(new|confirmed|completed|cancelled)$")]


class OrderTrackingInput(BaseModel):
    order_reference: Annotated[str, Field(min_length=8, max_length=36)]
    customer_email: Annotated[str, Field(min_length=3, max_length=254)]

    @field_validator("order_reference")
    @classmethod
    def normalize_order_reference(cls, reference: str) -> str:
        normalized = reference.strip().lower().replace("-", "")
        if not re.fullmatch(r"[0-9a-f]{8,32}", normalized):
            raise ValueError("Enter a valid order reference.")
        return normalized

    @field_validator("customer_email")
    @classmethod
    def normalize_tracking_email(cls, email: str) -> str:
        normalized = email.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class CustomerReminderInput(BaseModel):
    relationship_start_date: date | None = None

    @field_validator("relationship_start_date")
    @classmethod
    def validate_relationship_start_date(cls, value: date | None) -> date | None:
        if value and value > date.today() + timedelta(days=1):
            raise ValueError("The relationship start date cannot be in the future.")
        return value


class OrderItemInput(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=80)]
    quantity: Annotated[int, Field(ge=1, le=20)]


class OrderInput(BaseModel):
    customer_name: Annotated[str, Field(min_length=2, max_length=100)]
    customer_phone: Annotated[str, Field(min_length=7, max_length=30)]
    customer_email: Annotated[str, Field(min_length=3, max_length=254)]
    delivery_method: Annotated[str, Field(pattern=r"^(Delivery|Store pickup)$")]
    delivery_address: Annotated[str, Field(max_length=500)]
    delivery_date: Annotated[str, Field(min_length=1, max_length=20)]
    requested_time: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
    delivery_notes: Annotated[str, Field(max_length=500)] = ""
    payment_method: Annotated[str, Field(pattern=r"^(GCash \(manual confirmation\)|Bank transfer \(manual confirmation\)|Credit/debit card \(arrange with shop\)|Cash on delivery)$")]
    items: Annotated[list[OrderItemInput], Field(min_length=1, max_length=50)]

    @field_validator("customer_email")
    @classmethod
    def normalize_customer_email(cls, email: str) -> str:
        normalized = email.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("customer_name", "customer_phone", "delivery_address", "delivery_notes")
    @classmethod
    def trim_order_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("delivery_date")
    @classmethod
    def validate_delivery_date(cls, value: str) -> str:
        try:
            parsed_date = date.fromisoformat(value)
        except ValueError:
            raise ValueError("Choose a valid delivery date.") from None
        if parsed_date.isoformat() != value:
            raise ValueError("Choose a valid delivery date.")
        if parsed_date < date.today():
            raise ValueError("Delivery date cannot be in the past.")
        return value

    @field_validator("delivery_address")
    @classmethod
    def require_address_for_delivery(cls, value: str, info) -> str:
        if info.data.get("delivery_method") == "Delivery" and not value:
            raise ValueError("A delivery address is required.")
        return value


def create_session_token(email: str, role: str) -> str:
    if settings is None:
        raise RuntimeError("The account service is not configured.")
    now = datetime.now(timezone.utc)
    claims = {
        "sub": email,
        "role": role,
        "iat": now,
        "exp": now + SESSION_LIFETIME,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def set_session_cookie(response: Response, email: str, role: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(email, role),
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        secure=settings is not None and settings.environment != "development",
        samesite="strict",
        path="/",
    )


def get_authenticated_user(request: Request) -> dict[str, str]:
    if settings is None:
        raise HTTPException(status_code=503, detail="Account service is unavailable.")
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in.")
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in.") from None

    email = claims.get("sub")
    role = claims.get("role")
    if not isinstance(email, str) or role not in ("customer", "admin"):
        raise HTTPException(status_code=401, detail="Your session is invalid. Please sign in.")
    return {"email": email, "role": role}


@app.get("/")
def storefront() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
@app.state.limiter.limit("5/hour")
def register(request: Request, credentials: Credentials, response: Response) -> dict[str, dict[str, str]]:
    if len(credentials.password) < 12:
        raise HTTPException(
            status_code=400,
            detail="Choose a password with at least 12 characters.",
        )
    password_hash = PASSWORD_HASHER.hash(credentials.password)
    with connect_database() as connection:
        result = connection.execute(
            """
            INSERT INTO users (email, password_hash, role)
            VALUES (%s, %s, 'customer')
            ON CONFLICT (email) DO NOTHING
            RETURNING email, role
            """,
            (credentials.email, password_hash),
        ).fetchone()
    if result is None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    set_session_cookie(response, result[0], result[1])
    return {"user": {"email": result[0], "role": result[1]}}


@app.post("/api/auth/login")
@app.state.limiter.limit("5/minute")
def login(request: Request, credentials: Credentials, response: Response) -> dict[str, dict[str, str]]:
    with connect_database() as connection:
        user = connection.execute(
            "SELECT email, password_hash, role FROM users WHERE email = %s",
            (credentials.email,),
        ).fetchone()
    if user is None or not PASSWORD_HASHER.verify(credentials.password, user[1]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    set_session_cookie(response, user[0], user[2])
    return {"user": {"email": user[0], "role": user[2]}}


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(
        key=SESSION_COOKIE,
        httponly=True,
        secure=settings is not None and settings.environment != "development",
        samesite="strict",
        path="/",
    )
    return {"status": "signed out"}


@app.get("/api/auth/me")
def current_session(request: Request) -> dict[str, dict[str, str] | None]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return {"user": None}
    return {"user": get_authenticated_user(request)}


@app.get("/api/admin")
def admin_session(user: Annotated[dict[str, str], Depends(get_authenticated_user)]) -> dict[str, str]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access is required.")
    return {"email": user["email"], "role": user["role"]}


def require_admin(
    user: Annotated[dict[str, str], Depends(get_authenticated_user)],
) -> dict[str, str]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access is required.")
    return user


def require_customer(
    user: Annotated[dict[str, str], Depends(get_authenticated_user)],
) -> dict[str, str]:
    if user["role"] != "customer":
        raise HTTPException(status_code=403, detail="Customer access is required.")
    return user


def product_response(row) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "category": row[3],
        "price": float(row[4]),
        "image": row[5],
        "available": row[6],
    }


@app.get("/api/products")
def list_products() -> dict[str, list[dict]]:
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, name, description, category, price, image, available
            FROM products ORDER BY created_at, name
            """
        ).fetchall()
    return {"products": [product_response(row) for row in rows]}


@app.post("/api/orders", status_code=status.HTTP_201_CREATED)
@app.state.limiter.limit("10/hour")
def create_order(
    request: Request,
    order: OrderInput,
    user: Annotated[dict[str, str], Depends(require_customer)],
) -> dict:
    if order.customer_email != user["email"]:
        raise HTTPException(status_code=403, detail="Your order email must match your signed-in customer account.")
    if order.delivery_method == "Delivery" and not order.delivery_address:
        raise HTTPException(status_code=400, detail="A delivery address is required.")

    quantities: dict[str, int] = {}
    for item in order.items:
        quantities[item.id] = quantities.get(item.id, 0) + item.quantity
    if any(quantity > 20 for quantity in quantities.values()):
        raise HTTPException(status_code=400, detail="Maximum quantity per product is 20.")

    order_id = str(uuid4())
    line_items = []
    subtotal = Decimal("0.00")
    with connect_database() as connection:
        for product_id, quantity in quantities.items():
            product = connection.execute(
                """
                SELECT id, name, price, available
                FROM products WHERE id = %s FOR UPDATE
                """,
                (product_id,),
            ).fetchone()
            if product is None:
                raise HTTPException(status_code=400, detail="A product in your bag is no longer available.")
            if not product[3]:
                raise HTTPException(
                    status_code=409,
                    detail=f"{product[1]} is sold out. Please remove it from your bag to continue.",
                )
            line_total = Decimal(str(product[2])) * quantity
            subtotal += line_total
            line_items.append({
                "id": product[0],
                "name": product[1],
                "quantity": quantity,
                "unit_price": float(product[2]),
                "line_total": float(line_total),
            })

        connection.execute(
            """
            INSERT INTO orders (
                id, customer_name, customer_phone, customer_email,
                delivery_method, delivery_address, delivery_date, requested_time, delivery_notes,
                payment_method, items, subtotal
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s
            )
            """,
            (
                order_id,
                order.customer_name,
                order.customer_phone,
                order.customer_email,
                order.delivery_method,
                order.delivery_address,
                order.delivery_date,
                order.requested_time,
                order.delivery_notes,
                order.payment_method,
                (
                    json.dumps(line_items)
                    if settings is not None and settings.database_url.startswith("sqlite:///")
                    else Jsonb(line_items)
                ),
                subtotal,
            ),
        )
    return {"order": {"id": order_id, "status": "new", "subtotal": float(subtotal)}}


@app.post("/api/orders/track")
@app.state.limiter.limit("10/hour")
def track_order(request: Request, tracking: OrderTrackingInput) -> dict[str, dict]:
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, status, created_at, delivery_date, requested_time, delivery_method
            FROM orders
            WHERE customer_email = %s
              AND REPLACE(LOWER(id), '-', '') LIKE %s
            ORDER BY created_at DESC
            LIMIT 2
            """,
            (tracking.customer_email, f"{tracking.order_reference}%"),
        ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No order matches that reference and email.")
    if len(rows) > 1:
        raise HTTPException(
            status_code=409,
            detail="That short reference matches more than one order. Enter the full order reference.",
        )
    row = rows[0]
    return {
        "order": {
            "id": row[0],
            "status": row[1],
            "created_at": row[2].isoformat() if hasattr(row[2], "isoformat") else row[2],
            "delivery_date": row[3],
            "requested_time": row[4],
            "delivery_method": row[5],
        }
    }


@app.get("/admin")
def admin_dashboard() -> FileResponse:
    return FileResponse(ROOT / "admin.html")


@app.get("/api/customer/order-notifications")
def customer_order_notifications(
    user: Annotated[dict[str, str], Depends(require_customer)],
) -> dict[str, list[dict[str, str]]]:
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, status, created_at
            FROM orders
            WHERE customer_email = %s AND status IN ('confirmed', 'completed')
            ORDER BY created_at DESC
            """,
            (user["email"],),
        ).fetchall()
    return {
        "notifications": [
            {
                "id": row[0],
                "status": row[1],
                "created_at": row[2].isoformat() if hasattr(row[2], "isoformat") else row[2],
            }
            for row in rows
        ]
    }


@app.get("/api/customer/orders")
def customer_orders(
    user: Annotated[dict[str, str], Depends(require_customer)],
) -> dict[str, list[dict]]:
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, status, created_at, delivery_method, delivery_date,
                   requested_time, items, subtotal
            FROM orders
            WHERE customer_email = %s
            ORDER BY created_at DESC
            """,
            (user["email"],),
        ).fetchall()
    return {
        "orders": [
            {
                "id": row[0],
                "status": row[1],
                "created_at": row[2].isoformat() if hasattr(row[2], "isoformat") else row[2],
                "delivery_method": row[3],
                "delivery_date": row[4],
                "requested_time": row[5],
                "items": json.loads(row[6]) if isinstance(row[6], str) else row[6],
                "subtotal": float(row[7]),
            }
            for row in rows
        ]
    }


@app.get("/api/customer/reminders")
def get_customer_reminders(
    user: Annotated[dict[str, str], Depends(require_customer)],
) -> dict[str, str | None]:
    with connect_database() as connection:
        row = connection.execute(
            "SELECT relationship_start_date FROM customer_reminders WHERE customer_email = %s",
            (user["email"],),
        ).fetchone()
    relationship_start_date = row[0] if row else None
    return {
        "relationship_start_date": (
            relationship_start_date.isoformat()
            if hasattr(relationship_start_date, "isoformat")
            else relationship_start_date
        )
    }


@app.put("/api/customer/reminders")
def save_customer_reminders(
    reminders: CustomerReminderInput,
    user: Annotated[dict[str, str], Depends(require_customer)],
) -> dict[str, str | None]:
    relationship_start_date = reminders.relationship_start_date
    with connect_database() as connection:
        connection.execute(
            """
            INSERT INTO customer_reminders (customer_email, relationship_start_date)
            VALUES (%s, %s)
            ON CONFLICT (customer_email) DO UPDATE
            SET relationship_start_date = EXCLUDED.relationship_start_date
            """,
            (user["email"], relationship_start_date),
        )
    return {
        "relationship_start_date": (
            relationship_start_date.isoformat() if relationship_start_date else None
        )
    }


@app.get("/api/admin/products")
def admin_products(_: Annotated[dict[str, str], Depends(require_admin)]) -> dict[str, list[dict]]:
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, name, description, category, price, image, available
            FROM products ORDER BY created_at DESC, name
            """
        ).fetchall()
    return {"products": [product_response(row) for row in rows]}


@app.post("/api/admin/images", status_code=status.HTTP_201_CREATED)
@app.state.limiter.limit("20/hour")
async def upload_product_image(
    request: Request,
    image: Annotated[UploadFile, File()],
    product_name: Annotated[str, Form(min_length=2, max_length=100)],
    _: Annotated[dict[str, str], Depends(require_admin)],
) -> dict[str, str]:
    image_bytes = await image.read(MAX_PRODUCT_IMAGE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Choose an image to upload.")
    if len(image_bytes) > MAX_PRODUCT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Product images must be 5 MB or smaller.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                image_format = source_image.format
                source_image.verify()
            if image_format not in {"PNG", "JPEG", "WEBP"}:
                raise HTTPException(
                    status_code=415,
                    detail="Upload a PNG, JPEG, or WebP image.",
                )

            with Image.open(io.BytesIO(image_bytes)) as source_image:
                if source_image.width * source_image.height > MAX_PRODUCT_IMAGE_PIXELS:
                    raise HTTPException(
                        status_code=400,
                        detail="Image dimensions must be 20 megapixels or smaller.",
                    )
                clean_image = ImageOps.exif_transpose(source_image)
                clean_image.thumbnail((3000, 3000), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                if image_format == "JPEG":
                    clean_image.convert("RGB").save(output, format="JPEG", quality=88, optimize=True)
                    extension = "jpg"
                elif image_format == "WEBP":
                    if clean_image.mode not in ("RGB", "RGBA"):
                        clean_image = clean_image.convert("RGBA")
                    clean_image.save(output, format="WEBP", quality=88, method=6)
                    extension = "webp"
                else:
                    if clean_image.mode not in ("RGB", "RGBA"):
                        clean_image = clean_image.convert("RGBA")
                    clean_image.save(output, format="PNG", optimize=True)
                    extension = "png"
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="The selected file is not a valid supported image.",
        ) from None

    normalized_name = unicodedata.normalize("NFKD", product_name.strip().lower())
    ascii_name = normalized_name.encode("ascii", "ignore").decode("ascii")
    image_slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")[:80].rstrip("-") or "product"
    image_data = output.getvalue()
    suffix = 1
    while True:
        numbered_slug = image_slug if suffix == 1 else f"{image_slug}-{suffix}"
        image_name = f"{numbered_slug}.{extension}"
        image_path = ROOT / "assets" / image_name
        try:
            with image_path.open("xb") as image_file:
                image_file.write(image_data)
            break
        except FileExistsError:
            suffix += 1
    return {"image": f"assets/{image_name}"}


@app.post("/api/admin/products", status_code=status.HTTP_201_CREATED)
@app.state.limiter.limit("20/hour")
def add_product(
    request: Request,
    product: ProductInput,
    _: Annotated[dict[str, str], Depends(require_admin)],
) -> dict[str, dict]:
    product_id = str(uuid4())
    with connect_database() as connection:
        row = connection.execute(
            """
            INSERT INTO products (id, name, description, category, price, image, available)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, description, category, price, image, available
            """,
            (
                product_id, product.name, product.description, product.category,
                product.price, product.image, product.available,
            ),
        ).fetchone()
    return {"product": product_response(row)}


@app.put("/api/admin/products/{product_id}")
def update_product(
    product_id: str,
    product: ProductInput,
    _: Annotated[dict[str, str], Depends(require_admin)],
) -> dict[str, dict]:
    with connect_database() as connection:
        row = connection.execute(
            """
            UPDATE products
            SET name = %s, description = %s, category = %s, price = %s, image = %s
            WHERE id = %s
            RETURNING id, name, description, category, price, image, available
            """,
            (
                product.name, product.description, product.category,
                product.price, product.image, product_id,
            ),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return {"product": product_response(row)}


@app.patch("/api/admin/products/{product_id}")
def set_product_availability(
    product_id: str,
    availability: ProductAvailability,
    _: Annotated[dict[str, str], Depends(require_admin)],
) -> dict[str, dict]:
    with connect_database() as connection:
        row = connection.execute(
            """
            UPDATE products SET available = %s WHERE id = %s
            RETURNING id, name, description, category, price, image, available
            """,
            (availability.available, product_id),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return {"product": product_response(row)}


@app.delete("/api/admin/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_product(
    product_id: str,
    _: Annotated[dict[str, str], Depends(require_admin)],
) -> Response:
    with connect_database() as connection:
        result = connection.execute("DELETE FROM products WHERE id = %s", (product_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Product not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/admin/orders")
def admin_orders(_: Annotated[dict[str, str], Depends(require_admin)]) -> dict[str, list[dict]]:
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, customer_name, customer_phone, customer_email,
                   delivery_method, delivery_address, delivery_date,
                   requested_time, delivery_notes, payment_method, items, subtotal, status,
                   created_at
            FROM orders ORDER BY created_at DESC
            """
        ).fetchall()
    return {
        "orders": [
            {
                "id": row[0],
                "customer_name": row[1],
                "customer_phone": row[2],
                "customer_email": row[3],
                "delivery_method": row[4],
                "delivery_address": row[5],
                "delivery_date": row[6],
                "requested_time": row[7],
                "delivery_notes": row[8],
                "payment_method": row[9],
                "items": json.loads(row[10]) if isinstance(row[10], str) else row[10],
                "subtotal": float(row[11]),
                "status": row[12],
                "created_at": row[13].isoformat() if hasattr(row[13], "isoformat") else row[13],
            }
            for row in rows
        ]
    }


@app.patch("/api/admin/orders/{order_id}")
def update_order_status(
    order_id: str,
    update: OrderStatusInput,
    _: Annotated[dict[str, str], Depends(require_admin)],
) -> dict[str, str]:
    with connect_database() as connection:
        row = connection.execute(
            """
            UPDATE orders SET status = %s WHERE id = %s
            RETURNING id, status
            """,
            (update.status, order_id),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {"id": row[0], "status": row[1]}
