<!DOCTYPE html>
<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style type="text/css">
            body { background-color: #efefef;}
            body, tr, td {font-size:11pt; font-family:굴림,verdana; color:#433F37; line-height:19px;}
            table, img {border:none}

        </style>
        <script type="text/javascript">
            function cancelTid() {
                var form = document.frm;

                var win = window.open('', 'OnLine', 'scrollbars=no,status=no,toolbar=no,resizable=0,location=no,menu=no,width=600,height=400');
                win.focus();
                form.action = "https://stdpay.paywelcome.co.kr/stdpay/cancel/INIcancel_index.jsp";
                form.method = "post";
                form.target = "OnLine";
                form.submit();

            }
        </script>
    </head>
    <body bgcolor="#FFFFFF" text="#242424" leftmargin=0 topmargin=15 marginwidth=0 marginheight=0 bottommargin=0 rightmargin=0>
        <div style="padding:10px;width:100%;font-size:14px;color: #ffffff;background-color: #000000;text-align: center">
            웰컴페이먼츠 표준결제 인증결과 수신 / 승인요청 표시 샘플
        </div>
<?php
        require_once('./libs/WelStdPayUtil.php');
        require_once('./libs/HttpClient.php');

        $util = new WelStdPayUtil();

        try {

			//#############################
            // 승인요청 파라미터 일괄 수신
            //#############################

			//############################################
			// 전문 필드 값 설정(***가맹점 개발수정***)
			//############################################

			$mid 				= $_REQUEST["mid"];     						// 가맹점 ID 수신 받은 데이터로 설정 (필수)

			$timestamp 			= $util->getTimestamp();   						// util에 의해서 자동생성 (필수)

			$charset 			= "UTF-8";        								// 리턴형식[UTF-8,EUC-KR](가맹점 수정후 고정)

			$format 			= "JSON";        								// 리턴형식[XML,JSON,NVP](가맹점 수정후 고정)

			$authToken 			= $_REQUEST["authToken"];   					// 취소 요청 tid에 따라서 유동적(가맹점 수정후 고정) (필수)

			$authUrl 			= $_REQUEST["authUrl"];    						// 승인요청 API url(수신 받은 값으로 설정, 임의 세팅 금지)

			$netCancelUrl 		= $_REQUEST["netCancelUrl"];   					// 망취소 API url(수신 받은f값으로 설정, 임의 세팅 금지)

			//#####################
			// signature 생성
			//#####################
			$signParam["authToken"] 	= $authToken;  	// 필수
			$signParam["timestamp"] 	= $timestamp;  	// 필수
			// signature 데이터 생성 (모듈에서 자동으로 signParam을 알파벳 순으로 정렬후 NVP 방식으로 나열해 hash)
			$signature = $util->makeSignature($signParam);


			//#####################
			// 승인 요청 전문 생성
			//#####################
			$authMap["mid"] 			= $mid;   		// 필수
			$authMap["authToken"] 		= $authToken; 	// 필수
			$authMap["signature"] 		= $signature; 	// 필수
			$authMap["timestamp"] 		= $timestamp; 	// 필수
			$authMap["charset"] 		= $charset;  	// default=UTF-8
			$authMap["format"] 			= $format;  	// default=XML


			try {

				$httpUtil = new HttpClient();

				//#####################
				// 승인요청 URL 통신 시작
				//#####################

				$authResultString = "";
				
				if ($httpUtil->processHTTP($authUrl, $authMap)) {
					$authResultString = $httpUtil->body;
					//echo "<p><b>RESULT DATA :</b> $authResultString</p>";			//PRINT DATA
				} else {
					echo "Http Connect Error\n";
					echo $httpUtil->errormsg;

					throw new Exception("Http Connect Error");
				}

				//############################################################
				//승인요청 통신결과 처리(***가맹점 개발수정***)
				//############################################################
				echo "## 승인 API 결과 ##";

				$resultMap = json_decode($authResultString, true);
				
				echo "<pre>";
				echo "<table width='565' border='0' cellspacing='0' cellpadding='0'>";

				/*************************  결제보안 추가 2016-05-18 START ****************************/ 
				$secureMap["mid"]		= $mid;							//mid
				$secureMap["tstamp"]	= $timestamp;					//timestemp
				$secureMap["MOID"]		= $resultMap["MOID"];			//MOID
				$secureMap["TotPrice"]	= $resultMap["TotPrice"];		//TotPrice
				
				// signature 데이터 생성 
				$secureSignature = $util->makeSignatureAuth($secureMap);
				/*************************  결제보안 추가 2016-05-18 END ****************************/

				if ((strcmp("0000", $resultMap["resultCode"]) == 0) && (strcmp($secureSignature, $resultMap["authSignature"]) == 0) ){	//결제보안 추가 2016-05-18
						$merchantData = isset($resultMap["merchantData"])
							? urldecode($resultMap["merchantData"])
							: (isset($_REQUEST["merchantData"]) ? urldecode($_REQUEST["merchantData"]) : "");
					$parts = explode("|", $merchantData);
					$uid = isset($parts[0]) ? $parts[0] : "";
					$months = isset($parts[1]) ? $parts[1] : "1";
						$price = isset($parts[2]) ? $parts[2] : (isset($resultMap["TotPrice"]) ? $resultMap["TotPrice"] : "20000");
					$signKey = "QjZXWDZDRmxYUXJPYnMvelEvSjJ5QT09";
					$token = hash('sha256', $uid . $months . $price . $signKey);

					echo "<tr><th class='td01'><p>거래 성공 여부</p></th>";
					echo "<td class='td02'><p>성공</p></td></tr>";
					
						$returnQuery = http_build_query(array(
							"pay_status" => "success",
							"uid" => $uid,
							"months" => intval($months),
							"price" => intval($price),
							"token" => $token,
							"transaction_id" => isset($resultMap["tid"]) ? $resultMap["tid"] : "",
							"order_id" => isset($resultMap["MOID"]) ? $resultMap["MOID"] : ""
						));
						echo "<script type='text/javascript'>
							var msgData = {
							status: 'success',
							uid: '" . addslashes($uid) . "',
							months: " . intval($months) . ",
							price: " . intval($price) . ",
							token: '" . addslashes($token) . "'
						};
							try {
								if (window.opener && !window.opener.closed) window.opener.postMessage(msgData, '*');
							} catch (e) {}
							window.top.location.replace(window.location.origin + '/?" . addslashes($returnQuery) . "');
						</script>";
				} else {
					$resultMsg = isset($resultMap["resultMsg"]) ? $resultMap["resultMsg"] : "결제 승인 실패";
					echo "<script type='text/javascript'>
						var msgData = {
							status: 'fail',
							message: '" . addslashes($resultMsg) . "'
						};
						if (window.opener) {
							window.opener.postMessage(msgData, '*');
							window.close();
						} else {
							window.parent.postMessage(msgData, '*');
						}
					</script>";

					echo "<tr><th class='td01'><p>거래 성공 여부</p></th>";
					echo "<td class='td02'><p>실패</p></td></tr>";
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>결과 코드</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["resultCode"] , $resultMap) ? $resultMap["resultCode"] : "null" ) . "</p></td></tr>";
				}
				//결제보안키가 다른 경우.
					if (strcmp($secureSignature, $resultMap["authSignature"]) != 0) {
						echo "<tr><th class='line' colspan='2'><p></p></th></tr>
							<tr><th class='td01'><p>결과 내용</p></th>
							<td class='td02'><p>" . "* 데이터 위변조 체크 실패" . "</p></td></tr>";

						//망취소
						if(strcmp("0000", $resultMap["resultCode"]) == 0) {
							throw new Exception("데이터 위변조 체크 실패");
						}
					} else {
						echo "<tr><th class='line' colspan='2'><p></p></th></tr>
							<tr><th class='td01'><p>결과 내용</p></th>
							<td class='td02'><p>" . @(in_array($resultMap["resultMsg"] , $resultMap) ? $resultMap["resultMsg"] : "null" ) . "</p></td></tr>";
					}
					
					//공통 부분만
				echo
						"<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>거래 번호</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["tid"] , $resultMap) ? $resultMap["tid"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>결제방법(지불수단)</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["payMethod"] , $resultMap) ? $resultMap["payMethod"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>결과 코드</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["resultCode"] , $resultMap) ? $resultMap["resultCode"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>결과 내용</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["resultMsg"] , $resultMap) ? $resultMap["resultMsg"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>결제완료금액</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["TotPrice"] , $resultMap) ? $resultMap["TotPrice"] : "null" ) . "원</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>주문 번호</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["MOID"] , $resultMap) ? $resultMap["MOID"] : "null" )  . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>승인날짜</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["applDate"] , $resultMap) ? $resultMap["applDate"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>승인시간</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["applTime"] , $resultMap) ? $resultMap["applTime"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>";

				if (isset($resultMap["payMethod"]) && strcmp("VBank", $resultMap["payMethod"]) == 0) { //가상계좌
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>입금 계좌번호</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["VACT_Num"] , $resultMap) ? $resultMap["VACT_Num"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>입금 은행코드</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["VACT_BankCode"] , $resultMap) ? $resultMap["VACT_BankCode"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>입금 은행명</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["vactBankName"] , $resultMap) ? $resultMap["vactBankName"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>예금주 명</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["VACT_Name"] , $resultMap) ? $resultMap["VACT_Name"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>송금자 명</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["VACT_InputName"] , $resultMap) ? $resultMap["VACT_InputName"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>송금 일자</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["VACT_Date"] , $resultMap) ? $resultMap["VACT_Date"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>송금 시간</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["VACT_Time"] , $resultMap) ? $resultMap["VACT_Time"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>";
				} else if (isset($resultMap["payMethod"]) && strcmp("DirectBank", $resultMap["payMethod"]) == 0) { //실시간계좌이체
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>은행코드</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["ACCT_BankCode"] , $resultMap) ? $resultMap["ACCT_BankCode"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>현금영수증 발급결과코드</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CSHR_ResultCode"] , $resultMap) ? $resultMap["CSHR_ResultCode"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>현금영수증 발급구분코드</p> <font color=red><b>(0 - 소득공제용, 1 - 지출증빙용)</b></font></th>
						<td class='td02'><p>" . @(in_array($resultMap["CSHR_Type"] , $resultMap) ? $resultMap["CSHR_Type"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>";
				} else if (isset($resultMap["payMethod"]) && strcmp("HPP", $resultMap["payMethod"]) == 0) { //휴대폰
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>통신사</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["HPP_Corp"] , $resultMap) ? $resultMap["HPP_Corp"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>결제장치</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["payDevice"] , $resultMap) ? $resultMap["payDevice"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>휴대폰번호</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["HPP_Num"] , $resultMap) ? $resultMap["HPP_Num"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>";
				} else if (isset($resultMap["payMethod"]) && strcmp("CGFT", $resultMap["payMethod"]) == 0) { //문화상품권
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>문화상품권 승인금액</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CGFT_ApplPrice"] , $resultMap) ? $resultMap["CGFT_ApplPrice"] : "null" ) . "원</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>사용한 핀 수</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CGFT_Cnt"] , $resultMap) ? $resultMap["CGFT_Cnt"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>핀 번호</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CGFT_Num1"] , $resultMap) ? $resultMap["CGFT_Num1"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>핀 결제금액</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CGFT_Price1"] , $resultMap) ? $resultMap["CGFT_Price1"] : "null" ) . "원</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>";
				} else if (isset($resultMap["payMethod"]) && strcmp("Bill", $resultMap["payMethod"]) == 0) { //빌링결제
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>빌링키</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_BillKey"] , $resultMap) ? $resultMap["CARD_BillKey"] : "null" ) . "</p></td></tr>";
				}else if (isset($resultMap["payMethod"]) && strcmp("Auth", $resultMap["payMethod"]) == 0){//빌링결제
					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
							<tr><th class='td01'><p>빌링키</p></th>";
					if (isset($resultMap["payMethodDetail"]) && strcmp("BILL_CARD", $resultMap["payMethodDetail"]) == 0) {
						echo "<td class='td02'><p>" . @(in_array($resultMap["CARD_BillKey"] , $resultMap) ? $resultMap["CARD_BillKey"] : "null" ) . "</p></td></tr>";
					} else  if (isset($resultMap["payMethodDetail"]) && strcmp("BILL_HPP", $resultMap["payMethodDetail"]) == 0) {
						echo "<td class='td02'><p>" . @(in_array($resultMap["HPP_BillKey"] , $resultMap) ? $resultMap["HPP_BillKey"] : "null" ) . "</p></td></tr>
								<tr><th class='line' colspan='2'><p></p></th></tr>
								<tr><th class='line' colspan='2'><p></p></th></tr>
								<tr><th class='td01'><p>통신사</p></th>
								<td class='td02'><p>" . @(in_array($resultMap["HPP_Corp"] , $resultMap) ? $resultMap["HPP_Corp"] : "null" ) . "</p></td></tr>
								<tr><th class='line' colspan='2'><p></p></th></tr>
								<tr><th class='td01'><p>결제장치</p></th>
								<td class='td02'><p>" . @(in_array($resultMap["payDevice"] , $resultMap) ? $resultMap["payDevice"] : "null" ) . "</p></td></tr>
								<tr><th class='line' colspan='2'><p></p></th></tr>
								<tr><th class='td01'><p>휴대폰번호</p></th>
								<td class='td02'><p>" . @(in_array($resultMap["HPP_Num"] , $resultMap) ? $resultMap["HPP_Num"] : "null" ) . "</p></td></tr>
								<tr><th class='line' colspan='2'><p></p></th></tr>
								<tr><th class='td01'><p>상품명</p></th>
								<td class='td02'><p>" . @(in_array($resultMap["goodName"] , $resultMap) ? $resultMap["goodName"] : "null" ) . "</p></td></tr>";
					}
				} else { //카드
					if (isset($resultMap["EventCode"]) && !is_null($resultMap["EventCode"])) {

						echo "<tr><th class='line' colspan='2'><p></p></th></tr>
							<tr><th class='td01'><p>이벤트 코드</p></th>
							<td class='td02'><p>" . @(in_array($resultMap["EventCode"] , $resultMap) ? $resultMap["EventCode"] : "null" ) . "</p></td></tr>";
					}

					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>카드번호</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_Num"] , $resultMap) ? $resultMap["CARD_Num"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>할부기간</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_Quota"] , $resultMap) ? $resultMap["CARD_Quota"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>";

					if (isset($resultMap["EventCode"]) && isset($resultMap["CARD_Interest"]) && (strcmp("1", $resultMap["CARD_Interest"]) == 0 || strcmp("1", $resultMap["EventCode"]) == 0 )) {

						echo "<tr><th class='td01'><p>할부 유형</p></th>
							<td class='td02'><p>무이자</p></td></tr>";
					} else if (isset($resultMap["CARD_Interest"]) && !strcmp("1", $resultMap["CARD_Interest"]) == 0) {

						echo "<tr><th class='td01'><p>할부 유형</p></th>
							<td class='td02'><p>유이자 <font color='red'> *유이자로 표시되더라도 EventCode 및 EDI에 따라 무이자 처리가 될 수 있습니다.</font></p></td></tr>";
					}

					if (isset($resultMap["point"]) && strcmp("1", $resultMap["point"]) == 0) {

						echo "<td class='td02'><p></p></td></tr>
							<tr><th class='td01'><p>포인트 사용 여부</p></th>
							<td class='td02'><p>사용</p></td></tr>";
					} else {

						echo "<td class='td02'><p></p></td></tr>
							<tr><th class='td01'><p>포인트 사용 여부</p></th>
							<td class='td02'><p>미사용</p></td></tr>";
					}

					echo "<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>카드 종류</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_Code"] , $resultMap) ? $resultMap["CARD_Code"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>카드 발급사</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_BankCode"] , $resultMap) ? $resultMap["CARD_BankCode"] : "null" ) . "</p></td></tr>
	
						<tr><th class='td01'><p>부분취소 가능여부</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_PRTC_CODE"] , $resultMap) ? $resultMap["CARD_PRTC_CODE"] : "null" ) . "</p></td></tr>
						<tr><th class='line' colspan='2'><p></p></th></tr>
						<tr><th class='td01'><p>체크카드 여부</p></th>
						<td class='td02'><p>" . @(in_array($resultMap["CARD_CheckFlag"] , $resultMap) ? $resultMap["CARD_CheckFlag"] : "null" ) . "</p></td></tr>";
				}

				echo "</table>
					<span style='padding-left : 100px;'></span>
					<form name='frm' method='post'> 
						<input type='hidden' name='tid' value='" . @(in_array($resultMap["tid"] , $resultMap) ? $resultMap["tid"] : "null" ) . "'/>
					</form>				
					</pre>";

				// 수신결과를 파싱후 resultCode가 "0000"이면 승인성공 이외 실패
				// 가맹점에서 스스로 파싱후 내부 DB 처리 후 화면에 결과 표시
				// payViewType을 popup으로 해서 결제를 하셨을 경우
				// 내부처리후 스크립트를 이용해 opener의 화면 전환처리를 하세요
				//throw new Exception("강제 Exception");
			} catch (Exception $e) {
				// $s = $e->getMessage() . ' (오류코드:' . $e->getCode() . ')';
				//####################################
				// 실패시 처리(***가맹점 개발수정***)
				//####################################
				//---- db 저장 실패시 등 예외처리----//
				$s = $e->getMessage() . ' (오류코드:' . $e->getCode() . ')';
				echo $s;

				//#####################
				// 망취소 API
				//#####################

				$netcancelResultString = ""; // 망취소 요청 API url(고정, 임의 세팅 금지)
				
				if ($httpUtil->processHTTP($netCancelUrl, $authMap)) {
					$netcancelResultString = $httpUtil->body;
				} else {
					echo "Http Connect Error\n";
					echo $httpUtil->errormsg;

					throw new Exception("Http Connect Error");
				}

				echo "<br/>## 망취소 API 결과 ##<br/>";
				
				/*##XML output##*/
				//$netcancelResultString = str_replace("<", "&lt;", $$netcancelResultString);
				//$netcancelResultString = str_replace(">", "&gt;", $$netcancelResultString);
				
				// 취소 결과 확인
				echo "<p>". $netcancelResultString . "</p>";
			}
        } catch (Exception $e) {
            $s = $e->getMessage() . ' (오류코드:' . $e->getCode() . ')';
            echo $s;
        }
?>
</body>
</html>
