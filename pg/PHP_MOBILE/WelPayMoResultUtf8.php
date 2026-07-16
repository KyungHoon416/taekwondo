<html> 
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, width=device-width">
<title>웰컴PG Mobile Sample Page</title>
</head>
<body>
<?php		
header('Content-Type: text/html; charset=utf-8');
require_once('./libs/HttpClient.php');

	$P_TID 		= $_REQUEST["P_TID"]; // 승인 진행을 위한 가맹점 mid
	$P_MID 		= $_REQUEST["P_MID"]; // 승인 진행시 거래정보를 조회해 오기 위한 P_TID
	$P_REQ_URL 	= $_REQUEST["P_REQ_URL"]; // 승인 요청 URL

	$paramMap["P_MID"] = $P_MID; // 필수
	$paramMap["P_TID"] = $P_TID; // 필수
	
	//#########################################
	// 승인 요청을 위한 HTTP 통신
	//#########################################
	try {
		$httpUtil = new HttpClient();

		//#####################
		// 승인 요청 시작
		//#####################
		$resultString = "";
		
		if ($httpUtil->processHTTP($P_REQ_URL, $paramMap)) {
			
			//#############################
			// 승인 요청 처리 및 응답 결과 수신
			//#############################
			$resultString = $httpUtil->body;
			//echo "<p><b>RESULT DATA :</b>". $resultString ."</p>";			//PRINT DATA
			
			// 응답결과 처리
			// (** 가맹점 개발시 자유롭게 수정 **)
			// resultString을 $result변수에 map형식으로 파싱
			parse_str($resultString, $result);
			
			//################################################
			// 인증이 성공일 경우 표기 P_STATUS = 00 이외에는 모두 실패처리
			// * 주의 : 반드시 00 이외에 모든 결과는 실패로 처리 됩니다.
			// 		  지불수단 및 원천 지불사의 에러내용에 따라 
			//		  2~4자리로 전송 될 수 있습니다.
			//################################################		
			echo "## 승인 요청 결과 ##";
			echo "<br/>";
			echo "<pre>";
			
			echo "<table width='565' border='1'>";
			if(isset($result['P_STATUS']) && $result['P_STATUS'] == '00'){
					$noti = isset($result['P_NOTI']) && $result['P_NOTI'] !== '' ? $result['P_NOTI'] : (isset($_REQUEST['P_NOTI']) ? $_REQUEST['P_NOTI'] : '');
					$parts = explode('|', $noti);
					$uid = isset($parts[0]) ? $parts[0] : '';
					$months = isset($parts[1]) ? $parts[1] : '1';
					$price = isset($parts[2]) ? $parts[2] : (isset($result['P_AMT']) ? $result['P_AMT'] : (isset($_REQUEST['P_AMT']) ? $_REQUEST['P_AMT'] : '20000'));
					$transactionId = isset($result['P_TID']) ? $result['P_TID'] : $P_TID;
					$orderId = isset($result['P_OID']) ? $result['P_OID'] : '';
					$signKey = 'QjZXWDZDRmxYUXJPYnMvelEvSjJ5QT09';
					$token = hash('sha256', $uid . $months . $price . $signKey);
					echo "<script type='text/javascript'>
						var url = 'https://taekwoncareer.co.kr/?pay_status=success' +
							'&uid=' + encodeURIComponent('" . addslashes($uid) . "') +
							'&months=' + " . intval($months) . " +
							'&price=' + " . intval($price) . " +
							'&token=' + encodeURIComponent('" . addslashes($token) . "') +
							'&transaction_id=' + encodeURIComponent('" . addslashes($transactionId) . "') +
							'&order_id=' + encodeURIComponent('" . addslashes($orderId) . "');
						window.location.href = url;
					</script>";
				} else {
					$resultMsg = isset($result['P_RMESG1']) ? $result['P_RMESG1'] : '결제 실패';
					echo "<script type='text/javascript'>
						var url = 'https://taekwoncareer.co.kr/?pay_status=fail' +
							'&msg=' + encodeURIComponent('" . addslashes($resultMsg) . "');
						window.location.href = url;
					</script>";
				}
echo "</table>";

		} else {
			// HTTP 요청 실패
			echo "Http Connect Error\n";
			echo $httpUtil->errormsg;

			throw new Exception("Http Connect Error");
		}
		
	} catch (Exception $e) {
		//################################################
		// DB에 데이터 입력 실패 등읭 ㅔ러 발생시 웰컴페이먼츠와 거래상태가 다를 수 있기 떄문에 가맹점 관리자 등으로 거래상태 확인 후 조치 필요
		// (가맹점관리자에서 거래건 취소하거나 PAYAPI를 연동해서 취소 API로 거래건 취소 처리도 가능합니다.)
		//################################################	
		
		$s = $e->getMessage() . ' (오류코드:' . $e->getCode() . ')';
		echo $s;
	}		
?>
</body>
</html>
