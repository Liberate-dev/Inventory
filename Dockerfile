FROM php:8.2-apache

# Install PDO MySQL extension for Native PHP Database Connections
RUN docker-php-ext-install pdo pdo_mysql

# Enable Apache mod_rewrite for API routing if needed
RUN a2enmod rewrite

# Set document root to the Inventory project folder (to support the subdir mount like Laragon)
# This makes http://localhost/public/api work even with volume mounted to /var/www/html/Inventory
RUN sed -i 's|DocumentRoot /var/www/html|DocumentRoot /var/www/html/Inventory|g' /etc/apache2/sites-available/000-default.conf && \
    sed -i 's|<Directory /var/www/html>|<Directory /var/www/html/Inventory>|g' /etc/apache2/sites-available/000-default.conf && \
    sed -i 's|AllowOverride None|AllowOverride All|g' /etc/apache2/sites-available/000-default.conf

# Suppress "Could not reliably determine the server's fully qualified domain name" warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

WORKDIR /var/www/html/Inventory
