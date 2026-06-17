<?php
// Admin Server Router — runs on port 8001
// Routes all requests to admin.php
$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

// Serve static assets directly (CSS, JS, fonts, images)
$staticExts = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'json'];
if (in_array($ext, $staticExts)) {
    return false;
}

// Serve HTML files directly
if ($ext === 'html') {
    return false;
}

// Root or any other path -> serve admin.php
require __DIR__ . '/admin.php';
return true;
