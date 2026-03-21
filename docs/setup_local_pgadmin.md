# Setup pgAdmin for Docker Database (Company Exam Portal)

This guide explains how to connect your local pgAdmin to the PostgreSQL database running inside Docker for the Company Exam Portal.

## Why this setup?
Your application database runs inside a Docker container. To prevent conflicts with any native PostgreSQL installations on your Windows machine (which usually default to port `5432`), the Docker database is mapped to port **`5434`**. 

If you connect pgAdmin to `5432` by mistake, you will see an empty local database instead of your app's actual data.

## Step-by-Step Connection Guide

1. Open **pgAdmin**.
2. Right-click on **Servers** in the left sidebar.
3. Select **Register** -> **Server...**
4. In the **General** tab:
   * **Name:** `Docker CXPC (Exam Portal)` *(or any name you prefer)*
5. Switch to the **Connection** tab and enter these exact details:
   * **Host name/address:** `127.0.0.1` (or `localhost`)
   * **Port:** `5434`
   * **Maintenance database:** `cxpc` *(Do not leave this as `postgres`)*
   * **Username:** `postgres`
   * **Password:** `admin@1234`
   * **Save password:** Check the box (Optional, for convenience)
6. Click **Save**.

## How to View Your Data

Once the connection is established, follow this path in the left sidebar to see your tables and data:

1. Expand the new server: **Docker CXPC (Exam Portal)**
2. Expand **Databases**
3. Double-click the **`cxpc`** database to connect to it. *(Make sure you don't click the `postgres` database)*
4. Expand **Schemas** -> **public** -> **Tables**
5. You will now see all your app's tables (`companies`, `drives`, `students`, etc.).
6. To view the data, right-click on any table (e.g., `companies`) -> **View/Edit Data** -> **All Rows**.

## Troubleshooting
* **Connection Failed?** Ensure your Docker containers are currently running (`docker compose up -d`).
* **Tables are empty?** Double-check that you expanded the `cxpc` database and not the default `postgres` database.
