# Petal Ph

Petal Ph is served as a single FastAPI application so the storefront and account API share one origin.

Do not open `index.html` or `admin.html` directly as a `file://` URL. Authentication, product inventory, orders, and the dashboard API require the FastAPI server. Opening `/admin` through a local file preview is unsupported; it will show a message instead of navigating to a blocked file path. For a quick local test, run the FastAPI backend in development mode; it uses a local SQLite database. Production deployment continues to use PostgreSQL.

## Run locally on Windows

1. Install Python 3.11 or newer and make sure the Python launcher (`py`) is available in PowerShell.
2. From the project folder, create a virtual environment and install the dependencies:

   ```powershell
   py -3 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

3. Stop any static preview/Live Server that is already using port 5500. In VS Code, press **F5** and select **Petal Ph (local on 5500)**. The backend starts without an interactive prompt and prints the local admin password in the VS Code terminal. The generated password is saved in `%LOCALAPPDATA%\PetalPh\local-admin-password`, outside the project and Git, and reused on later starts, so restarting the backend will not unexpectedly change it. If you lose the password, read that file in PowerShell with `Get-Content "$env:LOCALAPPDATA\PetalPh\local-admin-password"` or remove it to generate a new one on the next start. To use your own password instead, define `ADMIN_PASSWORD` in the VS Code process environment before launching the task; it must contain at least 16 characters. VS Code opens the admin sign-in flow at `http://127.0.0.1:5500/admin`; the storefront is also available at `http://127.0.0.1:5500`.

   To start the backend manually instead, configure the local admin account in PowerShell. Choose a unique admin password with at least 16 characters:

   ```powershell
   $env:ENVIRONMENT = "development"
   $env:ADMIN_EMAIL = "petalphofficial@gmail.com"
   $securePassword = Read-Host "Choose a local admin password" -AsSecureString
   $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $secretBytes = New-Object byte[] 32
   $rng.GetBytes($secretBytes)
   $env:JWT_SECRET = [Convert]::ToBase64String($secretBytes)
   .\.venv\Scripts\python.exe -m uvicorn backend:app --reload --host 127.0.0.1 --port 5500
   ```

   Development mode uses `petal_ph_dev.db` in the project folder and automatically creates the admin account. The database and environment secrets are excluded from Git. Keep this PowerShell window open while testing.
4. Open `http://127.0.0.1:5500/admin`; if you are not signed in, the dashboard sends you to the storefront admin sign-in form. Sign in as `petalphofficial@gmail.com` with the temporary password printed in the terminal (or your configured password). To make a test customer account, choose **Account → Create account** and register with an email you control and a password of at least 12 characters.

The local SQLite database is for development/testing only. Customer accounts created locally are separate from production accounts. Do not use development mode for a public deployment.

## Deploy to Render

1. Push this project to the GitHub repository connected to your Render account.
2. In the Render Dashboard, select **New → Blueprint**, connect the repository, and select this repository's `render.yaml`.
3. Review the Blueprint resources. It creates a web service and a **paid persistent PostgreSQL database** (`basic-256mb`); review the current database price shown by Render before applying.
4. Provide `ADMIN_PASSWORD` when Render prompts for it. Use a new, unique password with at least 16 characters. Do not reuse a password shared in chat or commit it to this repository.
5. Apply the Blueprint and wait for the database and web service to finish provisioning. The Blueprint connects `DATABASE_URL` privately and generates `JWT_SECRET`.
6. Open the new `petal-ph` web service URL and use **Account → Admin** to sign in as `petalphofficial@gmail.com`.

The admin email is configured in `render.yaml`; the admin password, database URL, and JWT signing key are not stored in source code. Set `ADMIN_PASSWORD` privately in Render to a unique password of at least 16 characters. The account setup refuses to start with a missing or short admin password. Admin sessions use an eight-hour, HTTP-only, secure, same-site JWT cookie. Sign-in and sign-up requests are rate-limited.

Customer sign-up creates customer-role accounts only. To create a test customer account, open the hosted storefront, choose **Account → Create account**, and register with an email and password you control; customer accounts cannot access `/admin`. The admin dashboard at `/admin` can review customer orders and delivery details, update order statuses, add or remove products, edit product names, descriptions, categories, PHP prices, and images, upload new PNG/JPEG/WebP product photos up to 5 MB, and mark products available or sold out. Uploaded images are validated, resized, and stored with generated filenames in the assets directory. Prices display in Philippine pesos (₱); existing price amounts are unchanged. Customer orders are stored in PostgreSQL with a snapshot of product names and prices. Admin-only order APIs include customer delivery details; they require an admin session. The storefront does not collect payment or card details; payment is arranged directly with the shop.

Customers must sign in or create a customer account before checkout; the checkout form stays hidden until they sign in, and their bag is preserved. Checkout uses their account email. The server also requires a customer session and verifies that the order email matches the signed-in account. A signed-in customer's profile shows their relationship start date, purchase history, order references, and order statuses, with a shortcut to track each order. The storefront landing page also includes order tracking: customers enter the full order reference from checkout and the email address used for the order to see its current status and preferred pickup or delivery date and time. Checkout requires the customer to provide a requested date and exact time. Customers can also see an in-page notification when the admin changes an order to **Confirmed** (received and being processed) or **Completed** (processed); they must sign in to the storefront with the same email address used for the order. The account dialog shows those order updates, and new status updates are checked while the customer is signed in and the storefront page is visible.

Customers who sign in can save a relationship start date in their account for recurring monthly monthiversary reminders. The storefront also shows an in-app Valentine’s Day reminder from February 7 through February 14. Monthiversary reminders appear during the seven days leading up to the monthly date and on that date. These are in-app reminders; email and SMS alerts are not configured.
