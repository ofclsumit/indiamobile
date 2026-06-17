<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$dataDir = __DIR__ . '/../data';
$otpFile = $dataDir . '/otps.json';
$counterFile = $dataDir . '/sms-counter.json';
$configFile = $dataDir . '/sms-config.json';
$outboxFile = $dataDir . '/sms-outbox.json';

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function loadConfig() {
    global $configFile;
    $default = [
        'driver' => 'log',
        'fast2sms_api_key' => '',
        'fast2sms_sender_id' => 'FTWSMS',
        'msg91_auth_key' => '',
        'msg91_sender_id' => 'MSGIND',
        'otp_length' => 6,
        'otp_expiry' => 300,
        'daily_limit' => 100,
        'sms_template' => 'Your OTP for Aadhaar Booking is {otp}. Valid for {expiry} minutes. - India Mobile Center'
    ];
    if (!file_exists(dirname($configFile))) mkdir(dirname($configFile), 0755, true);
    if (!file_exists($configFile)) {
        file_put_contents($configFile, json_encode($default, JSON_PRETTY_PRINT));
        return $default;
    }
    return array_merge($default, json_decode(file_get_contents($configFile), true) ?: []);
}

function loadOTPs() {
    global $otpFile;
    if (!file_exists($otpFile)) return [];
    return json_decode(file_get_contents($otpFile), true) ?: [];
}

function saveOTPs($otps) {
    global $otpFile;
    file_put_contents($otpFile, json_encode($otps, JSON_PRETTY_PRINT), LOCK_EX);
}

function getDailyCounter() {
    global $counterFile;
    $today = date('Y-m-d');
    if (!file_exists($counterFile)) {
        $counter = ['date' => $today, 'count' => 0];
        file_put_contents($counterFile, json_encode($counter, JSON_PRETTY_PRINT));
        return $counter;
    }
    $counter = json_decode(file_get_contents($counterFile), true) ?: ['date' => $today, 'count' => 0];
    if ($counter['date'] !== $today) {
        $counter = ['date' => $today, 'count' => 0];
        file_put_contents($counterFile, json_encode($counter, JSON_PRETTY_PRINT));
    }
    return $counter;
}

function incrementCounter() {
    global $counterFile;
    $counter = getDailyCounter();
    $counter['count']++;
    file_put_contents($counterFile, json_encode($counter, JSON_PRETTY_PRINT), LOCK_EX);
    return $counter;
}

function hashOTP($otp) {
    return hash('sha256', 'DS_OTP_SALT_2026_' . $otp);
}

function sendSMS($phone, $message) {
    $config = loadConfig();
    $driver = $config['driver'];

    if ($driver === 'fast2sms') {
        return sendFast2SMS($phone, $message, $config);
    } elseif ($driver === 'msg91') {
        return sendMSG91($phone, $message, $config);
    } elseif ($driver === 'adb') {
        return queueADB($phone, $message);
    } else {
        return logSMS($phone, $message);
    }
}

function sendFast2SMS($phone, $message, $config) {
    $apiKey = $config['fast2sms_api_key'] ?? '';
    if (!$apiKey) return ['success' => false, 'message' => 'Fast2SMS API key not configured in settings'];

    $postData = http_build_query([
        'sender_id' => $config['fast2sms_sender_id'] ?? 'FTWSMS',
        'message' => $message,
        'language' => 'english',
        'route' => 'q',
        'numbers' => $phone,
    ]);

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "authorization: $apiKey\r\nContent-Type: application/x-www-form-urlencoded\r\n",
            'content' => $postData,
            'timeout' => 15,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ]
    ]);

    $response = @file_get_contents('https://www.fast2sms.com/dev/bulkV2', false, $context);

    if ($response === false) {
        $error = error_get_last();
        return ['success' => false, 'message' => 'Fast2SMS connection failed: ' . ($error['message'] ?? 'unknown')];
    }

    $result = json_decode($response, true);
    if (($result['return'] ?? false)) {
        return ['success' => true, 'message' => 'SMS sent via Fast2SMS'];
    }
    $errMsg = $result['message'] ?? ($result['reason'] ?? 'Fast2SMS API error');
    return ['success' => false, 'message' => $errMsg];
}

function sendMSG91($phone, $message, $config) {
    $authKey = $config['msg91_auth_key'] ?? '';
    $senderId = $config['msg91_sender_id'] ?? 'MSGIND';
    if (!$authKey) return ['success' => false, 'message' => 'MSG91 Auth Key not configured'];

    $postData = json_encode([
        'sender' => $senderId,
        'route' => '4',
        'country' => '91',
        'sms' => [
            [
                'message' => $message,
                'to' => [$phone]
            ]
        ]
    ]);

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "authkey: $authKey\r\nContent-Type: application/json\r\n",
            'content' => $postData,
            'timeout' => 15,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ]
    ]);

    $response = @file_get_contents('https://api.msg91.com/api/v2/sendsms', false, $context);

    if ($response === false) {
        $error = error_get_last();
        return ['success' => false, 'message' => 'MSG91 connection failed: ' . ($error['message'] ?? 'unknown')];
    }

    $result = json_decode($response, true);
    $type = $result['type'] ?? '';

    if ($type === 'success') {
        return ['success' => true, 'message' => 'SMS sent via MSG91'];
    }

    $errMsg = $result['message'] ?? ($response);
    return ['success' => false, 'message' => 'MSG91: ' . (is_string($errMsg) ? $errMsg : json_encode($errMsg))];
}

function queueADB($phone, $message) {
    global $outboxFile;
    $outbox = [];
    if (file_exists($outboxFile)) {
        $outbox = json_decode(file_get_contents($outboxFile), true) ?: [];
    }
    $outbox[] = [
        'id' => uniqid('sms_', true),
        'phone' => $phone,
        'message' => $message,
        'created_at' => date('c'),
        'sent' => false,
        'attempts' => 0
    ];
    $outbox = array_slice($outbox, -200);
    file_put_contents($outboxFile, json_encode($outbox, JSON_PRETTY_PRINT), LOCK_EX);
    return ['success' => true, 'message' => 'SMS queued for phone delivery'];
}

function logSMS($phone, $message) {
    $logFile = __DIR__ . '/../data/sms-log.txt';
    $dir = dirname($logFile);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($logFile, date('c') . " | TO: $phone | MSG: $message\n", FILE_APPEND | LOCK_EX);
    return ['success' => true, 'message' => 'SMS logged (demo mode)'];
}

function cleanupExpiredOTPs() {
    $otps = loadOTPs();
    $now = time();
    $otps = array_filter($otps, function($o) use ($now) {
        return ($o['expires_at'] ?? 0) > $now && ($o['attempts'] ?? 0) < ($o['max_attempts'] ?? 3);
    });
    saveOTPs(array_values($otps));
}

// ============================================
// ROUTES
// ============================================

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'status') {
    $config = loadConfig();
    $counter = getDailyCounter();
    jsonResponse([
        'success' => true,
        'today' => $counter['count'],
        'limit' => $config['daily_limit'],
        'remaining' => max(0, $config['daily_limit'] - $counter['count']),
        'driver' => $config['driver'],
        'otp_length' => (int)$config['otp_length'],
        'otp_expiry' => (int)$config['otp_expiry']
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_config') {
    $config = loadConfig();
    unset($config['fast2sms_api_key']);
    jsonResponse(['success' => true, 'config' => $config]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

// Handle config save posted from dashboard
if (!empty($input['_saveConfig']) && !empty($input['config'])) {
    $newConfig = $input['config'];
    $allowed = ['driver', 'fast2sms_api_key', 'fast2sms_sender_id', 'msg91_auth_key', 'msg91_sender_id', 'otp_length', 'otp_expiry', 'daily_limit', 'sms_template'];
    $current = loadConfig();
    foreach ($allowed as $key) {
        if (isset($newConfig[$key])) {
            $current[$key] = $newConfig[$key];
        }
    }
    file_put_contents($configFile, json_encode($current, JSON_PRETTY_PRINT), LOCK_EX);
    jsonResponse(['success' => true, 'message' => 'SMS config saved']);
}

cleanupExpiredOTPs();
$config = loadConfig();
$otpLength = (int)$config['otp_length'];
$otpExpiry = (int)$config['otp_expiry'];
$dailyLimit = (int)$config['daily_limit'];
$phone = preg_replace('/\D/', '', $input['phone'] ?? '');

if (!preg_match('/^[6-9]\d{9}$/', $phone)) {
    jsonResponse(['success' => false, 'message' => 'Invalid phone number'], 400);
}

if ($action === 'send' || $action === 'resend') {
    $counter = getDailyCounter();
    if ($counter['count'] >= $dailyLimit) {
        jsonResponse(['success' => false, 'message' => "Daily SMS limit ($dailyLimit) reached. Try again tomorrow."], 429);
    }

    $otps = loadOTPs();
    $existingKey = null;
    foreach ($otps as $k => $o) {
        if ($o['phone'] === $phone) {
            $existingKey = $k;
            break;
        }
    }

    $resendCooldown = 30;
    if ($existingKey !== null) {
        $existing = $otps[$existingKey];
        if (($existing['expires_at'] ?? 0) > time() && !($existing['verified'] ?? false)) {
            $timeSinceCreation = time() - ($existing['created_at'] ?? 0);
            if ($timeSinceCreation < $resendCooldown) {
                jsonResponse(['success' => false, 'message' => "Please wait " . ($resendCooldown - $timeSinceCreation) . "s before resending"], 429);
            }
        }
        if ($existingKey !== null) {
            array_splice($otps, $existingKey, 1);
        }
    }

    $otp = '';
    for ($i = 0; $i < $otpLength; $i++) {
        $otp .= random_int(0, 9);
    }

    $smsTemplate = $config['sms_template'] ?? 'Your OTP for Aadhaar Booking is {otp}. Valid for {expiry} minutes. - India Mobile Center';
    $message = str_replace(['{otp}', '{expiry}'], [$otp, (int)($otpExpiry / 60)], $smsTemplate);

    $smsResult = sendSMS($phone, $message);
    incrementCounter();

    if (!$smsResult['success']) {
        jsonResponse(['success' => false, 'message' => 'Failed to send SMS: ' . $smsResult['message']], 500);
    }

    $otps[] = [
        'phone' => $phone,
        'hash' => hashOTP($otp),
        'created_at' => time(),
        'expires_at' => time() + $otpExpiry,
        'attempts' => 0,
        'max_attempts' => 3,
        'verified' => false
    ];
    saveOTPs($otps);

    $response = ['success' => true, 'message' => 'OTP sent successfully'];
    if ($config['driver'] === 'log') {
        $response['debug_otp'] = $otp;
    }
    jsonResponse($response);
}

if ($action === 'verify') {
    $otpInput = preg_replace('/\D/', '', $input['otp'] ?? '');
    if (!$otpInput) {
        jsonResponse(['success' => false, 'message' => 'Please enter OTP'], 400);
    }

    $otps = loadOTPs();
    $foundKey = null;
    foreach ($otps as $k => $o) {
        if ($o['phone'] === $phone) {
            $foundKey = $k;
            break;
        }
    }

    if ($foundKey === null) {
        jsonResponse(['success' => false, 'message' => 'No OTP sent to this number. Please request a new OTP.']);
    }

    $record = $otps[$foundKey];

    if ($record['verified'] ?? false) {
        jsonResponse(['success' => false, 'message' => 'OTP already verified']);
    }

    if (($record['expires_at'] ?? 0) < time()) {
        array_splice($otps, $foundKey, 1);
        saveOTPs($otps);
        jsonResponse(['success' => false, 'message' => 'OTP expired. Please request a new OTP.']);
    }

    $record['attempts'] = ($record['attempts'] ?? 0) + 1;

    if (hashOTP($otpInput) === $record['hash']) {
        $record['verified'] = true;
        $otps[$foundKey] = $record;
        saveOTPs($otps);
        jsonResponse(['success' => true, 'message' => 'OTP verified successfully']);
    } else {
        if ($record['attempts'] >= $record['max_attempts']) {
            array_splice($otps, $foundKey, 1);
            saveOTPs($otps);
            jsonResponse(['success' => false, 'message' => 'Too many failed attempts. Please request a new OTP.']);
        }
        $otps[$foundKey] = $record;
        saveOTPs($otps);
        jsonResponse(['success' => false, 'message' => 'Incorrect OTP. ' . ($record['max_attempts'] - $record['attempts']) . ' attempt(s) remaining.']);
    }
}

jsonResponse(['success' => false, 'message' => 'Unknown action'], 400);
