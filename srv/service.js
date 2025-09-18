const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const XLSX = require('xlsx');
const cds = require('@sap/cds');
module.exports = async function (srv) {
  srv.on('convertExcelToCsv', async (req) => {
    try {
      const base64Data = req.data.file;
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      return { csvText, message: 'Excel converted to CSV successfully' };
    } catch (err) {
      console.error(err);
      req.error(500, 'Error converting Excel to CSV');
    }
  });
}