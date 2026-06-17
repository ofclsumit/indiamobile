<?php
// Public Server Router — blocks direct dashboard access on port 8000
$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);

// Block direct access to dashboard
$blocked = ['/dashboard.html', '/dashboard.css', '/dashboard.js', '/admin.php'];
if (in_array($path, $blocked)) {
    http_response_code(404);
    header('Content-Type: text/html');
    echo '<!DOCTYPE html><html><head><title>404</title><style>body{background:#0a0e1a;color:#94a3b8;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:8px;}h1{font-size:64px;font-weight:700;color:#1e293b;margin:0;}p{font-size:14px;}</style></head><body><h1>404</h1><p>The requested resource was not found.</p></body></html>';
    return true;
}

// Serve everything else normally
return false;
