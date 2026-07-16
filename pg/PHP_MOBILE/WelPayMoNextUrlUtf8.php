<?php
header('Content-Type: text/html; charset=utf-8');
$status = isset($_REQUEST['P_STATUS']) ? $_REQUEST['P_STATUS'] : '';
$tid = isset($_REQUEST['P_TID']) ? $_REQUEST['P_TID'] : '';
$requestUrl = isset($_REQUEST['P_REQ_URL']) ? $_REQUEST['P_REQ_URL'] : '';
$noti = isset($_REQUEST['P_NOTI']) ? $_REQUEST['P_NOTI'] : '';
$amount = isset($_REQUEST['P_AMT']) ? $_REQUEST['P_AMT'] : '';
$message = isset($_REQUEST['P_RMESG1']) ? $_REQUEST['P_RMESG1'] : '결제 인증에 실패했습니다.';
$mid = isset($_REQUEST['P_MID']) && $_REQUEST['P_MID'] !== '' ? $_REQUEST['P_MID'] : substr($tid, 10, 10);
if ($status !== '00' || $tid === '' || $requestUrl === '') {
    header('Location: https://taekwoncareer.co.kr/?pay_status=fail&msg=' . rawurlencode($message)); exit;
}
function h($value) { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
?>
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>결제 승인 중</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;color:#17233b;text-align:center}.spinner{width:42px;height:42px;margin:0 auto 18px;border:4px solid #dbe5f5;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}h1{font-size:18px}</style></head>
<body><div><div class="spinner"></div><h1>결제를 승인하고 있습니다</h1></div><form id="approvalForm" method="post" action="/pg/PHP_MOBILE/WelPayMoResultUtf8.php">
<input type="hidden" name="P_MID" value="<?= h($mid) ?>"><input type="hidden" name="P_TID" value="<?= h($tid) ?>"><input type="hidden" name="P_REQ_URL" value="<?= h($requestUrl) ?>"><input type="hidden" name="P_NOTI" value="<?= h($noti) ?>"><input type="hidden" name="P_AMT" value="<?= h($amount) ?>">
</form><script>document.getElementById('approvalForm').submit();</script></body></html>
