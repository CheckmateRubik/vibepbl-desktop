import { API } from './api.js';
import { printReport } from './components/print-report.js';
import { waitForPrintReady } from './components/print-ready.js';

const payload = await API.getPrintData();
const session = {
  ...payload.session,
  caseImages: payload.session.caseImages.map(image => ({ ...image, localPath: API.imageUrl(image.localPath) }))
};
document.getElementById('report').innerHTML = printReport(session, payload.generatedAt);
document.getElementById('back-to-session').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.location.assign('./index.html');
});
document.getElementById('print-report').addEventListener('click', async () => {
  try { await waitForPrintReady(document.getElementById('report')); await API.printCurrentWindow(); }
  catch (error) { alert(`Could not print: ${error}`); }
});
