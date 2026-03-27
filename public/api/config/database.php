<?php
class Database
{
    private $host;
    private $db_name;
    private $username;
    private $password;
    public $conn;

    public function __construct() {
        // Use environment variables (from Docker) or fallback to XAMPP/Laragon defaults
        $this->host = getenv('DB_HOST') ?: "localhost";
        $this->db_name = getenv('DB_DATABASE') ?: "inventory_db";
        $this->username = getenv('DB_USERNAME') ?: "root";
        $this->password = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : "";
    }

    public function getConnection()
    {
        $this->conn = null;

        try {
            $this->conn = new PDO("mysql:host=" . $this->host . ";dbname=" . $this->db_name, $this->username, $this->password);
            $this->conn->exec("set names utf8");
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $exception) {
            // Silently fail, caller should handle null connection
        }

        return $this->conn;
    }
}
?>