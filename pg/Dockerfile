FROM php:8.3-apache

ENV PORT=8080

RUN sed -ri 's!Listen 80!Listen 8080!g' /etc/apache2/ports.conf \
    && sed -ri 's!<VirtualHost \*:80>!<VirtualHost *:8080>!g' /etc/apache2/sites-available/000-default.conf

COPY . /var/www/html/pg/

EXPOSE 8080
