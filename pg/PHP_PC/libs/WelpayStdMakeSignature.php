<?php

require_once('../libs/WelStdPayUtil.php');

$SignatureUtil = new WelStdPayUtil();

$input = "mKey=" . $_REQUEST["mKey"] . "&oid=" . $_REQUEST["oid"] . "&price=" . $_REQUEST["price"] . "&timestamp=" . $_REQUEST["timestamp"];

$output['signature'] = array(
    ///'signature' => $SignatureUtil->makeHash($input, "sha256")
    'signature' => hash("sha256", $input)
);

echo json_encode($output);
?>
