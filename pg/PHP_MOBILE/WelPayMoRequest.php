<?php
ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
require_once('./libs/StdPayUtil.php');

$util = new StdPayUtil();
$paymentUrl = 'https://tmobile.paywelcome.co.kr/smart/wcard/';
$callbackUrl = 'https://taekwoncareer.co.kr/pg/PHP_MOBILE/WelPayMoNextUrlUtf8.php';
$mid = 'welcometst';
$signKey = 'QjZXWDZDRmxYUXJPYnMvelEvSjJ5QT09';
$timestamp = $util->getTimestamp();
$oid = $mid . '_' . $timestamp;
$price = isset($_REQUEST['price']) ? preg_replace('/[^0-9]/', '', $_REQUEST['price']) : '20000';
$months = isset($_REQUEST['months']) ? preg_replace('/[^0-9]/', '', $_REQUEST['months']) : '1';
$uid = isset($_REQUEST['uid']) ? preg_replace('/[^A-Za-z0-9_-]/', '', $_REQUEST['uid']) : '';
if ($price === '' || intval($price) <= 0) $price = '20000';
if ($months === '' || intval($months) <= 0) $months = '1';
$goodName = '이력서 열람 ' . $months . '개월 구독권';
$sign = $util->makeSignature(array(
    'mkey' => $util->makeHash($signKey, 'sha256'),
    'P_AMT' => $price,
    'P_OID' => $oid,
    'P_TIMESTAMP' => $timestamp
), 'sha256');
function h($value) { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
?>
<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>결제창 이동 중</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;color:#17233b}.box{text-align:center;padding:32px}.spinner{width:42px;height:42px;margin:0 auto 18px;border:4px solid #dbe5f5;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#667085;margin:0}</style></head>
<body><div class="box"><div class="spinner"></div><h1>결제창으로 이동 중입니다</h1><p>잠시만 기다려 주세요.</p></div>
<form id="payForm" method="post" action="<?= h($paymentUrl) ?>" accept-charset="euc-kr">
<input type="hidden" name="P_MID" value="<?= h($mid) ?>"><input type="hidden" name="P_OID" value="<?= h($oid) ?>"><input type="hidden" name="P_AMT" value="<?= h($price) ?>">
<input type="hidden" name="P_UNAME" value="태권커리어 회원"><input type="hidden" name="P_MNAME" value="태권커리어"><input type="hidden" name="P_NOTI" value="<?= h($uid . '|' . $months . '|' . $price) ?>">
<input type="hidden" name="P_GOODS" value="<?= h($goodName) ?>"><input type="hidden" name="P_MOBILE" value="010-0000-0000"><input type="hidden" name="P_EMAIL" value="pay@taekwoncareer.co.kr"><input type="hidden" name="P_CHARSET" value="">
<input type="hidden" name="P_NEXT_URL" value="<?= h($callbackUrl) ?>"><input type="hidden" name="P_RETURN_URL" value="<?= h($callbackUrl) ?>"><input type="hidden" name="P_NOTI_URL" value="<?= h($callbackUrl) ?>">
<input type="hidden" name="P_TIMESTAMP" value="<?= h($timestamp) ?>"><input type="hidden" name="P_SIGNATURE" value="<?= h($sign) ?>"><input type="hidden" name="P_RESERVED" value="below1000=Y&">
</form><script>document.getElementById('payForm').submit();</script></body></html>
