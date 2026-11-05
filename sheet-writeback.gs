/**
 * sheet-writeback.gs — ให้หน้าเว็บ (index.html) เขียนการแก้ไข/เพิ่ม/ลบผู้ป่วย
 * กลับไปที่ Google Sheet ต้นทางได้จริง แทนที่จะเก็บไว้แค่ในเบราว์เซอร์เครื่องเดียว
 *
 * ============================ ขั้นตอนติดตั้ง (ทำครั้งเดียว) ============================
 * 1. เปิด Google Sheet ต้นทาง (ต้องมีสิทธิ์แก้ไขชีตนี้) → เมนู Extensions → Apps Script
 * 2. ลบโค้ดเริ่มต้นในไฟล์ Code.gs ออกให้หมด แล้ววางโค้ดทั้งไฟล์นี้แทน
 * 3. แก้ค่า SHARED_SECRET ด้านล่างเป็นรหัสลับที่ตั้งเอง (ยาวๆ สุ่มๆ เช่นเดียวกับรหัสผ่าน)
 * 4. กด Deploy (มุมขวาบน) → New deployment → เลือกรูปแบบ (ไอคอนเฟือง) เป็น "Web app"
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    กด Deploy แล้วกด Authorize access เพื่ออนุญาตให้สคริปต์แก้ไขชีตนี้แทนคุณ
 * 5. คัดลอก "Web app URL" ที่ได้ (ขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)
 * 6. เปิดไฟล์ index.html ของเว็บ หาบรรทัด SHEET_WEBAPP_URL กับ SHEET_SECRET (ใกล้ๆ GSHEET_ID)
 *    ใส่ URL จากข้อ 5 และรหัสลับที่ตั้งในข้อ 3 (ต้องตรงกันเป๊ะ) ลงไป แล้ว commit/push ขึ้น GitHub
 * 7. ถ้าแก้โค้ดไฟล์นี้ใหม่ภายหลัง ต้องกด Deploy → Manage deployments → กดดินสอ (แก้ไข) ที่ deployment เดิม
 *    → เลือก Version: New version → Deploy อีกครั้ง (URL เดิมใช้ต่อได้ ไม่ต้องไปแก้ในหน้าเว็บใหม่)
 *
 * คำเตือนเรื่องความปลอดภัย: รหัสลับนี้ถูกฝังอยู่ในซอร์สโค้ดของหน้าเว็บสาธารณะ (ใครก็เปิดดูซอร์สได้)
 * จึงป้องกันได้แค่การเขียนทับโดยไม่ตั้งใจ/บอทกวนเล่นๆ เท่านั้น ไม่ใช่การรักษาความปลอดภัยระดับสูง
 *
 * ============================ วิธีจับคู่แถวที่จะแก้ไข/ลบ ============================
 * สคริปต์นี้ไม่มีคอลัมน์รหัสแถวในชีต จึงจับคู่ด้วย "ชื่อ-สกุล" + "กลุ่มเปราะบาง" เป็นหลัก
 * (ชื่อผู้ป่วยหลังคลอดที่มีคำว่า "(คลอดแล้ว)" ต่อท้ายจะถูกตัดออกก่อนเทียบ)
 * คอลัมน์ "กลุ่มเปราะบาง" ในชีตอาจเขียนคำไม่ตรงกับป้ายชื่อมาตรฐานของเว็บเป๊ะๆ (เช่นชีตเขียนแค่
 * "หลังคลอด" แต่เว็บส่งออกเป็น "มารดาหลังคลอด") จึงเทียบด้วย "ประเภทกลุ่ม" ที่ตีความจากคำในเซลล์
 * ด้วยกฎเดียวกับที่หน้าเว็บใช้ตอนอ่านชีต (ดู GROUP_TH) ไม่ใช่เทียบข้อความตรงตัว และจะไม่แก้ไข
 * เซลล์คอลัมน์ "กลุ่มเปราะบาง" เดิมเลย (กลุ่มแก้ไม่ได้จากฟอร์มแก้ไขในเว็บอยู่แล้ว)
 * ถ้าพบมากกว่า 1 แถวที่ชื่อ+กลุ่มตรงกันในชีตเดียวกัน (ชื่อซ้ำ) จะลองกรองซ้ำด้วย "บ้านเลขที่"+"หมู่"
 * ถ้ายังตรงกันมากกว่า 1 แถว จะ "ไม่แก้ไขชีตนั้น" และแจ้งเตือนกลับไปที่หน้าเว็บให้ผู้ใช้ไปแก้ในชีตเอง
 * (กันเขียนทับผิดคน) — แก้ไข/ลบ จะอัปเดตทุกชีตที่พบแถวตรงกัน (เช่น ชีตรวม + ชีตรายหมู่ พร้อมกัน)
 * เพิ่มผู้ป่วยใหม่ (add) จะเพิ่มแถวในชีตแรกตาม GSHEET_TABS ของหน้าเว็บเท่านั้น (ปกติคือชีตรวม)
 */

// กฎแปลข้อความในคอลัมน์ "กลุ่มเปราะบาง" เป็นรหัสกลุ่ม — อิงตาม GROUP_TH ใน index.html ทุกประการ
var GROUP_TH = [
  [/ตั้งครรภ์/, 'preg'],
  [/หลังคลอด/, 'post'],
  [/ติดเตียง/, 'bed'],
  [/ติดบ้าน/, 'home'],
  [/ฟอกไต|ล้างไต/, 'dial'],
  [/เครื่องไฟฟ้า|ออกซิเจน|อุปกรณ์/, 'equip']
];
function groupKeyOf(text) {
  var t = String(text || '');
  for (var i = 0; i < GROUP_TH.length; i++) { if (GROUP_TH[i][0].test(t)) return GROUP_TH[i][1]; }
  return null;
}

var SHARED_SECRET = 'เปลี่ยนรหัสลับตรงนี้ก่อนใช้งานจริง';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) return out({ ok: false, error: 'unauthorized' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = body.action;

    if (action === 'add') {
      var sheet = ss.getSheetByName(body.mainTab);
      if (!sheet) return out({ ok: false, error: 'ไม่พบชีตชื่อ "' + body.mainTab + '"' });
      appendRecord(sheet, body.row);
      return out({ ok: true, updated: 1, action: 'add' });
    }

    if (action === 'edit' || action === 'del') {
      if (!body.oldKey || !body.oldKey.name || !body.oldKey.g) return out({ ok: false, error: 'ไม่มีข้อมูลระบุแถวเดิม' });
      var sheets = ss.getSheets();
      var updated = 0;
      var ambiguous = [];
      var diag = [];
      var wantName = cleanName(body.oldKey.name);
      for (var s = 0; s < sheets.length; s++) {
        var sh = sheets[s];
        var data = sh.getDataRange().getValues();
        if (data.length < 2) continue;
        var header = data[0];
        var cols = resolveCols(header);
        if (cols.name < 0 || cols.grp < 0) { diag.push(sh.getName() + ': ไม่พบคอลัมน์ชื่อ/กลุ่มเปราะบาง'); continue; }

        var nameHits = 0, matches = [];
        for (var r = 1; r < data.length; r++) {
          var nm = cleanName(data[r][cols.name]);
          var gk = groupKeyOf(data[r][cols.grp]);
          var nameHit = nm === wantName;
          if (nameHit) nameHits++;
          if (nameHit && gk && gk === body.oldKey.g) matches.push(r);
        }
        if (matches.length > 1 && cols.house >= 0 && cols.moo >= 0) {
          var narrowed = matches.filter(function (r) {
            return String(data[r][cols.house] || '').trim() === String(body.oldKey.house || '').trim()
              && String(data[r][cols.moo] || '').trim() === String(body.oldKey.moo || '').trim();
          });
          if (narrowed.length) matches = narrowed;
        }
        if (matches.length > 1) { ambiguous.push(sh.getName()); continue; }
        if (!matches.length) {
          diag.push(sh.getName() + (nameHits ? ': เจอชื่อตรง ' + nameHits + ' แถว แต่กลุ่มไม่ตรง (' + body.oldKey.g + ')' : ': ไม่เจอชื่อตรงเลยใน ' + (data.length - 1) + ' แถว'));
          continue;
        }

        var rowIdx = matches[0]; // index ใน data[] (0 = header)
        if (action === 'del') { sh.deleteRow(rowIdx + 1); }
        else { writeRecord(sh, cols, rowIdx + 1, body.row); }
        updated++;
      }
      if (!updated && !ambiguous.length) {
        return out({ ok: false, error: 'ไม่พบแถว "' + body.oldKey.name + '" (' + body.oldKey.group + ') ในชีตใดเลย — อาจมีคนแก้ชื่อ/กลุ่มไปก่อนแล้ว กรุณา "ดึงจาก Google Sheet" ใหม่แล้วลองอีกครั้ง\n' + diag.join('\n') });
      }
      return out({ ok: true, updated: updated, action: action, ambiguous: ambiguous });
    }

    return out({ ok: false, error: 'ไม่รู้จัก action: ' + action });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  return out({ ok: true, msg: 'พร้อมใช้งาน (เขียนข้อมูลผ่าน POST เท่านั้น)' });
}

function cleanName(v) {
  // normalize('NFC') กันกรณีสระ/วรรณยุกต์ไทยถูกเก็บคนละรูปแบบ (เช่น คัดลอกมาจากคนละแหล่ง)
  // ตัดช่องว่างทั้งหมดออก (ไม่ใช่แค่ยุบ) กันกรณีมีช่องว่างแทรกไม่ตรงกันระหว่างชีตกับที่แอปบันทึกไว้
  return String(v || '')
    .normalize('NFC')
    .replace(/\s*\(.*?คลอดแล้ว.*?\)\s*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// คีย์ที่หน้าเว็บส่งมาใน body.row -> วิธีหาคอลัมน์จริงในชีต (exact = ต้องตรงเป๊ะหลังตัดช่องว่าง, regex = ยืดหยุ่น)
// อิงตามกติกาเดียวกับที่หน้าเว็บใช้อ่านคอลัมน์ตอนดึงข้อมูลจากชีต (parseNew ใน index.html)
var COLDEF = {
  area: { exact: 'ประเภทพื้นที่' },
  evac: { regex: /การอพย/ },
  trans: { regex: /เคลื่อนย้าย/ },
  consent: { regex: /ยินยอม/ },
  grp: { exact: 'กลุ่มเปราะบาง' },
  name: { regex: /ชื่อ/ },
  age: { exact: 'อายุ' },
  house: { regex: /บ้านเลขที/ },
  moo: { exact: 'หมู่' },
  village: { exact: 'บ้าน' },
  tambon: { exact: 'ตำบล' },
  phone: { exact: 'เบอร์โทร' },
  health: { exact: 'ภาวะสุขภาพ' },
  edc: { exact: 'กำหนดคลอด' },
  adl: { exact: 'ADL' },
  abil: { regex: /ความสามารถ/ },
  vhv: { regex: /พื้นที่อสม|^อสม/, strip: true },
  vhvphone: { regex: /เบอร์โทร.*อสม/, strip: true },
  hn: { exact: 'HN' },
  deliv: { exact: 'วันที่คลอด' },
  days: { exact: 'วันฟอก' },
  site: { exact: 'สถานที่ฟอกไต' },
  note: { exact: 'หมายเหตุ' },
  lat: { exact: 'ละติจูด' },
  lng: { exact: 'ลองจิจูด' }
};

function norm(s) { return String(s || '').replace(/\s+/g, ''); }

function resolveCols(header) {
  var cols = {};
  Object.keys(COLDEF).forEach(function (k) {
    var def = COLDEF[k];
    var idx = -1;
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i] || '');
      var hit = def.exact ? (norm(h) === norm(def.exact)) : def.regex.test(def.strip ? norm(h) : h);
      if (hit) { idx = i; break; }
    }
    cols[k] = idx;
  });
  return cols;
}

function writeRecord(sheet, cols, rowNum, row) {
  Object.keys(cols).forEach(function (k) {
    if (k === 'grp') return; // กลุ่มแก้ไม่ได้จากฟอร์มแก้ไขอยู่แล้ว — ไม่แตะคอลัมน์นี้ตอนแก้ไขแถวเดิม
    if (cols[k] < 0) return; // ชีตนี้ไม่มีคอลัมน์นี้ ข้ามไป
    if (!row || !(k in row)) return;
    sheet.getRange(rowNum, cols[k] + 1).setValue(row[k]);
  });
}

function appendRecord(sheet, row) {
  var header = sheet.getDataRange().getValues()[0];
  var cols = resolveCols(header);
  var out = new Array(header.length).fill('');
  Object.keys(cols).forEach(function (k) {
    if (cols[k] >= 0 && row && (k in row)) out[cols[k]] = row[k];
  });
  sheet.appendRow(out);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
