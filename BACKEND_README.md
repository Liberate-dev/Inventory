# Backend Setup Instructions

Since we are using Native PHP co-located in the `public/api` folder, you need to set up a Database and a PHP Server.

## 1. Database Setup (MySQL)
1.  Open **XAMPP Control Panel** (or Laragon).
2.  Start **Apache** and **MySQL**.
3.  Go to `http://localhost/phpmyadmin`.
4.  Create a new database named: `inventory_db`.
5.  Import the schema or run the SQL commands provided in `database_structure.sql`.

## 2. API Configuration
The default database configuration is in `public/api/config/database.php`:
-   Host: `localhost`
-   User: `root`
-   Pass: `` (Empty)
-   DB: `inventory_db`

*Change these if your XAMPP settings are different.*

## 3. Testing the API
You can test if the API is reachable by accessing:
`http://localhost/projectpkl/Inventory/public/api/test.php`
(URL depends on where your project folder is inside `htdocs`. If you use `php -S`, check that URL).
