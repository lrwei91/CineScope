index index.html;
charset utf-8;
gzip on;
gzip_vary on;
gzip_types text/css application/javascript application/json application/manifest+json image/svg+xml;
add_header X-Content-Type-Options nosniff always;
location ~ /\. { deny all; }
location = /manifest.webmanifest {
    types { application/manifest+json webmanifest; }
    add_header Cache-Control "public, max-age=0, must-revalidate";
}
location ~* \.(html|json)$ {
    add_header Cache-Control "public, max-age=0, must-revalidate";
    try_files $uri =404;
}
location / {
    add_header Cache-Control "public, max-age=0, must-revalidate";
    try_files $uri $uri/ =404;
}
