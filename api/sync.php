<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$dataFile = __DIR__ . '/../data/shared.json';

function readData($file) {
  if (!file_exists($file)) return ['bookings' => [], 'token' => 7, 'dates' => [], 'activity' => [], 'settings' => []];
  $content = file_get_contents($file);
  $data = json_decode($content, true);
  return $data ?: ['bookings' => [], 'token' => 7, 'dates' => [], 'activity' => [], 'settings' => []];
}

function writeData($file, $data) {
  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $data = readData($dataFile);
  echo json_encode($data);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $input = json_decode(file_get_contents('php://input'), true);
  if (!$input || !isset($input['action'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
  }

  $data = readData($dataFile);
  $action = $input['action'];

  switch ($action) {
    case 'setBookings':
      if (isset($input['bookings'])) $data['bookings'] = $input['bookings'];
      break;
    case 'setToken':
      if (isset($input['token'])) $data['token'] = (int)$input['token'];
      break;
    case 'setDates':
      if (isset($input['dates'])) $data['dates'] = $input['dates'];
      break;
    case 'setActivity':
      if (isset($input['activity'])) $data['activity'] = $input['activity'];
      break;
    case 'setSettings':
      if (isset($input['settings'])) $data['settings'] = $input['settings'];
      break;
    case 'sync':
      // Merge all fields
      foreach (['bookings', 'token', 'dates', 'activity', 'settings'] as $key) {
        if (isset($input[$key])) $data[$key] = $input[$key];
      }
      break;
    default:
      http_response_code(400);
      echo json_encode(['error' => 'Unknown action']);
      exit;
  }

  writeData($dataFile, $data);
  echo json_encode(['success' => true, 'data' => $data]);
  exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
