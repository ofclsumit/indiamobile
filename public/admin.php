<?php
// ============================================
// ADMIN GATEWAY — Session-protected dashboard
// ============================================
session_start();

define('ADMIN_USER', 'admin');
define('ADMIN_PASS', 'admin123');

$error = null;
$loggedIn = false;

// Check login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
  if ($_POST['action'] === 'login') {
    $user = $_POST['username'] ?? '';
    $pass = $_POST['password'] ?? '';
    if ($user === ADMIN_USER && $pass === ADMIN_PASS) {
      $_SESSION['admin_auth'] = true;
      $_SESSION['admin_user'] = $user;
      $_SESSION['login_time'] = time();
      $loggedIn = true;
    } else {
      $error = 'Invalid credentials.';
    }
  }
  if ($_POST['action'] === 'logout') {
    session_destroy();
    header('Location: admin.php');
    exit;
  }
}

// Check existing session
if (isset($_SESSION['admin_auth']) && $_SESSION['admin_auth'] === true) {
  $loggedIn = true;
}

// Serve dashboard if authenticated
if ($loggedIn) {
  $dashboardFile = __DIR__ . '/dashboard.html';
  if (file_exists($dashboardFile) && is_readable($dashboardFile)) {
    $content = file_get_contents($dashboardFile);
    if ($content === false) { echo 'Error reading dashboard file.'; exit; }
    // Inject admin context into the page
    $content = str_replace(
      '</head>',
      '<meta name="admin-auth" content="1">' . "\n" .
      '</head>',
      $content
    );
    $content = str_replace(
      '</body>',
      '</body>',
      $content
    );
    echo $content;
    exit;
  } else {
    echo 'Dashboard file not found.';
    exit;
  }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Access — India Mobile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  background:var(--bg);
  color:var(--text);
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  position:relative;
  overflow:hidden;
}
body::before{
  content:'';
  position:fixed;inset:0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.06) 0%, transparent 50%);
  pointer-events:none;
}
.login-container{
  width:100%;max-width:400px;padding:24px;
  position:relative;z-index:1;
}
.login-card{
  background:var(--bg2);
  border:1px solid var(--glass-border);
  border-radius:16px;padding:40px 32px;
  backdrop-filter:blur(20px);
}
.login-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(59,130,246,0.3),transparent);
}
.login-icon{
  width:48px;height:48px;
  background:linear-gradient(135deg,#3b82f6,#6366f1);
  border-radius:12px;
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 20px;font-size:20px;color:#fff;
}
.login-title{
  font-family:'Space Grotesk',sans-serif;
  font-size:20px;font-weight:700;text-align:center;
  margin-bottom:4px;
}
.login-subtitle{
  font-size:13px;color:var(--text2);text-align:center;
  margin-bottom:28px;
}
.form-group{margin-bottom:18px;}
.form-group label{
  display:block;font-size:12px;font-weight:600;
  color:var(--text2);margin-bottom:6px;
  text-transform:uppercase;letter-spacing:0.06em;
}
.form-group input{
  width:100%;padding:11px 14px;
  background:rgba(255,255,255,0.03);
  border:1px solid rgba(255,255,255,0.07);
  border-radius:10px;color:#f1f5f9;
  font-size:14px;font-family:inherit;
  outline:none;transition:all 0.2s;
}
.form-group input:focus{
  border-color:#3b82f6;
  box-shadow:0 0 0 3px rgba(59,130,246,0.15);
  background:rgba(255,255,255,0.05);
}
.form-group input::placeholder{color:#475569;}
.login-btn{
  width:100%;padding:12px;
  background:linear-gradient(135deg,#3b82f6,#6366f1);
  border:none;border-radius:10px;
  color:#fff;font-size:14px;font-weight:600;
  cursor:pointer;transition:all 0.2s;
  font-family:inherit;
}
.login-btn:hover{
  box-shadow:0 4px 20px rgba(59,130,246,0.3);
  transform:translateY(-1px);
}
.login-error{
  background:rgba(239,68,68,0.1);
  border:1px solid rgba(239,68,68,0.2);
  color:#ef4444;font-size:13px;
  padding:10px 14px;border-radius:8px;
  margin-bottom:16px;text-align:center;
}
.login-footer{
  text-align:center;margin-top:20px;
  font-size:12px;color:#475569;
}
.login-footer a{color:#3b82f6;text-decoration:none;}
.login-footer a:hover{text-decoration:underline;}
.login-version{
  position:fixed;bottom:16px;left:50%;
  transform:translateX(-50%);
  font-size:11px;color:#334155;
}
</style>
</head>
<body>

<div class="login-container">
  <div class="login-card">
    <div class="login-icon"><i class="fas fa-shield-halved"></i></div>
    <div class="login-title">Admin Access</div>
    <div class="login-subtitle">Operations Dashboard — India Mobile</div>

    <?php if ($error): ?>
      <div class="login-error"><i class="fas fa-circle-exclamation" style="margin-right:6px;"></i><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <form method="POST" action="admin.php">
      <input type="hidden" name="action" value="login">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter your username" required autocomplete="username" autofocus>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter your password" required autocomplete="current-password">
      </div>
      <button type="submit" class="login-btn"><i class="fas fa-arrow-right-to-bracket" style="margin-right:8px;"></i>Sign In</button>
    </form>

    <div class="login-footer">
      Authorized personnel only. Unauthorized access is prohibited.
    </div>
  </div>
</div>

<div class="login-version">India Mobile v2.0 — Operations Console</div>

<div style="position:fixed;bottom:48px;left:50%;transform:translateX(-50%);font-size:11px;color:#334155;text-align:center;line-height:1.6;">
  <span style="color:#475569;">Dev Credentials:</span> Username: <span style="color:#64748b;font-weight:600;">admin</span> &nbsp;|&nbsp; Password: <span style="color:#64748b;font-weight:600;">admin123</span>
</div>

</body>
</html>
