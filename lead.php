<?php
// KAP catalogue gate — receives a visitor's contact details, emails them to
// info@kap.energy with a .vcf attachment, and appends them to a CSV kept
// outside public_html (/home/<user>/kap-catalogue-leads.csv).
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
$src   = preg_replace('/[^a-z\-]/', '', clean('source', 30)) ?: 'catalogue';

if (mb_strlen($name, 'UTF-8') < 2) out(false, 'name');
if (strlen(preg_replace('/\D/', '', $phone)) < 10) out(false, 'phone');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(false, 'email');

// Simple rate limit: max 5 submissions per IP per hour.
$ip   = $_SERVER['REMOTE_ADDR'] ?? '0';
$home = dirname(__DIR__);                          // /home/<cpanel-user> (lead.php sits in public_html)
$rlf  = $home . '/kap-catalogue-rate.json';
$rl   = is_file($rlf) ? (json_decode(@file_get_contents($rlf), true) ?: []) : [];
$now  = time();
foreach ($rl as $k => $ts) { $rl[$k] = array_values(array_filter($ts, fn($t) => $t > $now - 3600)); if (!$rl[$k]) unset($rl[$k]); }
$key = hash('sha256', $ip);
if (count($rl[$key] ?? []) >= 5) out(false, 'rate');
$rl[$key][] = $now;
@file_put_contents($rlf, json_encode($rl), LOCK_EX);

$date = date('Y-m-d H:i');

// 1) CSV outside the web root (Excel-friendly UTF-8 BOM on first write).
$csv = $home . '/kap-catalogue-leads.csv';
$new = !is_file($csv);
$wrote = false;
if ($fh = @fopen($csv, 'a')) {
  if (flock($fh, LOCK_EX)) {
    if ($new) { fwrite($fh, "\xEF\xBB\xBF"); fputcsv($fh, ['date', 'name', 'phone', 'email', 'org', 'source']); }
    // Prefix cells that start with formula characters so Excel won't execute them.
    $safe = array_map(fn($c) => preg_match('/^[=+\-@]/', $c) && $c !== $phone ? "'" . $c : $c, [$date, $name, $phone, $email, $org, $src]);
    $wrote = fputcsv($fh, $safe) !== false;
    flock($fh, LOCK_UN);
  }
  fclose($fh);
}


// Build an Excel (.xlsx) file of every catalogue request so far, from the CSV.
function kap_xlsx($csv) {
  if (!class_exists('ZipArchive') || !is_file($csv)) return null;
  $rows = [];
  if ($fh = @fopen($csv, 'r')) {
    while (($r = fgetcsv($fh)) !== false) { if ($rows === [] && isset($r[0])) $r[0] = preg_replace('/^\xEF\xBB\xBF/', '', $r[0]); $rows[] = $r; }
    fclose($fh);
  }
  if (!$rows) return null;
  $head = ['تاریخ', 'نام', 'همراه', 'ایمیل', 'سازمان', 'منبع'];
  $rows[0] = $head;
  $x = fn($v) => htmlspecialchars((string)$v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
  $col = fn($i) => chr(65 + $i);
  $sd = '';
  foreach ($rows as $ri => $r) {
    $sd .= '<row r="' . ($ri + 1) . '">';
    foreach (array_slice($r, 0, 6) as $ci => $v) {
      $v = ltrim((string)$v, "'");
      $sd .= '<c r="' . $col($ci) . ($ri + 1) . '" t="inlineStr"' . ($ri === 0 ? ' s="1"' : '') . '><is><t xml:space="preserve">' . $x($v) . '</t></is></c>';
    }
    $sd .= '</row>';
  }
  $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="26" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="4" width="30" customWidth="1"/><col min="5" max="5" width="26" customWidth="1"/><col min="6" max="6" width="14" customWidth="1"/></cols><sheetData>' . $sd . '</sheetData></worksheet>';
  $tmp = tempnam(sys_get_temp_dir(), 'kapx');
  $z = new ZipArchive();
  if ($z->open($tmp, ZipArchive::OVERWRITE) !== true) return null;
  $z->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  $z->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  $z->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Catalogue leads" sheetId="1" r:id="rId1"/></sheets></workbook>');
  $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  $z->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF5A00"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
  $z->addFromString('xl/worksheets/sheet1.xml', $sheet);
  $z->close();
  $data = @file_get_contents($tmp); @unlink($tmp);
  return $data ?: null;
}
$xlsx = kap_xlsx($csv);

// 2) Email with the visitor's vCard attached, so it can be saved to contacts in one tap.
$esc = fn($s) => str_replace([',', ';'], ['\,', '\;'], $s);
$vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:" . $esc($name) . "\r\nN:" . $esc($name) . ";;;;\r\nTEL;TYPE=CELL:" . $phone . "\r\n"
     . ($email !== '' ? "EMAIL:" . $email . "\r\n" : '')
     . ($org !== '' ? "ORG:" . $esc($org) . "\r\n" : '')
     . "NOTE:" . $esc('کاتالوگ کاپ — ' . $date) . "\r\nEND:VCARD\r\n";

$to       = 'info@kap.energy';
$subject  = '=?UTF-8?B?' . base64_encode('درخواست کاتالوگ کاپ: ' . $name) . '?=';
$boundary = 'kap' . bin2hex(random_bytes(8));
$headers  = "From: KAP Website <info@kap.energy>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$boundary\"\r\n";
if ($email !== '') $headers .= "Reply-To: $email\r\n";   // validated above; contains no newlines

$text = "درخواست تازهٔ کاتالوگ از وب‌سایت کاپ\n\nنام: $name\nهمراه: $phone\nایمیل: " . ($email ?: '-') . "\nسازمان: " . ($org ?: '-') . "\nمنبع: $src\nزمان: $date\n\nپیوست‌ها: فهرست کامل درخواست‌های کاتالوگ (Excel) و کارت مخاطب (vcf).\n";
$fname = 'contact-' . date('Ymd-His') . '.vcf';
$body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
       . "--$boundary\r\nContent-Type: text/vcard; charset=UTF-8; name=\"$fname\"\r\nContent-Disposition: attachment; filename=\"$fname\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($vcf))
       . ($xlsx ? "--$boundary\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name=\"kap-catalogue-leads.xlsx\"\r\nContent-Disposition: attachment; filename=\"kap-catalogue-leads.xlsx\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($xlsx)) : '')
       . "--$boundary--\r\n";

$sent = @mail($to, $subject, $body, $headers, '-finfo@kap.energy');

// Saved to CSV or emailed counts as received.
if ($sent || $wrote) out(true);
out(false, 'server');
