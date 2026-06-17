import { printStaticDataAudit, runStaticDataAudit } from '../src/audits/static-data-audit.js';

runStaticDataAudit()
  .then((report) => {
    printStaticDataAudit(report);
    if (report.checks.some((check) => check.status === 'fail')) process.exit(1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
