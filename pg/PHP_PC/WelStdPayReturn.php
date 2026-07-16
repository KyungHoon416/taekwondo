<!DOCTYPE html>
<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style type="text/css">
            body { background-color: #efefef;}
            body, tr, td {font-size:11pt; font-family:굴림,verdana; color:#433F37; line-height:19px;}
        </style>

    <script language="javascript" type="text/javascript">
        window.onload = function() {
            setTimeout(function() {
                Submit_me();
            }, 300);
        };
		function Submit_me(){
			var payForm = document.getElementById('payForm');
			payForm.target="INIpayStd_Return";
			payForm.submit();
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
            // 인증결과 파라미터 일괄 수신
            //#############################

            //#####################
            // 인증이 성공일 경우만
            //#####################
            if (strcmp("0000", $_REQUEST["resultCode"]) == 0) {

                echo "####인증성공/승인요청####";
                echo "<br/>";

                //############################################
                // 1.전문 필드 값 설정(***가맹점 개발수정***)
                //############################################

                $mid 			= $_REQUEST["mid"];     						// 가맹점 ID 수신 받은 데이터로 설정

                $signKey 		= "QjZXWDZDRmxYUXJPYnMvelEvSjJ5QT09"; 			// 가맹점에 제공된 키(이니라이트키) (가맹점 수정후 고정) !!!절대!! 전문 데이터로 설정금지

                $authToken 		= $_REQUEST["authToken"];   					// 취소 요청 tid에 따라서 유동적(가맹점 수정후 고정)

                $authUrl 		= $_REQUEST["authUrl"];    						// 승인요청 API url(수신 받은 값으로 설정, 임의 세팅 금지)

                $netCancelUrl 		= $_REQUEST["netCancelUrl"];   				// 망취소 API url(수신 받은f값으로 설정, 임의 세팅 금지)

                $merchantData 		= $_REQUEST["merchantData"];   				// 가맹점 임의 데이터 (결제 요청 시 전달한 값 그대로 반환됩니다.) 
                
				echo "<인증결과 내역> </br><table border='1'><tr style='background-color:#bbb'><td>결과코드</td><td>결과메세지</td></tr>";
				echo "<tr><td>resultCode</td><td>" .$_REQUEST["resultCode"] ."</tr></td>";
				echo "<tr><td>resultMsg</td><td>" .$_REQUEST["resultMsg"] ."</tr></td>";
				echo "<tr><td>mid</td><td>" .$_REQUEST["mid"] ."</tr></td>";
				echo "<tr><td>orderNumber</td><td>" .$_REQUEST["orderNumber"] ."</tr></td>";
				echo "<tr><td>authUrl</td><td>" .$_REQUEST["authUrl"] ."</tr></td>";
				echo "<tr><td>merchantData</td><td>" .urldecode($merchantData) ."</tr></td>"; // 한글 입력 시 URL decoding 하여 원본 문자 확인
				echo "</table>";
             
?>
		<br>
		####################################<br>
			--------------<br>
			호출  URL : return 받은 authUrl(only https)<br>
			<?php echo $authUrl?><br>
			
			승인 요청 시 필수 파라미터 : mid, authToken, timestamp, signature<br>
			선택 파라미터 : charset (default utf-8), format (default xml)<br>
			--------------<br>
		###################################<br> 
        
        인증에 <strong>성공</strong>하였습니다. <br>
		아래 버튼을 클릭해 <strong>승인요청</strong>까지 진행해야만 승인완료 후 <strong>실결제</strong>처리됩니다.<br><p></p>
		
		<form id="payForm" method="post" action="./WelStdPayResult.php">
			<input type="hidden" name="mid" value="<?php echo $mid ?>" />
			<input type="hidden" name="authToken" value="<?php echo $authToken ?>" />
			<input type="hidden" name="authUrl" value="<?php echo $authUrl ?>" />
			<input type="hidden" name="merchantData" value="<?php echo htmlspecialchars($merchantData, ENT_QUOTES, 'UTF-8') ?>" />
			<input type="submit" type="button" value="승인 요청하기" onclick="Submit_me();">
		    <input type="hidden" name="netCancelUrl" value="<?php echo $netCancelUrl ?>" />
		</form>
<?php
     			 
            } else {

                //#############
                // 인증 실패시
                //#############
                echo "<br/>";
                echo "####인증실패####";

                echo "<pre>" . var_dump($_REQUEST) . "</pre>";
            }
        } catch (Exception $e) {
            $s = $e->getMessage() . ' (오류코드:' . $e->getCode() . ')';
            echo $s;
        }
?>
</body>
</html>
