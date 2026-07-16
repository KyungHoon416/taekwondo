<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 웰컴페이먼츠 정보 (테스트)
$signKey = "QjZXWDZDRmxYUXJPYnMvelEvSjJ5QT09";

// POST JSON body 파싱
$inputData = json_decode(file_get_contents('php://input'), true);

$uid = isset($inputData['uid']) ? $inputData['uid'] : '';
$months = isset($inputData['months']) ? $inputData['months'] : '';
$price = isset($inputData['price']) ? $inputData['price'] : '';
$token = isset($inputData['token']) ? $inputData['token'] : '';

if (empty($uid) || empty($months) || empty($price) || empty($token)) {
    echo json_encode(array("success" => false, "message" => "Missing parameters"));
    exit;
}

// 서버에서 검증 해시 토큰 생성
// 클라이언트에서 조작하는 것을 방지하기 위해 서버에 보관중인 signKey를 혼합하여 비교 검증
$expectedToken = hash('sha256', $uid . $months . $price . $signKey);

if (hash_equals($expectedToken, $token)) {
    echo json_encode(array("success" => true));
} else {
    echo json_encode(array("success" => false, "message" => "Invalid secure token"));
}
