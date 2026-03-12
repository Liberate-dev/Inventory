FROM php:8.2-apache

# Install PDO MySQL extension for Native PHP Database Connections
RUN docker-php-ext-install pdo pdo_mysql

# Enable Apache mod_rewrite for API routing if needed
RUN a2enmod rewrite

# Change document root to /var/www/html (default)
WORKDIR /var/www/html
