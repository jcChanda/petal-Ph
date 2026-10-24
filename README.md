# Petal Ph

Petal Ph's storefront and shop dashboard are HTML pages styled with CSS and enhanced with JavaScript. The FastAPI backend provides secure sign-in, live inventory, checkout, order tracking, and admin features.

## Run locally on Windows

1. Install Python 3.11 or newer.
2. From the project folder, create a virtual environment and install dependencies:

   ```powershell
   py -3 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

3. In VS Code, press **F5** and select **Petal Ph (local backend)**. This starts the FastAPI backend and opens the HTML admin dashboard at `http://127.0.0.1:5500/admin`. The local admin email is `petalphofficial@gmail.com`; the generated password is printed in the VS Code terminal and saved outside the project at `%LOCALAPPDATA%\PetalPh\local-admin-password`.
4. Open `http://127.0.0.1:5500` for the storefront. Keep the VS Code task terminal running while using the local site.

Opening `index.html` or `admin.html` directly from disk only shows a static preview; the real admin dashboard, login, and order features require the backend.

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
