const fs = require('fs');

const reportPath = 'npm-audit.json';
const allowed = JSON.parse(fs.readFileSync('npm-audit-allowlist.json', 'utf8'));
const failing = ['high', 'critical'];

const isAllowed = (via) => typeof via === 'object' && allowed.some((id) => via.url?.endsWith(id));

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulnerabilities = {};
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    const via = vuln.via.filter((v) => !isAllowed(v));
    if (via.length) vulnerabilities[name] = { ...vuln, via };
}
report.vulnerabilities = vulnerabilities;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const blocking = Object.values(vulnerabilities).filter((v) => failing.includes(v.severity));
if (blocking.length) {
    console.error(`npm audit: ${blocking.length} high/critical vulnerabilities`);
    process.exit(1);
}
