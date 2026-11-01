/**
 * One-time Google Sheets bridge. Deploy this as a separate Apps Script web app,
 * executing as you. Add BOUNDARY_WEBHOOK_SECRET in Script Properties.
 * The secret stays between your backend and this script; never put it in HTML.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var properties = PropertiesService.getScriptProperties();
    var expected = properties.getProperty('BOUNDARY_WEBHOOK_SECRET') || '';
    if (expected.length < 32 || !sameSecret_(String(body.secret || ''), expected)) {
      return json_({success:false,error:'Unauthorized Sheets update.'});
    }
    if (!/^[a-zA-Z0-9-]{10,80}$/.test(body.tournamentId || '')) {
      return json_({success:false,error:'Invalid tournament ID.'});
    }
    lock.waitLock(25000);
    var key = 'boundary_sheet_' + body.tournamentId;
    var id = properties.getProperty(key);
    var book;
    if (id) {
      book = SpreadsheetApp.openById(id);
    } else {
      // The stable ID in the file name lets retries recover a file created just
      // before a previous execution stopped, without creating another workbook.
      var title = '[Boundary ' + body.tournamentId + '] ' + String(body.name || 'Tournament').slice(0,100);
      var files = DriveApp.getFilesByName(title);
      book = files.hasNext() ? SpreadsheetApp.openById(files.next().getId()) : SpreadsheetApp.create(title);
      properties.setProperty(key,book.getId());
    }
    var previous = Number(properties.getProperty(key + '_version') || '-1');
    var version = Number(body.version);
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('Invalid version.');
    if (version >= previous) {
      var tabs = ['Registrations','Teams','Auction','Settings'];
      var blocks = body.data || [];
      if (blocks.length !== tabs.length) throw new Error('Incomplete tournament snapshot.');
      blocks.forEach(function(block,index) {
        if (block.range !== tabs[index] + '!A1') throw new Error('Invalid destination tab.');
        var rows = block.values;
        if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Invalid row data.');
        var columns = rows[0].length;
        var sheet = book.getSheetByName(tabs[index]) || book.insertSheet(tabs[index]);
        if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(),rows.length-sheet.getMaxRows());
        if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(),columns-sheet.getMaxColumns());
        var values = rows.map(function(row) {
          if (!Array.isArray(row) || row.length !== columns) throw new Error('Invalid columns.');
          return row.map(function(value) {
            if (typeof value === 'number' || typeof value === 'boolean') return value;
            var text = String(value == null ? '' : value);
            return /^[=+@-]/.test(text) ? "'" + text : text;
          });
        });
        sheet.getDataRange().clearContent();
        sheet.getRange(1,1,values.length,columns).setValues(values);
        sheet.setFrozenRows(1);
        sheet.getRange(1,1,1,columns).setFontWeight('bold').setBackground('#224c3d').setFontColor('#ffffff');
      });
      SpreadsheetApp.flush();
      properties.setProperty(key + '_version',String(version));
    }
    return json_({success:true,spreadsheetId:book.getId(),url:book.getUrl(),version:version});
  } catch (err) {
    return json_({success:false,error:String(err.message || err)});
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
function doGet() { return json_({service:'Boundary Sheets Bridge',ready:true}); }
function sameSecret_(a,b) {
  var result = a.length ^ b.length;
  for (var i=0;i<Math.max(a.length,b.length);i++) result |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return result === 0;
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
