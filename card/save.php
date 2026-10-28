<?php
// KAP digital card — receives a visitor's contact details, emails them to
// info@kap.energy with a .vcf attachment, and appends them to a CSV kept
// outside public_html (/home/<user>/kap-card-leads.csv).
date_default_timezone_set('Asia/Tehran');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function out($ok, $err = '') { echo json_encode(['ok' => $ok, 'error' => $err]); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); out(false, 'method'); }

// Honeypot: bots fill the hidden "website" field.
if (!empty($_POST['website'])) out(true);

function clean($k, $max) {
  $v = isset($_POST[$k]) ? (string)$_POST[$k] : '';
  $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);   // strip control chars / newlines
  $v = trim(preg_replace('/\s+/u', ' ', $v));
  return mb_substr($v, 0, $max, 'UTF-8');
}
$name  = clean('name', 80);
$phone = strtr(clean('phone', 30), ['۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9','٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9']);
$phone = substr(preg_replace('/[^\d+]/', '', $phone), 0, 20);
$email = clean('email', 100);
$org   = clean('org', 120);

if (mb_strlen($name, 'UTF-8') < 2) out(false, 'name');
if (strlen(preg_replace('/\D/', '', $phone)) < 10) out(false, 'phone');
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) out(false, 'email');

// Simple rate limit: max 5 submissions per IP per hour.
$ip   = $_SERVER['REMOTE_ADDR'] ?? '0';
$home = dirname(__DIR__, 2);                       // /home/<cpanel-user>
$rlf  = $home . '/kap-card-rate.json';
$rl   = is_file($rlf) ? (json_decode(@file_get_contents($rlf), true) ?: []) : [];
$now  = time();
foreach ($rl as $k => $ts) { $rl[$k] = array_values(array_filter($ts, fn($t) => $t > $now - 3600)); if (!$rl[$k]) unset($rl[$k]); }
$key = hash('sha256', $ip);
if (count($rl[$key] ?? []) >= 5) out(false, 'rate');
$rl[$key][] = $now;
@file_put_contents($rlf, json_encode($rl), LOCK_EX);

$date = date('Y-m-d H:i');

// 1) CSV outside the web root (Excel-friendly UTF-8 BOM on first write).
$csv = $home . '/kap-card-leads.csv';
$new = !is_file($csv);
$wrote = false;
if ($fh = @fopen($csv, 'a')) {
  if (flock($fh, LOCK_EX)) {
    if ($new) { fwrite($fh, "\xEF\xBB\xBF"); fputcsv($fh, ['date', 'name', 'phone', 'email', 'org']); }
    // Prefix cells that start with formula characters so Excel won't execute them.
    $safe = array_map(fn($c) => preg_match('/^[=+\-@]/', $c) && $c !== $phone ? "'" . $c : $c, [$date, $name, $phone, $email, $org]);
    $wrote = fputcsv($fh, $safe) !== false;
    flock($fh, LOCK_UN);
  }
  fclose($fh);
}

// 2) Email with the visitor's vCard attached, so it can be saved to contacts in one tap.
$esc = fn($s) => str_replace([',', ';'], ['\,', '\;'], $s);
$vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:" . $esc($name) . "\r\nN:" . $esc($name) . ";;;;\r\nTEL;TYPE=CELL:" . $phone . "\r\n"
     . ($email !== '' ? "EMAIL:" . $email . "\r\n" : '')
     . ($org !== '' ? "ORG:" . $esc($org) . "\r\n" : '')
     . "NOTE:" . $esc('کارت کاپ — ' . $date) . "\r\nEND:VCARD\r\n";

$to       = 'info@kap.energy';
$subject  = '=?UTF-8?B?' . base64_encode('مخاطب تازه از کارت کاپ: ' . $name) . '?=';
$boundary = 'kap' . bin2hex(random_bytes(8));
$headers  = "From: KAP Card <info@kap.energy>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$boundary\"\r\n";
if ($email !== '') $headers .= "Reply-To: $email\r\n";   // validated above; contains no newlines

$text = "مخاطب تازه از کارت دیجیتال کاپ\n\nنام: $name\nهمراه: $phone\nایمیل: " . ($email ?: '-') . "\nسازمان و سمت: " . ($org ?: '-') . "\nزمان: $date\n\nفایل پیوست را باز کنید تا مخاطب در گوشی ذخیره شود.\n";
$fname = 'contact-' . date('Ymd-His') . '.vcf';
$body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
       . "--$boundary\r\nContent-Type: text/vcard; charset=UTF-8; name=\"$fname\"\r\nContent-Disposition: attachment; filename=\"$fname\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($vcf))
       . "--$boundary--\r\n";

$sent = @mail($to, $subject, $body, $headers, '-finfo@kap.energy');

// Saved to CSV or emailed counts as received.
if ($sent || $wrote) out(true);
out(false, 'server');
