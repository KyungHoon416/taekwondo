<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 웰컴페이먼츠 정보 (테스트)
$mid = "welcometst";
$signKey = "QjZXWDZDRmxYUXJPYnMvelEvSjJ5QT09";

$price = isset($_REQUEST['price']) ? preg_replace('/[^0-9]/', '', $_REQUEST['price']) : '20000';
$months = isset($_REQUEST['months']) ? preg_replace('/[^0-9]/', '', $_REQUEST['months']) : '1';
$uid = isset($_REQUEST['uid']) ? $_REQUEST['uid'] : '';
$device = isset($_REQUEST['device']) ? $_REQUEST['device'] : 'pc';

if (empty($uid)) {
    echo json_encode(array("status" => "error", "message" => "Missing UID"));
    exit;
}

// 가맹점 임의 데이터 (P_NOTI / merchantData)
// uid와 months, price를 묶어서 전달
$customData = $uid . "|" . $months . "|" . $price;

date_default_timezone_set('Asia/Seoul');
$milliseconds = round(microtime(true) * 1000);
$tempValue1 = round($milliseconds/1000);
$tempValue2 = round((float)microtime(false) * 1000);
switch (strlen($tempValue2)) {
    case '3': break;
    case '2': $tempValue2 = "0".$tempValue2; break;
    case '1': $tempValue2 = "00".$tempValue2; break;
    default: $tempValue2 = "000"; break;
}
$timestamp = "".$tempValue1.$tempValue2;

// 주문번호 생성
$oid = $mid . "_" . $timestamp;

// mKey 해싱 (SHA256)
$mKey = hash("sha256", $signKey);

$signature = "";

if ($device === 'mobile') {
    // 모바일용 파라미터 및 서명 생성
    // StdPayUtil.php 의 StdMakeSignature.php 와 동일한 방식
    // P_AMT, P_OID, P_TIMESTAMP, mkey 순으로 ksort 정렬
    $params = array(
        "mkey" => $mKey,
        "P_AMT" => $price,
        "P_OID" => $oid,
        "P_TIMESTAMP" => $timestamp
    );
    ksort($params);
    $string = "";
    foreach ($params as $key => $value) {
        $string .= "&$key=$value";
    }
    $string = substr($string, 1);
    $signature = hash("sha256", $string);
} else {
    // PC용 파라미터 및 서명 생성
    $params = array(
        "mKey" => $mKey,
        "oid" => $oid,
        "price" => $price,
        "timestamp" => $timestamp
    );
    ksort($params);
    $string = "";
    foreach ($params as $key => $value) {
        $string .= "&$key=$value";
    }
    $string = substr($string, 1);
    $signature = hash("sha256", $string);
}

echo json_encode(array(
    "status" => "success",
    "mid" => $mid,
    "oid" => $oid,
    "price" => $price,
    "timestamp" => $timestamp,
    "mKey" => $mKey,
    "signature" => $signature,
    "customData" => $customData
));
